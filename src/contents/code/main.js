/**
 * @file main.js
 * @brief KWin 6 script for snapping active windows, cycling focus,
 * and automatically dragging/resizing stacked normal windows together.
 * Strictly excludes maximized, full-screen, and screen-spanning windows.
 */

var lastGeometries = new Map();
var isSyncing = false;

/**
 * Checks whether a target window is currently marked as maximized.
 *
 * @param {Window} win Target window object.
 * @returns {boolean} True if the window is maximized in any dimension.
 */
function isMaximized(win) {
    if (!win) {
        return false;
    }
    if (win.maximizeMode !== undefined && win.maximizeMode > 0) {
        return true;
    }
    if (win.maximized === true) {
        return true;
    }
    return false;
}

/**
 * Checks if two window geometries overlap within a pixel tolerance.
 *
 * @param {QtRect} geom1 First window geometry.
 * @param {QtRect} geom2 Second window geometry.
 * @param {number} tolerance Maximum allowed difference in pixels.
 * @returns {boolean} True if geometries match within tolerance.
 */
function isSameStack(geom1, geom2, tolerance) {
    if (!geom1 || !geom2) {
        return false;
    }
    var tol = tolerance || 15;
    return (
        Math.abs(geom1.x - geom2.x) <= tol &&
        Math.abs(geom1.y - geom2.y) <= tol &&
        Math.abs(geom1.width - geom2.width) <= tol &&
        Math.abs(geom1.height - geom2.height) <= tol
    );
}

/**
 * Checks whether a geometry object matches or spans the screen/work area.
 * Evaluates exact KWin client area, full screen output geometry, or percentage screen coverage.
 *
 * @param {Window} win Target window object.
 * @param {Object} geom Geometry object to evaluate.
 * @returns {boolean} True if geometry corresponds to full-screen or maximized bounds.
 */
function isMaximizedGeometry(win, geom) {
    if (!win || !geom) {
        return false;
    }
    if (isMaximized(win)) {
        return true;
    }

    // 1. Check against KWin workspace clientArea (MaximizeArea = 0)
    try {
        if (typeof workspace !== "undefined" && workspace.clientArea) {
            var ca = workspace.clientArea(0, win);
            if (ca && isSameStack(geom, ca, 15)) {
                return true;
            }
        }
    } catch (e) {
        // Fall back to output ratio check if clientArea call fails
    }

    // 2. Check against output monitor bounds (80% threshold for floating panels/docks)
    if (win.output && win.output.geometry) {
        var og = win.output.geometry;
        if (geom.width >= og.width * 0.80 && geom.height >= og.height * 0.80) {
            return true;
        }
    }

    return false;
}

/**
 * Creates a shallow copy of a geometry object.
 *
 * @param {QtRect} geom Source geometry object.
 * @returns {Object|null} Cloned geometry object.
 */
function copyGeometry(geom) {
    if (!geom) {
        return null;
    }
    return {
        x: geom.x,
        y: geom.y,
        width: geom.width,
        height: geom.height
    };
}

/**
 * Validates whether two windows inhabit the same monitor and virtual desktop context.
 * Excludes non-normal windows, off-screen windows, different desktops, and maximized windows.
 *
 * @param {Window} win1 First target window.
 * @param {Window} win2 Second target window.
 * @returns {boolean} True if windows share the same screen output and virtual desktop.
 */
function canStackWith(win1, win2) {
    if (!win1 || !win2 || win1 === win2) {
        return false;
    }

    if (!win1.normalWindow || !win2.normalWindow) {
        return false;
    }

    // Permanently exclude maximized or screen-spanning windows
    if (isMaximized(win1) || isMaximized(win2) ||
        isMaximizedGeometry(win1, win1.frameGeometry) ||
        isMaximizedGeometry(win2, win2.frameGeometry)) {
        return false;
        }

        // 1. Output/Monitor Check
        if (win1.output && win2.output && win1.output !== win2.output) {
            if (win1.output.name && win2.output.name && win1.output.name !== win2.output.name) {
                return false;
            }
        }

        // 2. Virtual Desktop Check (ignore if either window is pinned to all desktops)
        if (!win1.onAllDesktops && !win2.onAllDesktops) {
            var d1 = win1.desktops || [];
            var d2 = win2.desktops || [];
            var sharedDesktop = false;

            for (var i = 0; i < d1.length; i++) {
                for (var j = 0; j < d2.length; j++) {
                    if (d1[i] === d2[j] || (d1[i].id && d1[i].id === d2[j].id)) {
                        sharedDesktop = true;
                        break;
                    }
                }
                if (sharedDesktop) {
                    break;
                }
            }

            if (!sharedDesktop) {
                return false;
            }
        }

        return true;
}

/**
 * Handler triggered whenever a window's position or dimensions change.
 *
 * @param {Window} win The window emitting the event.
 */
function onGeometryChanged(win) {
    if (isSyncing || !win || !win.normalWindow) {
        return;
    }

    var oldGeom = lastGeometries.get(win);
    var newGeom = win.frameGeometry;

    if (!newGeom) {
        return;
    }

    // If target window is maximizing or full-screen, update tracking and skip stack sync
    if (isMaximizedGeometry(win, newGeom)) {
        lastGeometries.set(win, copyGeometry(newGeom));
        return;
    }

    if (!oldGeom) {
        lastGeometries.set(win, copyGeometry(newGeom));
        return;
    }

    // Ignore sub-pixel changes
    if (isSameStack(oldGeom, newGeom, 1)) {
        return;
    }

    // If window was previously maximized (unmaximizing transition), skip stack sync
    if (isMaximizedGeometry(win, oldGeom)) {
        lastGeometries.set(win, copyGeometry(newGeom));
        return;
    }

    // Detect abrupt macro jumps (maximizing, unmaximizing, quick tiling) and skip stack sync
    var dX = Math.abs(newGeom.x - oldGeom.x);
    var dY = Math.abs(newGeom.y - oldGeom.y);
    var dW = Math.abs(newGeom.width - oldGeom.width);
    var dH = Math.abs(newGeom.height - oldGeom.height);

    if (dX > 150 || dY > 150 || dW > 150 || dH > 150) {
        lastGeometries.set(win, copyGeometry(newGeom));
        return;
    }

    isSyncing = true;

    // Find all windows matching the previous stack geometry on the same output/desktop
    var allWindows = workspace.windowList();
    for (var i = 0; i < allWindows.length; i++) {
        var other = allWindows[i];
        if (canStackWith(win, other)) {
            var otherOldGeom = lastGeometries.get(other) || other.frameGeometry;
            if (isSameStack(oldGeom, otherOldGeom, 15)) {
                other.frameGeometry = newGeom;
                lastGeometries.set(other, copyGeometry(newGeom));
            }
        }
    }

    lastGeometries.set(win, copyGeometry(newGeom));
    isSyncing = false;
}

/**
 * Registers geometry tracking and signal handlers on a window.
 *
 * @param {Window} win Target window.
 */
function registerWindow(win) {
    if (!win || !win.normalWindow) {
        return;
    }

    lastGeometries.set(win, copyGeometry(win.frameGeometry));

    win.frameGeometryChanged.connect(function () {
        onGeometryChanged(win);
    });

    if (win.maximizedChanged) {
        win.maximizedChanged.connect(function () {
            lastGeometries.set(win, copyGeometry(win.frameGeometry));
        });
    }
}

/**
 * Cleans up tracking data when a window is closed.
 *
 * @param {Window} win Closed window.
 */
function unregisterWindow(win) {
    if (win) {
        lastGeometries.delete(win);
    }
}

// Register existing and new windows
var initialWindows = workspace.windowList();
for (var i = 0; i < initialWindows.length; i++) {
    registerWindow(initialWindows[i]);
}

workspace.windowAdded.connect(registerWindow);
workspace.windowRemoved.connect(unregisterWindow);

// Shortcut 1: Snap Active Window to Window Underneath
registerShortcut(
    "stack_switch_snap",
    "Stack & Switch - Snap Active Window to Window Underneath",
    "Meta+>",
    function () {
        var stacking = workspace.stackingOrder;
        var active = workspace.activeWindow;

        if (!active || isMaximizedGeometry(active, active.frameGeometry)) {
            return;
        }

        var currentIndex = stacking.indexOf(active);

        // Find top-most window directly underneath active window on same screen/desktop
        for (var i = currentIndex - 1; i >= 0; i--) {
            var candidate = stacking[i];
            if (canStackWith(active, candidate)) {
                active.frameGeometry = candidate.frameGeometry;
                lastGeometries.set(active, copyGeometry(candidate.frameGeometry));
                break;
            }
        }
    }
);

// Shortcut 2: Cycle Focus in Current Stack
registerShortcut(
    "stack_switch_cycle",
    "Stack & Switch - Cycle Focus in Current Stack",
    "Meta+<",
    function () {
        var active = workspace.activeWindow;
        if (!active || isMaximizedGeometry(active, active.frameGeometry)) {
            return;
        }

        var allWindows = workspace.windowList();
        var stackedSet = [];

        for (var i = 0; i < allWindows.length; i++) {
            var win = allWindows[i];
            if (win === active || (canStackWith(active, win) && isSameStack(active.frameGeometry, win.frameGeometry))) {
                stackedSet.push(win);
            }
        }

        if (stackedSet.length > 1) {
            var currentIdx = stackedSet.indexOf(active);
            var nextIdx = (currentIdx + 1) % stackedSet.length;
            var targetWin = stackedSet[nextIdx];

            workspace.activeWindow = targetWin;
        }
    }
);

// Shortcut 3: Detach Active Window from Stack
registerShortcut(
    "stack_switch_detach",
    "Stack & Switch - Detach Active Window from Stack",
    "Meta+Y",
    function () {
        var active = workspace.activeWindow;
        if (!active || isMaximizedGeometry(active, active.frameGeometry)) {
            return;
        }

        var currentGeom = active.frameGeometry;
        var newGeom = {
            x: currentGeom.x + 40,
            y: currentGeom.y + 40,
            width: currentGeom.width,
            height: currentGeom.height
        };

        isSyncing = true;
        active.frameGeometry = newGeom;
        lastGeometries.set(active, copyGeometry(newGeom));
        isSyncing = false;
    }
);
/**
 * @file main.js
 * @brief KWin 6 script for snapping active windows, cycling focus,
 * and automatically dragging/resizing stacked windows together.
 */

var lastGeometries = new Map();
var isSyncing = false;

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
 * Creates a shallow copy of a geometry object.
 *
 * @param {QtRect} geom Source geometry object.
 * @returns {Object|null} Cloned geometry.
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
 * Excludes non-normal windows, off-screen windows, and windows on different virtual desktops.
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

    if (!oldGeom) {
        lastGeometries.set(win, copyGeometry(newGeom));
        return;
    }

    // Ignore sub-pixel changes
    if (isSameStack(oldGeom, newGeom, 1)) {
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

        if (!active) {
            return;
        }

        var currentIndex = stacking.indexOf(active);

        // Find the top-most window directly underneath the active window on the same screen/desktop
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
        if (!active) {
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
        if (!active) {
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
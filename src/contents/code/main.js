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

    // Find all windows that matched the previous stack geometry and update them
    var allWindows = workspace.windowList();
    for (var i = 0; i < allWindows.length; i++) {
        var other = allWindows[i];
        if (other !== win && other.normalWindow) {
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
    "SnapToWindowBelow",
    "Snap Active Window to Window Underneath",
    "Meta+>",
    function () {
        var stacking = workspace.stackingOrder;
        var active = workspace.activeWindow;

        if (!active) {
            return;
        }

        var currentIndex = stacking.indexOf(active);
        if (currentIndex > 0) {
            var targetWindow = stacking[currentIndex - 1];
            active.frameGeometry = targetWindow.frameGeometry;
            lastGeometries.set(active, copyGeometry(targetWindow.frameGeometry));
        }
    }
);

// Shortcut 2: Cycle Focus in Current Stack
registerShortcut(
    "CycleStackedWindows",
    "Cycle Focus in Current Stack",
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
            if (win.normalWindow && isSameStack(active.frameGeometry, win.frameGeometry)) {
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
    "DetachStackedWindow",
    "Detach Active Window from Stack",
    "Meta+Shift+U",
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
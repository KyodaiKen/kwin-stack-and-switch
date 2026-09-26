# KWin Stack & Switch

A lightweight KWin 6 script for KDE Plasma 6 that adds manual window stacking, geometry synchronization, and isolated focus cycling.

It lets you snap floating windows into identical screen positions, keep their move and resize operations synced, and cycle focus strictly within the stack without opening system-wide `Alt+Tab` overlays.

It is basically simulating the stacked tabbed window experience on [Haiku](https://github.com/haiku/haiku), but without tabs and instead relying on keyboard shortcuts.

## Requirements

* KDE Plasma 6.x
* Standard Plasma CLI tools (`kpackagetool6`, `kwriteconfig6`, and `qdbus6` or `busctl`)

## Installation

Run the included installer script from the project folder:

```bash
chmod +x install.sh
./install.sh
```

The script unregisters any previous version, installs `kwin-stack-and-switch.tar.gz`, enables the plugin in `kwinrc`, and reloads KWin via DBus.

### Manual Installation

If you prefer installing without the shell script:

```bash
# Rebuild archive
tar -czvf kwin-stack-and-switch.tar.gz metadata.json contents/

# Install and enable
kpackagetool6 --type=KWin/Script -i kwin-stack-and-switch.tar.gz
kwriteconfig6 --file kwinrc --group Plugins --key kwin-stack-and-switchEnabled true
qdbus-qt6 org.kde.KWin /KWin reconfigure
```

## Keybindings

| Action | Default Shortcut | Description |
| --- | --- | --- |
| **Stack & Switch - Snap Active Window to Window Underneath** | `Meta + >` | Matches active window geometry to the window directly underneath it. |
| **Stack & Switch - Cycle Focus in Current Stack** | `Meta + <` | Cycles focus through windows sharing the current window's position. |
| **Stack & Switch - Detach Active Window from Stack** | `Meta + Y` | Detatches active window by offsetting it by 40px to un-sync it from the stack. |

Keybindings can be customized in **System Settings → Keyboard → Shortcuts → KWin**.
The default bindings make sense on a German layout keyboard. :)

## How It Works

* **Syncing:** Hooks into KWin's `frameGeometryChanged` signal. When you move or resize any window in a stack, all windows matching its previous geometry update automatically.
* **Focus Cycling:** Filters `workspace.windowList()` for normal windows within a 15px pixel tolerance of the active window, ignoring all unrelated open applications.
* **Detaching:** Modifies the target window's coordinates past the match tolerance, allowing independent movement again.

## License

MIT
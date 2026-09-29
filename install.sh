#!/usr/bin/env bash
#
# @file install.sh
# @brief Installer for kwin-stack-and-switch.tar.gz on KDE Plasma 6.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_FILE="${SCRIPT_DIR}/kwin-stack-and-switch.tar.gz"
PACKAGE_ID="kwin-stack-and-switch"

if [ ! -f "${PACKAGE_FILE}" ]; then
    echo "Error: Package archive ${PACKAGE_FILE} not found."
    exit 1
fi

echo "Installing ${PACKAGE_ID} from archive..."

# Remove prior registration if present to prevent upgrade lookup bugs
qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "kwin-stack-and-switch" &>/dev/null || true
kpackagetool6 --type=KWin/Script -r "${PACKAGE_ID}" &>/dev/null || true

# Install cleanly from the .tar.gz archive
kpackagetool6 --type=KWin/Script -i "${PACKAGE_FILE}"

# Enable plugin in kwinrc configuration
kwriteconfig6 --file kwinrc --group Plugins --key "${PACKAGE_ID}Enabled" true
qdbus-qt6 org.kde.KWin /KWin reconfigure

echo "Installation complete!"
echo "Shortcuts available under: System Settings -> Keyboard -> Shortcuts -> Window Management"
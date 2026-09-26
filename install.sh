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
kpackagetool6 --type=KWin/Script -r "${PACKAGE_ID}" &>/dev/null || true

# Install cleanly from the .tar.gz archive
kpackagetool6 --type=KWin/Script -i "${PACKAGE_FILE}"

# Enable plugin in kwinrc configuration
kwriteconfig6 --file kwinrc --group Plugins --key "${PACKAGE_ID}Enabled" true

# Detect available DBus binary in Plasma 6
if command -v qdbus6 &>/dev/null; then
    qdbus6 org.kde.KWin /KWin reconfigure
elif command -v qdbus-qt6 &>/dev/null; then
    qdbus-qt6 org.kde.KWin /KWin reconfigure
elif command -v qdbus &>/dev/null; then
    qdbus org.kde.KWin /KWin reconfigure
else
    busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
fi

echo "Installation complete!"
echo "Shortcuts available under: System Settings -> Keyboard -> Shortcuts -> Window Management"
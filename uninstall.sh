#!/usr/bin/env bash
#
# @file uninstall.sh
# @brief Uninstaller for kwin-stack-and-switch.tar.gz on KDE Plasma 6.

set -euo pipefail

PACKAGE_ID="kwin-stack-and-switch"

echo "Uninstalling ${PACKAGE_ID} from archive..."

# Remove prior registration if present to prevent upgrade lookup bugs
qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "kwin-stack-and-switch"
kpackagetool6 --type=KWin/Script -r "${PACKAGE_ID}"
qdbus-qt6 org.kde.KWin /KWin reconfigure

echo "Uninstallation complete!"
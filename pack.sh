#!/usr/bin/env bash
#
# @file pack.sh
# @brief Packages the KWin script into a .tar.gz archive and bundles it
#        with install.sh into a release .zip file using 7-Zip.

set -euo pipefail

PACKAGE_NAME="kwin-stack-and-switch"

echo "Building ${PACKAGE_NAME}.tar.gz..."

# Create tarball from inside src/ so metadata.json is at the root of the archive
tar -czvf "${PACKAGE_NAME}.tar.gz" -C src .

echo "Bundling ${PACKAGE_NAME}.zip using 7z..."

# Create a zip archive (-tzip) containing the .tar.gz file and install.sh
7z a -tzip "${PACKAGE_NAME}.zip" "${PACKAGE_NAME}.tar.gz" install.sh README.md LICENSE

echo "Package successfully created: ${PACKAGE_NAME}.zip"
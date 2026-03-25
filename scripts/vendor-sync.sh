#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# Vendor Sync — copy @rescor core packages into api/vendor/
# ════════════════════════════════════════════════════════════════════
# Usage: ./scripts/vendor-sync.sh [path/to/core.rescor.net/packages]
# Default: ../../core.rescor.net/packages (sibling repo checkout)
# ════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CORE_PACKAGES="${1:-$PROJECT_ROOT/../core.rescor.net/packages}"
VENDOR_DIR="$PROJECT_ROOT/api/vendor"

PACKAGES=(core-db core-config core-utils)

if [ ! -d "$CORE_PACKAGES" ]; then
  echo "ERROR: Core packages directory not found: $CORE_PACKAGES"
  echo "Usage: $0 [path/to/core.rescor.net/packages]"
  exit 1
fi

mkdir -p "$VENDOR_DIR"

for package in "${PACKAGES[@]}"; do
  SOURCE="$CORE_PACKAGES/$package"
  DESTINATION="$VENDOR_DIR/$package"

  if [ ! -d "$SOURCE" ]; then
    echo "ERROR: Package not found: $SOURCE"
    exit 1
  fi

  echo "Syncing $package..."
  rm -rf "$DESTINATION"
  cp -r "$SOURCE" "$DESTINATION"

  # Remove artifacts that shouldn't be vendored
  rm -rf "$DESTINATION/node_modules"
  rm -rf "$DESTINATION/test"
  rm -rf "$DESTINATION/tests"
  rm -rf "$DESTINATION/dist"
  rm -rf "$DESTINATION/.turbo"

  echo "  ✓ $package"
done

echo ""
echo "Vendor sync complete. Packages in $VENDOR_DIR:"
ls -1 "$VENDOR_DIR"

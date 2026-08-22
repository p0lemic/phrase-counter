#!/usr/bin/env bash
# Regenera los iconos de la app a partir de assets/icon.svg y assets/icon-mac.svg.
#   npm run icons
set -euo pipefail
cd "$(dirname "$0")/.."

python3 assets/generate-icon.py

# PNG maestro (Linux / icono de la ventana en desarrollo).
npx electron assets/render-icon.js assets/icon.svg 1024:assets/icon.png

# .icns para macOS, desde la variante con el margen que pide Apple.
ICONSET="$(mktemp -d)/icon.iconset"
mkdir -p "$ICONSET"
npx electron assets/render-icon.js assets/icon-mac.svg \
  16:"$ICONSET/icon_16x16.png"    32:"$ICONSET/icon_16x16@2x.png" \
  32:"$ICONSET/icon_32x32.png"    64:"$ICONSET/icon_32x32@2x.png" \
  128:"$ICONSET/icon_128x128.png" 256:"$ICONSET/icon_128x128@2x.png" \
  256:"$ICONSET/icon_256x256.png" 512:"$ICONSET/icon_256x256@2x.png" \
  512:"$ICONSET/icon_512x512.png" 1024:"$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o assets/icon.icns

# .ico multi-tamano para Windows.
ICODIR="$(mktemp -d)"
npx electron assets/render-icon.js assets/icon.svg \
  16:"$ICODIR/16.png" 24:"$ICODIR/24.png" 32:"$ICODIR/32.png" 48:"$ICODIR/48.png" \
  64:"$ICODIR/64.png" 128:"$ICODIR/128.png" 256:"$ICODIR/256.png"
python3 - "$ICODIR" <<'PY'
import sys
from PIL import Image

sizes = [16, 24, 32, 48, 64, 128, 256]
imgs = [Image.open(f"{sys.argv[1]}/{n}.png").convert("RGBA") for n in sizes]
imgs[-1].save("assets/icon.ico", format="ICO",
              sizes=[(n, n) for n in sizes], append_images=imgs[:-1])
PY

echo "Iconos regenerados: assets/icon.png, assets/icon.icns, assets/icon.ico"

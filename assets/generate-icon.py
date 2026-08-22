"""Genera los SVG del icono (fondo completo y variante macOS con margen).

El arte se define en un lienzo de 1024x1024; la variante mac lo encoge al
recuadro de 824px centrado que pide Apple, para que el squircle quede al
tamano correcto junto al resto de iconos del Dock.
"""

from pathlib import Path

ACCENT_TOP = "#ff8496"
ACCENT_BOTTOM = "#ff4a63"

# Alturas de las frases: intro, subida, drop (la roja) y caida.
BARS = [132, 198, 168, 270, 450, 354, 288, 216, 150]
DROP_INDEX = 4
BAR_W = 50
BAR_GAP = 30
BASELINE = 762
ART_X0 = (1024 - (len(BARS) * BAR_W + (len(BARS) - 1) * BAR_GAP)) / 2

DEFS = """  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#262936"/>
      <stop offset="1" stop-color="#111219"/>
    </linearGradient>
    <linearGradient id="phrase" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#828899"/>
      <stop offset="1" stop-color="#464b5b"/>
    </linearGradient>
    <linearGradient id="drop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="%s"/>
      <stop offset="1" stop-color="%s"/>
    </linearGradient>
    <filter id="dropGlow" x="-120%%" y="-60%%" width="340%%" height="220%%">
      <feGaussianBlur stdDeviation="26" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 0.25 0 0 0  0 0 0.3 0 0  0 0 0 0.75 0"/>
    </filter>
  </defs>""" % (ACCENT_TOP, ACCENT_BOTTOM)


def art() -> str:
    out = []
    x = ART_X0
    drop_x = ART_X0 + DROP_INDEX * (BAR_W + BAR_GAP)
    drop_h = BARS[DROP_INDEX]

    # Linea de base: la rejilla sobre la que se apoyan las frases.
    out.append(
        f'    <rect x="140" y="{BASELINE + 6}" width="744" height="11" rx="5.5" fill="#383c4a"/>'
    )

    # Resplandor de la barra del drop, por detras de todas las barras.
    out.append(
        f'    <rect x="{drop_x}" y="{BASELINE - drop_h}" width="{BAR_W}" '
        f'height="{drop_h}" rx="16" fill="{ACCENT_BOTTOM}" filter="url(#dropGlow)"/>'
    )

    for i, h in enumerate(BARS):
        fill = "url(#drop)" if i == DROP_INDEX else "url(#phrase)"
        out.append(
            f'    <rect x="{x}" y="{BASELINE - h}" width="{BAR_W}" '
            f'height="{h}" rx="16" fill="{fill}"/>'
        )
        x += BAR_W + BAR_GAP

    # Cuna que senala el drop.
    cx = drop_x + BAR_W / 2
    top = BASELINE - drop_h - 74
    out.append(
        f'    <path d="M{cx - 33} {top} L{cx + 33} {top} L{cx} {top + 50} Z" '
        f'fill="{ACCENT_BOTTOM}"/>'
    )
    return "\n".join(out)


def svg(tile_x: float, tile_size: float, radius: float) -> str:
    scale = tile_size / 1024
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
{DEFS}
  <g transform="translate({tile_x} {tile_x}) scale({scale})">
    <rect x="0" y="0" width="1024" height="1024" rx="{radius / scale}" fill="url(#tile)"/>
    <rect x="6" y="6" width="1012" height="1012" rx="{radius / scale - 6}" fill="none"
          stroke="#ffffff" stroke-opacity="0.07" stroke-width="6"/>
{art()}
  </g>
</svg>
"""


here = Path(__file__).parent
(here / "icon.svg").write_text(svg(0, 1024, 228))
(here / "icon-mac.svg").write_text(svg(100, 824, 185))
print("escritos assets/icon.svg y assets/icon-mac.svg")

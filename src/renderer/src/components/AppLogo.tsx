/** El icono de la app, en pequeño, para la cabecera. Es una versión simplificada de
 *  `assets/icon.svg`: 7 barras en vez de 9 y sin el resplandor ni la cuña del drop, que a
 *  30px se convierten en manchas. Dibujado a mano en vez de cargar el PNG para que se vea
 *  nítido en cualquier tamaño y densidad de pantalla. */

// Alturas de las frases (intro, subida, drop, caída); la del drop es la roja.
const BARS = [4.2, 6.6, 8.8, 12.4, 10, 7.2, 5]
const DROP_INDEX = 3
const BAR_W = 1.7
const BAR_GAP = 1.15
const BASELINE = 19
const FIRST_X = (24 - (BARS.length * BAR_W + (BARS.length - 1) * BAR_GAP)) / 2

export default function AppLogo({ size = 30 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      className="app-logo"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="24" height="24" rx="6.5" fill="#23262f" />
      <rect
        x="0.5"
        y="0.5"
        width="23"
        height="23"
        rx="6"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.08"
      />
      {BARS.map((height, index) => (
        <rect
          key={index}
          x={FIRST_X + index * (BAR_W + BAR_GAP)}
          y={BASELINE - height}
          width={BAR_W}
          height={height}
          rx={BAR_W / 2}
          fill={index === DROP_INDEX ? 'var(--accent)' : '#767c8e'}
        />
      ))}
    </svg>
  )
}

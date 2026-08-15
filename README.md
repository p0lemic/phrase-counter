# Drop Count

App de escritorio (Electron + React + TypeScript) para analizar canciones de makina: detecta el BPM y el bombo, calcula la rejilla de frases (cada 32 bombos = 1 frase), propone bloques por energía y marca el drop — todo editable a mano, con una librería persistente.

## Requisitos

- Node.js 18+ (probado con Node 26)
- macOS, Windows o Linux

No hace falta instalar nada más (Python, compiladores, etc.) — todas las dependencias son WASM/JS puro.

## Instalación

```bash
npm install
```

## Ejecutar en modo desarrollo

```bash
npm run dev
```

Abre la app en una ventana de Electron con recarga en caliente. Arrastra un archivo de audio (mp3, wav, flac, aiff, m4a, ogg) a la ventana para analizarlo, o usa los botones "+ Archivos" / "+ Carpeta" de la librería.

La librería se guarda en `~/Library/Application Support/drop-count/drop-count.sqlite` (macOS) — se conserva entre sesiones.

### Abrir un archivo concreto al arrancar (atajo de desarrollo)

Útil para probar sin arrastrar el archivo cada vez:

```bash
DROP_COUNT_DEBUG_FILE="/ruta/a/tu/cancion.mp3" npm run dev
```

## Tests y typecheck

```bash
npm test         # vitest — tests unitarios del análisis de audio
npm run typecheck
```

## Empaquetar la app

Genera un instalador para tu plataforma en `release/`:

```bash
npm run package:mac    # .app + .dmg (arm64 y x64)
npm run package:win    # instalador NSIS
npm run package:linux  # AppImage
```

## Licencia

AGPL-3.0. Esto es así por la dependencia `essentia.js` (detección de BPM), que es AGPL — si distribuyes esta app (aunque sea a un grupo cerrado, no solo como servicio web), estás obligado a publicar el código fuente completo bajo la misma licencia. Ver [`LICENSE`](./LICENSE).

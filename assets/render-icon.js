// Rasteriza un SVG a PNG usando el Chromium de Electron (no hay rsvg ni
// imagemagick en la maquina, y el icono usa gradientes y un filtro de brillo).
//   npx electron assets/render-icon.js <entrada.svg> <tamano>:<salida.png> [...]
//
// Una sola ventana de 1024x1024: se redimensiona el SVG por JS y se captura la
// esquina superior izquierda. Crear una ventana por tamano falla (ERR_FAILED en
// la segunda carga).
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const [svgPath, ...targets] = process.argv.slice(2)
const CANVAS = 1024

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.resolve(svgPath), 'utf8')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drop-count-icon-'))
  const htmlPath = path.join(tmpDir, 'icon.html')
  fs.writeFileSync(
    htmlPath,
    `<!doctype html><meta charset="utf-8">
    <style>html,body{margin:0;background:transparent}
    svg{display:block}</style>${svg}`
  )

  const win = new BrowserWindow({
    width: CANVAS,
    height: CANVAS,
    useContentSize: true,
    show: false,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000'
  })
  await win.loadFile(htmlPath)

  for (const target of targets) {
    const [sizeArg, outPath] = target.split(':')
    const size = Number(sizeArg)
    await win.webContents.executeJavaScript(
      `(() => { const s = document.querySelector('svg');
        s.style.width = '${size}px'; s.style.height = '${size}px'; })()`
    )
    await new Promise((r) => setTimeout(r, 200))

    let image = await win.capturePage({ x: 0, y: 0, width: size, height: size })
    // En pantallas Retina la captura sale al doble; la reducimos al tamano pedido.
    if (image.getSize().width !== size) {
      image = image.resize({ width: size, height: size, quality: 'best' })
    }
    fs.writeFileSync(path.resolve(outPath), image.toPNG())
    console.log(`${outPath} (${size}px)`)
  }

  fs.rmSync(tmpDir, { recursive: true, force: true })
  app.exit(0)
})

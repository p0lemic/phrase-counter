import { useCallback, useEffect, useState } from 'react'
import SongAnalysisView from './components/SongAnalysisView'
import Library from './components/Library'

interface OpenSong {
  filePath: string
  fileName: string
}

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.aiff', '.m4a', '.ogg']

function isAudioFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function LibraryWithDropzone({
  onOpenSong,
  refreshKey
}: {
  onOpenSong: (song: OpenSong) => void
  refreshKey: number
}): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)

      const file = event.dataTransfer.files[0]
      if (!file || !isAudioFile(file.name)) return

      const filePath = (file as unknown as { path: string }).path
      if (!filePath) return

      onOpenSong({ filePath, fileName: file.name })
    },
    [onOpenSong]
  )

  return (
    <div
      className={`library-dropzone${isDragging ? ' library-dropzone--active' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <Library key={refreshKey} onOpenSong={onOpenSong} />
    </div>
  )
}

/** Dev-only convenience: `?debugFile=<path>` auto-opens a song, to test without a real drag-and-drop. */
function useDebugFileFromQuery(onSongReady: (song: OpenSong) => void): void {
  useEffect(() => {
    const debugFile = new URLSearchParams(window.location.search).get('debugFile')
    if (!debugFile) return
    onSongReady({ filePath: debugFile, fileName: debugFile.split('/').pop() ?? debugFile })
    // Only ever run once, from the URL present at load time.
  }, [])
}

export default function App(): React.JSX.Element {
  const [currentSong, setCurrentSong] = useState<OpenSong | null>(null)
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0)
  useDebugFileFromQuery(setCurrentSong)

  function closeSong(): void {
    setCurrentSong(null)
    setLibraryRefreshKey((key) => key + 1)
  }

  return (
    <main className="app">
      <header className="app__header">
        <h1>Drop Count</h1>
      </header>
      {currentSong ? (
        <SongAnalysisView song={currentSong} onClose={closeSong} />
      ) : (
        <LibraryWithDropzone onOpenSong={setCurrentSong} refreshKey={libraryRefreshKey} />
      )}
    </main>
  )
}

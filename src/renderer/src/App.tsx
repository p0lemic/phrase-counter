import { useCallback, useEffect, useState } from 'react'
import AppLogo from './components/AppLogo'
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

/** This dropzone wraps the whole library, so it has to let the library's own song drags (onto a
 *  collection in the sidebar) pass through untouched and only react to files dropped from Finder. */
function isFileDrag(event: React.DragEvent): boolean {
  return [...event.dataTransfer.types].includes('Files')
}

function LibraryWithDropzone({
  onOpenSong,
  refreshToken,
  isHidden
}: {
  onOpenSong: (song: OpenSong) => void
  refreshToken: number
  isHidden: boolean
}): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event)) return
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
      hidden={isHidden}
      onDragOver={(event) => {
        if (!isFileDrag(event)) return
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <Library onOpenSong={onOpenSong} refreshToken={refreshToken} />
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
        <AppLogo />
        <h1>Phrase Counter</h1>
      </header>
      {currentSong && <SongAnalysisView song={currentSong} onClose={closeSong} />}
      {/* Kept mounted (just hidden) behind the song view: remounting it would throw away the
          search, the selection, the open collection, the sort and the scroll position. */}
      <LibraryWithDropzone
        onOpenSong={setCurrentSong}
        refreshToken={libraryRefreshKey}
        isHidden={currentSong !== null}
      />
    </main>
  )
}

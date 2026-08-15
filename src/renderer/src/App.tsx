import { useCallback, useState } from 'react'

interface DroppedSong {
  filePath: string
  fileName: string
}

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.aiff', '.m4a', '.ogg']

function isAudioFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function DropZone({ onSongDropped }: { onSongDropped: (song: DroppedSong) => void }): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)

      const file = event.dataTransfer.files[0]
      if (!file || !isAudioFile(file.name)) return

      const filePath = (file as unknown as { path: string }).path
      if (!filePath) return

      onSongDropped({ filePath, fileName: file.name })
    },
    [onSongDropped]
  )

  return (
    <div
      className={`dropzone${isDragging ? ' dropzone--active' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <p>Arrastra un archivo de audio aquí (mp3, wav, flac…)</p>
    </div>
  )
}

function SongView({ song, onClose }: { song: DroppedSong; onClose: () => void }): React.JSX.Element {
  return (
    <div className="song-view">
      <button className="back-button" onClick={onClose}>
        ← Volver
      </button>
      <h2>{song.fileName}</h2>
      <p className="song-view__path">{song.filePath}</p>
      <p className="song-view__placeholder">
        El análisis de audio (BPM, rejilla de frases, bloques) se implementará en los siguientes hitos.
      </p>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [currentSong, setCurrentSong] = useState<DroppedSong | null>(null)

  return (
    <main className="app">
      <header className="app__header">
        <h1>Drop Count</h1>
      </header>
      {currentSong ? (
        <SongView song={currentSong} onClose={() => setCurrentSong(null)} />
      ) : (
        <DropZone onSongDropped={setCurrentSong} />
      )}
    </main>
  )
}

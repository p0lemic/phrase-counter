import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/plugins/regions'
import { decodeAudioBuffer } from '../audio-analysis/decode'
import { detectKicks } from '../audio-analysis/kickDetection'
import { buildBeatGrid, phraseBoundariesSec } from '../audio-analysis/bpmGrid'

interface Song {
  filePath: string
  fileName: string
}

type Status = { kind: 'analyzing' } | { kind: 'ready'; bpm: number } | { kind: 'error'; message: string }

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.aiff': 'audio/aiff',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg'
}

function guessMimeType(filePath: string): string {
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return MIME_TYPES_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

export default function SongAnalysisView({
  song,
  onClose
}: {
  song: Song
  onClose: () => void
}): React.JSX.Element {
  const waveformContainerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>({ kind: 'analyzing' })

  useEffect(() => {
    let cancelled = false
    let wavesurfer: WaveSurfer | undefined
    let blobUrl: string | undefined

    async function analyze(): Promise<void> {
      setStatus({ kind: 'analyzing' })

      const arrayBuffer = await window.api.readAudioFile(song.filePath)
      const { monoSamples, sampleRate, durationSec } = await decodeAudioBuffer(arrayBuffer)
      const kickTimesSec = detectKicks(monoSamples, sampleRate)
      const grid = buildBeatGrid(kickTimesSec, durationSec)
      const phraseTimesSec = phraseBoundariesSec(grid.kickTimesSec)

      if (cancelled || !waveformContainerRef.current) return

      // wavesurfer needs a playable URL; a file:// URL is blocked here since the
      // renderer's origin isn't file://, so we reuse the bytes we already read.
      blobUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: guessMimeType(song.filePath) }))

      wavesurfer = WaveSurfer.create({
        container: waveformContainerRef.current,
        height: 120,
        waveColor: '#4c4f5c',
        progressColor: '#4c4f5c',
        cursorColor: '#ff5d73',
        url: blobUrl,
        peaks: [monoSamples],
        duration: durationSec
      })

      const regions = wavesurfer.registerPlugin(RegionsPlugin.create())
      wavesurfer.on('decode', () => {
        for (const timeSec of phraseTimesSec) {
          regions.addRegion({
            start: timeSec,
            end: timeSec,
            drag: false,
            resize: false,
            color: 'rgba(255, 255, 255, 0.35)'
          })
        }
      })

      setStatus({ kind: 'ready', bpm: Math.round(grid.bpm) })
    }

    analyze().catch((error: unknown) => {
      if (cancelled) return
      const message = error instanceof Error ? error.message : String(error)
      setStatus({ kind: 'error', message })
    })

    return () => {
      cancelled = true
      wavesurfer?.destroy()
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [song.filePath])

  return (
    <div className="song-view">
      <button className="back-button" onClick={onClose}>
        ← Volver
      </button>
      <h2>{song.fileName}</h2>

      {status.kind === 'analyzing' && <p className="song-view__status">Analizando audio…</p>}
      {status.kind === 'error' && <p className="song-view__status song-view__status--error">{status.message}</p>}
      {status.kind === 'ready' && <p className="song-view__status">{status.bpm} BPM</p>}

      <div ref={waveformContainerRef} className="waveform" />
    </div>
  )
}

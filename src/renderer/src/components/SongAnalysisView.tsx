import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/plugins/regions'
import { decodeAudioBuffer } from '../audio-analysis/decode'
import { detectKicks } from '../audio-analysis/kickDetection'
import { buildBeatGrid, phraseBoundariesSec } from '../audio-analysis/bpmGrid'
import { computePhraseEnergies, groupPhrasesIntoBlocks } from '../audio-analysis/energySegmentation'
import { markDrops } from '../audio-analysis/dropDetection'
import { formatBlocks, type Block } from '../audio-analysis/formatBlocks'

interface Song {
  filePath: string
  fileName: string
}

type Status =
  | { kind: 'analyzing' }
  | { kind: 'ready'; bpm: number; blocks: Block[] }
  | { kind: 'error'; message: string }

/** Timestamps where each block starts, plus a final entry at the track's end. */
function blockBoundaryTimesSec(blocks: Block[], phraseTimesSec: number[], durationSec: number): number[] {
  const boundaries: number[] = []
  let phraseIndex = 0
  for (const block of blocks) {
    boundaries.push(phraseTimesSec[phraseIndex] ?? durationSec)
    phraseIndex += block.phraseCount
  }
  boundaries.push(durationSec)
  return boundaries
}

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
      const phraseEnergies = computePhraseEnergies(monoSamples, sampleRate, phraseTimesSec, durationSec)
      const blocks = markDrops(groupPhrasesIntoBlocks(phraseEnergies), phraseEnergies)

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
      const boundaryTimesSec = blockBoundaryTimesSec(blocks, phraseTimesSec, durationSec)

      wavesurfer.on('decode', () => {
        for (const timeSec of phraseTimesSec) {
          regions.addRegion({
            start: timeSec,
            end: timeSec,
            drag: false,
            resize: false,
            color: 'rgba(255, 255, 255, 0.2)'
          })
        }

        blocks.forEach((block, i) => {
          const start = boundaryTimesSec[i]
          const end = boundaryTimesSec[i + 1]

          regions.addRegion({
            start,
            end: start,
            drag: false,
            resize: false,
            color: block.isDrop ? '#ff5d73' : 'rgba(255, 255, 255, 0.9)'
          })

          if (block.isDrop) {
            regions.addRegion({
              start,
              end,
              drag: false,
              resize: false,
              color: 'rgba(255, 93, 115, 0.15)'
            })
          }
        })
      })

      setStatus({ kind: 'ready', bpm: Math.round(grid.bpm), blocks })
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
      {status.kind === 'ready' && (
        <p className="song-view__status">
          {status.bpm} BPM · <span className="song-view__result">{formatBlocks(status.blocks)}</span>
        </p>
      )}

      <div ref={waveformContainerRef} className="waveform" />
    </div>
  )
}

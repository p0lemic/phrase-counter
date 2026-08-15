import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { type Region } from 'wavesurfer.js/plugins/regions'
import { decodeAudioBuffer } from '../audio-analysis/decode'
import { detectKicks } from '../audio-analysis/kickDetection'
import { buildBeatGrid, buildBeatGridFromBpm, phraseBoundariesSec } from '../audio-analysis/bpmGrid'
import { computePhraseEnergies, groupPhrasesIntoBlocks } from '../audio-analysis/energySegmentation'
import { markDrops } from '../audio-analysis/dropDetection'
import { formatBlocks, type Block } from '../audio-analysis/formatBlocks'
import { blockBoundaryTimesSec, mergeWithNext, shiftBoundary, splitInHalf, toggleDrop } from '../audio-analysis/blockEditing'

interface Song {
  filePath: string
  fileName: string
}

interface AnalysisResult {
  bpm: number
  durationSec: number
  phraseTimesSec: number[]
  phraseEnergies: number[]
  blocks: Block[]
}

type Status = { kind: 'analyzing' } | { kind: 'ready' } | { kind: 'error'; message: string }

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
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const allRegionsRef = useRef<Region[]>([])
  const monoSamplesRef = useRef<Float32Array | null>(null)
  const sampleRateRef = useRef<number | null>(null)

  const [status, setStatus] = useState<Status>({ kind: 'analyzing' })
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [waveformReady, setWaveformReady] = useState(false)
  const [manualBpmInput, setManualBpmInput] = useState('')
  const [manualOffsetInput, setManualOffsetInput] = useState('')
  const [copyFeedback, setCopyFeedback] = useState(false)

  // Runs the analysis pipeline once per song and sets up the waveform.
  useEffect(() => {
    let cancelled = false
    let blobUrl: string | undefined
    setResult(null)
    setWaveformReady(false)
    setManualBpmInput('')
    setManualOffsetInput('')

    async function analyze(): Promise<void> {
      setStatus({ kind: 'analyzing' })

      const arrayBuffer = await window.api.readAudioFile(song.filePath)
      const { monoSamples, sampleRate, durationSec } = await decodeAudioBuffer(arrayBuffer)
      monoSamplesRef.current = monoSamples
      sampleRateRef.current = sampleRate
      const kickTimesSec = detectKicks(monoSamples, sampleRate)
      const grid = buildBeatGrid(kickTimesSec, durationSec)
      const phraseTimesSec = phraseBoundariesSec(grid.kickTimesSec)
      const phraseEnergies = computePhraseEnergies(monoSamples, sampleRate, phraseTimesSec, durationSec)
      const blocks = markDrops(groupPhrasesIntoBlocks(phraseEnergies), phraseEnergies)

      if (cancelled || !waveformContainerRef.current) return

      // wavesurfer needs a playable URL; a file:// URL is blocked here since the
      // renderer's origin isn't file://, so we reuse the bytes we already read.
      blobUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: guessMimeType(song.filePath) }))

      const wavesurfer = WaveSurfer.create({
        container: waveformContainerRef.current,
        height: 120,
        waveColor: '#4c4f5c',
        progressColor: '#4c4f5c',
        cursorColor: '#ff5d73',
        url: blobUrl,
        peaks: [monoSamples],
        duration: durationSec
      })
      wavesurferRef.current = wavesurfer
      regionsRef.current = wavesurfer.registerPlugin(RegionsPlugin.create())

      wavesurfer.on('decode', () => {
        if (!cancelled) setWaveformReady(true)
      })

      setResult({ bpm: grid.bpm, durationSec, phraseTimesSec, phraseEnergies, blocks })
      setStatus({ kind: 'ready' })
    }

    analyze().catch((error: unknown) => {
      if (cancelled) return
      const message = error instanceof Error ? error.message : String(error)
      setStatus({ kind: 'error', message })
    })

    return () => {
      cancelled = true
      wavesurferRef.current?.destroy()
      wavesurferRef.current = null
      regionsRef.current = null
      allRegionsRef.current = []
      monoSamplesRef.current = null
      sampleRateRef.current = null
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [song.filePath])

  // Redraws the phrase grid, block boundaries and drop highlight whenever the analysis changes.
  useEffect(() => {
    const regions = regionsRef.current
    if (!regions || !result || !waveformReady) return

    for (const region of allRegionsRef.current) region.remove()
    allRegionsRef.current = []

    for (const timeSec of result.phraseTimesSec) {
      allRegionsRef.current.push(
        regions.addRegion({
          start: timeSec,
          end: timeSec,
          drag: false,
          resize: false,
          color: 'rgba(255, 255, 255, 0.2)'
        })
      )
    }

    const boundaryTimesSec = blockBoundaryTimesSec(result.blocks, result.phraseTimesSec, result.durationSec)

    result.blocks.forEach((block, i) => {
      const start = boundaryTimesSec[i]
      const end = boundaryTimesSec[i + 1]

      allRegionsRef.current.push(
        regions.addRegion({
          start,
          end: start,
          drag: false,
          resize: false,
          color: block.isDrop ? '#ff5d73' : 'rgba(255, 255, 255, 0.9)'
        })
      )

      if (block.isDrop) {
        allRegionsRef.current.push(
          regions.addRegion({
            start,
            end,
            drag: false,
            resize: false,
            color: 'rgba(255, 93, 115, 0.15)'
          })
        )
      }
    })
  }, [result, waveformReady])

  function updateBlocks(updater: (blocks: Block[]) => Block[]): void {
    setResult((prev) => (prev ? { ...prev, blocks: updater(prev.blocks) } : prev))
  }

  function recomputeFromManualBpm(bpm: number, offsetSec: number): void {
    if (!result || !monoSamplesRef.current || sampleRateRef.current === null) return
    const grid = buildBeatGridFromBpm(bpm, offsetSec, result.durationSec)
    const phraseTimesSec = phraseBoundariesSec(grid.kickTimesSec)
    const phraseEnergies = computePhraseEnergies(
      monoSamplesRef.current,
      sampleRateRef.current,
      phraseTimesSec,
      result.durationSec
    )
    const blocks = markDrops(groupPhrasesIntoBlocks(phraseEnergies), phraseEnergies)
    setResult({ bpm: grid.bpm, durationSec: result.durationSec, phraseTimesSec, phraseEnergies, blocks })
  }

  function playBlock(index: number): void {
    if (!result || !wavesurferRef.current) return
    const boundaryTimesSec = blockBoundaryTimesSec(result.blocks, result.phraseTimesSec, result.durationSec)
    wavesurferRef.current.play(boundaryTimesSec[index], boundaryTimesSec[index + 1])
  }

  function copyResult(): void {
    if (!result) return
    navigator.clipboard.writeText(formatBlocks(result.blocks)).catch(() => {})
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 1500)
  }

  return (
    <div className="song-view">
      <button className="back-button" onClick={onClose}>
        ← Volver
      </button>
      <h2>{song.fileName}</h2>

      {status.kind === 'analyzing' && <p className="song-view__status">Analizando audio…</p>}
      {status.kind === 'error' && <p className="song-view__status song-view__status--error">{status.message}</p>}
      {status.kind === 'ready' && result && (
        <p className="song-view__status">
          {Math.round(result.bpm)} BPM ·{' '}
          <span className="song-view__result">{formatBlocks(result.blocks)}</span>{' '}
          <button className="copy-button" onClick={copyResult}>
            {copyFeedback ? 'Copiado ✓' : 'Copiar'}
          </button>
        </p>
      )}

      <div ref={waveformContainerRef} className="waveform" />

      {result && (
        <div className="blocks">
          {result.blocks.map((block, i) => (
            <div className="block" key={i}>
              {i > 0 && (
                <button
                  className="block__shift"
                  title="Mover un compás al bloque anterior"
                  onClick={() => updateBlocks((blocks) => shiftBoundary(blocks, i - 1, -1))}
                >
                  ◀
                </button>
              )}

              <div className={`block__card${block.isDrop ? ' block__card--drop' : ''}`}>
                <span className="block__count">{block.phraseCount}</span>
                <div className="block__actions">
                  <button onClick={() => playBlock(i)} title="Reproducir este bloque">
                    ▶
                  </button>
                  <button onClick={() => updateBlocks((blocks) => toggleDrop(blocks, i))} title="Marcar/desmarcar drop">
                    {block.isDrop ? '★' : '☆'}
                  </button>
                  <button
                    onClick={() => updateBlocks((blocks) => splitInHalf(blocks, i))}
                    disabled={block.phraseCount < 2}
                    title="Partir por la mitad"
                  >
                    ✂
                  </button>
                  {i < result.blocks.length - 1 && (
                    <button onClick={() => updateBlocks((blocks) => mergeWithNext(blocks, i))} title="Fusionar con el siguiente">
                      ⇥
                    </button>
                  )}
                </div>
              </div>

              {i < result.blocks.length - 1 && (
                <button
                  className="block__shift"
                  title="Mover un compás al siguiente bloque"
                  onClick={() => updateBlocks((blocks) => shiftBoundary(blocks, i, 1))}
                >
                  ▶
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className="manual-override">
          <span>¿La rejilla no encaja? Recalcula con BPM y offset manuales:</span>
          <input
            type="number"
            placeholder={`BPM (auto: ${Math.round(result.bpm)})`}
            value={manualBpmInput}
            onChange={(e) => setManualBpmInput(e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            placeholder="offset del primer bombo (s)"
            value={manualOffsetInput}
            onChange={(e) => setManualOffsetInput(e.target.value)}
          />
          <button
            disabled={!manualBpmInput || !manualOffsetInput}
            onClick={() => recomputeFromManualBpm(Number(manualBpmInput), Number(manualOffsetInput))}
          >
            Recalcular rejilla
          </button>
        </div>
      )}
    </div>
  )
}

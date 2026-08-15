import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { type Region } from 'wavesurfer.js/plugins/regions'
import { analyzeSong } from '../audio-analysis/analyzeSong'
import { buildBeatGridFromBpm, phraseBoundariesSec } from '../audio-analysis/bpmGrid'
import { computePhraseEnergies, groupPhrasesIntoBlocks } from '../audio-analysis/energySegmentation'
import { markDrops } from '../audio-analysis/dropDetection'
import { formatBlocks, type Block } from '../audio-analysis/formatBlocks'
import { blockBoundaryTimesSec, mergeWithNext, shiftBoundary, splitInHalf, toggleDrop } from '../audio-analysis/blockEditing'
import { computeTapBpm } from '../audio-analysis/tapTempo'

interface Song {
  filePath: string
  fileName: string
  /** Existing library entry to reopen, if any. Its saved blocks win over freshly auto-detected ones. */
  songId?: number
  initialBlocks?: Block[]
}

interface AnalysisResult {
  bpm: number
  durationSec: number
  phraseTimesSec: number[]
  phraseEnergies: number[]
  blocks: Block[]
}

type Status = { kind: 'analyzing' } | { kind: 'ready' } | { kind: 'error'; message: string }

/** A gap this long between taps means the user started a fresh tap-tempo sequence. */
const TAP_RESET_GAP_MS = 2000
/** Only the most recent taps count, so an old, now-irrelevant rhythm can't drag the average. */
const TAP_MAX_COUNT = 8

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
  const songIdRef = useRef<number | null>(null)

  const [status, setStatus] = useState<Status>({ kind: 'analyzing' })
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [waveformReady, setWaveformReady] = useState(false)
  const [manualBpmInput, setManualBpmInput] = useState('')
  const [manualOffsetInput, setManualOffsetInput] = useState('')
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [tapTimestampsMs, setTapTimestampsMs] = useState<number[]>([])

  // Runs the analysis pipeline once per song and sets up the waveform.
  useEffect(() => {
    let cancelled = false
    let blobUrl: string | undefined
    setResult(null)
    setWaveformReady(false)
    setManualBpmInput('')
    setManualOffsetInput('')
    setTapTimestampsMs([])
    setIsPlaying(false)

    async function analyze(): Promise<void> {
      setStatus({ kind: 'analyzing' })

      const arrayBuffer = await window.api.readAudioFile(song.filePath)
      const analysis = await analyzeSong(arrayBuffer)
      monoSamplesRef.current = analysis.monoSamples
      sampleRateRef.current = analysis.sampleRate
      const blocks = song.initialBlocks ?? analysis.blocks

      if (cancelled || !waveformContainerRef.current) return

      if (song.songId !== undefined) {
        songIdRef.current = song.songId
      } else {
        const inserted = await window.api.db.insertSong({
          filePath: song.filePath,
          title: song.fileName,
          bpm: analysis.bpm,
          durationMs: Math.round(analysis.durationSec * 1000),
          blocks
        })
        if (cancelled) return
        songIdRef.current = inserted.id
      }

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
        peaks: [analysis.monoSamples],
        duration: analysis.durationSec
      })
      wavesurferRef.current = wavesurfer
      regionsRef.current = wavesurfer.registerPlugin(RegionsPlugin.create())

      wavesurfer.on('decode', () => {
        if (!cancelled) setWaveformReady(true)
      })
      wavesurfer.on('play', () => setIsPlaying(true))
      wavesurfer.on('pause', () => setIsPlaying(false))
      wavesurfer.on('finish', () => setIsPlaying(false))

      setResult({
        bpm: analysis.bpm,
        durationSec: analysis.durationSec,
        phraseTimesSec: analysis.phraseTimesSec,
        phraseEnergies: analysis.phraseEnergies,
        blocks
      })
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
      songIdRef.current = null
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
    // Only re-run when the song identity itself changes — songId/initialBlocks
    // are read once at analysis time and shouldn't retrigger on every render.
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

  function persistBlocks(blocks: Block[]): void {
    if (songIdRef.current === null) return
    window.api.db.updateSongBlocks(songIdRef.current, blocks).catch(() => {})
  }

  function updateBlocks(updater: (blocks: Block[]) => Block[]): void {
    if (!result) return
    const blocks = updater(result.blocks)
    persistBlocks(blocks)
    setResult({ ...result, blocks })
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
    persistBlocks(blocks)
    setResult({ bpm: grid.bpm, durationSec: result.durationSec, phraseTimesSec, phraseEnergies, blocks })
  }

  /** Nudges the BPM by a small amount, keeping the same first-kick anchor. */
  function stepBpm(deltaBpm: number): void {
    if (!result) return
    recomputeFromManualBpm(result.bpm + deltaBpm, result.phraseTimesSec[0] ?? 0)
  }

  function togglePlayback(): void {
    wavesurferRef.current?.playPause()
  }

  function handleTap(): void {
    const now = performance.now()
    setTapTimestampsMs((previous) => {
      const lastTap = previous[previous.length - 1]
      const isFreshSequence = lastTap !== undefined && now - lastTap > TAP_RESET_GAP_MS
      const taps = isFreshSequence ? [] : previous
      return [...taps, now].slice(-TAP_MAX_COUNT)
    })
  }

  function resetTaps(): void {
    setTapTimestampsMs([])
  }

  function applyTapBpm(): void {
    const bpm = computeTapBpm(tapTimestampsMs)
    if (!result || bpm === null) return
    recomputeFromManualBpm(bpm, result.phraseTimesSec[0] ?? 0)
    resetTaps()
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

  const tapBpm = computeTapBpm(tapTimestampsMs)

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
          <div className="manual-override__row">
            <span>¿El BPM no encaja?</span>
            <div className="bpm-stepper">
              <button onClick={() => stepBpm(-1)} title="Restar 1 BPM">
                −
              </button>
              <span className="bpm-stepper__value">{Math.round(result.bpm)}</span>
              <button onClick={() => stepBpm(1)} title="Sumar 1 BPM">
                +
              </button>
            </div>

            <button onClick={togglePlayback}>{isPlaying ? '⏸ Pausar' : '▶ Reproducir'}</button>
            <button className="tap-tempo__button" onClick={handleTap}>
              Tap
            </button>
            {tapBpm !== null && (
              <>
                <span className="tap-tempo__reading">
                  {Math.round(tapBpm)} BPM ({tapTimestampsMs.length} taps)
                </span>
                <button onClick={applyTapBpm}>Usar</button>
                <button className="tap-tempo__reset" onClick={resetTaps} title="Reiniciar taps">
                  ✕
                </button>
              </>
            )}
          </div>

          <div className="manual-override__row">
            <span>O recalcula con BPM y offset manuales:</span>
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
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { type Region } from 'wavesurfer.js/plugins/regions'
import { analyzeSong } from '../audio-analysis/analyzeSong'
import { decodeAudioBuffer } from '../audio-analysis/decode'
import { buildBeatGridFromBpm, phraseBoundariesSec } from '../audio-analysis/bpmGrid'
import { computeKickBandPhraseEnergies, groupPhrasesIntoBlocks } from '../audio-analysis/energySegmentation'
import { markBreakdowns } from '../audio-analysis/breakdownDetection'
import { formatBlocks, type Block } from '../audio-analysis/formatBlocks'
import {
  blockBoundaryTimesSec,
  mergeWithNext,
  shiftBoundary,
  splitInHalf,
  toggleBreakdown
} from '../audio-analysis/blockEditing'
import { computeTapBpm } from '../audio-analysis/tapTempo'
import type { SongMetadata } from '../../../shared/song'

interface Song {
  filePath: string
  fileName: string
}

interface AnalysisResult {
  bpm: number
  durationSec: number
  phraseTimesSec: number[]
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
  const [metadata, setMetadata] = useState<SongMetadata | null>(null)
  const [waveformReady, setWaveformReady] = useState(false)
  /** The BPM shown next to the stepper/tap controls — only applied to the grid on "Recalcular rejilla". */
  const [pendingBpm, setPendingBpm] = useState<number | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [isPlaying, setIsPlaying] = useState(false)
  const [tapTimestampsMs, setTapTimestampsMs] = useState<number[]>([])
  /** True while "Reset" is re-running full automatic detection. */
  const [isResetting, setIsResetting] = useState(false)

  // Runs the analysis pipeline once per song and sets up the waveform.
  useEffect(() => {
    let cancelled = false
    let blobUrl: string | undefined
    setResult(null)
    setMetadata(null)
    setWaveformReady(false)
    setPendingBpm(null)
    setTapTimestampsMs([])
    setIsPlaying(false)
    setIsResetting(false)
    setSaveFeedback('idle')

    // Cover/title/artist/key/rating are a nice-to-have read from the file's own tags — fetched
    // independently of the analysis pipeline so a slow/missing tag never blocks it.
    window.api
      .readSongMetadata(song.filePath)
      .then((m) => {
        if (!cancelled) setMetadata(m)
      })
      .catch(() => {})

    async function analyze(): Promise<void> {
      setStatus({ kind: 'analyzing' })

      // A song can already be in the library from a previous session (opened from Library, or
      // drag-and-dropped again) — reuse its saved analysis instead of re-inserting (which would
      // violate the file_path UNIQUE constraint) and, when it has a cached grid, skip BPM/kick
      // detection entirely so opening an already-analyzed song is instant.
      const existingSong = await window.api.db.findSongByPath(song.filePath)
      if (cancelled) return

      const arrayBuffer = await window.api.readAudioFile(song.filePath)
      if (cancelled) return

      let bpm: number
      let durationSec: number
      let phraseTimesSec: number[]
      let blocks: Block[]
      let monoSamples: Float32Array

      if (existingSong && existingSong.phraseTimesSec.length > 0) {
        const decoded = await decodeAudioBuffer(arrayBuffer)
        if (cancelled) return
        monoSamples = decoded.monoSamples
        sampleRateRef.current = decoded.sampleRate
        bpm = existingSong.bpm
        durationSec = decoded.durationSec
        phraseTimesSec = existingSong.phraseTimesSec
        blocks = existingSong.blocks
        songIdRef.current = existingSong.id
      } else {
        const analysis = await analyzeSong(arrayBuffer)
        if (cancelled) return
        monoSamples = analysis.monoSamples
        sampleRateRef.current = analysis.sampleRate
        bpm = analysis.bpm
        durationSec = analysis.durationSec
        phraseTimesSec = analysis.phraseTimesSec
        // A pre-existing record without a cached grid (from before this was tracked) keeps its
        // saved/edited blocks; only the grid itself needed recomputing.
        blocks = existingSong?.blocks ?? analysis.blocks

        if (existingSong) {
          songIdRef.current = existingSong.id
          await window.api.db.updateSongAnalysis(existingSong.id, { bpm, phraseTimesSec, blocks })
        } else {
          const inserted = await window.api.db.insertSong({
            filePath: song.filePath,
            title: song.fileName,
            bpm,
            durationMs: Math.round(durationSec * 1000),
            phraseTimesSec,
            blocks
          })
          if (cancelled) return
          songIdRef.current = inserted.id
        }
      }

      monoSamplesRef.current = monoSamples

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
      wavesurfer.on('play', () => setIsPlaying(true))
      wavesurfer.on('pause', () => setIsPlaying(false))
      wavesurfer.on('finish', () => setIsPlaying(false))

      setResult({ bpm, durationSec, phraseTimesSec, blocks })
      setPendingBpm(bpm)
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
  }, [song.filePath])

  // Redraws the phrase grid, block boundaries and breakdown highlight whenever the analysis changes.
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
          color: block.isBreakdown ? '#ff5d73' : 'rgba(255, 255, 255, 0.9)'
        })
      )

      if (block.isBreakdown) {
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

  function persistAnalysis(bpm: number, phraseTimesSec: number[], blocks: Block[]): void {
    if (songIdRef.current === null) return
    window.api.db.updateSongAnalysis(songIdRef.current, { bpm, phraseTimesSec, blocks }).catch(() => {})
  }

  function updateBlocks(updater: (blocks: Block[]) => Block[]): void {
    if (!result) return
    const blocks = updater(result.blocks)
    persistAnalysis(result.bpm, result.phraseTimesSec, blocks)
    setResult({ ...result, blocks })
  }

  /** Rebuilds the phrase grid + segmentation from a BPM value, without re-running kick detection. */
  function recomputeFromBpm(bpm: number, offsetSec: number): void {
    if (!result || !monoSamplesRef.current || sampleRateRef.current === null) return
    const grid = buildBeatGridFromBpm(bpm, offsetSec, result.durationSec)
    const phraseTimesSec = phraseBoundariesSec(grid.kickTimesSec)
    const phraseEnergies = computeKickBandPhraseEnergies(
      monoSamplesRef.current,
      sampleRateRef.current,
      phraseTimesSec,
      result.durationSec
    )
    const blocks = markBreakdowns(groupPhrasesIntoBlocks(phraseEnergies), phraseEnergies)
    persistAnalysis(grid.bpm, phraseTimesSec, blocks)
    setResult({ bpm: grid.bpm, durationSec: result.durationSec, phraseTimesSec, blocks })
  }

  /** Applies the currently-shown pending BPM (auto/stepped/tapped) to the grid. */
  function recalculateGrid(): void {
    if (pendingBpm === null || !result) return
    recomputeFromBpm(pendingBpm, result.phraseTimesSec[0] ?? 0)
  }

  /** Discards any BPM/grid/block edits and re-runs full automatic detection from scratch. */
  async function resetToAutomatic(): Promise<void> {
    if (!result || isResetting) return
    setIsResetting(true)
    try {
      const arrayBuffer = await window.api.readAudioFile(song.filePath)
      const analysis = await analyzeSong(arrayBuffer)
      monoSamplesRef.current = analysis.monoSamples
      sampleRateRef.current = analysis.sampleRate
      persistAnalysis(analysis.bpm, analysis.phraseTimesSec, analysis.blocks)
      setResult({
        bpm: analysis.bpm,
        durationSec: analysis.durationSec,
        phraseTimesSec: analysis.phraseTimesSec,
        blocks: analysis.blocks
      })
      setPendingBpm(analysis.bpm)
    } finally {
      setIsResetting(false)
    }
  }

  /** Nudges the shown (not-yet-applied) BPM by a small amount. */
  function stepBpm(deltaBpm: number): void {
    setPendingBpm((current) => (current ?? result?.bpm ?? 0) + deltaBpm)
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

  /** Stages the tapped BPM as the pending value — still needs "Recalcular rejilla" to apply it. */
  function applyTapBpm(): void {
    const bpm = computeTapBpm(tapTimestampsMs)
    if (bpm === null) return
    setPendingBpm(bpm)
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

  /** Writes the result into the mp3's ID3 comment tag, so it shows up in Engine DJ and similar
   *  software. Merges into the file's existing tags rather than replacing them. */
  async function saveToFile(): Promise<void> {
    if (!result) return
    setSaveFeedback('saving')
    try {
      const success = await window.api.writeSongComment(song.filePath, formatBlocks(result.blocks))
      setSaveFeedback(success ? 'saved' : 'error')
    } catch {
      setSaveFeedback('error')
    }
    setTimeout(() => setSaveFeedback('idle'), 2000)
  }

  const tapBpm = computeTapBpm(tapTimestampsMs)

  return (
    <div className="song-view">
      <button className="back-button" onClick={onClose}>
        ← Volver
      </button>

      <div className="song-summary">
        {metadata?.coverDataUrl && <img className="song-summary__cover" src={metadata.coverDataUrl} alt="" />}
        <div className="song-summary__info">
          <h2 className="song-summary__title">{metadata?.title || song.fileName}</h2>
          {metadata?.artist && <p className="song-summary__artist">{metadata.artist}</p>}
        </div>
        {status.kind === 'ready' && result && (
          <div className="song-summary__stats">
            <span className="song-summary__stat-value">{Math.round(result.bpm)}</span>
            {metadata?.key && <span className="song-summary__stat-value song-summary__stat-value--key">{metadata.key}</span>}
            {metadata?.ratingStars != null && (
              <span className="song-summary__stars">
                {'★'.repeat(metadata.ratingStars)}
                {'☆'.repeat(5 - metadata.ratingStars)}
              </span>
            )}
          </div>
        )}
      </div>

      {status.kind === 'analyzing' && <p className="song-view__status">Analizando audio…</p>}
      {status.kind === 'error' && <p className="song-view__status song-view__status--error">{status.message}</p>}
      {status.kind === 'ready' && result && (
        <p className="song-view__status">
          {Math.round(result.bpm)} BPM ·{' '}
          <span className="song-view__result">{formatBlocks(result.blocks)}</span>{' '}
          <button className="copy-button" onClick={copyResult}>
            {copyFeedback ? 'Copiado ✓' : 'Copiar'}
          </button>{' '}
          {song.filePath.toLowerCase().endsWith('.mp3') && (
            <button
              className="copy-button"
              onClick={saveToFile}
              disabled={saveFeedback === 'saving'}
              title="Escribe el resultado en el comentario (ID3) del mp3 — visible en Engine DJ y software similar"
            >
              {saveFeedback === 'saved' && 'Guardado ✓'}
              {saveFeedback === 'error' && 'Error al guardar'}
              {saveFeedback === 'saving' && 'Guardando…'}
              {saveFeedback === 'idle' && 'Guardar en MP3'}
            </button>
          )}
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

              <div className={`block__card${block.isBreakdown ? ' block__card--breakdown' : ''}`}>
                <span className="block__count">{block.phraseCount}</span>
                <div className="block__actions">
                  <button onClick={() => playBlock(i)} title="Reproducir este bloque">
                    ▶
                  </button>
                  <button
                    onClick={() => updateBlocks((blocks) => toggleBreakdown(blocks, i))}
                    title="Marcar/desmarcar breakdown"
                  >
                    {block.isBreakdown ? '★' : '☆'}
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
              <span className="bpm-stepper__value">{Math.round(pendingBpm ?? result.bpm)}</span>
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
            <button
              onClick={recalculateGrid}
              disabled={isResetting || pendingBpm === null || pendingBpm === result.bpm}
            >
              Recalcular rejilla
            </button>
            <button
              onClick={resetToAutomatic}
              disabled={isResetting}
              title="Descartar ajustes y volver a ejecutar la detección automática"
            >
              {isResetting ? 'Analizando…' : 'Reset'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

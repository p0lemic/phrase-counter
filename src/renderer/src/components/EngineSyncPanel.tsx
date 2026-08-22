import { useEffect, useState } from 'react'
import type { EngineSyncResult } from '../../../shared/engine'
import type { SongRecord } from '../../../shared/song'

/** Engine gives every track exactly eight hot cue slots, so a longer track can't get one per block. */
const QUICK_CUE_COUNT = 8

interface Props {
  /** What to push — the ticked songs, or the whole visible library when nothing is ticked. */
  songs: SongRecord[]
  scopeLabel: string
  onClose: () => void
}

type Phase = 'idle' | 'working' | 'done' | 'error'

export default function EngineSyncPanel({ songs, scopeLabel, onClose }: Props): React.JSX.Element {
  const [writeTitle, setWriteTitle] = useState(true)
  const [writeCues, setWriteCues] = useState(true)
  const [writeComment, setWriteComment] = useState(true)
  const [engineRunning, setEngineRunning] = useState(false)
  const [preview, setPreview] = useState<EngineSyncResult | null>(null)
  const [applied, setApplied] = useState<EngineSyncResult | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  const songIds = songs.map((song) => song.id)
  const overLongCount = songs.filter((song) => song.blocks.length > QUICK_CUE_COUNT).length
  const nothingSelected = !writeTitle && !writeCues && !writeComment

  useEffect(() => {
    window.api.engine.isRunning().then(setEngineRunning).catch(() => setEngineRunning(false))
  }, [])

  /** A dry run first, so the confirmation says how many tracks are really about to change rather
   *  than how many were ticked — most libraries have songs Engine has never seen. */
  useEffect(() => {
    if (nothingSelected) {
      setPreview(null)
      return
    }
    let cancelled = false
    window.api.engine
      .sync(songIds, { writeTitle, writeCues, writeComment, dryRun: true })
      .then((result) => {
        if (!cancelled) setPreview(result)
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
    return () => {
      cancelled = true
    }
  }, [writeTitle, writeCues, writeComment, songs])

  async function handleSync(): Promise<void> {
    setPhase('working')
    setError(null)
    try {
      const result = await window.api.engine.sync(songIds, {
        writeTitle,
        writeCues,
        writeComment,
        dryRun: false
      })
      setApplied(result)
      setPhase('done')
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError))
      setPhase('error')
    }
  }

  async function handleRevert(): Promise<void> {
    const confirmed = window.confirm(
      'Se quitarán los sufijos de título y se borrarán los hot cues de estas canciones en Engine DJ. Los comentarios se dejan como están.'
    )
    if (!confirmed) return
    setPhase('working')
    setError(null)
    try {
      const result = await window.api.engine.revertSync(songIds)
      setApplied(null)
      setPhase('idle')
      window.alert(
        `Revertido: ${result.titlesReverted} título(s) y ${result.cuesCleared} juego(s) de cues.\nCopia de seguridad: ${result.backupPath}`
      )
    } catch (revertError) {
      setError(revertError instanceof Error ? revertError.message : String(revertError))
      setPhase('error')
    }
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <h2>Enviar a Engine DJ</h2>
          <button className="modal__close" onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        <div className="modal__body">
          <p className="engine-sync__intro">
            Engine OS no dibuja el campo <em>Comment</em> en la pantalla de la controladora. Esto
            escribe la estructura donde sí se ve: en el título y en los hot cues.
          </p>

          <label className="engine-sync__option">
            <input
              type="checkbox"
              checked={writeTitle}
              onChange={(event) => setWriteTitle(event.target.checked)}
            />
            <span>
              <strong>Título</strong>
              <span className="engine-sync__hint">
                Añade <code>[PC 8+16+(4)]</code> al final del título en Engine. Se ve en el navegador
                antes de cargar el tema. No toca el mp3 — solo la copia de Engine.
              </span>
            </span>
          </label>

          <label className="engine-sync__option">
            <input
              type="checkbox"
              checked={writeCues}
              onChange={(event) => setWriteCues(event.target.checked)}
            />
            <span>
              <strong>Hot cues</strong>
              <span className="engine-sync__hint">
                Un cue en cada cambio de bloque, etiquetado con su número de frases y coloreado
                (azul bloque, naranja breakdown, rojo drop). Se ven sobre la forma de onda y en los
                pads.
                {overLongCount > 0 && (
                  <>
                    {' '}
                    <strong>
                      {overLongCount} de {songs.length} tienen más de {QUICK_CUE_COUNT} bloques
                    </strong>{' '}
                    y no caben enteras: se priorizan el drop y los breakdowns.
                  </>
                )}
              </span>
            </span>
          </label>

          <label className="engine-sync__option">
            <input
              type="checkbox"
              checked={writeComment}
              onChange={(event) => setWriteComment(event.target.checked)}
            />
            <span>
              <strong>Comentario</strong>
              <span className="engine-sync__hint">
                Refresca el campo Comment de Engine. No se ve en la controladora, pero sí en Engine
                DJ de escritorio, y corrige los que quedaron desactualizados.
              </span>
            </span>
          </label>

          {engineRunning && (
            <p className="engine-sync__warning">
              Engine DJ está abierto. Ciérralo antes de sincronizar: tiene la base de datos abierta y
              sobrescribiría estos cambios.
            </p>
          )}

          {preview && !applied && (
            <p className="engine-sync__preview">
              {preview.matched} de {songs.length} {scopeLabel} están en la librería de Engine.
              {preview.unmatched > 0 && ` ${preview.unmatched} no se han encontrado.`}
              {writeCues && preview.cuesSkippedNoSampleRate > 0 && (
                <>
                  {' '}
                  {preview.cuesSkippedNoSampleRate} no tienen análisis de Engine todavía, así que se
                  quedan sin cues.
                </>
              )}
            </p>
          )}

          {applied && (
            <div className="engine-sync__result">
              <p>
                <strong>Hecho.</strong> {applied.titlesWritten} título(s), {applied.cuesWritten} juego(s)
                de cues y {applied.commentsWritten} comentario(s) escritos.
              </p>
              {applied.cuesTruncated > 0 && (
                <p>{applied.cuesTruncated} tema(s) tenían más bloques que cues disponibles.</p>
              )}
              <p className="engine-sync__hint">Copia de seguridad: {applied.backupPath}</p>
              <p className="engine-sync__hint">
                Abre Engine DJ y exporta a la USB para verlo en la controladora.
              </p>
            </div>
          )}

          {error && <p className="engine-sync__warning">{error}</p>}
        </div>

        <div className="modal__footer">
          <span className="library__count">
            {songs.length} {scopeLabel}
          </span>
          <button onClick={handleRevert} disabled={phase === 'working'}>
            Revertir
          </button>
          <button onClick={onClose}>{applied ? 'Cerrar' : 'Cancelar'}</button>
          <button
            className="modal__primary"
            disabled={phase === 'working' || nothingSelected || songs.length === 0}
            onClick={handleSync}
          >
            {phase === 'working' ? 'Escribiendo…' : 'Sincronizar'}
          </button>
        </div>
      </div>
    </div>
  )
}

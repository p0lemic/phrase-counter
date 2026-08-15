import { formatBlocks } from './formatBlocks'
import type { SongRecord } from '../../../shared/song'

const CSV_HEADER = ['title', 'bpm', 'result', 'duration_sec', 'file_path']

function csvField(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function songsToCsv(songs: SongRecord[]): string {
  const rows = songs.map((song) =>
    [
      csvField(song.title),
      csvField(Math.round(song.bpm)),
      csvField(formatBlocks(song.blocks)),
      csvField(Math.round(song.durationMs / 1000)),
      csvField(song.filePath)
    ].join(',')
  )
  return [CSV_HEADER.join(','), ...rows].join('\n') + '\n'
}

export function songsToJson(songs: SongRecord[]): string {
  const entries = songs.map((song) => ({
    title: song.title,
    bpm: song.bpm,
    result: formatBlocks(song.blocks),
    durationSec: song.durationMs / 1000,
    filePath: song.filePath
  }))
  return JSON.stringify(entries, null, 2)
}

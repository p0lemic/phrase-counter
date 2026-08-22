/** A dash used as a separator: surrounded by spaces or underscores. A bare hyphen doesn't count —
 *  it's part of a word ("non-stop"). Both the plain hyphen and the en dash show up in real files. */
const SEPARATOR = /\s+[-–]\s+|_[-–]_/

/** Last-resort artist/title when a file carries no tags: split its name on the first separator. */
export function splitArtistTitle(fileName: string): { artist: string; title: string } {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '')
  const separator = SEPARATOR.exec(withoutExtension)
  if (!separator) return { artist: '', title: withoutExtension.trim() }

  const artist = withoutExtension.slice(0, separator.index).trim()
  const title = withoutExtension.slice(separator.index + separator[0].length).trim()
  // A name that splits into an empty half ("- Track") is better left whole.
  return artist && title ? { artist, title } : { artist: '', title: withoutExtension.trim() }
}

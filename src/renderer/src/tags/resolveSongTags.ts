import { splitArtistTitle } from './fileNameTags'
import type { SongTagsUpdate } from '../../../shared/song'

/** Title and artist for a file: its own tags when they say something, the file name split on its
 *  separator otherwise — per field, so a file tagged with only an artist still gets a title. */
export async function resolveSongTags(filePath: string, fileName: string): Promise<SongTagsUpdate> {
  const fromFileName = splitArtistTitle(fileName)
  try {
    const metadata = await window.api.readSongMetadata(filePath)
    return {
      title: metadata.title?.trim() || fromFileName.title,
      artist: metadata.artist?.trim() || fromFileName.artist
    }
  } catch {
    // A file with unreadable tags still deserves the name-based guess.
    return fromFileName
  }
}

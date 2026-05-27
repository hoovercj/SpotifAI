/**
 * Default rundown for a fresh session.
 *
 * The mix is intentionally heavy on `musicFact` slots — grounded
 * "behind the song" segments pulled from MusicBrainz + Wikipedia. The
 * user wants these to play far more often than the existing
 * weather / news / transit / history (this-day-in-music) slots, which
 * are kept as occasional flavor.
 *
 * Cadence (one cycle, then repeats via addPlaylistToRundown):
 *   song, song, musicFact,
 *   song, weather,
 *   song, musicFact,
 *   song, news,
 *   song, musicFact,
 *   song, transit,
 *   song, musicFact,
 *   song, history,
 *   song, musicFact,
 *   song, end
 *
 * Result: roughly every other talk break is a music-fact segment.
 */
function createDefaultShow() {
  const songSlot = () => ({
    type: 'song',
    songName: null,
    bandName: null,
    albumName: null,
    duration: null,
  })

  return {
    radioStation: 'SpotifAI',
    showName: 'Default Show',
    date: new Date().toISOString().slice(0, 10),
    rundown: [
      songSlot(),
      songSlot(),
      { type: 'musicFact' },
      songSlot(),
      { type: 'weather' },
      songSlot(),
      { type: 'musicFact' },
      songSlot(),
      { type: 'news' },
      songSlot(),
      { type: 'musicFact' },
      songSlot(),
      { type: 'transit' },
      songSlot(),
      { type: 'musicFact' },
      songSlot(),
      { type: 'history' },
      songSlot(),
      { type: 'musicFact' },
      songSlot(),
      {
        type: 'end',
        songName: null,
        bandName: null,
        albumName: null,
        duration: null,
      },
    ],
  }
}

module.exports = { createDefaultShow }


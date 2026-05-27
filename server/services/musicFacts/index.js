/**
 * Music facts orchestrator.
 *
 * Combines MusicBrainz (structured: year, label, producer, release) and
 * Wikipedia (narrative: cultural context, story behind the song /
 * artist) into a single grounded brief for the DJ to read between
 * tracks. Designed to slot into the rundown wherever the previous
 * release dropped a generic "song intro" — that is, way more often
 * than the existing "history" segment, which is about *what happened
 * on this date* rather than *what's actually playing*.
 *
 * Signature mirrors `historySegment(name, nextTrackTitle, nextTrackArtist)`
 * so wiring into `showRunner.js` is mechanical.
 *
 * Returns a fully formed LLM prompt (string) or `null` if neither
 * source had usable data — in which case the caller falls back to a
 * plain song intro.
 */
'use strict'

const { lookupRecording } = require('./musicBrainz')
const { lookup: wikipediaLookup } = require('./wikipedia')

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

const INTROS = [
  'Track Story',
  'Liner Notes',
  'Behind the Music',
  'Song File',
  'Fact Drop',
  'In the Studio',
  'Album Cuts',
  'Music Trivia',
]

const OUTROS = [
  'Cool stuff, right? Now, the track.',
  "There's always a story behind the song.",
  'Now you know — enjoy the track.',
  'Music is more fun with the context. Here we go.',
  "That's the backstory. Press play in your head.",
]

/**
 * Format the structured + narrative facts into a compact prompt the DJ
 * can read in 15-25 seconds. Truncates the Wikipedia extract to keep
 * the segment tight — long extracts can blow past 90s of read time.
 *
 * @param {object} args
 * @param {string} args.name              - Listener's first name (for direct address)
 * @param {string} args.nextTrackTitle    - The song that's about to play
 * @param {string} args.nextTrackArtist   - The artist whose song is about to play
 * @returns {Promise<string|null>}
 */
async function musicFactsSegment({ name, nextTrackTitle, nextTrackArtist } = {}) {
  if (!nextTrackTitle || !nextTrackArtist) return null

  // Parallel: MusicBrainz recording + Wikipedia song + Wikipedia artist.
  // We over-fetch so the prompt builder has options and can pick the
  // richest grounded fact rather than the first available one.
  const [mb, songWiki, artistWiki] = await Promise.all([
    lookupRecording({ artist: nextTrackArtist, title: nextTrackTitle }),
    wikipediaLookup({ kind: 'song', title: nextTrackTitle, artist: nextTrackArtist }),
    wikipediaLookup({ kind: 'artist', title: nextTrackArtist }),
  ])

  // Bail if literally nothing came back — caller will degrade gracefully.
  if (!mb && !songWiki && !artistWiki) return null

  const facts = []
  if (mb) {
    if (mb.year) facts.push(`first released in ${mb.year}`)
    if (mb.releaseGroup) facts.push(`from the release "${mb.releaseGroup}"`)
    if (mb.label) facts.push(`on ${mb.label}`)
    if (mb.producer) facts.push(`produced by ${mb.producer}`)
  }
  const structuredLine = facts.length ? facts.join(', ') : null

  // Cap each extract — Wikipedia summaries can be ~1k chars; we want
  // the model to digest them, not regurgitate them verbatim.
  const songExtract = songWiki?.extract
    ? songWiki.extract.slice(0, 600)
    : null
  const artistExtract = artistWiki?.extract
    ? artistWiki.extract.slice(0, 400)
    : null

  // Compose the prompt. Heavy on "grounded" instructions so the model
  // doesn't make things up — the whole point of this segment is that
  // the facts come from the lookup, not the LLM's parametric memory.
  const sections = []
  if (structuredLine) {
    sections.push(`Structured facts (from MusicBrainz): ${structuredLine}.`)
  }
  if (songExtract) {
    sections.push(
      `About the song (from Wikipedia "${songWiki.title}"): ${songExtract}`
    )
  }
  if (artistExtract) {
    sections.push(
      `About the artist (from Wikipedia "${artistWiki.title}"): ${artistExtract}`
    )
  }

  const greeting = name ? `Address ${name} as your primary listener.` : ''
  const intro = rand(INTROS)
  const outro = rand(OUTROS)

  return `
You are introducing the next song with a quick GROUNDED fact segment titled "${intro}".
Use ONLY the facts below — do not invent producers, labels, dates, or anecdotes.
If the facts are thin, keep the segment short rather than padding with speculation.
Pick the ONE most interesting detail (a story, a year, a collaborator) and lead with it.
Be conversational, never recite the facts as a list.
Do not include speaker annotations, cues, or special characters.
${greeting}
Conclude with: "${outro}"
Then introduce the next track "${nextTrackTitle}" by ${nextTrackArtist}.

FACTS:
${sections.join('\n\n')}
`.trim()
}

module.exports = { musicFactsSegment }

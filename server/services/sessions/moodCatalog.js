/**
 * Server-side mood catalog. Each entry mirrors a tile in
 * `client/Components/tabs/moods.js` by `id`, and adds the Gemini
 * curation `prompt` + pinned DJ for session generation.
 *
 * Each mood pins a DJ whose persona fits the mood's emotional register
 * (Magnus screams in the gym, Aria whispers you to sleep, Henri broods
 * through a rainy NOLA evening). Users can still swap to any DJ via the
 * per-seed picker on the Now Playing screen — these pins are the
 * default, not a constraint.
 *
 * Lo-fi / ambient is intentionally excluded — those listeners want
 * uninterrupted background audio, which is the opposite of a
 * DJ-hosted session.
 */

// House DJ for legacy callers that don't pass a mood id. M-Quake (id 2)
// stays the default fallback for the same reasons documented in
// resolveSessionDj.js.
const HOUSE_DJ_ID = 2

const MOODS = {
  workout: {
    id: "workout",
    name: "Workout",
    djId: 9, // Magnus — Norwegian metalhead, instigator energy
    prompt: `Curate 30 high-energy workout tracks. Driving beats, pump-up
choruses, BPMs in the 120-160 range — songs that make you push through the
last rep or run the extra mile. Cross genres freely: pop bangers, rock
anthems, hip-hop hype tracks, dance peaks. Skip slow songs, skip ballads,
skip anything contemplative.`,
  },

  party: {
    id: "party",
    name: "Party",
    djId: 8, // Diego — CDMX, the room-runs-on-his-energy host
    prompt: `Curate 30 huge party tracks that make a room move. Crowd-pleasers
across pop, hip-hop, dance, and crossover hits — the kind of songs everyone
sings along to. Mix recent chart-toppers with a handful of inevitable
throwbacks ("Mr. Brightside", "I Wanna Dance with Somebody", "Yeah!"). High
energy throughout.`,
  },

  drive: {
    id: "drive",
    name: "Drive",
    djId: 1, // Rusty — biker uncle, owns the highway
    prompt: `Curate 30 tracks built for a long highway drive. Strong rhythm,
big production, hooks that swell on a stereo. Lean into classic rock,
heartland rock, alt-rock anthems, road-trip pop. Think windows down,
horizon ahead — driving energy without being aggressive.`,
  },

  focus: {
    id: "focus",
    name: "Focus",
    djId: 11, // Tomas — Berlin ambient lifer, knows when to shut up
    prompt: `Curate 30 tracks that keep you in flow without demanding
attention. Mostly instrumental or low-vocal — post-rock, ambient electronic,
modern classical, downtempo, jazz instrumentals, math rock, film scores.
Steady forward motion, minimal vocal hooks, nothing that would interrupt
deep work.`,
  },

  chill: {
    id: "chill",
    name: "Chill",
    djId: 6, // Coda — atmospheric, low-key, never raises voice
    prompt: `Curate 30 mellow, low-stakes tracks for a relaxed afternoon.
Smooth indie, soft electronic, R&B grooves, acoustic-leaning pop, mellow
hip-hop. Vocals welcome but nothing that demands attention. Tempo 70-110
BPM range. The vibe is "Sunday couch", not "intense feelings".`,
  },

  rainy: {
    id: "rainy",
    name: "Rainy Day",
    djId: 5, // Saoirse — Dublin, hushed and literary
    prompt: `Curate 30 tracks that feel like a grey window and a warm
coffee. Reverb-heavy indie, melancholic folk, mid-tempo soul, dream pop,
slowcore. Lyrically introspective but not overtly sad. Think
Bon Iver, Phoebe Bridgers, The National, Frank Ocean's quieter moments.`,
  },

  sleep: {
    id: "sleep",
    name: "Sleep",
    djId: 24, // Aria — classical piano voice, lands softly
    prompt: `Curate 30 slow, gentle tracks for winding down toward sleep.
Soft acoustic, ambient, piano, mellow folk, nylon-string jazz. Very low
energy, sub-90 BPM, instrumental-leaning. Nothing surprising or jarring,
nothing with hard kick drums.`,
  },

  feelgood: {
    id: "feelgood",
    name: "Feel Good",
    djId: HOUSE_DJ_ID, // M-Quake — sunshine-pop default
    prompt: `Curate 30 upbeat, sunshine-bright tracks that lift the room.
Funky pop, motown, indie pop with a smile, summery hip-hop, soft rock
classics like "Brown Eyed Girl" energy. Major-key, mid-tempo, lyrically
optimistic. The kind of music that turns the morning around.`,
  },

  romance: {
    id: "romance",
    name: "Romance",
    djId: 16, // Bea — smoky NYC jazz/r&b, intimate by instinct
    prompt: `Curate 30 swooning, romantic tracks across eras and genres.
Slow R&B, classic soul, intimate indie folk, modern love-song pop ballads.
Lyrically about love and intimacy — earnest, not ironic. Think Marvin Gaye,
Sade, Frank Ocean, John Mayer, Adele's slow burners, Norah Jones.`,
  },

  sad: {
    id: "sad",
    name: "Sad",
    djId: 22, // Henri — NOLA jazz/folk/blues elder, raconteur of melancholy
    prompt: `Curate 30 cathartic, heartbroken, melancholy tracks. Indie
folk, slowcore, sad-girl pop, mournful country, blues, alt-rock ballads.
The vibe is "feel everything fully", not "background gloom". Think
Mitski, Sufjan Stevens, Lana Del Rey, The Cure's slower side, Sharon Van
Etten, Bon Iver.`,
  },

  morning: {
    id: "morning",
    name: "Morning",
    djId: 28, // Maya — Bay Area bedroom-pop, warm and unhurried
    prompt: `Curate 30 gentle wake-up tracks. Warm acoustic, mellow indie,
soft jazz, breezy pop. Mid-tempo, mostly major-key, slightly hopeful.
Think the first cup of coffee — quiet enough not to startle, lively enough
to ease into the day.`,
  },

  throwback: {
    id: "throwback",
    name: "Throwback",
    djId: 4, // Lady Lyric — Bronx-born, owns the "remember this?" beat
    prompt: `Curate 30 instantly-recognizable throwback hits spanning the
90s, 2000s, and early 2010s. Pop, hip-hop, R&B, rock — every track should
trigger "oh I haven't heard this in YEARS" recognition. Mix genres freely.
Bias toward singles that were inescapable in their day.`,
  },
}

function lookupMood(moodId) {
  return MOODS[moodId] || null
}

module.exports = { MOODS, lookupMood, HOUSE_DJ_ID }

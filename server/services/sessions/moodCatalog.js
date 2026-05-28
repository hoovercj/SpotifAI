/**
 * Server-side mood catalog. Each entry mirrors a tile in
 * `client/Components/tabs/moods.js` by `id`, and contains one or more
 * AI **stations** — each station carries its own Gemini curation
 * `prompt` + pinned DJ.
 *
 * A "mood" is the axis the user picks (Party, Workout, Sleep …); a
 * "station" is the specific take within that mood (Latin Party,
 * Throwback Party, …). The mood seed shape is:
 *
 *   { type: "mood", moodId, stationId? }
 *
 * If `stationId` is omitted, the first station in the array is the
 * default — this keeps old `recent_session` rows that pre-date the
 * station split working.
 *
 * Each station pins a DJ whose persona fits the station's vibe. Users
 * can still swap to any DJ via the per-seed picker on the Now Playing
 * screen — these pins are the default, not a constraint.
 *
 * Lo-fi / ambient backgrounds are intentionally excluded — those
 * listeners want uninterrupted audio, which is the opposite of a
 * DJ-hosted session. The closest we get is "Sleep" and "Focus" which
 * carry a hushed DJ.
 */

// House DJ for legacy callers that don't pass a mood id. M-Quake (id 2)
// stays the default fallback for the same reasons documented in
// resolveSessionDj.js.
const HOUSE_DJ_ID = 2

const MOODS = {
  workout: {
    id: "workout",
    name: "Workout",
    stations: [
      {
        id: "hiit",
        name: "HIIT Bangers",
        djId: 9, // Magnus — instigator energy
        prompt: `Curate 30 explosive 140-180 BPM tracks for high-intensity
interval training. Cross EDM peaks, metal breakdowns, hard hip-hop and rage
crossover. Every track should make you sprint the next 30 seconds.`,
      },
      {
        id: "lift",
        name: "Lift Heavy",
        djId: 9, // Magnus
        prompt: `Curate 30 heavy, slow-and-low tracks for a serious lifting
session. Sludge metal, doom riffs, trap with monstrous 808s, industrial
hip-hop. Tempo 80-120 BPM, weight in every beat. Think Pantera, Run the
Jewels, Death Grips.`,
      },
      {
        id: "run",
        name: "Run Pace",
        djId: 19, // Ziggy — indie/punk pace
        prompt: `Curate 30 tracks locked to running cadence — 160-180 BPM,
steady kick, no big tempo drops. Mix indie rock anthems, dance-punk,
electronic, and hip-hop. The vibe is "kept pace, mile 4".`,
      },
      {
        id: "pump-pop",
        name: "Pump-Up Pop",
        djId: 2, // M-Quake
        prompt: `Curate 30 chart pop bangers at workout BPM. Major-key,
shout-along choruses, no slow songs. Think Dua Lipa, The Weeknd, Doja Cat,
Beyoncé, Charli XCX — the kind of pop that turns a treadmill into a
performance.`,
      },
      {
        id: "yoga",
        name: "Yoga & Stretch",
        djId: 24, // Aria
        prompt: `Curate 30 flowing, low-energy tracks for yoga and a slow
stretch. Modern classical, ambient electronic, soft acoustic, nylon-string
guitar. Sub-90 BPM, mostly instrumental, nothing jarring or percussive.`,
      },
    ],
  },

  party: {
    id: "party",
    name: "Party",
    stations: [
      {
        id: "top40",
        name: "Top 40 Party",
        djId: 2, // M-Quake
        prompt: `Curate 30 current Top 40 bangers that make a crowded room
move. Pop, pop-rap, dance-pop — songs everyone knows the chorus to right
now. Skip slow songs, skip throwbacks; every track should feel like
"playing on the radio this week".`,
      },
      {
        id: "throwback",
        name: "Throwback Party",
        djId: 4, // Lady Lyric
        prompt: `Curate 30 inevitable 90s-and-2000s party sing-alongs. Pop,
hip-hop, R&B, rock — songs that pull every generation to the floor:
"Mr. Brightside", "I Wanna Dance with Somebody", "Yeah!", "Crazy in Love",
"Hey Ya!". The kind that earn the cheer when the DJ drops them.`,
      },
      {
        id: "latin",
        name: "Latin Party",
        djId: 8, // Diego
        prompt: `Curate 30 reggaetón, Latin urbano and Latin pop bangers
built for the dance floor. Bad Bunny, Karol G, J Balvin, Daddy Yankee,
Rosalía, Maluma, Shakira. Mostly Spanish-language; tempo 90-110 BPM with
that dembow drive.`,
      },
      {
        id: "hiphop",
        name: "Hip-Hop Party",
        djId: 27, // TJ
        prompt: `Curate 30 hip-hop club records that move bodies. Current
trap, southern bangers, Drake/Future-style anthems, and a few inescapable
2010s classics. Heavy 808s, big hooks, party-not-conscious lyrics.`,
      },
      {
        id: "dancefloor",
        name: "Dance Floor",
        djId: 11, // Tomas
        prompt: `Curate 30 dance-floor tracks across house, big-room, future
bass and pop-EDM. Major-key drops, peak-hour energy, 120-130 BPM. Think
Calvin Harris, Disclosure, Fred again.., Skrillex's poppier side.`,
      },
    ],
  },

  drive: {
    id: "drive",
    name: "Drive",
    stations: [
      {
        id: "highway",
        name: "Open Highway",
        djId: 1, // Rusty
        prompt: `Curate 30 classic and heartland rock anthems for an empty
highway. Bruce Springsteen, Tom Petty, Fleetwood Mac, Eagles, Dire Straits,
CCR. Windows-down energy without aggression — driving songs that swell on a
car stereo.`,
      },
      {
        id: "roadtrip-pop",
        name: "Road Trip Pop",
        djId: 2, // M-Quake
        prompt: `Curate 30 sing-along pop tracks built for the passenger
seat. Bright major-key choruses across modern pop, soft rock, and
crossover hits. The vibe is "windows down on the freeway, everyone in the
car knows the words".`,
      },
      {
        id: "country-cruise",
        name: "Country Cruise",
        djId: 13, // Hattie
        prompt: `Curate 30 modern and classic country songs with highway
energy. Mid-tempo, big hooks — think Eric Church, Miranda Lambert, Chris
Stapleton, Kenny Chesney, plus a sprinkle of 90s legends. Trucks, dirt
roads, freedom — without leaning corny.`,
      },
      {
        id: "indie-rolling",
        name: "Indie Rolling",
        djId: 19, // Ziggy
        prompt: `Curate 30 indie and alt-rock tracks with road-trip motion.
Driving rhythm sections, anthemic choruses, occasional dreamy passages.
War on Drugs, The Killers, Arctic Monkeys, Big Thief, Yeah Yeah Yeahs.`,
      },
      {
        id: "night-drive",
        name: "Night Drive",
        djId: 11, // Tomas
        prompt: `Curate 30 tracks for a late-night highway run. Synthwave,
downtempo electronic, atmospheric indie, dream pop. Steady forward motion,
neon-and-tail-lights mood. Think Tycho, Chromatics, M83, Beach House.`,
      },
    ],
  },

  focus: {
    id: "focus",
    name: "Focus",
    stations: [
      {
        id: "deep-work",
        name: "Deep Work",
        djId: 11, // Tomas
        prompt: `Curate 30 instrumental tracks that hold the room without
demanding attention. Ambient electronic, downtempo, IDM, modern classical
crossovers. Steady texture, minimal melodic hooks, no vocals. Brian Eno,
Nils Frahm, Bonobo's quieter side, Jon Hopkins ambient pieces.`,
      },
      {
        id: "neoclassical",
        name: "Modern Classical",
        djId: 24, // Aria
        prompt: `Curate 30 neoclassical and modern composer pieces for
focused work. Solo piano, minimalist strings, post-classical chamber.
Ólafur Arnalds, Max Richter, Hania Rani, Nils Frahm, Joep Beving. Quiet,
patient, structurally satisfying.`,
      },
      {
        id: "instrumental-beats",
        name: "Instrumental Beats",
        djId: 6, // Coda
        prompt: `Curate 30 instrumental hip-hop and beat tape tracks — chill
beats with a pulse but no rapping. Think Madlib, J Dilla, Nujabes, Knxwledge,
boom-bap instrumental records. 70-95 BPM, head-nod energy without lyrical
distraction.`,
      },
      {
        id: "film-scores",
        name: "Film Scores",
        djId: 17, // Theo
        prompt: `Curate 30 instrumental film and TV score cues that work as
focus music. Hans Zimmer's quieter pieces, Jóhann Jóhannsson, Mica Levi,
Joe Hisaishi, Trent Reznor & Atticus Ross. Cinematic, swelling, no
distracting dialogue or songs.`,
      },
      {
        id: "post-rock",
        name: "Post-Rock",
        djId: 21, // Wren
        prompt: `Curate 30 instrumental post-rock and math rock tracks —
long builds, soaring guitars, no vocals. Explosions in the Sky, Mogwai,
Sigur Rós (instrumental), Godspeed You! Black Emperor, This Will Destroy
You, Toe.`,
      },
    ],
  },

  chill: {
    id: "chill",
    name: "Chill",
    stations: [
      {
        id: "sunday-acoustic",
        name: "Sunday Acoustic",
        djId: 5, // Saoirse
        prompt: `Curate 30 mellow acoustic indie and folk tracks for a slow
Sunday. José González, Iron & Wine, Sufjan Stevens (gentle side), The
Paper Kites, Novo Amor, Phoebe Bridgers' acoustic moments. Vocals welcome
but never raised.`,
      },
      {
        id: "smooth-rnb",
        name: "Smooth R&B",
        djId: 25, // Drey
        prompt: `Curate 30 mellow modern R&B tracks. Daniel Caesar, Snoh
Aalegra, Frank Ocean's softer side, Cleo Sol, H.E.R., Giveon. Tempo
70-95 BPM, dreamy production, no club bangers. The vibe is "lit candle,
soft conversation".`,
      },
      {
        id: "chill-indie",
        name: "Chill Indie",
        djId: 28, // Maya
        prompt: `Curate 30 low-key indie pop and bedroom-pop tracks. Clairo,
Boy Pablo, Faye Webster, Beabadoobee, Cuco, Alvvays at half speed. Warm
production, gentle hooks, no anthems. Sounds like a coffee shop with good
taste.`,
      },
      {
        id: "coffee-jazz",
        name: "Coffee Shop Jazz",
        djId: 16, // Bea
        prompt: `Curate 30 vocal and instrumental jazz tracks at coffee-shop
volume. Norah Jones, Diana Krall, Chet Baker, Cécile McLorin Salvant,
Stacey Kent, modern Blue Note vocalists. Tempo and dynamics stay soft;
nothing that pulls the ear away from a book.`,
      },
      {
        id: "mellow-beats",
        name: "Mellow Beats",
        djId: 6, // Coda
        prompt: `Curate 30 chilled hip-hop and trip-hop tracks with vocals
but low energy. Jordan Rakei, Tom Misch, Loyle Carner, Anderson .Paak's
quieter side, Sault, Cleo Sol. Groove without intensity.`,
      },
    ],
  },

  rainy: {
    id: "rainy",
    name: "Rainy Day",
    stations: [
      {
        id: "indie-melancholy",
        name: "Indie Melancholy",
        djId: 5, // Saoirse
        prompt: `Curate 30 reverb-heavy, slightly-melancholic indie tracks
that feel like a grey window. Bon Iver, Phoebe Bridgers, The National,
Big Thief, Sufjan Stevens, Adrianne Lenker, Sharon Van Etten. Introspective
not despairing.`,
      },
      {
        id: "quiet-jazz",
        name: "Quiet Jazz",
        djId: 22, // Henri
        prompt: `Curate 30 late-night ballad and modal jazz pieces. Bill
Evans, Chet Baker ballads, Cassandra Wilson, John Coltrane's "Ballads",
Brad Mehldau's quieter trio work. Sub-100 BPM, smoke-in-the-room mood.`,
      },
      {
        id: "slowcore",
        name: "Slowcore",
        djId: 21, // Wren
        prompt: `Curate 30 slowcore and quiet-loud-quiet indie tracks. Low,
Codeine, Mojave 3, Red House Painters, Duster, Grouper, the slower side
of Cigarettes After Sex. Patient, sparse, weighted.`,
      },
      {
        id: "acoustic-ache",
        name: "Acoustic Ache",
        djId: 13, // Hattie
        prompt: `Curate 30 acoustic singer-songwriter tracks about long
days. Gillian Welch, Iris DeMent, John Prine ballads, Brandi Carlile,
Jason Isbell's softer side, Kacey Musgraves "rainbow" mode. Voice forward,
guitar honest.`,
      },
      {
        id: "ambient-rain",
        name: "Ambient Rain",
        djId: 11, // Tomas
        prompt: `Curate 30 atmospheric electronic tracks with a low-key,
overcast palette. Burial, Tim Hecker, Stars of the Lid, GAS, William
Basinski, A Winged Victory for the Sullen. Long-form, mostly textural.`,
      },
    ],
  },

  sleep: {
    id: "sleep",
    name: "Sleep",
    stations: [
      {
        id: "piano",
        name: "Piano for Sleep",
        djId: 24, // Aria
        prompt: `Curate 30 slow solo-piano pieces for falling asleep.
Ludovico Einaudi, Nils Frahm's quietest, Hania Rani, Joep Beving, Chad
Lawson. Sub-70 BPM, soft dynamics, nothing dissonant or surprising.`,
      },
      {
        id: "strings",
        name: "Sleep Strings",
        djId: 24, // Aria
        prompt: `Curate 30 slow minimalist string and chamber pieces. Max
Richter "Sleep" excerpts, Arvo Pärt, Henryk Górecki, modern minimalist
quartets. Patient, slow-moving, no jagged dynamics.`,
      },
      {
        id: "ambient",
        name: "Ambient Sleep",
        djId: 11, // Tomas
        prompt: `Curate 30 slow-evolving ambient electronic pieces designed
for sleep. Brian Eno (Ambient series), Stars of the Lid, Aphex Twin's
Selected Ambient Works II, Hammock, Marconi Union. Long-form, very quiet,
no rhythmic kick.`,
      },
      {
        id: "gentle-acoustic",
        name: "Gentle Acoustic",
        djId: 5, // Saoirse
        prompt: `Curate 30 soft acoustic guitar and nylon-string pieces.
Andrew Bird (instrumental), Sufjan Stevens "All Delighted People"
acoustic, José González (instrumental), Bill Frisell solo work. Whisper-
quiet vocals or instrumental only.`,
      },
      {
        id: "choral",
        name: "Choral Sleep",
        djId: 10, // Marcus
        prompt: `Curate 30 slow sacred-choral and contemplative vocal
pieces. Arvo Pärt, Eric Whitacre, Hildegard von Bingen, gregorian chant,
Górecki's "Symphony No. 3" passages. Warm reverberant rooms, slow lines.`,
      },
    ],
  },

  feelgood: {
    id: "feelgood",
    name: "Feel Good",
    stations: [
      {
        id: "sunshine-pop",
        name: "Sunshine Pop",
        djId: 2, // M-Quake
        prompt: `Curate 30 bright, optimistic modern pop tracks. Lizzo,
Dua Lipa, Harry Styles, Bruno Mars, Anderson .Paak's funkier side, Lake
Street Dive. Major-key, brass-or-strings forward, smile-on-face.`,
      },
      {
        id: "motown",
        name: "Motown Joy",
        djId: 16, // Bea
        prompt: `Curate 30 Motown and classic soul tracks built to lift a
room. Stevie Wonder up-tempo, The Jackson 5, The Temptations, Marvin
Gaye's groove side, Aretha Franklin's joyful tracks. The vibe is
"impossible to stay still".`,
      },
      {
        id: "reggae-vibes",
        name: "Reggae Vibes",
        djId: 20, // Aurelia
        prompt: `Curate 30 sunny roots reggae and lovers rock tracks. Bob
Marley & The Wailers (uplifting cuts), Toots & the Maytals, Jimmy Cliff,
Steel Pulse, Chronixx, Koffee. Major-key one-drops, beach energy.`,
      },
      {
        id: "80s-bright",
        name: "80s Bright",
        djId: 26, // Stella
        prompt: `Curate 30 bright 80s synth-pop and new-wave tracks. Wham!,
Cyndi Lauper, Tears for Fears, Whitney Houston up-tempo, A-ha, Talking
Heads, Hall & Oates. The kind of songs that play over end-credit montages.`,
      },
      {
        id: "funk-fix",
        name: "Funk Fix",
        djId: 4, // Lady Lyric
        prompt: `Curate 30 funk tracks across eras. Parliament-Funkadelic,
Sly & the Family Stone, Earth Wind & Fire, Chic, Prince's funkier
records, Vulfpeck, Cory Wong. Bass-forward, horn-stab heavy,
groove-and-pocket.`,
      },
    ],
  },

  romance: {
    id: "romance",
    name: "Romance",
    stations: [
      {
        id: "slow-burn-rnb",
        name: "Slow Burn R&B",
        djId: 25, // Drey
        prompt: `Curate 30 modern intimate R&B tracks for a quiet evening
together. Frank Ocean, Daniel Caesar, Snoh Aalegra, H.E.R., dvsn, Brent
Faiyaz at his softest. Sub-100 BPM, candle-and-vinyl mood, lyrically
earnest about love.`,
      },
      {
        id: "classic-soul",
        name: "Classic Soul Love",
        djId: 16, // Bea
        prompt: `Curate 30 classic soul love songs across the 60s, 70s and
early 80s. Sade, Marvin Gaye, Al Green, Anita Baker, Luther Vandross,
Stevie Wonder ballads, Roberta Flack & Donny Hathaway duets. Timeless,
swooning.`,
      },
      {
        id: "indie-love",
        name: "Indie Love Songs",
        djId: 28, // Maya
        prompt: `Curate 30 indie pop and indie folk love songs — earnest,
not ironic. Bon Iver duets, Phoebe Bridgers' love songs, Mac DeMarco's
sweet side, Mitski's tender tracks, Lord Huron, The Paper Kites.`,
      },
      {
        id: "latin-romance",
        name: "Latin Romance",
        djId: 8, // Diego
        prompt: `Curate 30 romantic Latin tracks. Bachata classics (Aventura,
Romeo Santos), bolero standards (Luis Miguel), reggaetón slow-burners
(Bad Bunny's softer cuts), Latin pop ballads (Shakira, Camilo, Selena
Gomez en español).`,
      },
      {
        id: "crooners",
        name: "Crooner Standards",
        djId: 23, // Sterling
        prompt: `Curate 30 classic vocal jazz standards for a candle-lit
dinner. Sinatra, Tony Bennett, Ella Fitzgerald, Nat King Cole, Etta James
ballads, Diana Krall, Michael Bublé's straighter renditions. Warm strings,
brushed drums, song-of-the-Great-American-Songbook energy.`,
      },
    ],
  },

  sad: {
    id: "sad",
    name: "Sad",
    stations: [
      {
        id: "sad-girl-pop",
        name: "Sad Girl Pop",
        djId: 28, // Maya
        prompt: `Curate 30 introspective, cathartic indie-pop tracks
typically labeled "sad girl". Mitski, Lana Del Rey, Phoebe Bridgers,
Soccer Mommy, Snail Mail, Japanese Breakfast, Faye Webster. Lyrically
heavy, sonically gorgeous.`,
      },
      {
        id: "heartbreak-country",
        name: "Heartbreak Country",
        djId: 13, // Hattie
        prompt: `Curate 30 country songs about heartbreak and longing.
Patsy Cline, Tammy Wynette, George Jones, Kacey Musgraves' "Star-Crossed"
side, Sturgill Simpson ballads, Jason Isbell, Sarah Jarosz. Steel guitar
optional, ache mandatory.`,
      },
      {
        id: "blues-catharsis",
        name: "Blues Catharsis",
        djId: 22, // Henri
        prompt: `Curate 30 slow blues tracks built around catharsis. B.B.
King ballads, Etta James, Bobby "Blue" Bland, Otis Redding's sad side,
Bonnie Raitt slow burners, Gary Clark Jr.'s mournful cuts. Wide vibrato,
weighted phrasing.`,
      },
      {
        id: "cathartic-indie",
        name: "Cathartic Indie",
        djId: 21, // Wren
        prompt: `Curate 30 cathartic indie rock and emo-leaning tracks.
Death Cab for Cutie's quietest, The Antlers, Mount Eerie, American
Football, Manchester Orchestra ballads, Pinegrove, Julien Baker. The
vibe is "cry in the car".`,
      },
      {
        id: "tear-jerker-jazz",
        name: "Tear-Jerker Standards",
        djId: 16, // Bea
        prompt: `Curate 30 melancholy jazz vocal pieces. Billie Holiday,
Nina Simone's lonelier tracks, Chet Baker's saddest ballads, Cassandra
Wilson's late-night cuts, José James, Cécile McLorin Salvant's slower
moments. Slow tempo, weight in every line.`,
      },
    ],
  },

  morning: {
    id: "morning",
    name: "Morning",
    stations: [
      {
        id: "slow-wake",
        name: "Slow Wake",
        djId: 28, // Maya
        prompt: `Curate 30 gentle indie tracks for slowly waking up. Mac
DeMarco, Whitney, Andy Shauf, Real Estate, Faye Webster, Beach House at
mid-tempo. Warm, mid-tempo, mostly major-key — soft enough not to startle.`,
      },
      {
        id: "coffee-jazz",
        name: "Morning Coffee Jazz",
        djId: 16, // Bea
        prompt: `Curate 30 warm vocal-jazz tracks for the first cup. Norah
Jones, Madeleine Peyroux, Stacey Kent, Diana Krall, Cécile McLorin
Salvant's softer takes. Brushed drums, upright bass, gentle horns.`,
      },
      {
        id: "sunday-hymns",
        name: "Sunday Hymns",
        djId: 10, // Marcus
        prompt: `Curate 30 gentle gospel and contemporary hymn tracks for a
calm Sunday morning. The Hawkins Family, Kirk Franklin's softer side,
Aretha's gospel records, Mahalia Jackson, modern worship in mid-tempo
mode. Lifted but unhurried.`,
      },
      {
        id: "soft-latin",
        name: "Soft Latin Morning",
        djId: 14, // Rio
        prompt: `Curate 30 bossa nova, Brazilian jazz and soft Latin tracks
for a slow morning. João Gilberto, Astrud Gilberto, Stan Getz with João,
Marisa Monte, Caetano Veloso quieter cuts, Bebel Gilberto. Warm and
unhurried.`,
      },
      {
        id: "folk-sunrise",
        name: "Folk Sunrise",
        djId: 5, // Saoirse
        prompt: `Curate 30 warm folk and indie folk tracks for sunrise. Iron
& Wine, Fleet Foxes, Bon Iver's quieter folk, José González, The Paper
Kites, Sufjan Stevens "Carrie & Lowell" side. Acoustic, harmony-rich,
softly hopeful.`,
      },
    ],
  },

  throwback: {
    id: "throwback",
    name: "Throwback",
    stations: [
      {
        id: "90s",
        name: "90s Throwback",
        djId: 4, // Lady Lyric
        prompt: `Curate 30 inescapable 90s pop, hip-hop and R&B hits. TLC,
Backstreet Boys, Britney Spears, Notorious B.I.G., Mariah Carey,
Destiny's Child, No Doubt, Boyz II Men, Spice Girls, 2Pac. Songs everyone
knows.`,
      },
      {
        id: "2000s",
        name: "2000s Throwback",
        djId: 27, // TJ
        prompt: `Curate 30 inescapable 2000s hits. Outkast, Beyoncé,
Justin Timberlake, Black Eyed Peas, Eminem, Usher, Nelly, Kelly Clarkson,
Avril Lavigne, Maroon 5. The kind of songs you sang along to in middle
school.`,
      },
      {
        id: "2010s",
        name: "2010s Throwback",
        djId: 25, // Drey
        prompt: `Curate 30 inescapable 2010s singles. Bruno Mars, Adele,
Rihanna, Drake, Katy Perry, Taylor Swift, Calvin Harris, The
Chainsmokers, Lorde, Ed Sheeran. The "wait this is a throwback now?"
playlist.`,
      },
      {
        id: "80s",
        name: "80s Throwback",
        djId: 26, // Stella
        prompt: `Curate 30 80s pop, rock and new wave hits. Michael Jackson,
Madonna, Prince, Whitney Houston, Bon Jovi, Bruce Springsteen, Van
Halen, Cyndi Lauper, Tears for Fears, Duran Duran. Big-haired and
inevitable.`,
      },
      {
        id: "one-hit",
        name: "One-Hit Wonders",
        djId: 2, // M-Quake
        prompt: `Curate 30 one-hit wonders spanning the 80s, 90s and 2000s
— songs everyone knows by an artist nobody can name a second song by.
"Take On Me", "Tubthumping", "How Bizarre", "Steal My Sunshine", "Closing
Time", "All Star", "Stacy's Mom". Maximum recognition-trigger.`,
      },
    ],
  },
}

function lookupMood(moodId) {
  return MOODS[moodId] || null
}

/**
 * Resolve a (moodId, stationId) pair to the underlying station record.
 * If `stationId` is null/undefined, returns the mood's first station as
 * the default — backwards-compatible with old recent_session rows that
 * only stored `{ type: "mood", moodId }`.
 */
function lookupMoodStation(moodId, stationId) {
  const mood = MOODS[moodId]
  if (!mood) return null
  if (!stationId) return mood.stations[0] || null
  return mood.stations.find((s) => s.id === stationId) || null
}

module.exports = { MOODS, lookupMood, lookupMoodStation, HOUSE_DJ_ID }

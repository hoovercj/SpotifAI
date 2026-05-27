// Client-side AI station catalog.
//
// We mirror the visual side of the station catalog here (id, name, gradient
// hint) so SearchTab can render station cards without an extra round-trip.
// The actual Gemini prompts live server-side in
// `server/services/aiStations/catalog.js` — that's the canonical source for
// per-station prompt text. Whatever station ids appear here MUST also exist
// server-side; otherwise tapping a station card 404s.

const STATIONS_BY_GENRE_ID = {
  pop: [
    { id: "current", name: "Current Hits", gradient: ["#ec4899", "#a855f7"] },
    { id: "2010s", name: "2010s Throwbacks", gradient: ["#f472b6", "#7c3aed"] },
    { id: "2000s", name: "2000s Pop", gradient: ["#f59e0b", "#dc2626"] },
    { id: "90s-classics", name: "90s Pop Classics", gradient: ["#a855f7", "#3b82f6"] },
    { id: "indie-pop", name: "Indie Pop Gems", gradient: ["#14b8a6", "#3b82f6"] },
  ],

  rock: [
    { id: "current", name: "Current Hits", gradient: ["#ef4444", "#7c3aed"] },
    { id: "2000s-10s", name: "2000s / 10s Anthems", gradient: ["#f59e0b", "#dc2626"] },
    { id: "80s-classics", name: "80s Classics", gradient: ["#a855f7", "#1e40af"] },
    { id: "70s-legends", name: "70s Legends", gradient: ["#d97706", "#7c2d12"] },
    { id: "indie-gems", name: "Indie Rock Gems", gradient: ["#14b8a6", "#3b82f6"] },
  ],

  hiphop: [
    { id: "current", name: "Current Hits", gradient: ["#f59e0b", "#b91c1c"] },
    { id: "90s-golden", name: "90s Golden Era", gradient: ["#6d28d9", "#0f172a"] },
    { id: "2000s-bling", name: "2000s Bling Era", gradient: ["#fbbf24", "#1d4ed8"] },
    { id: "2010s-trap", name: "2010s Trap Wave", gradient: ["#dc2626", "#0f172a"] },
    { id: "east-coast", name: "East Coast Boom Bap", gradient: ["#475569", "#1f2937"] },
    { id: "west-coast", name: "West Coast & G-Funk", gradient: ["#1d4ed8", "#f97316"] },
    { id: "southern", name: "Southern Heat", gradient: ["#ea580c", "#7c2d12"] },
    { id: "female-mcs", name: "Female MCs", gradient: ["#ec4899", "#8b5cf6"] },
    { id: "conscious", name: "Conscious & Backpack", gradient: ["#16a34a", "#1d4ed8"] },
  ],

  rnb: [
    { id: "current", name: "Current Hits", gradient: ["#f43f5e", "#7e22ce"] },
    { id: "90s", name: "90s R&B", gradient: ["#f472b6", "#2563eb"] },
    { id: "2000s", name: "2000s Smooth", gradient: ["#8b5cf6", "#0d9488"] },
    { id: "neo-soul", name: "Neo-Soul", gradient: ["#d97706", "#7c2d12"] },
    { id: "alternative", name: "Alternative R&B", gradient: ["#475569", "#7c3aed"] },
    { id: "motown", name: "Motown Classics", gradient: ["#dc2626", "#ca8a04"] },
    { id: "quiet-storm", name: "Quiet Storm", gradient: ["#1e3a8a", "#6d28d9"] },
    { id: "new-jack-swing", name: "New Jack Swing", gradient: ["#0d9488", "#db2777"] },
  ],

  afrobeats: [
    { id: "current", name: "Current Hits", gradient: ["#f97316", "#15803d"] },
    { id: "anthems", name: "Afrobeats Anthems", gradient: ["#facc15", "#dc2626"] },
    { id: "amapiano", name: "Amapiano", gradient: ["#7c3aed", "#facc15"] },
    { id: "roots", name: "Fela & Highlife Roots", gradient: ["#b91c1c", "#facc15"] },
    { id: "alte", name: "Alté Wave", gradient: ["#06b6d4", "#d946ef"] },
    { id: "naija", name: "Naija Heat", gradient: ["#15803d", "#fafafa"] },
    { id: "diaspora", name: "UK & Diaspora", gradient: ["#1d4ed8", "#dc2626"] },
  ],

  indie: [
    { id: "current", name: "Current Indie", gradient: ["#14b8a6", "#1d4ed8"] },
    { id: "2000s", name: "2000s Indie Boom", gradient: ["#dc2626", "#1d4ed8"] },
    { id: "2010s", name: "2010s Indie Anthems", gradient: ["#7c3aed", "#0d9488"] },
    { id: "indie-folk", name: "Indie Folk", gradient: ["#d97706", "#14532d"] },
    { id: "dream-pop", name: "Dream Pop & Shoegaze", gradient: ["#f472b6", "#6d28d9"] },
    { id: "indie-sleaze", name: "Indie Sleaze", gradient: ["#facc15", "#0f172a"] },
    { id: "bedroom-pop", name: "Bedroom Pop", gradient: ["#c4b5fd", "#fb7185"] },
  ],

  electronic: [
    { id: "house", name: "House Classics", gradient: ["#06b6d4", "#7c3aed"] },
    { id: "techno", name: "Techno", gradient: ["#475569", "#dc2626"] },
    { id: "dnb", name: "Drum & Bass", gradient: ["#f97316", "#0f172a"] },
    { id: "dubstep", name: "Dubstep", gradient: ["#facc15", "#0f172a"] },
    { id: "trance", name: "Trance", gradient: ["#38bdf8", "#7c3aed"] },
    { id: "synthwave", name: "Synthwave", gradient: ["#d946ef", "#06b6d4"] },
    { id: "ambient", name: "Ambient & IDM", gradient: ["#475569", "#1d4ed8"] },
    { id: "french-touch", name: "French Touch", gradient: ["#dc2626", "#1d4ed8"] },
    { id: "future-bass", name: "Future Bass", gradient: ["#f472b6", "#14b8a6"] },
  ],

  folk: [
    { id: "60s-revival", name: "60s Folk Revival", gradient: ["#92400e", "#d97706"] },
    { id: "modern", name: "Modern Folk Revival", gradient: ["#15803d", "#fef3c7"] },
    { id: "folk-rock", name: "Folk Rock", gradient: ["#b91c1c", "#14532d"] },
    { id: "singer-songwriter", name: "Singer-Songwriter", gradient: ["#facc15", "#78350f"] },
    { id: "americana", name: "Americana", gradient: ["#ea580c", "#7c2d12"] },
    { id: "bluegrass", name: "Bluegrass", gradient: ["#15803d", "#facc15"] },
    { id: "indie-folk", name: "Indie Folk", gradient: ["#84cc16", "#1d4ed8"] },
  ],

  jazz: [
    { id: "bebop", name: "Bebop", gradient: ["#ca8a04", "#7f1d1d"] },
    { id: "cool", name: "Cool Jazz", gradient: ["#93c5fd", "#475569"] },
    { id: "hard-bop", name: "Hard Bop", gradient: ["#f97316", "#7c2d12"] },
    { id: "modal", name: "Modal Jazz", gradient: ["#1d4ed8", "#0d9488"] },
    { id: "fusion", name: "Fusion", gradient: ["#7c3aed", "#f97316"] },
    { id: "big-band", name: "Big Band & Swing", gradient: ["#dc2626", "#ca8a04"] },
    { id: "vocal", name: "Vocal Jazz", gradient: ["#fb7185", "#78350f"] },
    { id: "bossa-nova", name: "Bossa Nova & Brazilian", gradient: ["#15803d", "#facc15"] },
    { id: "contemporary", name: "Contemporary Jazz", gradient: ["#06b6d4", "#7c3aed"] },
  ],

  classical: [
    { id: "baroque", name: "Baroque Masters", gradient: ["#ca8a04", "#7f1d1d"] },
    { id: "classical-era", name: "Classical Era", gradient: ["#fef3c7", "#1d4ed8"] },
    { id: "romantic", name: "Romantic Era", gradient: ["#fb7185", "#7f1d1d"] },
    { id: "impressionist", name: "Impressionist", gradient: ["#c4b5fd", "#0d9488"] },
    { id: "20th-century", name: "20th-Century Modern", gradient: ["#475569", "#b91c1c"] },
    { id: "minimalism", name: "Minimalism", gradient: ["#e5e7eb", "#0f172a"] },
    { id: "neoclassical", name: "Neoclassical & Cinematic", gradient: ["#84cc16", "#94a3b8"] },
    { id: "opera", name: "Opera Arias", gradient: ["#b91c1c", "#ca8a04"] },
    { id: "piano-solo", name: "Piano Solo", gradient: ["#fef3c7", "#475569"] },
  ],

  stagescreen: [
    { id: "broadway-classics", name: "Broadway Golden Age", gradient: ["#b91c1c", "#ca8a04"] },
    { id: "modern-broadway", name: "Modern Broadway", gradient: ["#7c3aed", "#06b6d4"] },
    { id: "disney", name: "Disney Animated", gradient: ["#1d4ed8", "#facc15"] },
    { id: "movie-musicals", name: "Movie Musicals", gradient: ["#ec4899", "#ca8a04"] },
    { id: "epic-scores", name: "Epic Film Scores", gradient: ["#1e3a8a", "#ca8a04"] },
    { id: "indie-scores", name: "Indie Film Scores", gradient: ["#475569", "#7c3aed"] },
    { id: "game-osts", name: "Video Game Soundtracks", gradient: ["#15803d", "#1d4ed8"] },
    { id: "west-end", name: "West End", gradient: ["#b91c1c", "#0f172a"] },
  ],

  country: [
    { id: "current", name: "Current Country", gradient: ["#f97316", "#15803d"] },
    { id: "90s", name: "90s Country", gradient: ["#1d4ed8", "#dc2626"] },
    { id: "2000s", name: "2000s Country", gradient: ["#facc15", "#b91c1c"] },
    { id: "outlaw", name: "Outlaw Country", gradient: ["#0f172a", "#b91c1c"] },
    { id: "classic", name: "Classic Country", gradient: ["#78350f", "#7f1d1d"] },
    { id: "bluegrass", name: "Bluegrass", gradient: ["#15803d", "#facc15"] },
    { id: "americana", name: "Americana & Alt-Country", gradient: ["#9a3412", "#14532d"] },
  ],

  gospel: [
    { id: "contemporary", name: "Contemporary Gospel", gradient: ["#ca8a04", "#7e22ce"] },
    { id: "traditional", name: "Traditional Gospel", gradient: ["#1d4ed8", "#ca8a04"] },
    { id: "choir", name: "Mass Choirs", gradient: ["#fafafa", "#1d4ed8"] },
    { id: "modern-worship", name: "Modern Worship", gradient: ["#38bdf8", "#7c3aed"] },
    { id: "ccm", name: "Contemporary Christian", gradient: ["#0d9488", "#94a3b8"] },
    { id: "southern", name: "Southern Gospel", gradient: ["#b91c1c", "#facc15"] },
    { id: "spirituals", name: "Spirituals & Hymns", gradient: ["#1e3a8a", "#fef3c7"] },
  ],

  latin: [
    { id: "reggaeton", name: "Reggaetón", gradient: ["#dc2626", "#facc15"] },
    { id: "latin-pop", name: "Latin Pop", gradient: ["#f472b6", "#facc15"] },
    { id: "salsa", name: "Salsa", gradient: ["#dc2626", "#0f172a"] },
    { id: "bachata", name: "Bachata", gradient: ["#fb7185", "#7f1d1d"] },
    { id: "cumbia", name: "Cumbia", gradient: ["#facc15", "#b91c1c"] },
    { id: "regional", name: "Regional Mexican", gradient: ["#15803d", "#dc2626"] },
    { id: "rock-en-espanol", name: "Rock en Español", gradient: ["#7c3aed", "#b91c1c"] },
    { id: "trap-latino", name: "Latin Trap", gradient: ["#0f172a", "#7c3aed"] },
    { id: "bolero", name: "Bolero & Standards", gradient: ["#78350f", "#ca8a04"] },
  ],

  reggae: [
    { id: "roots", name: "Roots Reggae", gradient: ["#15803d", "#b91c1c"] },
    { id: "dancehall", name: "Dancehall", gradient: ["#facc15", "#ea580c"] },
    { id: "ska", name: "Ska Originators", gradient: ["#0f172a", "#fafafa"] },
    { id: "two-tone", name: "2 Tone & Ska Revival", gradient: ["#475569", "#dc2626"] },
    { id: "lovers-rock", name: "Lovers Rock", gradient: ["#fb7185", "#0d9488"] },
    { id: "dub", name: "Dub", gradient: ["#1e3a8a", "#0f172a"] },
    { id: "modern-roots", name: "Modern Roots Revival", gradient: ["#14532d", "#facc15"] },
  ],

  kpop: [
    { id: "current", name: "Current K-Pop", gradient: ["#f472b6", "#06b6d4"] },
    { id: "4th-gen", name: "4th Gen", gradient: ["#c4b5fd", "#06b6d4"] },
    { id: "3rd-gen", name: "3rd Gen Classics", gradient: ["#7c3aed", "#facc15"] },
    { id: "2nd-gen", name: "2nd Gen Legends", gradient: ["#dc2626", "#0f172a"] },
    { id: "ballads", name: "K-Pop Ballads", gradient: ["#fb7185", "#1d4ed8"] },
    { id: "k-rnb", name: "K-Hip-Hop & R&B", gradient: ["#7c3aed", "#0d9488"] },
    { id: "k-indie", name: "K-Indie", gradient: ["#84cc16", "#c4b5fd"] },
    { id: "k-drama", name: "K-Drama OSTs", gradient: ["#ca8a04", "#fb7185"] },
  ],

  anime: [
    { id: "openings", name: "Anime Openings", gradient: ["#dc2626", "#1d4ed8"] },
    { id: "ghibli", name: "Studio Ghibli", gradient: ["#38bdf8", "#15803d"] },
    { id: "shonen", name: "Shonen Battle Themes", gradient: ["#f97316", "#0f172a"] },
    { id: "j-rock", name: "J-Rock & Anime Rock", gradient: ["#b91c1c", "#0f172a"] },
    { id: "anisong-classics", name: "Anisong Classics", gradient: ["#facc15", "#b91c1c"] },
    { id: "sad-anime", name: "Sad Anime", gradient: ["#475569", "#c4b5fd"] },
    { id: "j-pop-anime", name: "Modern Anisong", gradient: ["#ec4899", "#7c3aed"] },
    { id: "game-osts", name: "JRPG / Game OSTs", gradient: ["#06b6d4", "#7c3aed"] },
  ],

  metal: [
    { id: "classic", name: "Classic Metal", gradient: ["#475569", "#b91c1c"] },
    { id: "thrash", name: "Thrash", gradient: ["#0f172a", "#facc15"] },
    { id: "death", name: "Death Metal", gradient: ["#0f172a", "#7f1d1d"] },
    { id: "black", name: "Black Metal", gradient: ["#0f172a", "#6d28d9"] },
    { id: "power", name: "Power Metal", gradient: ["#94a3b8", "#1d4ed8"] },
    { id: "doom", name: "Doom Metal", gradient: ["#1f2937", "#000000"] },
    { id: "nu-metal", name: "Nu-Metal", gradient: ["#dc2626", "#0f172a"] },
    { id: "prog", name: "Prog Metal", gradient: ["#7c3aed", "#06b6d4"] },
    { id: "modern", name: "Modern Metal", gradient: ["#06b6d4", "#dc2626"] },
  ],

  holiday: [
    { id: "pop-hits", name: "Christmas Pop Hits", gradient: ["#dc2626", "#15803d"] },
    { id: "crooners", name: "Classic Crooners", gradient: ["#ca8a04", "#1e3a8a"] },
    { id: "soul-motown", name: "Soul & Motown Christmas", gradient: ["#b91c1c", "#ca8a04"] },
    { id: "rock", name: "Christmas Rock", gradient: ["#dc2626", "#0f172a"] },
    { id: "rnb-hiphop", name: "R&B & Hip-Hop Holiday", gradient: ["#94a3b8", "#b91c1c"] },
    { id: "cozy", name: "Cozy Acoustic Holiday", gradient: ["#fef3c7", "#14532d"] },
    { id: "sacred", name: "Sacred Christmas", gradient: ["#e5e7eb", "#1d4ed8"] },
  ],
}

/**
 * Resolve a free-text query (the search box, or a tapped genre tile) to a
 * `{ genreId, stations }` bundle, if the query matches one of our known
 * genres. Returns `null` for anything that isn't a clean genre match.
 */
export function stationsForQuery(query) {
  const normalized = String(query || "")
    .trim()
    .toLowerCase()
  if (!normalized) return null

  // Aliases live alongside each genreId so "hip hop", "hiphop", and
  // "hip-hop" all resolve to the same set.
  const aliases = {
    pop: ["pop"],
    rock: ["rock"],
    hiphop: ["hip-hop", "hip hop", "hiphop", "rap"],
    rnb: ["r&b", "rnb", "r and b"],
    afrobeats: ["afrobeats", "afrobeat", "afro"],
    indie: ["indie"],
    electronic: ["electronic", "edm", "dance", "house", "techno"],
    folk: ["folk", "acoustic"],
    jazz: ["jazz"],
    classical: ["classical"],
    stagescreen: [
      "stage & screen",
      "stage and screen",
      "musicals",
      "soundtracks",
      "soundtrack",
      "film scores",
      "broadway",
    ],
    country: ["country"],
    gospel: ["gospel", "christian"],
    latin: ["latin"],
    reggae: ["reggae"],
    kpop: ["k-pop", "kpop", "k pop"],
    anime: ["anime", "anisong"],
    metal: ["metal"],
    holiday: ["holiday", "christmas", "xmas"],
  }

  for (const [genreId, names] of Object.entries(aliases)) {
    if (names.includes(normalized)) {
      const stations = STATIONS_BY_GENRE_ID[genreId]
      if (stations?.length) return { genreId, stations }
      // Genre is known but we don't have stations yet — surface nothing
      // rather than a sad empty row.
      return null
    }
  }

  return null
}

export default STATIONS_BY_GENRE_ID

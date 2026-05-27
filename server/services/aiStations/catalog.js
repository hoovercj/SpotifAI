/**
 * Server-side AI station catalog. Each genre maps to a set of stations; each
 * station has a Gemini prompt describing the curatorial intent. The station
 * `id` and `name` MUST match the client-side mirror at
 * `client/Components/tabs/aiStations.js` (so a card the user can see
 * actually resolves to a real prompt here when they tap it).
 *
 * Each station also pins a `djId` that maps into `server/services/djCharacters.js`.
 * Today every station in a given genre shares the same DJ — the per-station
 * field exists so we can override individual stations later (e.g. a
 * "morning show" station could pin a different host) without restructuring.
 */

// DJ ids from server/services/utl/loadPersonas.js (which mirrors
// personas/*.md). Centralized so a typo here becomes a single failure
// point instead of scattering magic numbers across the genre catalog.
//
// Original four are kept first (1–4) for historical continuity; the
// roster expansion in Aug 2025 added 24 more (5–28) so every genre has
// at least 2 genre-appropriate hosts. See `personas/README.md` for the
// full table.
const DJ = {
  // ── Originals ───────────────────────────────────────────────────────
  RUSTY: 1,       // classic rock, country, folk, metal — midwest biker uncle
  M_QUAKE: 2,     // pop / contemporary / dance / kpop / latin / anime
  NIGEL: 3,       // jazz / classical / stage & screen — British heritage host
  LADY_LYRIC: 4,  // hip-hop / r&b / afrobeats / gospel — Bronx warmth

  // ── Expansion (Aug 2025) ───────────────────────────────────────────
  SAOIRSE: 5,     // folk / indie — Dublin, hushed and literary
  CODA: 6,        // hiphop / rnb — non-binary, atmospheric, future-leaning
  YUKI: 7,        // anime / kpop / pop — Tokyo, otaku-fluent
  DIEGO: 8,       // latin / hiphop — CDMX, bilingual reggaetón energy
  MAGNUS: 9,      // metal / punk — Bergen, blackened-and-erudite
  MARCUS: 10,     // gospel / rnb / soul — Atlanta reverend
  TOMAS: 11,      // electronic — Berlin techno/ambient lifer
  JADE: 12,       // kpop / pop — Seoul/LA bilingual, idol-scholar
  HATTIE: 13,     // country / folk — Nashville stalwart, plainspoken
  RIO: 14,        // latin / electronic — São Paulo, trans woman, club-pop
  LIAM: 15,       // electronic / hiphop — London garage/dnb/grime native
  BEA: 16,        // jazz / rnb / soul — NYC heritage, smoky and warm
  THEO: 17,       // stagescreen / holiday / classical — Broadway insider
  KWAME: 18,      // afrobeats / hiphop — Lagos, sweat and pride
  ZIGGY: 19,      // indie / punk / rock — Portland, non-binary, sleaze era
  AURELIA: 20,    // reggae / afrobeats — Jamaica→Toronto, soundsystem auntie
  WREN: 21,       // punk / indie / rock — Brooklyn, trans man, post-hardcore
  HENRI: 22,      // jazz / folk / blues — NOLA elder, raconteur
  STERLING: 23,   // holiday / stagescreen / jazz — NYC crooner-host
  ARIA: 24,       // classical / stagescreen — Astoria-Greek conservatoire host
  DREY: 25,       // rnb / pop — LA, melodic, currently-charting voice
  STELLA: 26,     // rock / pop / indie — Sydney, big-tent rock authority
  TJ: 27,         // hiphop / rnb — Houston, southern rap historian
  MAYA: 28,       // indie / pop — Bay Area, bedroom-pop sensibility
}

const CATALOG = {
  pop: {
    name: "Pop",
    stations: [
      {
        id: "current",
        name: "Current Hits",
        djId: DJ.M_QUAKE,
        prompt: `Curate 30 popular mainstream pop songs that are charting or
trending right now. Focus on the biggest pop artists of the current era —
think the kind of songs you'd hear on a Top 40 radio station this week. Mix
established stars with breakout artists. No throwbacks; every track should
feel like "right now".`,
      },
      {
        id: "2010s",
        name: "2010s Throwbacks",
        djId: DJ.DREY,
        prompt: `Curate 30 huge pop songs from 2010 through 2019. Aim for
tracks that defined the decade — chart-topping singles by artists like
Taylor Swift, Bruno Mars, Katy Perry, Rihanna, Justin Bieber, Ed Sheeran,
Adele, Maroon 5, The Chainsmokers, Selena Gomez, Drake, Sia, Lady Gaga.
Mix peppy bangers with a few of the era's biggest ballads.`,
      },
      {
        id: "2000s",
        name: "2000s Pop",
        djId: DJ.M_QUAKE,
        prompt: `Curate 30 quintessential pop songs from 2000 through 2009.
Britney, Christina, Beyoncé, NSYNC, Backstreet Boys, Justin Timberlake,
Pink, Kelly Clarkson, Avril Lavigne, Black Eyed Peas, Gwen Stefani,
Destiny's Child, Nelly Furtado, OutKast crossover hits. Big radio singles,
not deep cuts.`,
      },
      {
        id: "90s-classics",
        name: "90s Pop Classics",
        djId: DJ.STELLA,
        prompt: `Curate 30 defining pop hits from 1990 through 1999. Spice
Girls, TLC, Mariah Carey, Whitney Houston, Backstreet Boys, NSYNC, Boyz II
Men, Ace of Base, All-4-One, Hanson, Britney's late-90s breakout, Ricky
Martin, Shania Twain crossover hits. Singalong-on-the-radio energy.`,
      },
      {
        id: "indie-pop",
        name: "Indie Pop Gems",
        djId: DJ.MAYA,
        prompt: `Curate 30 indie-pop tracks that feel curated, not mainstream
top 40. Artists like Phoebe Bridgers, Clairo, Lorde, Mitski, Japanese
Breakfast, Carly Rae Jepsen, Tame Impala, MGMT, Vampire Weekend, beabadoobee,
Soccer Mommy, Snail Mail, boygenius. Hooky but with personality.`,
      },
    ],
  },

  rock: {
    name: "Rock",
    stations: [
      {
        id: "current",
        name: "Current Hits",
        djId: DJ.STELLA,
        prompt: `Curate 30 modern rock songs that are trending or charting on
today's Active / Alternative / Modern Rock radio. Think the biggest current
rock acts and breakout bands of the present moment.`,
      },
      {
        id: "2000s-10s",
        name: "2000s / 10s Anthems",
        djId: DJ.ZIGGY,
        prompt: `Curate 30 huge rock anthems from 2000 through 2019. Foo
Fighters, Linkin Park, Green Day, Killers, Kings of Leon, Arctic Monkeys,
Muse, Coldplay, Imagine Dragons, Twenty One Pilots, My Chemical Romance,
Fall Out Boy, Paramore, Red Hot Chili Peppers, Jack White. Big choruses,
sing-it-back energy.`,
      },
      {
        id: "80s-classics",
        name: "80s Classics",
        djId: DJ.RUSTY,
        prompt: `Curate 30 essential 80s rock songs. Van Halen, Guns N'
Roses, Bon Jovi, Def Leppard, AC/DC's 80s output, U2, The Police,
Journey, Aerosmith, Tom Petty, Bryan Adams, INXS, Heart, ZZ Top, Dire
Straits. Big hair, bigger hooks.`,
      },
      {
        id: "70s-legends",
        name: "70s Legends",
        djId: DJ.RUSTY,
        prompt: `Curate 30 essential 70s rock songs from the giants — Led
Zeppelin, Pink Floyd, The Rolling Stones, The Who, Queen, Fleetwood Mac,
Eagles, David Bowie, Lynyrd Skynyrd, Bruce Springsteen, Aerosmith, Boston,
Heart, Steve Miller Band, Black Sabbath, Deep Purple. Classic rock canon.`,
      },
      {
        id: "indie-gems",
        name: "Indie Rock Gems",
        djId: DJ.WREN,
        prompt: `Curate 30 indie rock tracks that feel curated and a bit
left-of-center. Arctic Monkeys deep cuts, The Strokes, Yeah Yeah Yeahs,
Modest Mouse, The National, Arcade Fire, Vampire Weekend, Tame Impala,
Mac DeMarco, Mitski, Phoebe Bridgers, Big Thief, Wet Leg, Fontaines DC,
Idles, Black Country New Road, boygenius.`,
      },
    ],
  },

  hiphop: {
    name: "Hip-Hop",
    stations: [
      {
        id: "current",
        name: "Current Hits",
        djId: DJ.CODA,
        prompt: `Curate 30 hip-hop songs that are charting or trending right
now. Biggest rappers of the present moment plus breakout artists — the kind
of tracks dominating rap radio, TikTok, and the Billboard Hot 100 this week.
Mix bangers and the occasional melodic standout.`,
      },
      {
        id: "90s-golden",
        name: "90s Golden Era",
        djId: DJ.LADY_LYRIC,
        prompt: `Curate 30 essential 90s hip-hop tracks from the golden era.
Nas, Notorious B.I.G., 2Pac, Wu-Tang Clan, A Tribe Called Quest, Dr. Dre,
Snoop Dogg, Mobb Deep, Gang Starr, Mos Def, OutKast, De La Soul, Pete Rock
& CL Smooth, Black Star, Lauryn Hill. Boom bap, sample-driven, lyrically dense.`,
      },
      {
        id: "2000s-bling",
        name: "2000s Bling Era",
        djId: DJ.TJ,
        prompt: `Curate 30 huge 2000s hip-hop singles from the bling/jiggy
era. 50 Cent, Jay-Z, Eminem, Nelly, Ludacris, Lil Wayne, T.I., Kanye West,
Ja Rule, Missy Elliott, Fabolous, Chingy, Chamillionaire, The Game, Mike
Jones. Big choruses, Neptunes/Timbaland beats, club-ready energy.`,
      },
      {
        id: "2010s-trap",
        name: "2010s Trap Wave",
        djId: DJ.DIEGO,
        prompt: `Curate 30 defining trap-era hip-hop tracks from 2012–2019.
Future, Migos, Travis Scott, 21 Savage, Lil Uzi Vert, Young Thug, Drake's
trap mode, Cardi B, Kodak Black, Gucci Mane, Lil Baby, Quavo, Playboi
Carti, A$AP Rocky. 808s, hi-hat rolls, autotuned melodic flows.`,
      },
      {
        id: "east-coast",
        name: "East Coast Boom Bap",
        djId: DJ.LADY_LYRIC,
        prompt: `Curate 30 East Coast hip-hop tracks rooted in the boom-bap
tradition. Nas, Jay-Z, Wu-Tang, Mobb Deep, Big Pun, Black Moon, KRS-One,
Rakim, EPMD, Slick Rick, Joey Bada$$, Griselda crew (Westside Gunn, Conway,
Benny). Gritty drums, jazz-loop samples, lyricism first.`,
      },
      {
        id: "west-coast",
        name: "West Coast & G-Funk",
        djId: DJ.CODA,
        prompt: `Curate 30 West Coast hip-hop classics with heavy G-funk and
modern LA representation. Dr. Dre, Snoop Dogg, 2Pac, Warren G, Ice Cube,
DJ Quik, The Game, Kendrick Lamar, YG, Dom Kennedy, Tyler the Creator,
Vince Staples. Synth whines, low-end bounce, palm-tree menace.`,
      },
      {
        id: "southern",
        name: "Southern Heat",
        djId: DJ.TJ,
        prompt: `Curate 30 Southern hip-hop staples from Atlanta, Houston,
Memphis, and New Orleans. OutKast, UGK, Three 6 Mafia, T.I., Lil Wayne,
Goodie Mob, Lil Jon, Project Pat, 2 Chainz, Gucci Mane, Big K.R.I.T.,
Master P, Juvenile, Future. Slow drawls, trunk-rattling 808s, regional pride.`,
      },
      {
        id: "female-mcs",
        name: "Female MCs",
        djId: DJ.LADY_LYRIC,
        prompt: `Curate 30 essential tracks from female rappers across eras.
MC Lyte, Queen Latifah, Lauryn Hill, Missy Elliott, Lil' Kim, Foxy Brown,
Eve, Nicki Minaj, Cardi B, Megan Thee Stallion, Doja Cat, Latto, Rapsody,
Little Simz, Tierra Whack, GloRilla. Bars-first showcase of the lineage.`,
      },
      {
        id: "conscious",
        name: "Conscious & Backpack",
        djId: DJ.KWAME,
        prompt: `Curate 30 conscious hip-hop and backpack-rap cuts that
prioritize lyricism and message. Common, Talib Kweli, Mos Def, The Roots,
J. Cole, Kendrick Lamar, Kanye's early albums, Lupe Fiasco, Saba, Joey
Bada$$, Run the Jewels, Noname, Rapsody, Little Brother. Heady, soulful,
storytelling-driven.`,
      },
    ],
  },

  rnb: {
    name: "R&B",
    stations: [
      {
        id: "current",
        name: "Current Hits",
        djId: DJ.DREY,
        prompt: `Curate 30 R&B songs charting or trending right now. SZA,
Summer Walker, Brent Faiyaz, Giveon, Bryson Tiller, Jhené Aiko, Daniel
Caesar, H.E.R., Victoria Monét, Coco Jones, Kehlani, Tems plus newer
breakouts. Modern moody R&B that's actually in heavy rotation today.`,
      },
      {
        id: "90s",
        name: "90s R&B",
        djId: DJ.LADY_LYRIC,
        prompt: `Curate 30 essential 90s R&B classics. Mariah Carey, Whitney
Houston, Boyz II Men, TLC, Brandy, Monica, Aaliyah, SWV, Jodeci, Mary J.
Blige, Toni Braxton, Erykah Badu, D'Angelo, Janet Jackson, R. Kelly's
ballads, Maxwell. Velvet vocals, swung tempos, slow-jam canon.`,
      },
      {
        id: "2000s",
        name: "2000s Smooth",
        djId: DJ.MARCUS,
        prompt: `Curate 30 defining 2000s R&B singles. Usher, Beyoncé,
Alicia Keys, John Legend, Ne-Yo, Chris Brown, Mario, Mary J. Blige's
2000s output, Ashanti, Ciara, Trey Songz, T-Pain, Keyshia Cole, Faith
Evans. Big radio R&B with Neptunes/Timbaland/Polow da Don production.`,
      },
      {
        id: "neo-soul",
        name: "Neo-Soul",
        djId: DJ.BEA,
        prompt: `Curate 30 neo-soul cuts that feel warm, live, and
band-driven. Erykah Badu, D'Angelo, Lauryn Hill, Jill Scott, Maxwell,
Musiq Soulchild, India.Arie, Bilal, Anthony Hamilton, Raphael Saadiq,
Anderson .Paak, Robert Glasper, Hiatus Kaiyote, Cleo Sol. Rhodes pianos,
real drums, vocals out front.`,
      },
      {
        id: "alternative",
        name: "Alternative R&B",
        djId: DJ.CODA,
        prompt: `Curate 30 alternative / PBR&B / experimental R&B tracks.
The Weeknd's mixtape era, Frank Ocean, Miguel, FKA twigs, Solange, Blood
Orange, Kelela, Sampha, James Blake, Banks, Jhené Aiko, Ravyn Lenae,
Steve Lacy, Ari Lennox, Snoh Aalegra. Atmospheric, moody, genre-bending.`,
      },
      {
        id: "motown",
        name: "Motown Classics",
        djId: DJ.MARCUS,
        prompt: `Curate 30 Motown and classic soul standards from the 60s
and 70s. Marvin Gaye, Stevie Wonder, The Temptations, The Supremes, Smokey
Robinson, The Four Tops, Aretha Franklin, Otis Redding, Sam Cooke, Al
Green, Diana Ross, Gladys Knight, Jackson 5. Foundational soul hits.`,
      },
      {
        id: "quiet-storm",
        name: "Quiet Storm",
        djId: DJ.BEA,
        prompt: `Curate 30 quiet-storm R&B slow jams — late-night,
candlelit, romantic. Luther Vandross, Sade, Anita Baker, Toni Braxton,
Babyface, Teddy Pendergrass, Keith Sweat, Freddie Jackson, Phyllis Hyman,
Atlantic Starr, After 7, Ralph Tresvant. Smooth grown-and-sexy energy.`,
      },
      {
        id: "new-jack-swing",
        name: "New Jack Swing",
        djId: DJ.LADY_LYRIC,
        prompt: `Curate 30 new jack swing tracks from the late 80s and early
90s. Bobby Brown, Bell Biv DeVoe, Guy, Keith Sweat, Johnny Gill, Heavy D &
the Boyz, Color Me Badd, Tony! Toni! Toné!, Karyn White, Pebbles, En
Vogue, SWV's debut. Teddy Riley's swing-beat sound, hip-hop drums under
R&B vocals.`,
      },
    ],
  },

  afrobeats: {
    name: "Afrobeats",
    stations: [
      {
        id: "current",
        name: "Current Hits",
        djId: DJ.KWAME,
        prompt: `Curate 30 Afrobeats songs trending right now across the
diaspora. Burna Boy, Wizkid, Davido, Rema, Tems, Asake, Ayra Starr, Ckay,
Joeboy, Omah Lay, Fireboy DML, Adekunle Gold, Tyla, Libianca. The current
heatwave moving Lagos, London, and Atlanta dance floors.`,
      },
      {
        id: "anthems",
        name: "Afrobeats Anthems",
        djId: DJ.LADY_LYRIC,
        prompt: `Curate 30 modern Afrobeats anthems — the certified
crossover hits from the 2010s and 2020s. "Essence", "Calm Down",
"Last Last", "Peru", "Ye", "Soco", "Joro", "Fall", "Love Nwantiti".
Wizkid, Davido, Burna Boy, P-Square, D'banj, Mr Eazi, plus crossover
remixes with Western pop stars. Crowd-pleasers.`,
      },
      {
        id: "amapiano",
        name: "Amapiano",
        djId: DJ.AURELIA,
        prompt: `Curate 30 Amapiano tracks driven by log-drum bass and jazzy
piano. Kabza De Small, DJ Maphorisa, Tyler ICU, Focalistic, Major League
DJz, Uncle Waffles, Tyla, Musa Keys, Daliwonga, Mr JazziQ, Felo Le
Tee, Young Stunna, Asake's amapiano-leaning singles. South African house
heat that's gone global.`,
      },
      {
        id: "roots",
        name: "Fela & Highlife Roots",
        djId: DJ.KWAME,
        prompt: `Curate 30 foundational Afrobeat and highlife tracks that
laid the groundwork for the modern sound. Fela Kuti, Tony Allen, Ebo
Taylor, King Sunny Adé, Femi Kuti, Manu Dibango, Hugh Masekela, Salif
Keita, Antibalas, Orchestre Poly-Rythmo. Long polyrhythmic grooves,
horn-driven, politically charged.`,
      },
      {
        id: "alte",
        name: "Alté Wave",
        djId: DJ.AURELIA,
        prompt: `Curate 30 alté and alternative Afrobeats tracks — the
artier, genre-blurring corner of the scene. Cruel Santino, Odunsi (The
Engine), Lady Donli, Tay Iwar, Tems' moodier cuts, Amaarae, Tomi Owó,
Wavy The Creator, Show Dem Camp, BOJ. R&B, indie, and electronic colors
swirled into Afro rhythms.`,
      },
      {
        id: "naija",
        name: "Naija Heat",
        djId: DJ.KWAME,
        prompt: `Curate 30 Nigerian Afrobeats and Afropop tracks — Lagos at
its sweatiest. Asake, Olamide, Naira Marley, Zlatan, Bella Shmurda, Rema,
Ruger, Pheelz, Ckay, Joeboy, Buju (BNXN), Crayon, Spinall. Street-pop
energy, gritty melodies, Yoruba flows.`,
      },
      {
        id: "diaspora",
        name: "UK & Diaspora",
        djId: DJ.LADY_LYRIC,
        prompt: `Curate 30 Afroswing and UK/diaspora Afro-fusion tracks. J
Hus, NSG, Tion Wayne, Not3s, Hardy Caprio, Yxng Bane, Kojo Funds, B Young,
WSTRN, Headie One's afro-leaning cuts, Mr Eazi's UK collabs, Stefflon
Don, Ms Banks. The London-side of the wave.`,
      },
    ],
  },

  indie: {
    name: "Indie",
    stations: [
      {
        id: "current",
        name: "Current Indie",
        djId: DJ.MAYA,
        prompt: `Curate 30 indie tracks getting major attention right now.
Wet Leg, Mitski, boygenius, Phoebe Bridgers, Big Thief, Black Country New
Road, Fontaines D.C., Geese, MJ Lenderman, Indigo De Souza, Wednesday,
Beach Bunny, Snail Mail, Soccer Mommy. Whatever's hot on Pitchfork and
indie radio this week.`,
      },
      {
        id: "2000s",
        name: "2000s Indie Boom",
        djId: DJ.STELLA,
        prompt: `Curate 30 essential 2000s indie tracks from the post-Strokes
boom. The Strokes, Yeah Yeah Yeahs, Interpol, Bloc Party, Modest Mouse,
The Shins, Death Cab for Cutie, Arcade Fire, Vampire Weekend, MGMT, LCD
Soundsystem, Animal Collective, The Killers' early work, Spoon, TV on the
Radio, Franz Ferdinand. Garage revival meets art-pop.`,
      },
      {
        id: "2010s",
        name: "2010s Indie Anthems",
        djId: DJ.WREN,
        prompt: `Curate 30 huge indie anthems from the 2010s. Tame Impala,
Mac DeMarco, Alvvays, Real Estate, Sufjan Stevens, The War on Drugs,
Father John Misty, Beach House, Mitski, Japanese Breakfast, Courtney
Barnett, Parquet Courts, Lucy Dacus, Frank Ocean's indie-adjacent work.
The decade's indie canon.`,
      },
      {
        id: "indie-folk",
        name: "Indie Folk",
        djId: DJ.SAOIRSE,
        prompt: `Curate 30 indie folk tracks — finger-picked, hushed, often
heartbreaking. Sufjan Stevens, Bon Iver, Fleet Foxes, Iron & Wine, Father
John Misty, Big Thief, Phoebe Bridgers, Adrianne Lenker, Andy Shauf, Andrew
Bird, José González, The Tallest Man on Earth, Angel Olsen. Acoustic
intimacy with literary lyrics.`,
      },
      {
        id: "dream-pop",
        name: "Dream Pop & Shoegaze",
        djId: DJ.MAYA,
        prompt: `Curate 30 dream-pop and shoegaze tracks — wash of guitars,
washed-out vocals. My Bloody Valentine, Slowdive, Cocteau Twins, Mazzy
Star, Beach House, DIIV, Wild Nothing, Cigarettes After Sex, Alvvays,
Hatchie, Tame Impala's hazy side, Lush, Ride, Galaxie 500. Reverb-drenched
bliss.`,
      },
      {
        id: "indie-sleaze",
        name: "Indie Sleaze",
        djId: DJ.ZIGGY,
        prompt: `Curate 30 tracks from the late-2000s/early-2010s indie
sleaze moment — flash photos, American Apparel, electroclash. LCD
Soundsystem, Justice, MGMT, M.I.A., Crystal Castles, Sleigh Bells, The
Rapture, Klaxons, Hot Chip, Yelle, Uffie, Peaches, Santigold, Vampire
Weekend's debut, Cobra Snake-era hits. Sweaty Brooklyn loft energy.`,
      },
      {
        id: "bedroom-pop",
        name: "Bedroom Pop",
        djId: DJ.SAOIRSE,
        prompt: `Curate 30 bedroom-pop and lo-fi indie tracks from the
GarageBand-and-SoundCloud era. Clairo, Rex Orange County, Cuco, beabadoobee,
Boy Pablo, Mac DeMarco, Mild High Club, Yellow Days, Gus Dapperton, Faye
Webster, Còrte, mxmtoon, Still Woozy. DIY warmth, tape hiss, soft melodies.`,
      },
    ],
  },

  electronic: {
    name: "Electronic",
    stations: [
      {
        id: "house",
        name: "House Classics",
        djId: DJ.TOMAS,
        prompt: `Curate 30 essential house tracks spanning Chicago/Detroit
roots, deep house, French house, and modern peak-time. Frankie Knuckles,
Larry Heard, Marshall Jefferson, Daft Punk, Disclosure, Duke Dumont,
Fisher, Honey Dijon, Black Coffee, Kerri Chandler, Jamie xx, Floorplan,
MK. Four-on-the-floor, soulful samples, hands-up energy.`,
      },
      {
        id: "techno",
        name: "Techno",
        djId: DJ.TOMAS,
        prompt: `Curate 30 techno tracks from Detroit originators through
modern Berlin warehouse. Jeff Mills, Carl Craig, Derrick May, Juan Atkins,
Richie Hawtin, Charlotte de Witte, Amelie Lens, Adam Beyer, Joseph Capriati,
Nina Kraviz, Tale of Us, ANNA, I Hate Models. Hypnotic, percussive,
relentless.`,
      },
      {
        id: "dnb",
        name: "Drum & Bass",
        djId: DJ.LIAM,
        prompt: `Curate 30 drum & bass tracks across liquid, neurofunk, and
jump-up flavors. Goldie, LTJ Bukem, Roni Size, Pendulum, Andy C, Sub Focus,
Chase & Status, High Contrast, Wilkinson, Netsky, Dimension, Hybrid Minds,
Sigma. 170 BPM breakbeats and rolling sub-bass.`,
      },
      {
        id: "dubstep",
        name: "Dubstep",
        djId: DJ.LIAM,
        prompt: `Curate 30 dubstep tracks ranging from the UK originators to
the US brostep peak. Burial, Skream, Benga, Mala, Coki, Joker, James Blake's
early work, Skrillex, Excision, Rusko, Bassnectar, Doctor P, Flux Pavilion,
Datsik. 140 BPM, half-time, wobble-bass drops.`,
      },
      {
        id: "trance",
        name: "Trance",
        djId: DJ.M_QUAKE,
        prompt: `Curate 30 trance anthems from the genre's golden era and
modern revival. Paul van Dyk, Tiësto's classic-trance era, Armin van
Buuren, Above & Beyond, ATB, Ferry Corsten, Markus Schulz, Gareth Emery,
ASOT-era big-room. Soaring leads, breakdowns, hands-in-the-air moments.`,
      },
      {
        id: "synthwave",
        name: "Synthwave",
        djId: DJ.RIO,
        prompt: `Curate 30 synthwave / retrowave / outrun tracks — neon 80s
nostalgia. Kavinsky, College, Carpenter Brut, Perturbator, Mitch Murder,
Lazerhawk, Com Truise, FM-84, The Midnight, Gunship, Power Glove, Miami
Nights 1984, Mega Drive. Cinematic synths, gated drums, Drive soundtrack
vibes.`,
      },
      {
        id: "ambient",
        name: "Ambient & IDM",
        djId: DJ.TOMAS,
        prompt: `Curate 30 ambient and intelligent-dance-music tracks for
deep listening. Brian Eno, Aphex Twin, Boards of Canada, Tycho, Bonobo,
Jon Hopkins, Four Tet, Caribou's ambient side, Nils Frahm, Stars of the
Lid, William Basinski, Oneohtrix Point Never, Helios. Atmospheric,
beat-light, headspace music.`,
      },
      {
        id: "french-touch",
        name: "French Touch",
        djId: DJ.RIO,
        prompt: `Curate 30 French-touch and filter-house classics. Daft
Punk, Justice, Cassius, Étienne de Crécy, Stardust, Modjo, Bob Sinclar's
early stuff, Alan Braxe, Fred Falke, Breakbot, SebastiAn, Mr. Oizo, Air.
Disco loops, filter sweeps, talk-box vocals, Parisian sleek.`,
      },
      {
        id: "future-bass",
        name: "Future Bass",
        djId: DJ.M_QUAKE,
        prompt: `Curate 30 future-bass and melodic-EDM tracks. Flume, ODESZA,
San Holo, Illenium, Marshmello, Louis the Child, Big Wild, Whethan, Petit
Biscuit, Jai Wolf, RL Grime, What So Not, Mura Masa, Cashmere Cat.
Pitched-up vocals, wobbly synth chords, festival-friendly drops.`,
      },
    ],
  },

  folk: {
    name: "Folk",
    stations: [
      {
        id: "60s-revival",
        name: "60s Folk Revival",
        djId: DJ.HENRI,
        prompt: `Curate 30 essential 60s folk-revival tracks. Bob Dylan,
Joan Baez, Simon & Garfunkel, Peter Paul & Mary, Phil Ochs, Pete Seeger,
Buffy Sainte-Marie, Joni Mitchell's early work, Donovan, The Mamas & The
Papas, Tim Buckley, Fred Neil, Judy Collins, Tom Paxton. Greenwich Village
coffeehouse era.`,
      },
      {
        id: "modern",
        name: "Modern Folk Revival",
        djId: DJ.SAOIRSE,
        prompt: `Curate 30 tracks from the 2010s/2020s folk revival.
Mumford & Sons, The Lumineers, Of Monsters and Men, Fleet Foxes, First Aid
Kit, Iron & Wine's recent work, The Head and the Heart, The Decemberists,
Ben Howard, Vance Joy, Noah Kahan, Tyler Childers, Zach Bryan. Banjos,
choruses meant for festival sing-alongs.`,
      },
      {
        id: "folk-rock",
        name: "Folk Rock",
        djId: DJ.RUSTY,
        prompt: `Curate 30 folk-rock classics where acoustic songwriting
meets electric backing. The Byrds, Crosby Stills Nash & Young, Neil Young,
Bob Dylan's electric albums, Fairport Convention, Joni Mitchell's
band-era work, Cat Stevens, Jackson Browne, Wilco, R.E.M., The Jayhawks,
Whiskeytown, Big Star. Jangle and harmonies.`,
      },
      {
        id: "singer-songwriter",
        name: "Singer-Songwriter",
        djId: DJ.HATTIE,
        prompt: `Curate 30 classic singer-songwriter tracks. James Taylor,
Carole King, Cat Stevens, Joni Mitchell, Carly Simon, Jackson Browne,
Jim Croce, Harry Chapin, Paul Simon's solo work, Leonard Cohen, Nick
Drake, John Prine, Townes Van Zandt, Joan Armatrading, Tracy Chapman.
Voice, guitar, story.`,
      },
      {
        id: "americana",
        name: "Americana",
        djId: DJ.HATTIE,
        prompt: `Curate 30 Americana tracks blending folk, country, rock,
and blues into roots music. Jason Isbell, Brandi Carlile, John Prine,
Lucinda Williams, Steve Earle, Drive-By Truckers, Gillian Welch, Ryan
Adams, Wilco, Sturgill Simpson, Kacey Musgraves' Americana side,
Hayes Carll, Justin Townes Earle, Lori McKenna. Plainspoken and rooted.`,
      },
      {
        id: "bluegrass",
        name: "Bluegrass",
        djId: DJ.RUSTY,
        prompt: `Curate 30 bluegrass tracks from the high-lonesome originators
through the modern progressive scene. Bill Monroe, Flatt & Scruggs, Stanley
Brothers, Alison Krauss & Union Station, Del McCoury Band, Béla Fleck,
Punch Brothers, Old Crow Medicine Show, Steep Canyon Rangers, Billy
Strings, Molly Tuttle, Sierra Hull. Fiddle, banjo, mandolin, tight
harmonies.`,
      },
      {
        id: "indie-folk",
        name: "Indie Folk",
        djId: DJ.SAOIRSE,
        prompt: `Curate 30 indie-folk tracks where folk meets indie-rock
sensibilities. Bon Iver, Sufjan Stevens, Fleet Foxes, Iron & Wine, Father
John Misty, Big Thief, Adrianne Lenker, Phoebe Bridgers, Andy Shauf,
The Tallest Man on Earth, José González, Andrew Bird, Damien Jurado, Kevin
Morby. Quiet, layered, often gorgeous.`,
      },
    ],
  },

  jazz: {
    name: "Jazz",
    stations: [
      {
        id: "bebop",
        name: "Bebop",
        djId: DJ.BEA,
        prompt: `Curate 30 essential bebop tracks. Charlie Parker, Dizzy
Gillespie, Bud Powell, Thelonious Monk, Max Roach, Fats Navarro, Dexter
Gordon's early work, Sonny Stitt, Sonny Rollins' bebop sides, Tadd Dameron,
Kenny Dorham, J.J. Johnson, Stan Getz. Lightning-fast heads, harmonic
sophistication, 52nd Street.`,
      },
      {
        id: "cool",
        name: "Cool Jazz",
        djId: DJ.NIGEL,
        prompt: `Curate 30 cool-jazz tracks from the West Coast and beyond.
Miles Davis' "Birth of the Cool", Chet Baker, Stan Getz, Gerry Mulligan,
Dave Brubeck, Paul Desmond, Lee Konitz, Lennie Tristano, Shorty Rogers,
Art Pepper, Modern Jazz Quartet, Bill Evans. Laid-back, subtle, restrained
elegance.`,
      },
      {
        id: "hard-bop",
        name: "Hard Bop",
        djId: DJ.HENRI,
        prompt: `Curate 30 hard-bop tracks — the bluesy, gospel-tinged
post-bop sound. Art Blakey & the Jazz Messengers, Horace Silver, Clifford
Brown, Lee Morgan, Cannonball Adderley, Wayne Shorter's Blue Note sides,
Hank Mobley, Jackie McLean, Donald Byrd, Freddie Hubbard, Joe Henderson,
Dexter Gordon. Soulful, swinging, Blue Note era.`,
      },
      {
        id: "modal",
        name: "Modal Jazz",
        djId: DJ.NIGEL,
        prompt: `Curate 30 modal-jazz tracks where chord changes give way to
extended modal vamps. Miles Davis' "Kind of Blue" and follow-ups, John
Coltrane's "A Love Supreme" era, McCoy Tyner, Bill Evans, Herbie Hancock's
modal work, Wayne Shorter, Pharoah Sanders, Alice Coltrane, Bobby Hutcherson,
Andrew Hill. Open spaces, hypnotic.`,
      },
      {
        id: "fusion",
        name: "Fusion",
        djId: DJ.BEA,
        prompt: `Curate 30 jazz-fusion tracks blending jazz with rock, funk,
and electronics. Miles Davis' electric period, Weather Report, Return to
Forever, Mahavishnu Orchestra, Herbie Hancock's Headhunters, Chick Corea,
Jeff Beck, Pat Metheny Group, Yellowjackets, Stanley Clarke, Jaco
Pastorius, Snarky Puppy. Virtuosic, plugged-in, often dazzling.`,
      },
      {
        id: "big-band",
        name: "Big Band & Swing",
        djId: DJ.STERLING,
        prompt: `Curate 30 big-band and swing-era tracks. Duke Ellington,
Count Basie, Benny Goodman, Glenn Miller, Tommy Dorsey, Artie Shaw, Cab
Calloway, Fletcher Henderson, Woody Herman, Stan Kenton, Buddy Rich, Quincy
Jones' big-band records, Maynard Ferguson. Brass sections at full
roar, dance-floor jazz.`,
      },
      {
        id: "vocal",
        name: "Vocal Jazz",
        djId: DJ.STERLING,
        prompt: `Curate 30 vocal-jazz classics from the great singers. Ella
Fitzgerald, Billie Holiday, Sarah Vaughan, Nina Simone, Frank Sinatra's jazz
sides, Nat King Cole, Carmen McRae, Anita O'Day, Dinah Washington, Mel
Tormé, Tony Bennett, Diana Krall, Cassandra Wilson, Kurt Elling. The
Great American Songbook in the right hands.`,
      },
      {
        id: "bossa-nova",
        name: "Bossa Nova & Brazilian",
        djId: DJ.NIGEL,
        prompt: `Curate 30 bossa-nova and Brazilian-jazz tracks. João
Gilberto, Antonio Carlos Jobim, Astrud Gilberto, Stan Getz & Gilberto,
Sergio Mendes, Vinicius de Moraes, Elis Regina, Caetano Veloso, Gilberto
Gil, Milton Nascimento, Hermeto Pascoal, Eliane Elias, Bebel Gilberto.
Whispered Portuguese, gentle guitar, samba pulse.`,
      },
      {
        id: "contemporary",
        name: "Contemporary Jazz",
        djId: DJ.BEA,
        prompt: `Curate 30 contemporary jazz tracks from the last two decades.
Kamasi Washington, Robert Glasper, Christian Scott, Esperanza Spalding,
Vijay Iyer, Brad Mehldau, Snarky Puppy, Thundercat, Shabaka Hutchings,
Sons of Kemet, Nubya Garcia, Ezra Collective, GoGo Penguin, BadBadNotGood.
Jazz alive and forward-looking right now.`,
      },
    ],
  },

  classical: {
    name: "Classical",
    stations: [
      {
        id: "baroque",
        name: "Baroque Masters",
        djId: DJ.NIGEL,
        prompt: `Curate 30 baroque-era pieces or representative movements.
J.S. Bach (Brandenburgs, cello suites, well-tempered clavier), Handel
(Messiah, Water Music), Vivaldi (Four Seasons), Telemann, Corelli,
Pachelbel, Purcell, Scarlatti, Couperin, Rameau, Albinoni, Buxtehude.
Counterpoint, harpsichord, ornamentation.`,
      },
      {
        id: "classical-era",
        name: "Classical Era",
        djId: DJ.ARIA,
        prompt: `Curate 30 pieces (or movements) from the Classical era —
Haydn, Mozart, early Beethoven, plus Boccherini, Salieri, C.P.E. Bach,
Clementi, Hummel. Symphonies, string quartets, sonatas, concertos.
Balance, clarity, Viennese elegance.`,
      },
      {
        id: "romantic",
        name: "Romantic Era",
        djId: DJ.ARIA,
        prompt: `Curate 30 Romantic-era pieces or movements. Beethoven's
middle/late period, Schubert, Schumann, Chopin, Liszt, Brahms, Mendelssohn,
Tchaikovsky, Dvořák, Wagner, Mahler, Rachmaninoff, Bruckner, Verdi.
Sweeping emotion, expanded forms, expressive depth.`,
      },
      {
        id: "impressionist",
        name: "Impressionist",
        djId: DJ.NIGEL,
        prompt: `Curate 30 impressionist and post-impressionist pieces.
Debussy, Ravel, Satie, Fauré, Dukas, Delius, Respighi, Vaughan Williams'
pastoral work, early Stravinsky, Scriabin, Falla, Albéniz. Whole-tone
scales, watercolor harmonies, atmospheric.`,
      },
      {
        id: "20th-century",
        name: "20th-Century Modern",
        djId: DJ.ARIA,
        prompt: `Curate 30 20th-century modernist pieces. Stravinsky's
"Rite of Spring", Bartók, Shostakovich, Prokofiev, Schoenberg, Berg, Webern,
Britten, Ives, Copland, Messiaen, Ligeti, Penderecki, Berio. Dissonance,
new techniques, the century reshaping itself.`,
      },
      {
        id: "minimalism",
        name: "Minimalism",
        djId: DJ.NIGEL,
        prompt: `Curate 30 minimalist and post-minimalist works. Steve Reich,
Philip Glass, Terry Riley, La Monte Young, John Adams, Michael Nyman, Arvo
Pärt, Henryk Górecki, Max Richter, Nils Frahm, Ólafur Arnalds, Nico
Muhly, Bryce Dessner. Repetition, slow harmonic motion, hypnotic.`,
      },
      {
        id: "neoclassical",
        name: "Neoclassical & Cinematic",
        djId: DJ.THEO,
        prompt: `Curate 30 modern neoclassical and cinematic-classical
tracks. Max Richter, Ludovico Einaudi, Ólafur Arnalds, Nils Frahm, Joep
Beving, Hania Rani, Dustin O'Halloran, Jóhann Jóhannsson, Hildur
Guðnadóttir, Peter Broderick, Goldmund, Poppy Ackroyd. Piano + strings,
emotionally direct.`,
      },
      {
        id: "opera",
        name: "Opera Arias",
        djId: DJ.ARIA,
        prompt: `Curate 30 great opera arias and ensemble moments. Mozart
(Don Giovanni, Magic Flute, Figaro), Verdi (La Traviata, Aida, Otello),
Puccini (La Bohème, Tosca, Turandot, Madama Butterfly), Wagner (Tristan,
Ring), Bizet (Carmen), Rossini (Barber of Seville), Donizetti, Handel
operas, modern Britten. Showstoppers and famous arias.`,
      },
      {
        id: "piano-solo",
        name: "Piano Solo",
        djId: DJ.NIGEL,
        prompt: `Curate 30 solo-piano pieces across eras. Bach
preludes/inventions, Mozart sonatas, Beethoven sonatas, Chopin nocturnes
and études, Schumann, Liszt, Debussy preludes, Satie's Gymnopédies, Ravel,
Rachmaninoff, Scriabin, Glass etudes, Einaudi, Hania Rani. The instrument
alone, intimate.`,
      },
    ],
  },

  stagescreen: {
    name: "Stage & Screen",
    stations: [
      {
        id: "broadway-classics",
        name: "Broadway Golden Age",
        djId: DJ.THEO,
        prompt: `Curate 30 showstoppers from Broadway's golden age. Rodgers
& Hammerstein (Oklahoma!, South Pacific, The King and I, The Sound of
Music), Lerner & Loewe (My Fair Lady, Camelot), Cole Porter, Irving
Berlin, West Side Story, Gypsy, Fiddler on the Roof, Funny Girl, Hello
Dolly!, A Chorus Line. Big orchestrations, eleven-o'clock numbers.`,
      },
      {
        id: "modern-broadway",
        name: "Modern Broadway",
        djId: DJ.THEO,
        prompt: `Curate 30 standout tracks from contemporary Broadway.
Hamilton, In the Heights, Dear Evan Hansen, Wicked, Hadestown, The Book of
Mormon, Six, Waitress, Come From Away, A Strange Loop, Spring Awakening,
Next to Normal, Fun Home, Be More Chill, & Juliet. Modern musical
theatre's biggest moments.`,
      },
      {
        id: "disney",
        name: "Disney Animated",
        djId: DJ.THEO,
        prompt: `Curate 30 iconic songs from Disney animated films. The
Little Mermaid, Beauty and the Beast, Aladdin, The Lion King, Pocahontas,
Mulan, Tarzan, Hercules, Tangled, Frozen, Moana, Encanto, Coco, Toy Story,
Princess and the Frog. Alan Menken/Howard Ashman/Tim Rice/Lin-Manuel
Miranda showcase.`,
      },
      {
        id: "movie-musicals",
        name: "Movie Musicals",
        djId: DJ.STERLING,
        prompt: `Curate 30 standout numbers from movie musicals. La La Land,
The Greatest Showman, Chicago, Moulin Rouge!, Mamma Mia!, Grease, Singin'
in the Rain, West Side Story (both versions), Cabaret, Sound of Music,
Hairspray, Dreamgirls, Sweeney Todd, Les Misérables. Cinema-scale
production numbers.`,
      },
      {
        id: "epic-scores",
        name: "Epic Film Scores",
        djId: DJ.NIGEL,
        prompt: `Curate 30 sweeping orchestral film cues. John Williams (Star
Wars, Indiana Jones, Harry Potter, Jurassic Park), Hans Zimmer (Inception,
Dune, Interstellar, Dark Knight, Gladiator), Howard Shore (Lord of the
Rings), James Horner (Titanic, Braveheart), Ennio Morricone, Jerry
Goldsmith, John Barry, Alan Silvestri. Massive, cinematic.`,
      },
      {
        id: "indie-scores",
        name: "Indie Film Scores",
        djId: DJ.NIGEL,
        prompt: `Curate 30 quieter, more idiosyncratic film-score cues. Jonny
Greenwood, Mica Levi, Jóhann Jóhannsson, Hildur Guðnadóttir, Nicholas
Britell, Mac Quayle, Cliff Martinez, Trent Reznor & Atticus Ross, Daniel
Pemberton's quieter cuts, Carter Burwell, Alexandre Desplat, Nathan
Johnson. Mood-driven, often electronic-tinged.`,
      },
      {
        id: "game-osts",
        name: "Video Game Soundtracks",
        djId: DJ.ARIA,
        prompt: `Curate 30 standout video-game soundtrack cues. Nobuo
Uematsu (Final Fantasy), Koji Kondo (Mario, Zelda), Yasunori Mitsuda
(Chrono Trigger), Jeremy Soule (Skyrim), Gustavo Santaolalla (The Last of
Us), Mick Gordon (Doom), Austin Wintory (Journey), Toby Fox (Undertale),
Lena Raine (Celeste), Disasterpeace, Darren Korb (Hades). Memorable
themes.`,
      },
      {
        id: "west-end",
        name: "West End",
        djId: DJ.NIGEL,
        prompt: `Curate 30 numbers from London's West End and broader British
musical theatre. Andrew Lloyd Webber (Phantom of the Opera, Cats, Evita,
Jesus Christ Superstar, Joseph), Les Misérables, Matilda, Billy Elliot,
Mary Poppins, Oliver!, Half a Sixpence, Blood Brothers, The Lion King
West End, Six, Operation Mincemeat. British theatre showcase.`,
      },
    ],
  },

  country: {
    name: "Country",
    stations: [
      {
        id: "current",
        name: "Current Country",
        djId: DJ.HATTIE,
        prompt: `Curate 30 country songs trending on country radio right
now. Morgan Wallen, Luke Combs, Zach Bryan, Cody Johnson, Bailey Zimmerman,
Jelly Roll, Lainey Wilson, Chris Stapleton, Tyler Childers' crossover hits,
Megan Moroney, Warren Zeiders, Riley Green, HARDY. Today's mainstream
country.`,
      },
      {
        id: "90s",
        name: "90s Country",
        djId: DJ.RUSTY,
        prompt: `Curate 30 essential 90s country hits. Garth Brooks, George
Strait, Alan Jackson, Brooks & Dunn, Tim McGraw, Faith Hill, Shania Twain,
Reba McEntire, Vince Gill, Trisha Yearwood, Patty Loveless, Travis Tritt,
Clint Black, Dixie Chicks. Honky-tonk meets stadium country.`,
      },
      {
        id: "2000s",
        name: "2000s Country",
        djId: DJ.HATTIE,
        prompt: `Curate 30 huge 2000s country radio singles. Kenny Chesney,
Toby Keith, Brad Paisley, Carrie Underwood, Taylor Swift's country era,
Rascal Flatts, Lady Antebellum, Dierks Bentley, Sugarland, Jason Aldean,
Miranda Lambert, Keith Urban, Big & Rich, Trace Adkins, Tim McGraw. Heart of
modern country.`,
      },
      {
        id: "outlaw",
        name: "Outlaw Country",
        djId: DJ.RUSTY,
        prompt: `Curate 30 outlaw-country tracks. Willie Nelson, Waylon
Jennings, Johnny Cash's American Recordings era, Kris Kristofferson,
Merle Haggard, Hank Williams Jr., David Allan Coe, Billy Joe Shaver,
Jamey Johnson, Sturgill Simpson, Colter Wall, Tyler Childers, Cody Jinks.
Anti-Nashville, gritty, telecasters and conviction.`,
      },
      {
        id: "classic",
        name: "Classic Country",
        djId: DJ.HATTIE,
        prompt: `Curate 30 classic-country foundational tracks. Hank
Williams Sr., Patsy Cline, Johnny Cash, Loretta Lynn, Tammy Wynette, George
Jones, Merle Haggard, Buck Owens, Conway Twitty, Dolly Parton, Charley
Pride, Marty Robbins, Roger Miller, Bobbie Gentry, Glen Campbell. The
canon — heartbreak, trains, and barrooms.`,
      },
      {
        id: "bluegrass",
        name: "Bluegrass",
        djId: DJ.RUSTY,
        prompt: `Curate 30 bluegrass tracks from the originators through the
progressive scene. Bill Monroe, Flatt & Scruggs, Stanley Brothers, Doc
Watson, Alison Krauss, Del McCoury Band, Ricky Skaggs, Béla Fleck, Punch
Brothers, Old Crow Medicine Show, Billy Strings, Molly Tuttle, Steep
Canyon Rangers. Fast-picking, tight harmonies.`,
      },
      {
        id: "americana",
        name: "Americana & Alt-Country",
        djId: DJ.HATTIE,
        prompt: `Curate 30 Americana and alt-country tracks. Jason Isbell,
Brandi Carlile, Wilco, Whiskeytown, Uncle Tupelo, Drive-By Truckers,
Steve Earle, Lucinda Williams, Gillian Welch, John Prine, Lyle Lovett,
Emmylou Harris, Kacey Musgraves' alt cuts, Sturgill Simpson. Country
that lives outside the country-radio lane.`,
      },
    ],
  },

  gospel: {
    name: "Gospel",
    stations: [
      {
        id: "contemporary",
        name: "Contemporary Gospel",
        djId: DJ.MARCUS,
        prompt: `Curate 30 contemporary gospel hits. Kirk Franklin, Mary
Mary, Tasha Cobbs Leonard, Travis Greene, Maverick City Music, Tye
Tribbett, Marvin Sapp, Israel Houghton, Donnie McClurkin, Hezekiah Walker,
Jonathan McReynolds, CeCe Winans' modern work. Praise & worship with
R&B/hip-hop polish.`,
      },
      {
        id: "traditional",
        name: "Traditional Gospel",
        djId: DJ.MARCUS,
        prompt: `Curate 30 traditional gospel classics. Mahalia Jackson,
Mavis Staples, The Staple Singers, Aretha Franklin's gospel records,
Andraé Crouch, Shirley Caesar, James Cleveland, The Clark Sisters, The
Mighty Clouds of Joy, Dixie Hummingbirds, Soul Stirrers, Albertina
Walker. The Hammond organ, the choir, the Sunday morning anchor.`,
      },
      {
        id: "choir",
        name: "Mass Choirs",
        djId: DJ.LADY_LYRIC,
        prompt: `Curate 30 mass-choir tracks. Brooklyn Tabernacle Choir,
Mississippi Mass Choir, Hezekiah Walker & Love Fellowship Choir,
Georgia Mass Choir, Hampton University Choir, Edwin Hawkins Singers,
Florida Mass Choir, Thompson Community Singers, Mighty Clouds of Joy
choir cuts, Walt Whitman & The Soul Children. Wall-of-voices uplift.`,
      },
      {
        id: "modern-worship",
        name: "Modern Worship",
        djId: DJ.MARCUS,
        prompt: `Curate 30 modern worship tracks. Hillsong United, Hillsong
Worship, Bethel Music, Elevation Worship, Maverick City, Passion, Chris
Tomlin, Matt Redman, Brandon Lake, Phil Wickham, CeCe Winans crossover,
Cory Asbury, Jeremy Riddle, Kari Jobe. Anthemic, congregational, designed
for arenas.`,
      },
      {
        id: "ccm",
        name: "Contemporary Christian",
        djId: DJ.LADY_LYRIC,
        prompt: `Curate 30 contemporary Christian music tracks (CCM).
Lauren Daigle, MercyMe, Casting Crowns, TobyMac, Lecrae, for King &
Country, Newsboys, Hillsong United crossover hits, Switchfoot, Skillet,
Jeremy Camp, Third Day, Steven Curtis Chapman, NEEDTOBREATHE. Christian
pop/rock radio.`,
      },
      {
        id: "southern",
        name: "Southern Gospel",
        djId: DJ.MARCUS,
        prompt: `Curate 30 Southern gospel quartets and trios. The Cathedrals,
Gaither Vocal Band, The Statler Brothers gospel side, The Oak Ridge Boys
gospel records, Ernie Haase & Signature Sound, Greater Vision, The
Inspirations, Triumphant Quartet, Booth Brothers, Hoppers, Florida Boys.
Tight harmony singing, conservative tradition, glory-bound.`,
      },
      {
        id: "spirituals",
        name: "Spirituals & Hymns",
        djId: DJ.MARCUS,
        prompt: `Curate 30 spirituals and classic hymns in beloved
recordings. Mahalia Jackson, Marian Anderson, Paul Robeson, Jessye Norman,
Kathleen Battle, Sweet Honey in the Rock, Wynton Marsalis hymn arrangements,
Fisk Jubilee Singers, Aretha Franklin's hymn moments, "Amazing Grace",
"Wade in the Water", "Go Down Moses". Roots and reverence.`,
      },
    ],
  },

  latin: {
    name: "Latin",
    stations: [
      {
        id: "reggaeton",
        name: "Reggaetón",
        djId: DJ.DIEGO,
        prompt: `Curate 30 reggaetón tracks across the genre's eras. Daddy
Yankee, Don Omar, Wisin & Yandel, Tego Calderón, Bad Bunny, J Balvin,
Ozuna, Anuel AA, Karol G, Maluma, Nicky Jam, Farruko, Rauw Alejandro,
Tainy productions, Feid, Myke Towers, Rosalía's reggaetón cuts.
Dembow rhythm, perreo energy.`,
      },
      {
        id: "latin-pop",
        name: "Latin Pop",
        djId: DJ.RIO,
        prompt: `Curate 30 Latin pop hits. Shakira, Enrique Iglesias, Marc
Anthony's pop side, Ricky Martin, Luis Miguel, Thalía, Chayanne, Jesse &
Joy, Camila, Reik, Sebastián Yatra, Camilo, Manuel Turizo, Carlos Rivera,
Christian Nodal's pop crossovers. Big-melody, ballad-and-bop pan-Latin
radio.`,
      },
      {
        id: "salsa",
        name: "Salsa",
        djId: DJ.DIEGO,
        prompt: `Curate 30 salsa classics and modern essentials. Héctor
Lavoe, Willie Colón, Rubén Blades, Celia Cruz, Tito Puente, Marc Anthony,
Eddie Palmieri, Fania All-Stars, El Gran Combo, Oscar D'León, Frankie
Ruiz, La India, Gilberto Santa Rosa, Víctor Manuelle, Grupo Niche. Brass
sections, montunos, dance-floor heat.`,
      },
      {
        id: "bachata",
        name: "Bachata",
        djId: DJ.M_QUAKE,
        prompt: `Curate 30 bachata tracks from Dominican originators through
the modern romantic-bachata wave. Juan Luis Guerra, Antony Santos, Luis
Vargas, Aventura, Romeo Santos, Prince Royce, Toby Love, Monchy & Alexandra,
Frank Reyes, Joe Veras, Zacarías Ferreira. Lilting guitar pulse,
heartbreak as a craft.`,
      },
      {
        id: "cumbia",
        name: "Cumbia",
        djId: DJ.DIEGO,
        prompt: `Curate 30 cumbia tracks from Colombian roots through
Mexican, Argentine, and digital variants. Lucho Bermúdez, Toto la
Momposina, Aniceto Molina, Los Ángeles Azules, Selena's cumbia hits,
Grupo Bryndis, Sonora Dinamita, Bomba Estéreo, Nicola Cruz, ZZK Records
crew, Bareto. Two-step pulse, accordion or synth glow.`,
      },
      {
        id: "regional",
        name: "Regional Mexican",
        djId: DJ.DIEGO,
        prompt: `Curate 30 regional Mexican tracks across mariachi, banda,
norteño, and corridos tumbados. Vicente Fernández, Pepe Aguilar,
Marco Antonio Solís, Banda MS, Grupo Firme, Calibre 50, Christian Nodal,
Carin León, Peso Pluma, Junior H, Natanael Cano, Eslabón Armado, Fuerza
Regida, Ángela Aguilar. The full regional spectrum.`,
      },
      {
        id: "rock-en-espanol",
        name: "Rock en Español",
        djId: DJ.RIO,
        prompt: `Curate 30 rock-en-español classics and modern essentials.
Soda Stereo, Caifanes, Maná, Café Tacvba, Heroes del Silencio, Los
Fabulosos Cadillacs, Molotov, Enanitos Verdes, Hombres G, Jaguares,
Zoé, Babasónicos, Andrés Calamaro, Fito Páez, Gustavo Cerati solo. Indie
to arena rock, all in Spanish.`,
      },
      {
        id: "trap-latino",
        name: "Latin Trap",
        djId: DJ.RIO,
        prompt: `Curate 30 Latin-trap tracks. Bad Bunny's trap-era cuts,
Anuel AA, Bryant Myers, Almighty, Arcángel, De La Ghetto, Ñengo Flow,
Lyanno, Cazzu, Duki, Trueno, Bizarrap sessions, Eladio Carrión, Rauw
Alejandro's trap side, Myke Towers. 808s and Spanish flows, the SoundCloud
generation's Latin wing.`,
      },
      {
        id: "bolero",
        name: "Bolero & Standards",
        djId: DJ.DIEGO,
        prompt: `Curate 30 bolero and Latin-standard recordings. Trio Los
Panchos, Pedro Infante, Javier Solís, José José, Luis Miguel's "Romance"
albums, Vicente Fernández boleros, Eydie Gormé, Armando Manzanero, Lucho
Gatica, Olga Guillot, Toña la Negra, Omara Portuondo. Velvet-voiced,
candlelit Latin classics.`,
      },
    ],
  },

  reggae: {
    name: "Reggae",
    stations: [
      {
        id: "roots",
        name: "Roots Reggae",
        djId: DJ.AURELIA,
        prompt: `Curate 30 roots-reggae essentials. Bob Marley & The Wailers,
Peter Tosh, Bunny Wailer, Burning Spear, Toots & the Maytals, Jimmy Cliff,
Culture, The Abyssinians, Black Uhuru, Gregory Isaacs, Dennis Brown,
Steel Pulse, Israel Vibration, Third World, Lee "Scratch" Perry productions.
Skanking pulse, conscious lyrics.`,
      },
      {
        id: "dancehall",
        name: "Dancehall",
        djId: DJ.AURELIA,
        prompt: `Curate 30 dancehall tracks from the 80s through today.
Yellowman, Shabba Ranks, Buju Banton, Beenie Man, Bounty Killer, Sean
Paul, Vybz Kartel, Mavado, Popcaan, Konshens, Spice, Shenseea, Skillibeng,
Masicka, Charly Black. Riddim-driven, deejay vocals, party rhythm.`,
      },
      {
        id: "ska",
        name: "Ska Originators",
        djId: DJ.M_QUAKE,
        prompt: `Curate 30 first-wave Jamaican ska and rocksteady tracks.
The Skatalites, Prince Buster, Desmond Dekker, Toots & the Maytals' ska
era, The Wailers' ska period, Justin Hinds, Stranger Cole, Alton Ellis,
The Upsetters, Don Drummond, Roland Alphonso, The Slickers, Laurel
Aitken. Off-beat horns, walking bass, dance-floor jump.`,
      },
      {
        id: "two-tone",
        name: "2 Tone & Ska Revival",
        djId: DJ.M_QUAKE,
        prompt: `Curate 30 2 Tone and later ska-revival tracks. The
Specials, Madness, The Selecter, The Beat, Bad Manners, Fishbone,
Operation Ivy, Rancid, Mighty Mighty Bosstones, Reel Big Fish, Sublime,
No Doubt's ska songs, Streetlight Manifesto, Less Than Jake. UK 2 Tone
and US third-wave together.`,
      },
      {
        id: "lovers-rock",
        name: "Lovers Rock",
        djId: DJ.AURELIA,
        prompt: `Curate 30 lovers-rock tracks — reggae's sweet, romantic
strain. Janet Kay, Carroll Thompson, Louisa Mark, Sandra Cross, Maxi
Priest, Beres Hammond, Sanchez, Wayne Wonder, Tarrus Riley, Etana,
Romain Virgo, Christopher Martin, Glenn Washington, Freddie McGregor.
Slow skank, harmony vocals, slow-dance reggae.`,
      },
      {
        id: "dub",
        name: "Dub",
        djId: DJ.AURELIA,
        prompt: `Curate 30 dub tracks. King Tubby, Lee "Scratch" Perry, Augustus
Pablo, Scientist, Mad Professor, Adrian Sherwood, Sly & Robbie, Prince
Jammy, Linton Kwesi Johnson's dub poetry, Burning Spear dub, African Head
Charge, Twilight Circus, Dub Syndicate. Echo, reverb, bass-as-a-feeling.`,
      },
      {
        id: "modern-roots",
        name: "Modern Roots Revival",
        djId: DJ.AURELIA,
        prompt: `Curate 30 modern roots-reggae and reggae-revival tracks.
Damian Marley, Stephen Marley, Ziggy Marley, Chronixx, Protoje, Kabaka
Pyramid, Jah9, Koffee, Lila Iké, Iotosh, Lutan Fyah, Tarrus Riley's
roots cuts, Dre Island, Naâman, SOJA. Roots music updated for the
streaming era.`,
      },
    ],
  },

  kpop: {
    name: "K-Pop",
    stations: [
      {
        id: "current",
        name: "Current K-Pop",
        djId: DJ.JADE,
        prompt: `Curate 30 K-pop tracks charting right now. NewJeans, IVE,
LE SSERAFIM, aespa, ITZY, (G)I-DLE, ENHYPEN, TXT, Stray Kids, Seventeen's
recent comebacks, ATEEZ, NCT, plus solo work from BLACKPINK members, BTS
solo cuts, and breakout new groups. The latest comebacks.`,
      },
      {
        id: "4th-gen",
        name: "4th Gen",
        djId: DJ.JADE,
        prompt: `Curate 30 4th-generation K-pop tracks (~2018–2024). aespa,
ITZY, IVE, LE SSERAFIM, NewJeans, (G)I-DLE, Kep1er, NMIXX, fromis_9,
Stray Kids, TXT, ENHYPEN, ATEEZ, TREASURE, ZEROBASEONE, RIIZE. Concept
twists, hyperpop touches, social-media-native era.`,
      },
      {
        id: "3rd-gen",
        name: "3rd Gen Classics",
        djId: DJ.JADE,
        prompt: `Curate 30 3rd-generation K-pop hits (~2012–2018). BTS,
EXO, TWICE, BLACKPINK, Red Velvet, SEVENTEEN, GFRIEND, MAMAMOO, GOT7,
NCT 127, MONSTA X, BTOB, Lovelyz, OH MY GIRL, WJSN, iKON. The Hallyu-Wave
explosion years.`,
      },
      {
        id: "2nd-gen",
        name: "2nd Gen Legends",
        djId: DJ.JADE,
        prompt: `Curate 30 2nd-generation K-pop classics (~2005–2012). Girls'
Generation/SNSD, SHINee, Super Junior, TVXQ, Big Bang, 2NE1, KARA, Wonder
Girls, BEAST/HIGHLIGHT, MBLAQ, INFINITE, 2PM, T-ara, f(x), Sistar, Miss
A, Brown Eyed Girls. The era that built modern K-pop.`,
      },
      {
        id: "ballads",
        name: "K-Pop Ballads",
        djId: DJ.YUKI,
        prompt: `Curate 30 K-pop ballads — the big tearjerkers. Taeyeon
ballads, Baekhyun's solo work, Park Hyo-shin, IU's ballads, Sung Si-kyung,
Lee Hi, Heize, Suzy, Ailee, K. Will, Davichi, Akdong Musician's quieter
cuts, Crush. Piano + strings + a vocalist destroying the listener.`,
      },
      {
        id: "k-rnb",
        name: "K-Hip-Hop & R&B",
        djId: DJ.JADE,
        prompt: `Curate 30 Korean hip-hop and R&B tracks. Epik High, Zico,
Dean, Crush, Jay Park, Beenzino, GRAY, Loco, pH-1, BewhY, Changmo,
Heize, Sik-K, Tablo solo cuts, AOMG roster, H1GHR MUSIC roster. The
non-idol side of Korean music.`,
      },
      {
        id: "k-indie",
        name: "K-Indie",
        djId: DJ.YUKI,
        prompt: `Curate 30 K-indie tracks from outside the major-label idol
system. Hyukoh, Adoy, Se So Neon, Silica Gel, Surl, Wave to Earth, Lucid
Fall, Standing Egg, Day6's indie-rock cuts, Sunwoojunga, Yerin Baek,
Colde, Sondia, Jannabi. Cozy, guitar-led, more "song" than "concept".`,
      },
      {
        id: "k-drama",
        name: "K-Drama OSTs",
        djId: DJ.YUKI,
        prompt: `Curate 30 K-drama OST tracks — the ballads and themes that
play under the gut-punch scenes. Heize, Punch, Davichi, Gummy, Sung Si-kyung,
Baek Yerin, Crush, Paul Kim, IU's drama features, Lee Hi, Yongzoo, Kim
Bum-soo, Lyn, Younha. Sweeping, lush, drama-emotional.`,
      },
    ],
  },

  anime: {
    name: "Anime",
    stations: [
      {
        id: "openings",
        name: "Anime Openings",
        djId: DJ.YUKI,
        prompt: `Curate 30 iconic anime opening themes. Naruto, One Piece,
Bleach, Attack on Titan, Demon Slayer, Jujutsu Kaisen, My Hero Academia,
Death Note, Cowboy Bebop, Fullmetal Alchemist, Chainsaw Man, Spy x Family,
Tokyo Ghoul, Code Geass, Neon Genesis Evangelion. The 90-second
adrenaline shots.`,
      },
      {
        id: "ghibli",
        name: "Studio Ghibli",
        djId: DJ.YUKI,
        prompt: `Curate 30 Studio Ghibli soundtrack cues, almost all by Joe
Hisaishi. Spirited Away, My Neighbor Totoro, Princess Mononoke, Howl's
Moving Castle, Castle in the Sky, Kiki's Delivery Service, Ponyo, The
Wind Rises, Porco Rosso, Nausicaä. Pastoral, melodic, often gentle
chamber-pop classical.`,
      },
      {
        id: "shonen",
        name: "Shonen Battle Themes",
        djId: DJ.YUKI,
        prompt: `Curate 30 high-energy battle/shonen anime themes. Naruto's
"Sadness and Sorrow"/battle themes, Dragon Ball Z fight cues, Attack on
Titan's Hiroyuki Sawano scores ("YouSeeBIGGIRL/T:T", "Vogel im Käfig"),
Demon Slayer fight themes, Bleach battle cues, JoJo's Bizarre Adventure,
My Hero Academia. Hype incarnate.`,
      },
      {
        id: "j-rock",
        name: "J-Rock & Anime Rock",
        djId: DJ.YUKI,
        prompt: `Curate 30 J-rock and rock-flavored anime tracks. ONE OK
ROCK, Asian Kung-Fu Generation, Radwimps, Bump of Chicken, UVERworld,
FLOW, MAN WITH A MISSION, Mrs. GREEN APPLE, Vickeblanka, SiM, KANA-BOON,
SPYAIR, Survive Said the Prophet, Mob Choir. Tight Japanese rock with
huge choruses.`,
      },
      {
        id: "anisong-classics",
        name: "Anisong Classics",
        djId: DJ.YUKI,
        prompt: `Curate 30 anisong classics from the 90s and 2000s. Yoko
Kanno (Cowboy Bebop, Macross Plus), Yoko Takahashi ("A Cruel Angel's
Thesis"), L'Arc-en-Ciel, Porno Graffitti, Kotoko, Round Table feat.
Nino, See-Saw, Olivia, JAM Project, Ali Project, FictionJunction, Yui,
Younha. Pre-streaming anime-music canon.`,
      },
      {
        id: "sad-anime",
        name: "Sad Anime",
        djId: DJ.YUKI,
        prompt: `Curate 30 sad/melancholic anime tracks. Clannad/Air/Kanon
piano themes, "Dango Daikazoku", Anohana's "Secret Base", Your Lie in
April scoring, Violet Evergarden score, Erased themes, A Silent Voice,
March Comes in Like a Lion, Steins;Gate emotional cues. Tear-trigger
specialists.`,
      },
      {
        id: "j-pop-anime",
        name: "Modern Anisong",
        djId: DJ.YUKI,
        prompt: `Curate 30 modern J-pop and anisong tracks defining current
anime music. YOASOBI, Aimer, LiSA, Eve, Yorushika, Ado, Kenshi Yonezu,
Vaundy, Tatsuya Kitani, Mrs. GREEN APPLE's anime cuts, Reol, Zutomayo,
RADWIMPS' Shinkai collabs, Tani Yuuki. The streaming era's anime stars.`,
      },
      {
        id: "game-osts",
        name: "JRPG / Game OSTs",
        djId: DJ.YUKI,
        prompt: `Curate 30 JRPG and Japanese-game OST cues. Nobuo Uematsu
(Final Fantasy), Yasunori Mitsuda (Chrono Trigger/Cross, Xenogears),
Yoko Shimomura (Kingdom Hearts), Yuzo Koshiro (Streets of Rage), Motoi
Sakuraba (Tales/Star Ocean), Persona series (Shoji Meguro), NieR
(Keiichi Okabe), Toby Fox's Japanese-inflected work. Iconic game music.`,
      },
    ],
  },

  metal: {
    name: "Metal",
    stations: [
      {
        id: "classic",
        name: "Classic Metal",
        djId: DJ.RUSTY,
        prompt: `Curate 30 classic-metal foundational tracks. Black Sabbath,
Judas Priest, Iron Maiden, Motörhead, Dio, Rainbow, Scorpions, Saxon,
Diamond Head, Accept, UFO, Thin Lizzy's heavier cuts, early Whitesnake,
Manowar, Mercyful Fate. NWOBHM and the genre's pillars.`,
      },
      {
        id: "thrash",
        name: "Thrash",
        djId: DJ.MAGNUS,
        prompt: `Curate 30 essential thrash-metal tracks. Metallica's
80s era, Slayer, Megadeth, Anthrax, Testament, Exodus, Overkill, Death
Angel, Sepultura, Kreator, Sodom, Destruction, Dark Angel, Annihilator,
Forbidden, Vio-lence. Galloping riffs, double bass, snarling vocals.`,
      },
      {
        id: "death",
        name: "Death Metal",
        djId: DJ.MAGNUS,
        prompt: `Curate 30 death-metal tracks across the genre. Death,
Morbid Angel, Cannibal Corpse, Deicide, Obituary, Suffocation, Carcass,
Entombed, Dismember, At the Gates, In Flames, Opeth's death-metal cuts,
Cattle Decapitation, Job for a Cowboy, Behemoth, Decapitated. Brutal
riffs, blast beats, guttural vocals.`,
      },
      {
        id: "black",
        name: "Black Metal",
        djId: DJ.MAGNUS,
        prompt: `Curate 30 black-metal tracks. Bathory, Mayhem, Darkthrone,
Burzum, Emperor, Immortal, Satyricon, Enslaved, Dissection, Watain,
Wolves in the Throne Room, Agalloch, Deafheaven, Krallice, Liturgy,
Drudkh. Tremolo guitars, blast beats, atmosphere of cold.`,
      },
      {
        id: "power",
        name: "Power Metal",
        djId: DJ.MAGNUS,
        prompt: `Curate 30 power-metal anthems. Helloween, Blind Guardian,
Stratovarius, Sonata Arctica, Rhapsody (of Fire), Kamelot, Nightwish,
DragonForce, HammerFall, Edguy, Avantasia, Symphony X, Iced Earth,
Sabaton, Powerwolf. Soaring vocals, fantasy lyrics, twin-guitar harmonies.`,
      },
      {
        id: "doom",
        name: "Doom Metal",
        djId: DJ.RUSTY,
        prompt: `Curate 30 doom-metal tracks across traditional, stoner, and
sludge varieties. Black Sabbath, Candlemass, Saint Vitus, Pentagram,
Trouble, Electric Wizard, Sleep, Kyuss, Boris, Earth, Pallbearer,
YOB, Sunn O))), Khemmis, Bell Witch. Slow tempos, downtuned guitars,
crushing weight.`,
      },
      {
        id: "nu-metal",
        name: "Nu-Metal",
        djId: DJ.RUSTY,
        prompt: `Curate 30 nu-metal staples. Korn, Slipknot, Limp Bizkit,
System of a Down, Linkin Park, Deftones, Disturbed, Mudvayne, Static-X,
Coal Chamber, Soulfly, Powerman 5000, P.O.D., Drowning Pool, Crazy Town,
Spineshank. Detuned 7-strings, hip-hop drums, the late-90s/early-2000s
peak.`,
      },
      {
        id: "prog",
        name: "Prog Metal",
        djId: DJ.MAGNUS,
        prompt: `Curate 30 progressive-metal tracks. Dream Theater, Tool,
Opeth, Mastodon, Between the Buried and Me, Animals as Leaders, Periphery,
TesseracT, Devin Townsend, Symphony X, Fates Warning, Queensrÿche,
Gojira, Meshuggah, Leprous, Haken. Odd time signatures, virtuosic
playing, conceptual ambition.`,
      },
      {
        id: "modern",
        name: "Modern Metal",
        djId: DJ.MAGNUS,
        prompt: `Curate 30 modern metal tracks from the last decade.
Bring Me the Horizon, Architects, Spiritbox, Sleep Token, Code Orange,
Lorna Shore, Knocked Loose, Polyphia, Bad Omens, Loathe, Currents,
Northlane, Erra, Falling in Reverse, Ghost. Metalcore, djent, and
genre-blurring modern heaviness.`,
      },
    ],
  },

  holiday: {
    name: "Holiday",
    stations: [
      {
        id: "pop-hits",
        name: "Christmas Pop Hits",
        djId: DJ.M_QUAKE,
        prompt: `Curate 30 mainstream pop Christmas hits. Mariah Carey's
"All I Want for Christmas Is You", Wham!'s "Last Christmas", Ariana
Grande, Kelly Clarkson, Michael Bublé's pop side, Justin Bieber's
Christmas album, Sia, Pentatonix, Idina Menzel, Gwen Stefani, Carrie
Underwood, Sabrina Carpenter, Norah Jones. Today's holiday playlists.`,
      },
      {
        id: "crooners",
        name: "Classic Crooners",
        djId: DJ.STERLING,
        prompt: `Curate 30 classic-crooner Christmas standards. Bing Crosby,
Frank Sinatra, Dean Martin, Nat King Cole, Andy Williams, Perry Como,
Johnny Mathis, Elvis Presley's Christmas album, Tony Bennett, Burl Ives,
Rosemary Clooney, Doris Day, Ella Fitzgerald, Judy Garland. Velvet voices
by the fireplace.`,
      },
      {
        id: "soul-motown",
        name: "Soul & Motown Christmas",
        djId: DJ.STERLING,
        prompt: `Curate 30 soul and Motown Christmas tracks. The Jackson 5's
Christmas album, The Temptations, Stevie Wonder's "Someday at Christmas",
The Supremes, Marvin Gaye, Smokey Robinson, James Brown's funky Christmas,
Otis Redding, Aretha Franklin, Donny Hathaway's "This Christmas",
Charles Brown, Lou Rawls. Holiday with rhythm and grit.`,
      },
      {
        id: "rock",
        name: "Christmas Rock",
        djId: DJ.M_QUAKE,
        prompt: `Curate 30 rock and alt-rock Christmas tracks. Bruce
Springsteen's "Santa Claus Is Coming to Town", Chuck Berry, John Lennon's
"Happy Xmas (War Is Over)", The Kinks, Tom Petty, The Pogues' "Fairytale
of New York", Cheap Trick, Twisted Sister, Bon Jovi, Killers, Death Cab,
Sufjan Stevens' Christmas songs. Christmas with guitars.`,
      },
      {
        id: "rnb-hiphop",
        name: "R&B & Hip-Hop Holiday",
        djId: DJ.THEO,
        prompt: `Curate 30 R&B and hip-hop Christmas tracks. Boyz II Men's
Christmas album, Destiny's Child's "8 Days of Christmas", Mariah's R&B
crew, Mary J. Blige, John Legend's "A Legendary Christmas", Run-DMC's
"Christmas in Hollis", Kanye's "Christmas in Harlem", Ariana, Chris
Brown, Jennifer Hudson, NSYNC. Holiday with groove.`,
      },
      {
        id: "cozy",
        name: "Cozy Acoustic Holiday",
        djId: DJ.THEO,
        prompt: `Curate 30 cozy, acoustic, low-key holiday tracks. Sufjan
Stevens' Christmas EPs, Norah Jones, Sarah McLachlan, Vince Guaraldi
Trio's "Charlie Brown Christmas", The Head and the Heart, She & Him,
Lord Huron, James Taylor, Phoebe Bridgers' "7 O'Clock News/Silent Night",
Andy Williams' quiet sides, Phil Wickham acoustic. Mug-of-cocoa music.`,
      },
      {
        id: "sacred",
        name: "Sacred Christmas",
        djId: DJ.STERLING,
        prompt: `Curate 30 sacred Christmas carols and choir works.
"O Holy Night", "Silent Night", "What Child Is This", "Hark! The Herald
Angels Sing", "O Come All Ye Faithful", Handel's "Messiah" highlights,
Bach Christmas Oratorio, King's College Choir, Mormon Tabernacle Choir,
Andrea Bocelli's Christmas, Josh Groban, CeCe Winans. Reverent and
choral.`,
      },
    ],
  },
}

/**
 * Look up `{ genre, station }` for a given (genreId, stationId) pair, or
 * return `null` if either is unknown.
 */
function lookupStation(genreId, stationId) {
  const genre = CATALOG[genreId]
  if (!genre) return null
  const station = genre.stations.find((s) => s.id === stationId)
  if (!station) return null
  return { genre: { id: genreId, name: genre.name }, station }
}

module.exports = { CATALOG, lookupStation }

// Build the deterministic on-air voice-intro transcript for a
// persona. Shared by two callers:
//
//   - scripts/seed-dj-intros.js — wraps the result in
//     buildTtsPrompt() before sending it to Gemini TTS, so a
//     re-bake of the same persona produces the same transcript.
//
//   - server/services/utl/loadPersonas.js — surfaces the same
//     string as `details.introText`, so the picker UI can show
//     the user exactly what the Audition clip will say.
//
// Centralizing it here is what keeps the displayed transcript
// guaranteed-in-sync with the baked audio: both code paths run
// the same function over the same persona metadata.
//
// We prefer the first signature phrase because those are written
// expressly to capture the DJ's on-air voice (catchphrases, tics,
// rhythm). If a persona ships without phrases we fall back to the
// first sentence of `djStyle`, which is usually a descriptive
// blurb rather than a quote — adequate but less colorful.
//
// `spokenName` (optional frontmatter) is preferred over `djName`
// for the "Hi, I'm X" portion: some on-air handles read poorly
// when fed to TTS ("M-Quake" → "Mac-Quake"), so the persona can
// supply a phonetic spelling ("Em Quake") that the model reads
// cleanly. The UI surfaces always use `djName` — only the spoken
// transcript uses `spokenName`.
function buildIntroText(persona) {
  const spoken = persona.spokenName || persona.djName
  const phrase = (persona.signaturePhrases || [])[0]
  if (phrase) {
    return `Hi, I'm ${spoken}. ${phrase}`.trim()
  }
  const firstSentence = String(persona.djStyle || '')
    .split(/(?<=[.!?])\s+/)[0]
    .trim()
  if (firstSentence) {
    return `Hi, I'm ${spoken}. ${firstSentence}`.trim()
  }
  return `Hi, I'm ${spoken}.`
}

module.exports = { buildIntroText }

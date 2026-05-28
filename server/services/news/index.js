/**
 * News segment dispatcher.
 *
 * Rotates through locales listed in NEWS_TOPIC_ROTATION (default "dk,es,iowa"),
 * fetches the latest headlines for the selected locale, picks the first article
 * we haven't aired before, marks it seen, and returns a DJ prompt string ready
 * to feed to `createContent`.
 *
 * Returns null if no fresh article is available — show runner should skip the
 * segment gracefully in that case.
 */
const drDk = require('./drDk');
const rtveEs = require('./rtveEs');
const iowa = require('./iowa');
const SeenArticle = require('../../db/SeenArticle');

const PROVIDERS = { dk: drDk, es: rtveEs, iowa };

let rotationCursor = 0;

function getRotation() {
  const raw = process.env.NEWS_TOPIC_ROTATION || 'dk,es,iowa';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => PROVIDERS[s]);
}

function nextLocale() {
  const rotation = getRotation();
  if (rotation.length === 0) return null;
  const locale = rotation[rotationCursor % rotation.length];
  rotationCursor += 1;
  return locale;
}

async function pickFreshArticle(provider) {
  const articles = await provider.fetchLatestArticles({ limit: 10 });
  for (const article of articles) {
    const existing = await SeenArticle.findOne({ where: { url: article.url } });
    if (!existing) return article;
  }
  return null;
}

function buildPrompt({ name, article, nextTrackTitle, nextTrackArtist, omitSegue }) {
  const localeLabel = {
    dk: 'Denmark',
    es: 'Spain',
    iowa: 'Iowa',
  }[article.locale] || article.locale;

  const segueLine = omitSegue
    ? `- Do NOT introduce, name, or announce a song after the brief — the music is already playing underneath you. End with a brief sign-off.`
    : `- After the brief, segue smoothly into the next track: "${nextTrackTitle}" by ${nextTrackArtist}.`;

  return `
You are about to deliver a short on-air news brief from ${localeLabel} (${article.source}) for ${name}.

Headline: ${article.title}
${article.summary ? `Context: ${article.summary}` : ''}

Rules:
- Stay neutral, factual, and brief — two to three sentences max.
- Translate any non-English words naturally; pronounce place names in their source language.
- Do not invent details that are not in the headline or context.
- Do not include a URL, source attribution beyond "${article.source}", or filler like "stay tuned for more news".
${segueLine}
- Output only the words you would speak on air. No stage directions, no quotation marks around the whole response.
`.trim();
}

async function newsSegment({ name, nextTrackTitle, nextTrackArtist, omitSegue = false }) {
  const locale = nextLocale();
  if (!locale) return null;
  const provider = PROVIDERS[locale];

  let article;
  try {
    article = await pickFreshArticle(provider);
  } catch (err) {
    console.error(`[news:${locale}] feed fetch failed:`, err.message);
    return null;
  }
  if (!article) return null;

  try {
    await SeenArticle.create({
      url: article.url,
      title: article.title,
      locale: article.locale,
      source: article.source,
    });
  } catch (err) {
    // unique constraint race — safe to ignore
    if (err.name !== 'SequelizeUniqueConstraintError') {
      console.error('[news] failed to record seen article:', err.message);
    }
  }

  return buildPrompt({ name, article, nextTrackTitle, nextTrackArtist, omitSegue });
}

module.exports = { newsSegment };

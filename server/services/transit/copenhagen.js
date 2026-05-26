/**
 * Copenhagen-area transit disruption fetcher.
 *
 * Strategy:
 *   1. If REJSEPLANEN_ACCESS_ID is set, query Rejseplanen's `himMessages`
 *      endpoint (HAFAS Information Manager) for active disruptions.
 *   2. Fall back to DSB's Trafikinfo RSS feed when Rejseplanen is unavailable
 *      or returns nothing.
 *   3. Cache results for 5 minutes to avoid hammering the upstreams.
 *
 * Returns a normalized array of { id, title, summary, severity, source, url }
 * — empty array when nothing is happening (the segment will be skipped).
 */
const Parser = require('rss-parser');

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = { value: null, expiresAt: 0 };

const rssParser = new Parser({
  timeout: 8000,
  headers: { 'User-Agent': 'SpotifAI/0.1 (+https://github.com/hoovercj/SpotifAI)' },
});

const REJSEPLANEN_BASE =
  process.env.REJSEPLANEN_BASE_URL || 'https://www.rejseplanen.dk/api';
const DSB_RSS_URL =
  process.env.DSB_RSS_URL || 'https://www.dsb.dk/trafikinformation/rss/';

function isCacheFresh() {
  return cache.value !== null && Date.now() < cache.expiresAt;
}

function setCache(value) {
  cache.value = value;
  cache.expiresAt = Date.now() + CACHE_TTL_MS;
}

async function fetchRejseplanen() {
  const accessId = process.env.REJSEPLANEN_ACCESS_ID;
  if (!accessId) return null;

  const url = `${REJSEPLANEN_BASE}/himMessages?accessId=${encodeURIComponent(
    accessId
  )}&format=json`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const messages = Array.isArray(data?.Message)
      ? data.Message
      : Array.isArray(data?.messages)
        ? data.messages
        : [];
    return messages.slice(0, 5).map((m) => ({
      id: m.id || m.externalId || m.head || m.text,
      title: m.head || m.lead || m.text || 'Transit disruption',
      summary: m.lead || m.text || '',
      severity: m.priority || m.category || 'info',
      source: 'Rejseplanen',
      url: m.url || null,
    }));
  } catch (err) {
    console.warn('[transit:rejseplanen] fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDsbRss() {
  try {
    const feed = await rssParser.parseURL(DSB_RSS_URL);
    return (feed.items || []).slice(0, 5).map((item) => ({
      id: item.guid || item.link || item.title,
      title: item.title || 'Transit notice',
      summary: (item.contentSnippet || item.summary || '').trim(),
      severity: 'info',
      source: 'DSB Trafikinfo',
      url: item.link || null,
    }));
  } catch (err) {
    console.warn('[transit:dsb] feed fetch failed:', err.message);
    return [];
  }
}

/**
 * Returns the current list of Copenhagen-area transit disruptions, with
 * 5-minute caching. Empty array means nothing to report.
 */
async function fetchDisruptions() {
  if (isCacheFresh()) return cache.value;

  let disruptions = await fetchRejseplanen();
  if (!disruptions || disruptions.length === 0) {
    disruptions = await fetchDsbRss();
  }

  setCache(disruptions || []);
  return disruptions || [];
}

function buildPrompt({ name, disruptions, nextTrackTitle, nextTrackArtist }) {
  const top = disruptions.slice(0, 2);
  const lines = top
    .map((d, i) => `${i + 1}. [${d.source}] ${d.title}${d.summary ? ` — ${d.summary}` : ''}`)
    .join('\n');

  return `
You are about to give a short Copenhagen-area transit alert for ${name}.

Current disruption(s):
${lines}

Rules:
- Be brief — one to two sentences total, even if there are multiple items.
- Translate any Danish phrases into natural English; pronounce Danish station names in Danish.
- Mention the affected line, station, or area if it appears in the text. Do not invent details.
- Do not include URLs or filler like "for more info visit our website".
- After the alert, segue into the next track: "${nextTrackTitle}" by ${nextTrackArtist}.
- Output only the words you would speak on air. No stage directions, no quotation marks around the whole response.
`.trim();
}

async function transitSegment({ name, nextTrackTitle, nextTrackArtist }) {
  if (String(process.env.TRANSIT_ENABLED || 'true').toLowerCase() === 'false') {
    return null;
  }
  const disruptions = await fetchDisruptions();
  if (!disruptions || disruptions.length === 0) return null;
  return buildPrompt({ name, disruptions, nextTrackTitle, nextTrackArtist });
}

module.exports = { transitSegment, fetchDisruptions };

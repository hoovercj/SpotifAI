/**
 * Shared helpers for RSS-based news providers.
 *
 * Each provider exports `fetchLatestArticles({ limit })` returning an array of
 * normalized articles: { title, summary, url, publishedAt, source, locale }.
 */
const Parser = require('rss-parser');

const sharedParser = new Parser({
  timeout: 8000,
  headers: { 'User-Agent': 'SpotifAI/0.1 (+https://github.com/hoovercj/SpotifAI)' },
});

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchFeed({ url, source, locale, limit = 5 }) {
  const feed = await sharedParser.parseURL(url);
  return (feed.items || [])
    .slice(0, limit)
    .map((item) => ({
      title: stripHtml(item.title),
      summary: stripHtml(item.contentSnippet || item.summary || item.content),
      url: item.link,
      publishedAt: item.isoDate || item.pubDate || null,
      source,
      locale,
    }))
    .filter((article) => article.title && article.url);
}

module.exports = { fetchFeed, stripHtml };

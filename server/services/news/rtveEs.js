/**
 * Spain news provider — El País (national daily).
 *
 * Feed URL overridable via NEWS_ES_FEED_URL.
 */
const { fetchFeed } = require('./rssClient');

const DEFAULT_FEED =
  'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada';

async function fetchLatestArticles({ limit = 5 } = {}) {
  return fetchFeed({
    url: process.env.NEWS_ES_FEED_URL || DEFAULT_FEED,
    source: 'El País',
    locale: 'es',
    limit,
  });
}

module.exports = { fetchLatestArticles, locale: 'es' };

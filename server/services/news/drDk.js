/**
 * Denmark news provider — DR Nyheder (public broadcaster).
 *
 * Feed URL overridable via NEWS_DK_FEED_URL.
 */
const { fetchFeed } = require('./rssClient');

const DEFAULT_FEED = 'https://www.dr.dk/nyheder/service/feeds/allenyheder';

async function fetchLatestArticles({ limit = 5 } = {}) {
  return fetchFeed({
    url: process.env.NEWS_DK_FEED_URL || DEFAULT_FEED,
    source: 'DR Nyheder',
    locale: 'dk',
    limit,
  });
}

module.exports = { fetchLatestArticles, locale: 'dk' };

/**
 * Iowa news provider — Iowa Public Radio (state public broadcaster).
 *
 * Feed URL overridable via NEWS_IOWA_FEED_URL.
 */
const { fetchFeed } = require('./rssClient');

const DEFAULT_FEED = 'https://www.iowapublicradio.org/feed/news.rss';

async function fetchLatestArticles({ limit = 5 } = {}) {
  return fetchFeed({
    url: process.env.NEWS_IOWA_FEED_URL || DEFAULT_FEED,
    source: 'Iowa Public Radio',
    locale: 'iowa',
    limit,
  });
}

module.exports = { fetchLatestArticles, locale: 'iowa' };

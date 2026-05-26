const { DataTypes } = require('sequelize');
const conn = require('./conn');

/**
 * Tracks news article URLs we've already aired so the same headline doesn't
 * repeat across restarts or rotation cycles.
 */
const SeenArticle = conn.define('seen_article', {
  url: {
    type: DataTypes.STRING(2048),
    allowNull: false,
    unique: true,
  },
  title: {
    type: DataTypes.STRING(1024),
    allowNull: true,
  },
  locale: {
    type: DataTypes.STRING(16),
    allowNull: false,
  },
  source: {
    type: DataTypes.STRING(128),
    allowNull: true,
  },
  seenAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

module.exports = SeenArticle;

const { DataTypes } = require("sequelize")
const conn = require("./conn")

/**
 * Per-user "recently played" sessions. One row per (userEmail, seedKey).
 *
 * We persist these server-side (rather than in localStorage) so the list
 * follows the user across devices — open SpotifAI on a phone, see what
 * was played on the laptop, hit a tile, resume.
 *
 * `seedKey` is the stable identifier returned by
 *   server/services/sessions/seedKey.js
 * (e.g. "station:rock/70s-legends", "mood:workout", "track:spotify:track:XYZ").
 *
 * `seed` is the full seed object the client originally sent, stored as
 * JSONB so we can echo it back on retrieval without parsing the seedKey.
 *
 * `lastUsedAt` is bumped on every successful /start so the "Jump back
 * in" row stays ordered by most-recent-first.
 */
const RecentSession = conn.define(
  "recent_session",
  {
    userEmail: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    seedKey: {
      type: DataTypes.STRING(256),
      allowNull: false,
    },
    seed: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(256),
      allowNull: false,
    },
    djId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING(1024),
      allowNull: true,
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    indexes: [
      {
        name: "recent_session_user_seed_uniq",
        unique: true,
        fields: ["userEmail", "seedKey"],
      },
      {
        name: "recent_session_user_last_used_idx",
        fields: ["userEmail", "lastUsedAt"],
      },
    ],
  }
)

module.exports = RecentSession

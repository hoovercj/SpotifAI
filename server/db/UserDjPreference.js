const { DataTypes } = require("sequelize")
const conn = require("./conn")

/**
 * Per-user, per-seed DJ override. Lets a listener say "every time I
 * start the 'rock/70s-legends' station, give it to Nigel instead of
 * Rusty", and have that preference survive reloads / device-swaps.
 *
 * One row per (userEmail, seedKey). Writing the same key overwrites
 * (upsert in the route handler). DELETE removes the override and the
 * resolver falls back to the catalog/mood pin or the LLM pick.
 *
 * `seedKey` is the stable identifier from
 *   server/services/sessions/seedKey.js
 * (e.g. "station:rock/70s-legends", "mood:workout",
 *  "artist:spotify:artist:XYZ"). Same key the RecentSession table
 * uses, so the two stay aligned.
 */
const UserDjPreference = conn.define(
  "user_dj_preference",
  {
    userEmail: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    seedKey: {
      type: DataTypes.STRING(256),
      allowNull: false,
    },
    djId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    indexes: [
      {
        name: "user_dj_preference_user_seed_uniq",
        unique: true,
        fields: ["userEmail", "seedKey"],
      },
    ],
  }
)

module.exports = UserDjPreference

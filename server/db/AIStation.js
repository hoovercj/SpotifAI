const { DataTypes } = require("sequelize")
const conn = require("./conn")

/**
 * Cached AI-station setlists. One row per (genreId, stationId) — the latest
 * generated tracks always replace the prior version.
 *
 * `weekKey` is the ISO-style "YYYY-Www" bucket that the row was generated in
 * (e.g. "2026-W22"). We use it to detect staleness: a row whose `weekKey`
 * does not match the current week triggers a background regen the next time
 * the station is started. The user always gets the cached tracks back
 * instantly; the refresh happens out of band.
 *
 * `tracks` is the resolved Spotify-side payload: an array of
 *   { uri, name, artists: [string], image: string|null, durationMs?: number }
 * objects ready to feed into the Web Playback SDK.
 */
const AIStation = conn.define(
  "ai_station",
  {
    genreId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    stationId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    weekKey: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    tracks: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
  },
  {
    indexes: [
      {
        name: "ai_station_genre_station_uniq",
        unique: true,
        fields: ["genreId", "stationId"],
      },
    ],
  }
)

module.exports = AIStation

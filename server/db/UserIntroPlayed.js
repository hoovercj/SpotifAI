const { DataTypes } = require('sequelize')
const conn = require('./conn')

/**
 * Per-user record of which (seedKey, djId) intros the user has
 * already heard. Once present, /api/sessions/start (and the legacy
 * /api/stations/.../start) omit the `intro` field from the response —
 * the user gets the warm-cache experience without the explainer.
 *
 * Composite primary key on (userEmail, seedKey, djId). Writes are
 * upserts triggered by the client's POST /api/sessions/intro-played
 * after the intro <audio> element fires `ended`.
 *
 * No FK to User by design — we never care about a user being deleted
 * from this table (rows just become dead weight) and an FK would
 * couple intro-played writes to user.email primary-key behavior.
 */
const UserIntroPlayed = conn.define(
  'user_intro_played',
  {
    userEmail: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    seedKey: {
      type: DataTypes.STRING(256),
      allowNull: false,
      primaryKey: true,
    },
    djId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    playedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    indexes: [
      {
        name: 'user_intro_played_lookup',
        fields: ['userEmail', 'seedKey', 'djId'],
      },
    ],
  }
)

module.exports = UserIntroPlayed

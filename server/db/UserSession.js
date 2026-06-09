const conn = require("./conn");
const { STRING } = conn.Sequelize;

// Represents a single sign-in-to-sign-out span for a user. Keyed by the
// nanoid the client mints on OAuth success / session restore. Used by
// `getOrCreateChat` to keep per-DJ conversation history continuous across
// station changes within one user session, and by `UserSessionTracks` to
// log the rundown of segments emitted during the span.
const UserSession = conn.define("userSession", {
  userEmail: {
    type: STRING,
    references: {
      model: "users",
      key: "email",
    },
    allowNull: false,
  },
  userSessionId: {
    type: STRING,
    primaryKey: true,
  },
});

module.exports = UserSession;

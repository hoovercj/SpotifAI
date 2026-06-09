const conn = require("./conn");
const { STRING, INTEGER, TEXT } = conn.Sequelize;

// One row per rundown slot played within a user session. The DJ chatter
// audio and transcript are stored inline so the rundown can be replayed
// (or audited via debugTracker) without re-calling Gemini.
const UserSessionTracks = conn.define("userSessionTracks", {
  userSessionId: {
    type: STRING,
    references: {
      model: "userSessions",
      key: "userSessionId",
    },
    allowNull: false,
  },
  runDownIndex: {
    type: INTEGER,
    allowNull: true,
  },
  spotifyTrackId: {
    type: STRING,
    allowNull: true,
  },
  spotifyTrackName: {
    type: STRING,
    allowNull: true,
  },
  spotifyTrackArtist: {
    type: STRING,
    allowNull: true,
  },
  djAudioDataURI: {
    type: TEXT,
    allowNull: true,
  },
  djAudioTranscript: {
    type: TEXT,
    allowNull: true,
  },
});

module.exports = UserSessionTracks;

const conn = require("./conn");
const { STRING, BOOLEAN, INTEGER } = conn.Sequelize;

const Settings = conn.define("settings", {
  userEmail: {
    type: STRING,
    references: {
      model: "users",
      key: "email",
    },
    primaryKey: true,
    allowNull: false,
  },
  shuffle: {
    type: BOOLEAN,
    allowNull: true,
    defaultValue: false,
  },
  repeat: {
    type: BOOLEAN,
    allowNull: true,
    defaultValue: false,
  },
  defaultThing: {
    type: STRING,
    allowNull: true,
  },
  // "Exclusive DJ" — if set, every session this user starts is hosted
  // by this DJ regardless of seed type, station pin, mood pin, or LLM
  // pick. Cleared by writing null. Resolved first in
  // server/services/sessions/resolveSessionDj.js.
  exclusiveDjId: {
    type: INTEGER,
    allowNull: true,
    defaultValue: null,
  },
});

module.exports = Settings;

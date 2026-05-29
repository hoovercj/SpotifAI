const conn = require("./conn")
const User = require("./User")
const syncAndSeed = require("./seed")
const Profile = require("./Profile")
const Settings = require("./Settings")
const JamSession = require("./JamSession")
const JamSessionTracks = require("./JamSessionTracks")
const Tracks = require("./Tracks")
const SeenArticle = require("./SeenArticle")
const AIStation = require("./AIStation")
const RecentSession = require("./RecentSession")
const UserDjPreference = require("./UserDjPreference")
const UserIntroPlayed = require("./UserIntroPlayed")

User.hasOne(Profile, {
  foreignKey: "userEmail",
  sourceKey: "email",
  onDelete: "CASCADE",
})

Profile.belongsTo(User, {
  foreignKey: "userEmail",
  targetKey: "email",
})

User.hasOne(Settings, {
  foreignKey: "userEmail",
  sourceKey: "email",
  onDelete: "CASCADE",
})

Settings.belongsTo(User, {
  foreignKey: "userEmail",
  targetKey: "email",
})

User.hasMany(JamSession, {
  foreignKey: "userEmail",
})

JamSession.belongsTo(User, {
  foreignKey: "userEmail",
})

JamSession.hasMany(JamSessionTracks, {
  foreignKey: "jamSessionId",
})

JamSessionTracks.belongsTo(JamSession, {
  foreignKey: "jamSessionId",
})

User.hasMany(RecentSession, {
  foreignKey: "userEmail",
  sourceKey: "email",
  onDelete: "CASCADE",
})

RecentSession.belongsTo(User, {
  foreignKey: "userEmail",
  targetKey: "email",
})

User.hasMany(UserDjPreference, {
  foreignKey: "userEmail",
  sourceKey: "email",
  onDelete: "CASCADE",
})

UserDjPreference.belongsTo(User, {
  foreignKey: "userEmail",
  targetKey: "email",
})

module.exports = {
  syncAndSeed,
  User,
  JamSession,
  Profile,
  Settings,
  SeenArticle,
  AIStation,
  RecentSession,
  UserDjPreference,
  UserIntroPlayed,
}

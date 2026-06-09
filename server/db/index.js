const conn = require("./conn")
const User = require("./User")
const syncAndSeed = require("./seed")
const Profile = require("./Profile")
const Settings = require("./Settings")
const UserSession = require("./UserSession")
const UserSessionTracks = require("./UserSessionTracks")
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

User.hasMany(UserSession, {
  foreignKey: "userEmail",
})

UserSession.belongsTo(User, {
  foreignKey: "userEmail",
})

UserSession.hasMany(UserSessionTracks, {
  foreignKey: "userSessionId",
})

UserSessionTracks.belongsTo(UserSession, {
  foreignKey: "userSessionId",
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
  UserSession,
  Profile,
  Settings,
  SeenArticle,
  AIStation,
  RecentSession,
  UserDjPreference,
  UserIntroPlayed,
}

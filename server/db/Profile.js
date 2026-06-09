const conn = require('./conn')
const { STRING } = conn.Sequelize

const Profile = conn.define('profile', {
  userEmail: {
    type: STRING,
    references: {
      model: 'users',
      key: 'email',
    },
    allowNull: false,
    primaryKey: true,
    unique: true,
  },
  name: {
    type: STRING,
    allowNull: true,
  },
})

module.exports = Profile

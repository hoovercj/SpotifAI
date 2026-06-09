const conn = require('./conn')
const User = require('./User')
const Profile = require('./Profile')
const logger = require('../services/logger')

async function setAdmin(email, isAdmin) {
  try {
    await User.upsert({
      email: email,
      isAdmin: isAdmin,
    })
    await Profile.findOrCreate({
      where: { userEmail: email },
    })
  } catch (error) {
    logger.error({ err: error?.message, stack: error?.stack }, 'db.seed.upsert_failed')
  }
}

const syncAndSeed = async () => {
  await conn.sync({ force: false, alter: true })
  try {
    // Admins are configured via the ADMIN_EMAILS env var (comma-separated).
    // Was previously hardcoded to two emails from the original fork — env
    // is friendlier for rotating admins without a code change, and lets
    // local dev keep its own list separate from prod.
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    for (const email of adminEmails) {
      await setAdmin(email, true)
    }
  } catch (err) {
    logger.error('db.seed.failed')
  }
}

if (require.main === module) {
  syncAndSeed()
}

module.exports = syncAndSeed

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
  // One-shot cleanup of tables renamed in the JamSession → UserSession
  // refactor (June 2026). Sequelize's `sync({ alter: true })` adds the
  // new tables but doesn't drop the old ones, so without this they'd
  // linger forever with orphan rows. Idempotent: DROP IF EXISTS no-ops
  // once the tables are gone, and we can delete this block in a future
  // pass when all environments have booted at least once.
  try {
    await conn.query('DROP TABLE IF EXISTS "jamSessionTracks" CASCADE')
    await conn.query('DROP TABLE IF EXISTS "jamSessions" CASCADE')
  } catch (err) {
    logger.warn({ err: err?.message }, 'db.seed.legacy_drop_failed')
  }
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

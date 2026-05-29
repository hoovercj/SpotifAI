/**
 * Per-user "have I heard this intro" suppression helper.
 *
 * Used by the session + station start orchestrators to suppress the
 * `intro` field in the response payload once a given user has played
 * the intro for that (seedKey, djId) combo at least once.
 *
 * Two purposes for an intro: (1) fill cold-start time while we
 * generate tracks, (2) introduce the station/seed to a new listener.
 * Once both are satisfied for a user, replaying the intro is just
 * dead air. The blob cache stays — fresh listeners on other accounts
 * still benefit from the warm audio.
 *
 * The "played" check is best-effort: DB hiccups must NOT block the
 * user from playing, so callers treat a thrown error as "no, they
 * haven't" (i.e. play the intro). The matching upsert called from
 * the /intro-played route is also best-effort.
 */

const { UserIntroPlayed } = require('../../db')
const { hashUserId } = require('../utl/hashUserId')
const logger = require('../logger')

async function hasIntroBeenPlayed({ userEmail, seedKey, djId }) {
  if (!userEmail || !seedKey || !djId) return false
  try {
    const row = await UserIntroPlayed.findOne({
      where: { userEmail, seedKey, djId },
      attributes: ['userEmail'],
    })
    return Boolean(row)
  } catch (err) {
    logger.warn(
      { err: err?.message, userIdHash: hashUserId(userEmail), seedKey, djId },
      'introPlayed.lookup_failed'
    )
    return false
  }
}

async function recordIntroPlayed({ userEmail, seedKey, djId }) {
  if (!userEmail || !seedKey || !djId) return false
  try {
    await UserIntroPlayed.upsert({
      userEmail,
      seedKey,
      djId,
      playedAt: new Date(),
    })
    return true
  } catch (err) {
    logger.warn(
      { err: err?.message, userIdHash: hashUserId(userEmail), seedKey, djId },
      'introPlayed.upsert_failed'
    )
    return false
  }
}

module.exports = { hasIntroBeenPlayed, recordIntroPlayed }

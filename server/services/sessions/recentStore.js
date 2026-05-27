/**
 * Server-side per-user "recently played" sessions store.
 *
 * Used by the home screen's "Jump back in" / "Recent sessions" row so
 * the list follows the user across devices instead of being trapped in
 * one browser's localStorage.
 *
 *   record({ userEmail, sessionDescriptor })  — bump or insert
 *   list({ userEmail, limit })                — most-recent-first
 *   remove({ userEmail, seedKey })            — explicit dismissal
 */
const { RecentSession } = require("../../db")

const DEFAULT_LIMIT = 20
const MAX_PER_USER = 50 // cap to keep the table well-bounded

/**
 * Upsert the row for (userEmail, seedKey) — sets lastUsedAt to now and
 * refreshes the cached display name / image / DJ. Returns the row.
 *
 * Best-effort: errors are logged and swallowed so a DB hiccup never
 * breaks playback. The user can always still start the session — they
 * just don't get a "recent" tile this time.
 */
async function record({ userEmail, sessionDescriptor }) {
  if (!userEmail || !sessionDescriptor) return null
  const { id: seedKey, seed, name, djId, image } = sessionDescriptor
  if (!seedKey || !seed || !name) return null

  try {
    // `upsert` is the right primitive here, but Sequelize's upsert
    // doesn't bump `updatedAt` reliably across dialects — we want a
    // visible "last played" stamp on its own column.
    const [row] = await RecentSession.upsert({
      userEmail,
      seedKey,
      seed,
      name,
      djId: djId ?? null,
      imageUrl: image ?? null,
      lastUsedAt: new Date(),
    })

    // Trim per-user to MAX_PER_USER. Find the oldest rows beyond the
    // cap and drop them. Cheap because we kept the (userEmail, lastUsedAt)
    // index. Best-effort — errors logged + swallowed.
    pruneOldest(userEmail).catch((err) => {
      console.warn("recentSessions.pruneOldest failed:", err?.message || err)
    })

    return row
  } catch (err) {
    console.warn("recentSessions.record failed:", err?.message || err)
    return null
  }
}

async function pruneOldest(userEmail) {
  const count = await RecentSession.count({ where: { userEmail } })
  if (count <= MAX_PER_USER) return
  const excess = count - MAX_PER_USER
  const oldest = await RecentSession.findAll({
    where: { userEmail },
    order: [["lastUsedAt", "ASC"]],
    limit: excess,
    attributes: ["id"],
  })
  if (oldest.length === 0) return
  await RecentSession.destroy({
    where: { id: oldest.map((r) => r.id) },
  })
}

async function list({ userEmail, limit = DEFAULT_LIMIT }) {
  if (!userEmail) return []
  try {
    const rows = await RecentSession.findAll({
      where: { userEmail },
      order: [["lastUsedAt", "DESC"]],
      limit: Math.max(1, Math.min(limit, 50)),
    })
    return rows.map((row) => ({
      seedKey: row.seedKey,
      seed: row.seed,
      name: row.name,
      djId: row.djId,
      imageUrl: row.imageUrl,
      lastUsedAt: row.lastUsedAt,
    }))
  } catch (err) {
    console.warn("recentSessions.list failed:", err?.message || err)
    return []
  }
}

async function remove({ userEmail, seedKey }) {
  if (!userEmail || !seedKey) return 0
  try {
    return await RecentSession.destroy({ where: { userEmail, seedKey } })
  } catch (err) {
    console.warn("recentSessions.remove failed:", err?.message || err)
    return 0
  }
}

module.exports = { record, list, remove }

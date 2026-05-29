/**
 * One-way HMAC hash of a user email.
 *
 * Used everywhere we'd otherwise log or telemeter the raw email — log
 * dumps and App Insights events get the hash; the full email stays in
 * the `users` table where we legitimately need it for OAuth.
 *
 * SESSION_SECRET is the HMAC key so the hash isn't reversible from
 * logs alone. A leaked log + the secret can still reverse a specific
 * known email, but cannot enumerate the user base from scratch.
 *
 * 16 hex chars (64 bits of entropy) is plenty for a per-user
 * correlation key — collision probability across 10k users is ~3e-12.
 */

const crypto = require('node:crypto')

const SECRET = process.env.SESSION_SECRET || 'dev-only-fallback-secret-do-not-use-in-prod'

function hashUserId(email) {
  if (!email) return null
  return crypto
    .createHmac('sha256', SECRET)
    .update(String(email).toLowerCase().trim())
    .digest('hex')
    .slice(0, 16)
}

module.exports = { hashUserId }

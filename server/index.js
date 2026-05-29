require("dotenv").config()
// MUST come before any other require so the App Insights SDK can hook
// outgoing HTTP, console, Postgres, etc. No-ops when the connection
// string env var is unset (i.e. local dev with no Azure).
require("./services/telemetry")
const logger = require("./services/logger")
const httpServer = require("./app")
const { syncAndSeed } = require("./db")

const init = async () => {
  const port = process.env.PORT || 3000

  // Bind the port FIRST, then run DB sync in the background. App Service's
  // container start probe gives us ~230s to respond on PORT; if syncAndSeed
  // is on the critical path (esp. with sequelize `alter: true` against a
  // fresh remote DB) we blow that budget and the container gets killed.
  // The brief window before sync completes is safe: nothing in the request
  // path uses the DB during the App Service warmup probe, which only
  // checks that the port is listening.
  httpServer.listen(port, () => logger.info({ port }, "server.listening"))

  try {
    logger.info("startup.syncAndSeed.start")
    const t0 = Date.now()
    await syncAndSeed()
    logger.info({ ms: Date.now() - t0 }, "startup.syncAndSeed.complete")
  } catch (ex) {
    logger.error({ err: ex?.message, stack: ex?.stack }, "startup.syncAndSeed.failed")
  }
}

init()

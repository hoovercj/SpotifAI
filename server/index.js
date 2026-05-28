require("dotenv").config()
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
  httpServer.listen(port, () => console.log(`listening on port ${port}`))

  try {
    console.log("[startup] running syncAndSeed in background...")
    const t0 = Date.now()
    await syncAndSeed()
    console.log(`[startup] syncAndSeed complete in ${Date.now() - t0}ms`)
  } catch (ex) {
    console.error("[startup] syncAndSeed failed:", ex)
  }
}

init()

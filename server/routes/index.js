const express = require("express")
const router = express.Router()

router.use("/spotify", require("./spotify"))
router.use("/profile", require("./profile"))
router.use("/content", require("./content"))
router.use("/stations", require("./stations"))
router.use("/sessions", require("./sessions"))

// Dev-only: human-pick UI for the station-cover photo-discovery flow.
// Reads candidates from `debug/station-cover-candidates/` and writes
// picked covers + sidecar credits into `public/images/stations/`.
// Never mounted in production builds.
if (process.env.NODE_ENV !== "production") {
  router.use("/dev/station-covers", require("./devCovers"))
  // Approve / tweak / reject UI for AI-generated station covers.
  // Reads designs from `.tmp/station-cover-design/_all-prompts.json`,
  // tracks decisions in `.tmp/station-cover-design/_decisions.json`,
  // and stores variant PNGs under `.tmp/station-cover-design/<genre>/<station>/v*.png`.
  router.use("/dev/review-covers", require("./devReviewCovers"))
}

module.exports = router
// router.use(contentRoutes)
const PORT = 3000

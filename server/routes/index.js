const express = require("express")
const router = express.Router()

router.use("/spotify", require("./spotify"))
router.use("/profile", require("./profile"))
router.use("/content", require("./content"))
router.use("/stations", require("./stations"))
router.use("/sessions", require("./sessions"))

module.exports = router
// router.use(contentRoutes)
const PORT = 3000

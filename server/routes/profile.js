const router = require("express").Router()
const { Profile } = require("../db")
const logger = require("../services/logger")

router.get("/", async (req, res, next) => {
  try {
    const profile = await Profile.findOne({
      where: { userEmail: req.session.email },
    })
    res.json(profile)
  } catch (err) {
    next(err)
  }
})

router.put("/", async (req, res, next) => {
  try {
    const profile = await Profile.findOne({
      where: { userEmail: req.session.email },
    })
    await profile.update(req.body)
    res.json(profile)
  } catch (err) {
    next(err)
  }
})

module.exports = router

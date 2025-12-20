const express = require('express')
const router = express.Router()
const bonusController = require('../controllers/bonusController')

// Middleware to check if user is logged in
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  next()
}

router.post('/daily-bonus', requireAuth, bonusController.claimDailyBonus)
router.get('/daily-bonus-status', requireAuth, bonusController.getDailyBonusStatus)

module.exports = router
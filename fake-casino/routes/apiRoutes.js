const express = require('express')
const router = express.Router()
const leaderboardController = require('../controllers/leaderboardController')
const betController = require('../controllers/betController')

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  next()
}

router.get('/leaderboard', leaderboardController.getLeaderboard)
router.post('/bet/create', requireAuth, betController.createBet)
router.post('/bet/accept', requireAuth, betController.acceptBet)

module.exports = router

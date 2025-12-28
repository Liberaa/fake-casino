const express = require('express')
const router = express.Router()
const gameController = require('../controllers/gameController')

// Simple auth check middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  next()
}

// Game endpoints - already secure because controller validates everything
router.post('/slots', requireAuth, gameController.playSlots)
router.post('/roulette', requireAuth, gameController.playRoulette)
router.post('/blackjack', requireAuth, gameController.playBlackjack)
router.post('/dice', requireAuth, gameController.playDice)
router.post('/craps', requireAuth, gameController.playCraps)
module.exports = router
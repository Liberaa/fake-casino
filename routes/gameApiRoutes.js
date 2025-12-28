const express = require('express')
const router = express.Router()
const gameController = require('../controllers/gameController')

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  next()
}

router.post('/slots', requireAuth, gameController.playSlots)
router.post('/roulette/bet', requireAuth, gameController.playRoulette)
router.post('/blackjack', requireAuth, gameController.playBlackjack)
router.post('/dice', requireAuth, gameController.playDice)

module.exports = router

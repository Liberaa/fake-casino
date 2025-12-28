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
router.post('/mines/start',
  requireAuth,
  securityMiddleware,
  gameController.startMines
);

router.post('/mines/click',
  requireAuth,
  securityMiddleware,
  gameController.clickMines
);

router.post('/mines/cashout',
  requireAuth,
  securityMiddleware,
  gameController.cashoutMines
);


module.exports = router

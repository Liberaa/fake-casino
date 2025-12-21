const express = require('express')
const router = express.Router()
const shopController = require('../controllers/shopController')

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/')
  }
  next()
}

router.post('/checkout', requireAuth, shopController.createCheckout)
router.get('/success', requireAuth, shopController.handleSuccess)

module.exports = router
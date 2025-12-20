const express = require('express')
const router = express.Router()
const User = require('../models/User')

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/')
  }
  next()
}

router.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/lobby')
  }
  res.render('home')
})

router.get('/lobby', requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId)
  res.render('lobby', { user })
})

router.get('/chat', requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId)
  res.render('chat', { user })
})

router.get('/leaderboard', requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId)
  res.render('leaderboard', { user })
})

router.get('/games/slots', requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId)
  res.render('games/slots', { user })
})

router.get('/games/roulette', requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId)
  res.render('games/roulette', { user })
})

router.get('/games/blackjack', requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId)
  res.render('games/blackjack', { user })
})

router.get('/games/dice', requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId)
  res.render('games/dice', { user })
})


module.exports = router

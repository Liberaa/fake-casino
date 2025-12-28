const express = require('express')
const router = express.Router()
const User = require('../models/User')

// Page-only auth guard (NO JSON, NO bet logic)
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/')
  }
  next()
}

// Home
router.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/lobby')
  }
  res.render('home')
})

// Lobby
router.get('/lobby', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId).lean()
    if (!user) return res.redirect('/')

    res.render('lobby', { user })
  } catch (err) {
    next(err)
  }
})

// Games (VIEWS ONLY — NO LOGIC)
router.get('/games/slots', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId).lean()
    res.render('games/slots', { user })
  } catch (err) {
    next(err)
  }
})

router.get('/games/roulette', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId).lean()
    res.render('games/roulette', { user })
  } catch (err) {
    next(err)
  }
})

router.get('/games/blackjack', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId).lean()
    res.render('games/blackjack', { user })
  } catch (err) {
    next(err)
  }
})

router.get('/games/dice', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId).lean()
    res.render('games/dice', { user })
  } catch (err) {
    next(err)
  }
})

module.exports = router

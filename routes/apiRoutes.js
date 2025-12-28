const express = require('express')
const router = express.Router()
const User = require('../models/User')

// Middleware
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  next()
}

// Leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const type = req.query.type || 'credits'
    let leaderboard = []
    
    if (type === 'credits') {
      leaderboard = await User.find()
        .select('username credits totalWins totalLosses')
        .sort({ credits: -1 })
        .limit(10)
    }
    
    res.json({ success: true, leaderboard })
  } catch (error) {
    res.status(500).json({ error: 'Failed to get leaderboard' })
  }
})

// Daily bonus status
router.get('/daily-bonus-status', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    const now = new Date()
    const lastBonus = user.lastDailyBonus
    
    let canClaim = true
    let nextClaimTime = null
    
    if (lastBonus) {
      const timeDiff = now - lastBonus
      const hoursDiff = timeDiff / (1000 * 60 * 60)
      canClaim = hoursDiff >= 24
      
      if (!canClaim) {
        nextClaimTime = new Date(lastBonus.getTime() + 24 * 60 * 60 * 1000)
      }
    }
    
    res.json({
      canClaim,
      bonus: 500,
      level: user.level || 1,
      nextClaimTime
    })
  } catch (error) {
    console.error('Bonus status error:', error)
    res.status(500).json({ error: 'Failed to get bonus status' })
  }
})

// Claim daily bonus
router.post('/daily-bonus', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    const now = new Date()
    const lastBonus = user.lastDailyBonus
    
    if (lastBonus) {
      const timeDiff = now - lastBonus
      const hoursDiff = timeDiff / (1000 * 60 * 60)
      
      if (hoursDiff < 24) {
        const nextClaim = new Date(lastBonus.getTime() + 24 * 60 * 60 * 1000)
        return res.status(400).json({ 
          error: 'Already claimed today',
          nextClaimTime: nextClaim
        })
      }
    }
    
    // Award bonus
    user.credits += 500
    user.lastDailyBonus = now
    await user.save()
    
    res.json({
      success: true,
      bonus: 500,
      newBalance: user.credits,
      level: user.level || 1
    })
  } catch (error) {
    console.error('Claim bonus error:', error)
    res.status(500).json({ error: 'Failed to claim bonus' })
  }
})

module.exports = router
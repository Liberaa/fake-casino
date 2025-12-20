const User = require('../models/User')
const { getDailyBonus, canClaimDailyBonus } = require('../utils/levelSystem')

exports.claimDailyBonus = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId)
    
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    
    // Check if can claim
    if (!canClaimDailyBonus(user.lastDailyBonus)) {
      const nextClaim = new Date(user.lastDailyBonus)
      nextClaim.setHours(nextClaim.getHours() + 24)
      
      return res.json({
        success: false,
        error: 'Already claimed today',
        nextClaimTime: nextClaim
      })
    }
    
    // Calculate bonus
    const bonus = getDailyBonus(user.level)
    
    // Award bonus
    user.credits += bonus
    user.lastDailyBonus = new Date()
    await user.save()
    
    res.json({
      success: true,
      bonus,
      newBalance: user.credits,
      level: user.level
    })
  } catch (error) {
    console.error('Daily bonus error:', error)
    res.status(500).json({ error: 'Failed to claim bonus' })
  }
}

exports.getDailyBonusStatus = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId)
    
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    
    const canClaim = canClaimDailyBonus(user.lastDailyBonus)
    const bonus = getDailyBonus(user.level)
    
    let nextClaimTime = null
    if (!canClaim && user.lastDailyBonus) {
      nextClaimTime = new Date(user.lastDailyBonus)
      nextClaimTime.setHours(nextClaimTime.getHours() + 24)
    }
    
    res.json({
      canClaim,
      bonus,
      level: user.level,
      nextClaimTime
    })
  } catch (error) {
    console.error('Bonus status error:', error)
    res.status(500).json({ error: 'Failed to get bonus status' })
  }
}
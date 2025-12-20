// XP and Level System

// Calculate XP needed for a level (exponential scaling)
function getXPForLevel(level) {
  if (level >= 1000) return Infinity
  // Exponential formula: base XP * (level ^ 1.5)
  return Math.floor(100 * Math.pow(level, 1.5))
}

// Calculate XP gained from a bet (1 XP per coin wagered)
function getXPFromBet(betAmount) {
  return Math.floor(betAmount)
}

// Check if user leveled up and return new level/XP
function checkLevelUp(currentLevel, currentXP) {
  let level = currentLevel
  let xp = currentXP
  let levelsGained = []
  
  while (level < 1000) {
    const xpNeeded = getXPForLevel(level)
    if (xp >= xpNeeded) {
      xp -= xpNeeded
      level++
      levelsGained.push(level)
    } else {
      break
    }
  }
  
  return {
    level,
    xp,
    levelsGained,
    leveledUp: levelsGained.length > 0
  }
}

// Get daily bonus based on level
function getDailyBonus(level) {
  if (level >= 1000) {
    return 10000 // VIP bonus
  } else if (level >= 500) {
    return 5000
  } else if (level >= 250) {
    return 2500
  } else if (level >= 100) {
    return 1000
  } else if (level >= 50) {
    return 500
  } else if (level >= 25) {
    return 250
  } else {
    return 100
  }
}

// Check if user can claim daily bonus (24 hours)
function canClaimDailyBonus(lastClaimDate) {
  if (!lastClaimDate) return true
  const now = new Date()
  const diff = now - new Date(lastClaimDate)
  const hours = diff / (1000 * 60 * 60)
  return hours >= 24
}

// Get level tier name
function getLevelTier(level) {
  if (level >= 1000) return 'VIP Legend'
  if (level >= 500) return 'Diamond'
  if (level >= 250) return 'Platinum'
  if (level >= 100) return 'Gold'
  if (level >= 50) return 'Silver'
  if (level >= 25) return 'Bronze'
  return 'Beginner'
}

// Get level badge emoji
function getLevelBadge(level) {
  if (level >= 1000) return '👑'
  if (level >= 500) return '💎'
  if (level >= 250) return '🏆'
  if (level >= 100) return '🥇'
  if (level >= 50) return '🥈'
  if (level >= 25) return '🥉'
  return '🎮'
}

module.exports = {
  getXPForLevel,
  getXPFromBet,
  checkLevelUp,
  getDailyBonus,
  canClaimDailyBonus,
  getLevelTier,
  getLevelBadge
}
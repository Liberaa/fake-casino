const User = require('../models/User')
const { getXPFromBet, checkLevelUp, getXPForLevel } = require('../utils/levelSystem')

module.exports = (io) => {
  io.on('connection', (socket) => {
    
    // When user places a bet, award XP
    socket.on('bet:placed', async (data) => {
      try {
        const { userId, betAmount } = data
        const user = await User.findById(userId)
        
        if (!user) return
        
        // Award XP (1 XP per coin wagered)
        const xpGained = getXPFromBet(betAmount)
        user.xp += xpGained
        
        // Check for level up
        const levelResult = checkLevelUp(user.level, user.xp)
        
        if (levelResult.leveledUp) {
          user.level = levelResult.level
          user.xp = levelResult.xp
          await user.save()
          
          // Emit level up to all users
          io.emit('level:up', {
            userId: user._id,
            username: user.username,
            level: user.level,
            levelsGained: levelResult.levelsGained
          })
          
          // Send XP update to the user
          socket.emit('xp:updated', {
            xp: user.xp,
            level: user.level,
            xpNeeded: getXPForLevel(user.level),
            xpGained
          })
        } else {
          await user.save()
          
          // Just send XP update
          socket.emit('xp:updated', {
            xp: user.xp,
            level: user.level,
            xpNeeded: getXPForLevel(user.level),
            xpGained
          })
        }
      } catch (error) {
        console.error('Level socket error:', error)
      }
    })
    
  })
}
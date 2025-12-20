const User = require('../models/User')
const Game = require('../models/Game')

exports.getLeaderboard = async (req, res) => {
  try {
    const type = req.query.type || 'credits'
    let leaderboard = []
    
    if (type === 'credits') {
      // Top balances
      leaderboard = await User.find()
        .select('username credits totalWins totalLosses')
        .sort({ credits: -1 })
        .limit(10)
        
    } else if (type === 'wagered') {
      // Total wagered
      leaderboard = await User.find()
        .select('username totalWagered totalWins totalLosses')
        .sort({ totalWagered: -1 })
        .limit(10)
      
      // Add totalGames calculation
      leaderboard = leaderboard.map(user => ({
        username: user.username,
        totalWagered: user.totalWagered || 0,
        totalWins: user.totalWins,
        totalLosses: user.totalLosses,
        totalGames: user.totalWins + user.totalLosses
      }))
      
    } else if (type === 'bigwin') {
      // Biggest single win
      leaderboard = await User.find()
        .select('username biggestWin createdAt')
        .sort({ biggestWin: -1 })
        .limit(10)
      
      // Get game type for biggest win
      const enriched = []
      for (const user of leaderboard) {
        const bigWinGame = await Game.findOne({ 
          user: user._id, 
          winAmount: user.biggestWin 
        }).sort({ createdAt: -1 })
        
        enriched.push({
          username: user.username,
          biggestWin: user.biggestWin || 0,
          gameType: bigWinGame ? bigWinGame.gameType : 'N/A',
          date: bigWinGame ? bigWinGame.createdAt : user.createdAt
        })
      }
      leaderboard = enriched
      
    } else if (type === 'level') {
      // Highest level players
      leaderboard = await User.find()
        .select('username level xp')
        .sort({ level: -1, xp: -1 })
        .limit(10)
      
      leaderboard = leaderboard.map(user => ({
        username: user.username,
        level: user.level || 1,
        xp: user.xp || 0
      }))
    }

    res.json({ success: true, leaderboard })
  } catch (error) {
    console.error('Leaderboard error:', error)
    res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }
}
const User = require('../models/User')
const Game = require('../models/Game')

// Store game state
let gameState = {
  timer: 10.00,
  canBet: true,
  roundActive: false,
  bets: [], // All bets for current round
  history: [] // Last 100 results
}

let timerInterval = null

// Start the game loop
function startGameLoop(io) {
  // Reset and start timer
  gameState.timer = 10.00
  gameState.canBet = true
  gameState.roundActive = true
  gameState.bets = []
  
  // Broadcast new round started
  io.emit('roulette:roundStarted')
  
  // Clear previous bets display
  io.emit('roulette:clearBets')
  
  // Start countdown
  if (timerInterval) clearInterval(timerInterval)
  
  timerInterval = setInterval(() => {
    gameState.timer -= 0.01
    
    // Broadcast timer update to all clients
    io.emit('roulette:timerUpdate', { timer: Math.max(0, gameState.timer).toFixed(2) })
    
    if (gameState.timer <= 0) {
      gameState.timer = 0
      gameState.canBet = false
      clearInterval(timerInterval)
      
      // Execute round after a brief delay
      setTimeout(() => executeRound(io), 100)
    }
  }, 10)
}

// Execute the round
async function executeRound(io) {
  gameState.roundActive = false
  
  // Generate winning symbol
  const rand = Math.random()
  let winningSymbol
  if (rand < 0.45) winningSymbol = '🌙' // 45% moon
  else if (rand < 0.90) winningSymbol = '⭐' // 45% star  
  else winningSymbol = '☀️' // 10% sun
  
  // Add to history
  gameState.history.push(winningSymbol)
  if (gameState.history.length > 100) {
    gameState.history.shift()
  }
  
  // Tell all clients to start spinning animation
  io.emit('roulette:spin', { winningSymbol })
  
  // Process all bets
  const results = new Map() // userId -> {totalWinnings, credits, username}
  
  for (const bet of gameState.bets) {
    const user = await User.findById(bet.userId)
    if (!user) continue
    
    let won = false
    let winAmount = 0
    
    if (bet.type === 'moon' && winningSymbol === '🌙') {
      won = true
      winAmount = bet.amount * 2
    } else if (bet.type === 'star' && winningSymbol === '⭐') {
      won = true
      winAmount = bet.amount * 2
    } else if (bet.type === 'sun' && winningSymbol === '☀️') {
      won = true
      winAmount = bet.amount * 14
    }
    
    if (!results.has(bet.userId)) {
      results.set(bet.userId, {
        totalWinnings: 0,
        credits: user.credits,
        username: bet.username
      })
    }
    
    const userResult = results.get(bet.userId)
    if (won) {
      userResult.totalWinnings += winAmount
    }
    
    // Save game record
    const game = new Game({
      user: bet.userId,
      gameType: 'roulette',
      betAmount: bet.amount,
      result: won ? 'win' : 'loss',
      winAmount: won ? winAmount : 0,
      details: { symbol: winningSymbol, betType: bet.type }
    })
    await game.save()
  }
  
  // Update user credits
  for (const [userId, result] of results.entries()) {
    const user = await User.findById(userId)
    if (!user) continue
    
    if (result.totalWinnings > 0) {
      user.credits += result.totalWinnings
      user.totalWins++
      
      // Update biggest win if this is larger
      if (result.totalWinnings > user.biggestWin) {
        user.biggestWin = result.totalWinnings
      }
    } else {
      user.totalLosses++
    }
    
    // Track total wagered (sum of all bets this round for this user)
    const userBetsThisRound = gameState.bets.filter(b => b.userId === userId)
    const totalBet = userBetsThisRound.reduce((sum, bet) => sum + bet.amount, 0)
    user.totalWagered = (user.totalWagered || 0) + totalBet
    
    await user.save()
    
    result.credits = user.credits
  }
  
  // Broadcast results after animation completes (3.2 seconds)
  setTimeout(() => {
    io.emit('roulette:result', {
      winningSymbol,
      results: Array.from(results.entries()).map(([userId, data]) => ({
        userId,
        ...data
      })),
      history: gameState.history
    })
    
    // Start new round after 3 seconds
    setTimeout(() => startGameLoop(io), 3000)
  }, 3200)
}

module.exports = (io) => {
  // Start the first round when server starts
  setTimeout(() => startGameLoop(io), 1000)
  
  io.on('connection', (socket) => {
    console.log('Player connected to roulette')
    
    // Send current game state
    socket.emit('roulette:init', {
      timer: gameState.timer.toFixed(2),
      canBet: gameState.canBet,
      history: gameState.history
    })
    
    // Player places a bet
    socket.on('roulette:placeBet', async (data) => {
      const { userId, username, type, amount } = data
      
      if (!gameState.canBet) {
        socket.emit('roulette:error', { message: 'Betting closed' })
        return
      }
      
      // Check user's bets in current round
      const userBetsCount = gameState.bets.filter(b => b.userId === userId).length
      if (userBetsCount >= 2) {
        socket.emit('roulette:error', { message: 'Maximum 2 bets per round' })
        return
      }
      
      // Verify user has credits
      const user = await User.findById(userId)
      if (!user || user.credits < amount) {
        socket.emit('roulette:error', { message: 'Insufficient credits' })
        return
      }
      
      // Deduct credits immediately
      user.credits -= amount
      await user.save()
      
      // Add bet to current round
      gameState.bets.push({ userId, username, type, amount })
      
      // Broadcast bet to all players
      io.emit('roulette:betPlaced', {
        username,
        type,
        amount
      })
      
      // Confirm to player
      socket.emit('roulette:betAccepted', { credits: user.credits })
    })
  })
}
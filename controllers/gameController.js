const User = require('../models/User')
const Game = require('../models/Game')
const crypto = require('crypto')

// Store active games in memory
const activeMinesGames = new Map()
const activeBlackjackGames = new Map()

// Server-side RNG with seed for verification
function getRandomResult(seed) {
  const hash = crypto.createHash('sha256').update(seed).digest('hex')
  return parseInt(hash.substring(0, 8), 16) / 0xffffffff
}

// ===== MINES GAME =====
exports.startMines = async (req, res) => {
  try {
    const { bet, mines } = req.body
    const userId = req.session.userId

    if (!bet || bet <= 0) {
      return res.status(400).json({ error: 'Invalid bet' })
    }

    if (!mines || mines < 1 || mines > 24) {
      return res.status(400).json({ error: 'Invalid mines count' })
    }

    // Check if user already has active game
    if (activeMinesGames.has(userId)) {
      return res.status(400).json({ error: 'Finish current game first' })
    }

    // Get user and check credits
    const user = await User.findById(userId)
    if (!user || user.credits < bet) {
      return res.status(400).json({ error: 'Insufficient credits' })
    }

    // Deduct bet
    user.credits -= bet
    await user.save()

    // Generate mine positions using server seed
    const serverSeed = crypto.randomBytes(32).toString('hex')
    const grid = Array(25).fill(false)
    const minePositions = new Set()
    
    // Place mines randomly using seed
    let seedCounter = 0
    while (minePositions.size < mines) {
      const hash = crypto.createHash('sha256')
        .update(serverSeed + seedCounter)
        .digest('hex')
      const position = parseInt(hash.substring(0, 8), 16) % 25
      minePositions.add(position)
      seedCounter++
    }
    
    minePositions.forEach(pos => {
      grid[pos] = true
    })

    // Calculate multipliers
    const safeSpots = 25 - mines
    const multipliers = []
    let currentMultiplier = 1
    
    for (let i = 0; i < safeSpots; i++) {
      currentMultiplier *= (safeSpots - i) / (25 - mines - i)
      multipliers.push(parseFloat(currentMultiplier.toFixed(2)))
    }

    // Store game state
    const gameState = {
      userId,
      betAmount: bet,
      mineCount: mines,
      grid,
      revealed: [],
      multipliers,
      currentMultiplier: 1,
      gameOver: false,
      serverSeed,
      cashoutAvailable: false
    }
    
    activeMinesGames.set(userId, gameState)

    res.json({
      gridSize: 25,
      balance: user.credits,
      mineCount: mines,
      multipliers: multipliers.slice(0, 5)
    })
  } catch (error) {
    console.error('Start mines error:', error)
    res.status(500).json({ error: 'Failed to start game' })
  }
}

exports.clickMines = async (req, res) => {
  try {
    const { tileIndex } = req.body
    const userId = req.session.userId

    // Validate tile
    if (tileIndex === undefined || tileIndex < 0 || tileIndex > 24) {
      return res.status(400).json({ error: 'Invalid tile' })
    }

    // Get game state
    const gameState = activeMinesGames.get(userId)
    if (!gameState) {
      return res.status(400).json({ error: 'No active game' })
    }

    if (gameState.gameOver) {
      return res.status(400).json({ error: 'Game already ended' })
    }

    if (gameState.revealed.includes(tileIndex)) {
      return res.status(400).json({ error: 'Tile already revealed' })
    }

    // Check if mine
    const hitMine = gameState.grid[tileIndex]
    gameState.revealed.push(tileIndex)

    if (hitMine) {
      // Game over - lost
      gameState.gameOver = true
      
      // Update user stats
      const user = await User.findById(userId)
      user.totalLosses++
      user.totalWagered = (user.totalWagered || 0) + gameState.betAmount
      await user.save()

      // Save game record
      await Game.create({
        user: userId,
        gameType: 'mines',
        betAmount: gameState.betAmount,
        result: 'loss',
        winAmount: 0,
        details: {
          mineCount: gameState.mineCount,
          tilesRevealed: gameState.revealed.length,
          serverSeed: gameState.serverSeed,
          grid: gameState.grid,
          verificationHash: crypto.createHash('sha256').update(gameState.serverSeed).digest('hex')
        }
      })

      // Clean up
      activeMinesGames.delete(userId)

      res.json({
        hitMine: true,
        multiplier: 0,
        balance: user.credits,
        gameOver: true,
        grid: gameState.grid, // Reveal all mines
        revealed: gameState.revealed
      })
    } else {
      // Safe tile
      const safeRevealed = gameState.revealed.filter(idx => !gameState.grid[idx]).length
      gameState.currentMultiplier = gameState.multipliers[safeRevealed - 1] || 1
      gameState.cashoutAvailable = true
      
      const potentialWin = Math.floor(gameState.betAmount * gameState.currentMultiplier)
      const nextMultiplier = gameState.multipliers[safeRevealed] || null

      res.json({
        hitMine: false,
        multiplier: gameState.currentMultiplier,
        balance: (await User.findById(userId)).credits,
        tileIndex,
        potentialWin,
        tilesRevealed: safeRevealed,
        nextMultiplier,
        revealed: gameState.revealed
      })
    }
  } catch (error) {
    console.error('Click mines error:', error)
    res.status(500).json({ error: 'Failed to reveal tile' })
  }
}

exports.cashoutMines = async (req, res) => {
  try {
    const userId = req.session.userId
    
    const gameState = activeMinesGames.get(userId)
    if (!gameState) {
      return res.status(400).json({ error: 'No active game' })
    }
    
    if (!gameState.cashoutAvailable) {
      return res.status(400).json({ error: 'Must reveal at least one safe tile first' })
    }

    if (gameState.gameOver) {
      return res.status(400).json({ error: 'Game already ended' })
    }
    
    const winAmount = Math.floor(gameState.betAmount * gameState.currentMultiplier)
    
    // Update user credits
    const user = await User.findById(userId)
    user.credits += winAmount
    user.totalWins++
    user.totalWagered = (user.totalWagered || 0) + gameState.betAmount
    
    if (winAmount > user.biggestWin) {
      user.biggestWin = winAmount
    }
    
    await user.save()
    
    // Save game record
    await Game.create({
      user: userId,
      gameType: 'mines',
      betAmount: gameState.betAmount,
      result: 'win',
      winAmount,
      details: {
        mineCount: gameState.mineCount,
        tilesRevealed: gameState.revealed.length,
        multiplier: gameState.currentMultiplier,
        serverSeed: gameState.serverSeed,
        grid: gameState.grid,
        verificationHash: crypto.createHash('sha256').update(gameState.serverSeed).digest('hex')
      }
    })
    
    // Clear game state
    activeMinesGames.delete(userId)
    
    res.json({
      winAmount,
      balance: user.credits,
      grid: gameState.grid, // Show all mines after cashout
      revealed: gameState.revealed
    })
  } catch (error) {
    console.error('Cashout mines error:', error)
    res.status(500).json({ error: 'Failed to cashout' })
  }
}

// ===== CRAPS GAME =====
// ===== CRAPS GAME - FIXED FOR MULTIPLE BETS =====
exports.playCraps = async (req, res) => {
  try {
    const { bets, point } = req.body
    const user = await User.findById(req.session.userId)

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    // Validate all bets
    let totalBetAmount = 0
    const validBets = [
      'passLine', 'dontPass', 'come', 'dontCome', 'field',
      'any7', 'anyCraps', 'snake', 'ace', 'yo', 'boxcars',
      'hard4', 'hard6', 'hard8', 'hard10',
      'place4', 'place5', 'place6', 'place8', 'place9', 'place10'
    ]

    // Handle both single bet and multiple bets
    let betArray = []
    if (req.body.betAmount && req.body.betType) {
      betArray = [{betType: req.body.betType, amount: req.body.betAmount}]
    } else if (bets && Array.isArray(bets)) {
      betArray = bets
    } else {
      return res.status(400).json({ error: 'Invalid bet format' })
    }

    // Validate each bet
    for (const bet of betArray) {
      if (!bet.amount || bet.amount <= 0) {
        return res.status(400).json({ error: 'Invalid bet amount' })
      }
      if (!validBets.includes(bet.betType)) {
        return res.status(400).json({ error: `Invalid bet type: ${bet.betType}` })
      }
      totalBetAmount += bet.amount
    }

    if (totalBetAmount > user.credits) {
      return res.status(400).json({ error: 'Insufficient credits' })
    }

    // Deduct total bet amount
    user.credits -= totalBetAmount

    // Roll dice ONCE for all bets
    const serverSeed = crypto.randomBytes(32).toString('hex')
    const random1 = getRandomResult(serverSeed + '1')
    const random2 = getRandomResult(serverSeed + '2')
    const die1 = Math.floor(random1 * 6) + 1
    const die2 = Math.floor(random2 * 6) + 1
    const total = die1 + die2
    const isHard = die1 === die2

    let totalWinAmount = 0
    let newPoint = point
    let gameOver = false
    const betResults = []

    // Process each bet against the SAME dice roll
    for (const bet of betArray) {
      let winAmount = 0
      let result = 'loss'

      switch (bet.betType) {
        case 'passLine':
          if (!point) {
            // Come out roll
            if (total === 7 || total === 11) {
              winAmount = bet.amount * 2
              result = 'win'
              gameOver = true
            } else if (total === 2 || total === 3 || total === 12) {
              result = 'loss'
              gameOver = true
            } else {
              newPoint = total
              result = 'pending' // Bet stays active
            }
          } else {
            // Point phase
            if (total === point) {
              winAmount = bet.amount * 2
              result = 'win'
              gameOver = true
              newPoint = null
            } else if (total === 7) {
              result = 'loss'
              gameOver = true
              newPoint = null
            } else {
              result = 'pending' // Bet stays active
            }
          }
          break

        case 'dontPass':
          if (!point) {
            // Come out roll
            if (total === 7 || total === 11) {
              result = 'loss'
              gameOver = true
            } else if (total === 2 || total === 3) {
              winAmount = bet.amount * 2
              result = 'win'
              gameOver = true
            } else if (total === 12) {
              winAmount = bet.amount // Push
              result = 'push'
              gameOver = true
            } else {
              newPoint = total
              result = 'pending'
            }
          } else {
            // Point phase
            if (total === 7) {
              winAmount = bet.amount * 2
              result = 'win'
              gameOver = true
              newPoint = null
            } else if (total === point) {
              result = 'loss'
              gameOver = true
              newPoint = null
            } else {
              result = 'pending'
            }
          }
          break

        case 'field':
          if ([2, 3, 4, 9, 10, 11, 12].includes(total)) {
            if (total === 2 || total === 12) {
              winAmount = bet.amount * 3 // 2:1 payout
            } else {
              winAmount = bet.amount * 2
            }
            result = 'win'
          }
          break

        case 'any7':
          if (total === 7) {
            winAmount = bet.amount * 5 // 4:1 payout
            result = 'win'
          }
          break

        case 'anyCraps':
          if ([2, 3, 12].includes(total)) {
            winAmount = bet.amount * 8 // 7:1 payout
            result = 'win'
          }
          break

        case 'snake': // Snake Eyes (2)
          if (total === 2) {
            winAmount = bet.amount * 31 // 30:1 payout
            result = 'win'
          }
          break

        case 'ace': // Ace Deuce (3)
          if (total === 3) {
            winAmount = bet.amount * 16 // 15:1 payout
            result = 'win'
          }
          break

        case 'yo': // Yo-leven (11)
          if (total === 11) {
            winAmount = bet.amount * 16 // 15:1 payout
            result = 'win'
          }
          break

        case 'boxcars': // Boxcars (12)
          if (total === 12) {
            winAmount = bet.amount * 31 // 30:1 payout
            result = 'win'
          }
          break

        case 'hard4':
          if (total === 4 && isHard) {
            winAmount = bet.amount * 8 // 7:1 payout
            result = 'win'
          } else if (total === 7 || (total === 4 && !isHard)) {
            result = 'loss'
          } else {
            result = 'pending'
          }
          break

        case 'hard6':
          if (total === 6 && isHard) {
            winAmount = bet.amount * 10 // 9:1 payout
            result = 'win'
          } else if (total === 7 || (total === 6 && !isHard)) {
            result = 'loss'
          } else {
            result = 'pending'
          }
          break

        case 'hard8':
          if (total === 8 && isHard) {
            winAmount = bet.amount * 10 // 9:1 payout
            result = 'win'
          } else if (total === 7 || (total === 8 && !isHard)) {
            result = 'loss'
          } else {
            result = 'pending'
          }
          break

        case 'hard10':
          if (total === 10 && isHard) {
            winAmount = bet.amount * 8 // 7:1 payout
            result = 'win'
          } else if (total === 7 || (total === 10 && !isHard)) {
            result = 'loss'
          } else {
            result = 'pending'
          }
          break

        case 'place4':
          if (point) { // Only valid after point is established
            if (total === 4) {
              winAmount = Math.floor(bet.amount * 9 / 5) + bet.amount // Return bet + winnings
              result = 'win'
            } else if (total === 7) {
              result = 'loss'
            } else {
              result = 'pending'
            }
          } else {
            result = 'pending' // Can't win/lose place bets on come out
          }
          break

        case 'place5':
          if (point) {
            if (total === 5) {
              winAmount = Math.floor(bet.amount * 7 / 5) + bet.amount
              result = 'win'
            } else if (total === 7) {
              result = 'loss'
            } else {
              result = 'pending'
            }
          } else {
            result = 'pending'
          }
          break

        case 'place6':
          if (point) {
            if (total === 6) {
              winAmount = Math.floor(bet.amount * 7 / 6) + bet.amount
              result = 'win'
            } else if (total === 7) {
              result = 'loss'
            } else {
              result = 'pending'
            }
          } else {
            result = 'pending'
          }
          break

        case 'place8':
          if (point) {
            if (total === 8) {
              winAmount = Math.floor(bet.amount * 7 / 6) + bet.amount
              result = 'win'
            } else if (total === 7) {
              result = 'loss'
            } else {
              result = 'pending'
            }
          } else {
            result = 'pending'
          }
          break

        case 'place9':
          if (point) {
            if (total === 9) {
              winAmount = Math.floor(bet.amount * 7 / 5) + bet.amount
              result = 'win'
            } else if (total === 7) {
              result = 'loss'
            } else {
              result = 'pending'
            }
          } else {
            result = 'pending'
          }
          break

        case 'place10':
          if (point) {
            if (total === 10) {
              winAmount = Math.floor(bet.amount * 9 / 5) + bet.amount
              result = 'win'
            } else if (total === 7) {
              result = 'loss'
            } else {
              result = 'pending'
            }
          } else {
            result = 'pending'
          }
          break

        case 'come':
          if (total === 7 || total === 11) {
            winAmount = bet.amount * 2
            result = 'win'
          } else if (total === 2 || total === 3 || total === 12) {
            result = 'loss'
          } else {
            result = 'pending' // Would establish a come point
          }
          break

        case 'dontCome':
          if (total === 7 || total === 11) {
            result = 'loss'
          } else if (total === 2 || total === 3) {
            winAmount = bet.amount * 2
            result = 'win'
          } else if (total === 12) {
            winAmount = bet.amount // Push
            result = 'push'
          } else {
            result = 'pending'
          }
          break
      }

      totalWinAmount += winAmount
      betResults.push({
        betType: bet.betType,
        amount: bet.amount,
        winAmount,
        result
      })
    }

    // Update user balance
    user.credits += totalWinAmount
    user.totalWagered = (user.totalWagered || 0) + totalBetAmount

    const netResult = totalWinAmount - totalBetAmount
    if (netResult > 0) {
      user.totalWins++
      if (netResult > (user.biggestWin || 0)) {
        user.biggestWin = netResult
      }
    } else if (netResult < 0) {
      user.totalLosses++
    }

    await user.save()

    // Save game record
    const game = new Game({
      user: user._id,
      gameType: 'craps',
      betAmount: totalBetAmount,
      result: netResult >= 0 ? 'win' : 'loss',
      winAmount: netResult > 0 ? netResult : 0,
      details: {
        die1,
        die2,
        total,
        isHard,
        bets: betResults,
        point,
        newPoint,
        serverSeed,
        verificationHash: crypto.createHash('sha256').update(serverSeed).digest('hex')
      }
    })
    await game.save()

    res.json({
      success: true,
      die1,
      die2,
      total,
      point: newPoint,
      gameOver,
      totalWinAmount,
      betResults,
      credits: user.credits
    })
  } catch (error) {
    console.error('Craps error:', error)
    res.status(500).json({ error: 'Game failed' })
  }
}

// ===== SLOTS GAME =====
exports.playSlots = async (req, res) => {
  try {
    const { betAmount } = req.body
    const user = await User.findById(req.session.userId)

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    if (!betAmount || betAmount <= 0) {
      return res.status(400).json({ error: 'Invalid bet amount' })
    }

    if (user.credits < betAmount) {
      return res.status(400).json({ error: 'Insufficient credits' })
    }

    // Deduct bet
    user.credits -= betAmount

    // Generate server-side seed
    const serverSeed = crypto.randomBytes(32).toString('hex')
    const clientSeed = Date.now().toString()
    const combinedSeed = serverSeed + clientSeed + user._id
    
    // Server determines outcome
    const random = getRandomResult(combinedSeed)
    
    // Slot payouts (server-controlled)
    let winAmount = 0
    let symbols = []
    
    // Generate 5 symbols
    for (let i = 0; i < 5; i++) {
      const reelRandom = getRandomResult(combinedSeed + i)
      let symbol
      if (reelRandom < 0.4) symbol = '🍒'
      else if (reelRandom < 0.6) symbol = '🍋'
      else if (reelRandom < 0.75) symbol = '🍊'
      else if (reelRandom < 0.85) symbol = '🍇'
      else if (reelRandom < 0.94) symbol = '💎'
      else if (reelRandom < 0.99) symbol = '7️⃣'
      else symbol = '💰'
      symbols.push(symbol)
    }
    
    // Calculate wins based on matching symbols
    const symbolCounts = {}
    symbols.forEach(s => symbolCounts[s] = (symbolCounts[s] || 0) + 1)
    
    // Payout multipliers
    const payouts = {
      '🍒': { 3: 5, 4: 20, 5: 100 },
      '🍋': { 3: 10, 4: 40, 5: 200 },
      '🍊': { 3: 15, 4: 60, 5: 300 },
      '🍇': { 3: 20, 4: 80, 5: 400 },
      '💎': { 3: 50, 4: 200, 5: 1000 },
      '7️⃣': { 3: 100, 4: 500, 5: 5000 },
      '💰': { 3: 250, 4: 2500, 5: 10000 }
    }
    
    // Find best payout
    for (const [symbol, count] of Object.entries(symbolCounts)) {
      if (count >= 3 && payouts[symbol] && payouts[symbol][count]) {
        const payout = betAmount * payouts[symbol][count]
        if (payout > winAmount) {
          winAmount = payout
        }
      }
    }
    
    // Update user balance
    user.credits += winAmount
    user.totalWagered = (user.totalWagered || 0) + betAmount
    
    if (winAmount > 0) {
      user.totalWins++
      if (winAmount > (user.biggestWin || 0)) {
        user.biggestWin = winAmount
      }
    } else {
      user.totalLosses++
    }
    
    await user.save()
    
    // Save game record
    const game = new Game({
      user: user._id,
      gameType: 'slots',
      betAmount,
      result: winAmount > 0 ? 'win' : 'loss',
      winAmount,
      details: {
        symbols,
        serverSeed,
        clientSeed,
        verificationHash: crypto.createHash('sha256').update(combinedSeed).digest('hex')
      }
    })
    await game.save()
    
    res.json({
      success: true,
      credits: user.credits,
      winAmount,
      symbols,
      gameId: game._id,
      verificationHash: game.details.verificationHash
    })
  } catch (error) {
    console.error('Slots error:', error)
    res.status(500).json({ error: 'Game failed' })
  }
}

// ===== ROULETTE GAME =====
exports.playRoulette = async (req, res) => {
  try {
    const { betAmount, betType, betValue } = req.body
    const user = await User.findById(req.session.userId)

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    if (!betAmount || betAmount <= 0) {
      return res.status(400).json({ error: 'Invalid bet amount' })
    }

    if (user.credits < betAmount) {
      return res.status(400).json({ error: 'Insufficient credits' })
    }

    // Deduct bet
    user.credits -= betAmount

    // Server generates winning number
    const serverSeed = crypto.randomBytes(32).toString('hex')
    const random = getRandomResult(serverSeed + user._id + Date.now())
    const winningNumber = Math.floor(random * 37)
    
    let winAmount = 0
    let result = 'loss'

    // Calculate winnings server-side
    if (betType === 'number' && winningNumber === parseInt(betValue)) {
      winAmount = betAmount * 35
      result = 'win'
    } else if (betType === 'color') {
      const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
      const isRed = redNumbers.includes(winningNumber)
      if ((betValue === 'red' && isRed) || (betValue === 'black' && !isRed && winningNumber !== 0)) {
        winAmount = betAmount * 2
        result = 'win'
      }
    } else if (betType === 'evenOdd') {
      if (winningNumber !== 0 && 
          ((betValue === 'even' && winningNumber % 2 === 0) || 
           (betValue === 'odd' && winningNumber % 2 === 1))) {
        winAmount = betAmount * 2
        result = 'win'
      }
    }

    // Update balance
    user.credits += winAmount
    user.totalWagered = (user.totalWagered || 0) + betAmount
    
    if (result === 'win') {
      user.totalWins++
      if (winAmount > (user.biggestWin || 0)) {
        user.biggestWin = winAmount
      }
    } else {
      user.totalLosses++
    }

    await user.save()

    const game = new Game({
      user: user._id,
      gameType: 'roulette',
      betAmount,
      result,
      winAmount,
      details: { 
        winningNumber, 
        betType, 
        betValue,
        serverSeed,
        verificationHash: crypto.createHash('sha256').update(serverSeed).digest('hex')
      }
    })
    await game.save()

    res.json({ 
      success: true, 
      winningNumber, 
      winAmount, 
      credits: user.credits, 
      result,
      verificationHash: game.details.verificationHash
    })
  } catch (error) {
    console.error('Roulette error:', error)
    res.status(500).json({ error: 'Game failed' })
  }
}

// ===== BLACKJACK GAME =====
exports.playBlackjack = async (req, res) => {
  try {
    const { betAmount, action, gameId } = req.body
    const user = await User.findById(req.session.userId)

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    // For new game
    if (!gameId) {
      if (!betAmount || betAmount <= 0) {
        return res.status(400).json({ error: 'Invalid bet amount' })
      }

      if (user.credits < betAmount) {
        return res.status(400).json({ error: 'Insufficient credits' })
      }

      // Deduct bet
      user.credits -= betAmount
      await user.save()

      // Create deck with server seed
      const serverSeed = crypto.randomBytes(32).toString('hex')
      const deck = createShuffledDeck(serverSeed)
      
      // Deal initial cards
      const playerHand = [deck.pop(), deck.pop()]
      const dealerHand = [deck.pop(), deck.pop()]
      
      // Generate unique game ID
      const newGameId = crypto.randomBytes(16).toString('hex')
      
      // Store game state in memory
      activeBlackjackGames.set(newGameId, {
        userId: user._id.toString(),
        deck,
        playerHand,
        dealerHand,
        betAmount,
        serverSeed
      })
      
      // Check for blackjack
      const playerScore = calculateBlackjackScore(playerHand)
      let gameOver = false
      let result = ''
      let winAmount = 0
      
      if (playerScore === 21) {
        gameOver = true
        const dealerScore = calculateBlackjackScore(dealerHand)
        if (dealerScore === 21) {
          result = 'push'
          winAmount = betAmount
          user.credits += betAmount
        } else {
          result = 'win'
          winAmount = betAmount * 2.5 // Blackjack pays 3:2
          user.credits += winAmount
          user.totalWins++
        }
        await user.save()
        
        // Save completed game
        const game = new Game({
          user: user._id,
          gameType: 'blackjack',
          betAmount,
          result: result === 'push' ? 'loss' : result,
          winAmount,
          details: { playerHand, dealerHand, serverSeed }
        })
        await game.save()
        
        // Clean up
        activeBlackjackGames.delete(newGameId)
      }
      
      res.json({
        success: true,
        gameId: newGameId,
        playerHand,
        dealerHand: gameOver ? dealerHand : [dealerHand[0], 'hidden'],
        playerScore,
        dealerScore: gameOver ? calculateBlackjackScore(dealerHand) : null,
        credits: user.credits,
        gameOver,
        result,
        winAmount
      })
    } else {
      // Continue existing game
      const gameState = activeBlackjackGames.get(gameId)
      
      if (!gameState || gameState.userId !== user._id.toString()) {
        return res.status(400).json({ error: 'Invalid game' })
      }
      
      let { deck, playerHand, dealerHand, betAmount, serverSeed } = gameState
      
      if (action === 'hit') {
        playerHand.push(deck.pop())
        gameState.playerHand = playerHand
        activeBlackjackGames.set(gameId, gameState)
      }
      
      let playerScore = calculateBlackjackScore(playerHand)
      let dealerScore = calculateBlackjackScore(dealerHand)
      let gameOver = false
      let winAmount = 0
      let result = 'loss'
      
      if (playerScore > 21) {
        // Player busts
        gameOver = true
        result = 'loss'
        user.totalLosses++
      } else if (action === 'stand' || playerScore === 21) {
        // Dealer plays
        while (dealerScore < 17) {
          dealerHand.push(deck.pop())
          dealerScore = calculateBlackjackScore(dealerHand)
        }
        
        gameState.dealerHand = dealerHand
        gameOver = true
        
        if (dealerScore > 21) {
          winAmount = betAmount * 2
          result = 'win'
          user.credits += winAmount
          user.totalWins++
        } else if (playerScore > dealerScore) {
          winAmount = betAmount * 2
          result = 'win'
          user.credits += winAmount
          user.totalWins++
        } else if (playerScore === dealerScore) {
          winAmount = betAmount
          result = 'push'
          user.credits += betAmount
        } else {
          result = 'loss'
          user.totalLosses++
        }
      }
      
      if (gameOver) {
        user.totalWagered = (user.totalWagered || 0) + betAmount
        if (winAmount > (user.biggestWin || 0)) {
          user.biggestWin = winAmount
        }
        await user.save()
        
        // Save completed game
        const game = new Game({
          user: user._id,
          gameType: 'blackjack',
          betAmount,
          result: result === 'push' ? 'loss' : result === 'win' ? 'win' : 'loss',
          winAmount: result === 'win' ? winAmount : 0,
          details: {
            playerHand,
            dealerHand,
            serverSeed,
            verificationHash: crypto.createHash('sha256').update(serverSeed).digest('hex')
          }
        })
        await game.save()
        
        // Clean up
        activeBlackjackGames.delete(gameId)
      }
      
      res.json({
        success: true,
        playerHand,
        dealerHand: gameOver ? dealerHand : [dealerHand[0], 'hidden'],
        playerScore,
        dealerScore: gameOver ? dealerScore : null,
        winAmount,
        credits: user.credits,
        result,
        gameOver
      })
    }
  } catch (error) {
    console.error('Blackjack error:', error)
    res.status(500).json({ error: 'Game failed' })
  }
}

// ===== DICE GAME =====
exports.playDice = async (req, res) => {
  try {
    const { betAmount, target, mode } = req.body
    const user = await User.findById(req.session.userId)

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    // Validate inputs
    if (!betAmount || betAmount <= 0 || betAmount > user.credits) {
      return res.status(400).json({ error: 'Invalid bet amount' })
    }

    if (!target || target < 2 || target > 98) {
      return res.status(400).json({ error: 'Invalid target (must be 2-98)' })
    }

    if (!['under', 'over'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' })
    }

    // Deduct bet
    user.credits -= betAmount

    // Server generates roll
    const serverSeed = crypto.randomBytes(32).toString('hex')
    const clientSeed = Date.now().toString()
    const combinedSeed = serverSeed + clientSeed + user._id
    const random = getRandomResult(combinedSeed)
    const roll = Math.floor(random * 100) + 1

    // Calculate win server-side
    let win = false
    if (mode === 'under') {
      win = roll < target
    } else {
      win = roll > target
    }

    // Calculate multiplier with house edge
    let multiplier
    const houseEdge = 0.01 // 1% house edge
    if (mode === 'under') {
      multiplier = (100 - 100 * houseEdge) / target
    } else {
      multiplier = (100 - 100 * houseEdge) / (100 - target)
    }

    // Cap multiplier
    const MAX_MULTIPLIER = 99
    const MAX_WIN = 1000000
    multiplier = Math.min(multiplier, MAX_MULTIPLIER)

    let winAmount = win ? Math.floor(betAmount * multiplier) : 0
    winAmount = Math.min(winAmount, MAX_WIN)

    // Update user
    user.credits += winAmount
    user.totalWagered = (user.totalWagered || 0) + betAmount

    if (win) {
      user.totalWins++
      if (winAmount > (user.biggestWin || 0)) {
        user.biggestWin = winAmount
      }
    } else {
      user.totalLosses++
    }

    await user.save()

    // Save game with verification
    const game = new Game({
      user: user._id,
      gameType: 'dice',
      betAmount,
      result: win ? 'win' : 'loss',
      winAmount,
      details: {
        roll,
        target,
        mode,
        multiplier: parseFloat(multiplier.toFixed(4)),
        serverSeed,
        clientSeed,
        verificationHash: crypto.createHash('sha256').update(combinedSeed).digest('hex')
      }
    })
    await game.save()

    res.json({
      success: true,
      roll,
      target,
      mode,
      win,
      multiplier: parseFloat(multiplier.toFixed(4)),
      winAmount,
      credits: user.credits,
      verificationHash: game.details.verificationHash
    })
  } catch (error) {
    console.error('Dice error:', error)
    res.status(500).json({ error: 'Game failed' })
  }
}

// ===== HELPER FUNCTIONS =====
function createShuffledDeck(seed) {
  const suits = ['♠', '♥', '♦', '♣']
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
  const deck = []
  
  suits.forEach(suit => {
    values.forEach(value => {
      deck.push(value + suit)
    })
  })
  
  // Seeded shuffle
  let currentIndex = deck.length
  let randomIndex
  
  while (currentIndex !== 0) {
    const hash = crypto.createHash('sha256').update(seed + currentIndex).digest('hex')
    randomIndex = parseInt(hash.substring(0, 8), 16) % currentIndex
    currentIndex--
    
    [deck[currentIndex], deck[randomIndex]] = [deck[randomIndex], deck[currentIndex]]
  }
  
  return deck
}

function calculateBlackjackScore(hand) {
  let score = 0
  let aces = 0
  
  for (let card of hand) {
    const value = card.slice(0, -1)
    if (value === 'A') {
      aces++
      score += 11
    } else if (['J', 'Q', 'K'].includes(value)) {
      score += 10
    } else {
      score += parseInt(value)
    }
  }
  
  while (score > 21 && aces > 0) {
    score -= 10
    aces--
  }
  
  return score
}

module.exports = {
  startMines: exports.startMines,
  clickMines: exports.clickMines,
  cashoutMines: exports.cashoutMines,
  playCraps: exports.playCraps,
  playSlots: exports.playSlots,
  playRoulette: exports.playRoulette,
  playBlackjack: exports.playBlackjack,
  playDice: exports.playDice
}
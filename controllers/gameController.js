const User = require('../models/User')
const Game = require('../models/Game')
const crypto = require('crypto')

// Server-side RNG with seed for verification
function getRandomResult(seed) {
  const hash = crypto.createHash('sha256').update(seed).digest('hex')
  return parseInt(hash.substring(0, 8), 16) / 0xffffffff
}

exports.startMines = async (req, res) => {
  const { bet, mines } = req.body

  if (!bet || bet <= 0) {
    return res.status(400).json({ error: 'Invalid bet' })
  }

  if (!mines || mines < 1 || mines > 24) {
    return res.status(400).json({ error: 'Invalid mines count' })
  }

  res.json({
    gridSize: 25,
    balance: req.user?.credits ?? 0
  })
}

// =======================
// MINES TEMP STUBS
// =======================

exports.clickMines = async (req, res) => {
  res.json({
    hitMine: false,
    multiplier: 1.25,
    balance: 1000
  })
}

exports.cashoutMines = async (req, res) => {
  res.json({
    winAmount: 50,
    balance: 1050
  })
}

exports.playCraps = async (req, res) => {
  try {
    const { betAmount, betType, point } = req.body
    const user = await User.findById(req.session.userId)

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    if (!betAmount || betAmount <= 0 || betAmount > user.credits) {
      return res.status(400).json({ error: 'Invalid bet amount' })
    }

    const validBets = ['passLine', 'dontPass', 'come', 'dontCome', 'field', 'any7', 'anyCraps']
    if (!validBets.includes(betType)) {
      return res.status(400).json({ error: 'Invalid bet type' })
    }

    // Deduct bet
    user.credits -= betAmount

    // Roll dice
    const serverSeed = crypto.randomBytes(32).toString('hex')
    const random1 = getRandomResult(serverSeed + '1')
    const random2 = getRandomResult(serverSeed + '2')
    const die1 = Math.floor(random1 * 6) + 1
    const die2 = Math.floor(random2 * 6) + 1
    const total = die1 + die2

    let winAmount = 0
    let result = 'loss'
    let newPoint = point
    let gameOver = false

    // Pass Line / Don't Pass logic
    if (betType === 'passLine' || betType === 'dontPass') {
      if (!point) {
        // Come out roll
        if (total === 7 || total === 11) {
          if (betType === 'passLine') {
            winAmount = betAmount * 2
            result = 'win'
          }
          gameOver = true
        } else if (total === 2 || total === 3 || total === 12) {
          if (betType === 'dontPass' && total !== 12) { // 12 is push for don't pass
            winAmount = betAmount * 2
            result = 'win'
          } else if (total === 12 && betType === 'dontPass') {
            winAmount = betAmount // Push - return bet
            result = 'push'
          }
          gameOver = true
        } else {
          // Point established
          newPoint = total
        }
      } else {
        // Point phase
        if (total === point) {
          if (betType === 'passLine') {
            winAmount = betAmount * 2
            result = 'win'
          }
          gameOver = true
        } else if (total === 7) {
          if (betType === 'dontPass') {
            winAmount = betAmount * 2
            result = 'win'
          }
          gameOver = true
        }
      }
    }

    // Field bet
    if (betType === 'field') {
      if ([3, 4, 9, 10, 11].includes(total)) {
        winAmount = betAmount * 2
        result = 'win'
      } else if (total === 2 || total === 12) {
        winAmount = betAmount * 3 // 2:1 payout
        result = 'win'
      }
      gameOver = true
    }

    // Any Seven
    if (betType === 'any7') {
      if (total === 7) {
        winAmount = betAmount * 5 // 4:1 payout
        result = 'win'
      }
      gameOver = true
    }

    // Any Craps
    if (betType === 'anyCraps') {
      if (total === 2 || total === 3 || total === 12) {
        winAmount = betAmount * 8 // 7:1 payout
        result = 'win'
      }
      gameOver = true
    }

    // Come / Don't Come (similar to pass/don't pass but during point phase)
    if (betType === 'come' || betType === 'dontCome') {
      if (total === 7 || total === 11) {
        if (betType === 'come') {
          winAmount = betAmount * 2
          result = 'win'
        }
      } else if (total === 2 || total === 3 || total === 12) {
        if (betType === 'dontCome' && total !== 12) {
          winAmount = betAmount * 2
          result = 'win'
        }
      }
      gameOver = true
    }

    // Update user balance
    user.credits += winAmount
    user.totalWagered = (user.totalWagered || 0) + betAmount

    if (winAmount > 0) {
      user.totalWins++
      if (winAmount > (user.biggestWin || 0)) {
        user.biggestWin = winAmount
      }
    } else if (result === 'loss') {
      user.totalLosses++
    }

    await user.save()

    // Save game if it's over
    if (gameOver) {
      const game = new Game({
        user: user._id,
        gameType: 'craps',
        betAmount,
        result: result === 'push' ? 'loss' : result,
        winAmount: winAmount > betAmount ? winAmount - betAmount : 0,
        details: {
          die1,
          die2,
          total,
          betType,
          point,
          serverSeed,
          verificationHash: crypto.createHash('sha256').update(serverSeed).digest('hex')
        }
      })
      await game.save()
    }

    res.json({
      success: true,
      die1,
      die2,
      total,
      point: newPoint,
      gameOver,
      winAmount,
      result,
      credits: user.credits
    })
  } catch (error) {
    console.error('Craps error:', error)
    res.status(500).json({ error: 'Game failed' })
  }
}



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
    
    // Save game record only with win/loss result
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

// Store active blackjack games in memory
const activeBlackjackGames = new Map()

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
          winAmount = betAmount * 2
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

// Helper functions
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
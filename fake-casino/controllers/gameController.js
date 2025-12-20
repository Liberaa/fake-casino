const User = require('../models/User')
const Game = require('../models/Game')

exports.playSlots = async (req, res) => {
  try {
    const { betAmount, winAmount } = req.body;
    const user = await User.findById(req.session.userId);

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // If winAmount is provided, this is just crediting a win
    if (winAmount !== undefined && winAmount > 0) {
      user.credits += winAmount;
      user.totalWins++;
      user.totalWagered = (user.totalWagered || 0) + (betAmount || 0);
      
      if (winAmount > (user.biggestWin || 0)) {
        user.biggestWin = winAmount;
      }
      
      await user.save();

      const game = new Game({
        user: user._id,
        gameType: 'slots',
        betAmount: betAmount || 0,
        result: 'win',
        winAmount: winAmount,
        details: { megaways: true }
      });
      await game.save();

      return res.json({ 
        success: true, 
        credits: user.credits,
        winAmount: winAmount
      });
    }

    // Otherwise, this is placing a bet
    if (user.credits < betAmount) {
      return res.status(400).json({ error: 'Insufficient credits' });
    }

    user.credits -= betAmount;
    user.totalWagered = (user.totalWagered || 0) + betAmount;
    user.totalLosses++;
    await user.save();

    res.json({ 
      success: true, 
      credits: user.credits,
      betAmount: betAmount
    });
  } catch (error) {
    console.error('Slots error:', error);
    res.status(500).json({ error: 'Game failed' });
  }
};

exports.playRoulette = async (req, res) => {
  try {
    const { betAmount, betType, betValue } = req.body
    const user = await User.findById(req.session.userId)

    if (!user || user.credits < betAmount) {
      return res.status(400).json({ error: 'Insufficient credits' })
    }

    const winningNumber = Math.floor(Math.random() * 37)
    let winAmount = 0
    let result = 'loss'

    if (betType === 'number' && winningNumber === betValue) {
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
      if (winningNumber !== 0 && ((betValue === 'even' && winningNumber % 2 === 0) || (betValue === 'odd' && winningNumber % 2 === 1))) {
        winAmount = betAmount * 2
        result = 'win'
      }
    }

    user.credits = user.credits - betAmount + winAmount
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
      details: { winningNumber, betType, betValue }
    })
    await game.save()

    res.json({ success: true, winningNumber, winAmount, credits: user.credits, result })
  } catch (error) {
    console.error('Roulette error:', error)
    res.status(500).json({ error: 'Game failed' })
  }
}

exports.playBlackjack = async (req, res) => {
  try {
    const { betAmount, action, playerHand, dealerHand } = req.body
    const user = await User.findById(req.session.userId)

    if (!user || user.credits < betAmount) {
      return res.status(400).json({ error: 'Insufficient credits' })
    }

    // Full deck with suits for card images
    const suits = ['♠', '♥', '♦', '♣']
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const fullDeck = []
    suits.forEach(suit => {
      values.forEach(value => {
        fullDeck.push(value + suit)
      })
    })
    
    const drawCard = () => fullDeck[Math.floor(Math.random() * fullDeck.length)]
    
    const calculateScore = (hand) => {
      let score = 0
      let aces = 0
      for (let card of hand) {
        const value = card.slice(0, -1) // Remove suit symbol
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

    let newPlayerHand = playerHand || [drawCard(), drawCard()]
    let newDealerHand = dealerHand || [drawCard(), drawCard()]

    if (action === 'hit') {
      newPlayerHand.push(drawCard())
    }

    let playerScore = calculateScore(newPlayerHand)
    let dealerScore = calculateScore(newDealerHand)

    if (action === 'stand' || playerScore >= 21) {
      while (dealerScore < 17) {
        newDealerHand.push(drawCard())
        dealerScore = calculateScore(newDealerHand)
      }
    }

    let winAmount = 0
    let result = 'loss'
    let gameOver = false

    if (playerScore > 21) {
      // Player busts
      result = 'loss'
      gameOver = true
    } else if (action === 'stand' || playerScore === 21) {
      gameOver = true
      
      if (dealerScore > 21) {
        // Dealer busts, player wins
        winAmount = betAmount * 2
        result = 'win'
      } else if (playerScore > dealerScore) {
        // Player has higher score
        winAmount = betAmount * 2
        result = 'win'
      } else if (playerScore === dealerScore) {
        // Tie
        winAmount = betAmount
        result = 'push'
      } else {
        // Dealer wins
        result = 'loss'
      }
    }

    if (gameOver) {
      user.credits = user.credits - betAmount + winAmount
      user.totalWagered = (user.totalWagered || 0) + betAmount
      
      if (result === 'win') {
        user.totalWins++
        if (winAmount > (user.biggestWin || 0)) {
          user.biggestWin = winAmount
        }
      } else if (result === 'loss') {
        user.totalLosses++
      }
      
      await user.save()

      const game = new Game({
        user: user._id,
        gameType: 'blackjack',
        betAmount,
        result: result === 'push' ? 'loss' : result,
        winAmount,
        details: { playerHand: newPlayerHand, dealerHand: newDealerHand, playerScore, dealerScore }
      })
      await game.save()
    }

    res.json({
      success: true,
      playerHand: newPlayerHand,
      dealerHand: newDealerHand,
      playerScore,
      dealerScore,
      winAmount,
      credits: user.credits,
      result,
      gameOver
    })
  } catch (error) {
    console.error('Blackjack error:', error)
    res.status(500).json({ error: 'Game failed' })
  }
}

exports.playDice = async (req, res) => {
  try {
    const { betAmount, target, mode } = req.body
    const user = await User.findById(req.session.userId)

    if (
      !user ||
      typeof betAmount !== 'number' ||
      typeof target !== 'number' ||
      !['under', 'over'].includes(mode)
    ) {
      return res.status(400).json({ error: 'Invalid bet data' })
    }

    if (betAmount <= 0) {
      return res.status(400).json({ error: 'Invalid bet amount' })
    }

    if (user.credits < betAmount) {
      return res.status(400).json({ error: 'Insufficient credits' })
    }

    if (target < 1 || target > 99) {
      return res.status(400).json({ error: 'Invalid target' })
    }

    const roll = Math.floor(Math.random() * 100) + 1

    let win = false
    if (mode === 'under') {
      win = roll < target
    } else {
      win = roll > target
    }

    let multiplier
    if (mode === 'under') {
      multiplier = 99 / target
    } else {
      multiplier = 99 / (100 - target)
    }

    const MAX_MULTIPLIER = 99
    const MAX_WIN = 1_000_000

    multiplier = Math.min(multiplier, MAX_MULTIPLIER)

    let winAmount = win ? +(betAmount * multiplier).toFixed(2) : 0
    winAmount = Math.min(winAmount, MAX_WIN)

    user.credits = user.credits - betAmount + winAmount
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

    await new Game({
      user: user._id,
      gameType: 'dice',
      betAmount,
      result: win ? 'win' : 'loss',
      winAmount,
      details: {
        roll,
        target,
        mode,
        multiplier: +multiplier.toFixed(4)
      }
    }).save()

    res.json({
      success: true,
      roll,
      target,
      mode,
      win,
      multiplier: +multiplier.toFixed(4),
      winAmount,
      credits: user.credits
    })

  } catch (err) {
    console.error('Dice error:', err)
    res.status(500).json({ error: 'Dice game failed' })
  }
}
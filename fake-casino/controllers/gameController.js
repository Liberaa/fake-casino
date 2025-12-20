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
      await user.save();

      const game = new Game({
        user: user._id,
        gameType: 'slots',
        betAmount: 0,
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
    await user.save();

    res.json({ 
      success: true, 
      credits: user.credits,
      betAmount: betAmount
    });
  } catch (error) {
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
    if (result === 'win') user.totalWins++
    else user.totalLosses++

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

    const deck = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const drawCard = () => deck[Math.floor(Math.random() * deck.length)]
    
    const calculateScore = (hand) => {
      let score = 0
      let aces = 0
      for (let card of hand) {
        if (card === 'A') {
          aces++
          score += 11
        } else if (['J', 'Q', 'K'].includes(card)) {
          score += 10
        } else {
          score += parseInt(card)
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
      result = 'loss'
      gameOver = true
    } else if (action === 'stand' || playerScore === 21) {
      gameOver = true
      if (dealerScore > 21 || playerScore > dealerScore) {
        winAmount = betAmount * 2
        result = 'win'
      } else if (playerScore === dealerScore) {
        winAmount = betAmount
        result = 'push'
      }
    }

    if (gameOver) {
      user.credits = user.credits - betAmount + winAmount
      if (result === 'win') user.totalWins++
      else if (result === 'loss') user.totalLosses++
      
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
    res.status(500).json({ error: 'Game failed' })
  }
}

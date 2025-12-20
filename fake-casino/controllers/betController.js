const Bet = require('../models/Bet')
const User = require('../models/User')

exports.createBet = async (req, res) => {
  try {
    const { player2Id, amount } = req.body
    const user = await User.findById(req.session.userId)

    if (!user || user.credits < amount) {
      return res.status(400).json({ error: 'Insufficient credits' })
    }

    const bet = new Bet({
      player1: user._id,
      player2: player2Id,
      amount
    })

    await bet.save()
    res.json({ success: true, bet })
  } catch (error) {
    res.status(500).json({ error: 'Failed to create bet' })
  }
}

exports.acceptBet = async (req, res) => {
  try {
    const { betId } = req.body
    const bet = await Bet.findById(betId)
    const user = await User.findById(req.session.userId)

    if (!bet || bet.status !== 'pending') {
      return res.status(400).json({ error: 'Invalid bet' })
    }

    if (!user || user.credits < bet.amount) {
      return res.status(400).json({ error: 'Insufficient credits' })
    }

    const winner = Math.random() < 0.5 ? bet.player1 : bet.player2

    const player1 = await User.findById(bet.player1)
    const player2 = await User.findById(bet.player2)

    if (winner.equals(bet.player1)) {
      player1.credits += bet.amount
      player2.credits -= bet.amount
      player1.totalWins++
      player2.totalLosses++
    } else {
      player2.credits += bet.amount
      player1.credits -= bet.amount
      player2.totalWins++
      player1.totalLosses++
    }

    await player1.save()
    await player2.save()

    bet.status = 'completed'
    bet.winner = winner
    await bet.save()

    res.json({ success: true, winner, bet })
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept bet' })
  }
}

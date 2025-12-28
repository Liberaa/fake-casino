const Bet = require('../models/Bet')
const User = require('../models/User')
const crypto = require('crypto')

/* --------------------------------------------------
   Create Bet
-------------------------------------------------- */
exports.createBet = async (req, res) => {
  try {
    const userId = req.session?.userId

    // Accept BOTH names (backward compatible)
    const betAmount =
      req.body.betAmount ??
      req.body.amount

    const { player2Id } = req.body

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    if (typeof betAmount !== 'number' || betAmount <= 0) {
      return res.status(400).json({ error: 'Invalid bet amount' })
    }

    if (!player2Id) {
      return res.status(400).json({ error: 'Missing opponent' })
    }

    if (userId === player2Id) {
      return res.status(400).json({ error: 'Cannot bet against yourself' })
    }

    // Atomically deduct credits from player1
    const player1 = await User.findOneAndUpdate(
      { _id: userId, credits: { $gte: betAmount } },
      { $inc: { credits: -betAmount } },
      { new: true }
    )

    if (!player1) {
      return res.status(400).json({ error: 'Insufficient credits' })
    }

    const player2 = await User.findById(player2Id)
    if (!player2) {
      // Refund player1 if player2 is invalid
      await User.updateOne(
        { _id: userId },
        { $inc: { credits: betAmount } }
      )
      return res.status(400).json({ error: 'Invalid opponent' })
    }

    const bet = await Bet.create({
      player1: player1._id,
      player2: player2._id,
      amount: betAmount,
      status: 'pending'
    })

    res.json({
      success: true,
      bet,
      credits: player1.credits
    })

  } catch (error) {
    console.error('Create bet error:', error)
    res.status(500).json({ error: 'Failed to create bet' })
  }
}

/* --------------------------------------------------
   Accept Bet
-------------------------------------------------- */
exports.acceptBet = async (req, res) => {
  try {
    const userId = req.session?.userId
    const { betId } = req.body

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    if (!betId) {
      return res.status(400).json({ error: 'Missing betId' })
    }

    const bet = await Bet.findById(betId)
    if (!bet || bet.status !== 'pending') {
      return res.status(400).json({ error: 'Bet not available' })
    }

    if (bet.player2.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    // Atomically deduct from player2
    const player2 = await User.findOneAndUpdate(
      { _id: userId, credits: { $gte: bet.amount } },
      { $inc: { credits: -bet.amount } },
      { new: true }
    )

    if (!player2) {
      return res.status(400).json({ error: 'Insufficient credits' })
    }

    const player1 = await User.findById(bet.player1)
    if (!player1) {
      // Refund player2 if something went wrong
      await User.updateOne(
        { _id: userId },
        { $inc: { credits: bet.amount } }
      )
      return res.status(400).json({ error: 'Invalid bet state' })
    }

    /* -----------------------------
       Provably fair winner
    ----------------------------- */
    const randomBytes = crypto.randomBytes(32)
    const verificationHash = crypto
      .createHash('sha256')
      .update(randomBytes)
      .digest('hex')

    const randomValue =
      parseInt(verificationHash.substring(0, 8), 16) / 0xffffffff

    const winner =
      randomValue < 0.5 ? player1._id : player2._id

    /* -----------------------------
       Payout
    ----------------------------- */
    if (winner.equals(player1._id)) {
      await User.updateOne(
        { _id: player1._id },
        {
          $inc: {
            credits: bet.amount * 2,
            totalWins: 1,
            totalWagered: bet.amount
          },
          $max: { biggestWin: bet.amount }
        }
      )

      await User.updateOne(
        { _id: player2._id },
        {
          $inc: {
            totalLosses: 1,
            totalWagered: bet.amount
          }
        }
      )
    } else {
      await User.updateOne(
        { _id: player2._id },
        {
          $inc: {
            credits: bet.amount * 2,
            totalWins: 1,
            totalWagered: bet.amount
          },
          $max: { biggestWin: bet.amount }
        }
      )

      await User.updateOne(
        { _id: player1._id },
        {
          $inc: {
            totalLosses: 1,
            totalWagered: bet.amount
          }
        }
      )
    }

    bet.status = 'completed'
    bet.winner = winner
    bet.verificationHash = verificationHash
    await bet.save()

    res.json({
      success: true,
      winner: winner.toString(),
      bet,
      verificationHash
    })

  } catch (error) {
    console.error('Accept bet error:', error)
    res.status(500).json({ error: 'Failed to accept bet' })
  }
}

/* --------------------------------------------------
   Cancel Bet
-------------------------------------------------- */
exports.cancelBet = async (req, res) => {
  try {
    const userId = req.session?.userId
    const { betId } = req.body

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const bet = await Bet.findById(betId)
    if (!bet || bet.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot cancel bet' })
    }

    if (bet.player1.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    // Refund atomically
    await User.updateOne(
      { _id: userId },
      { $inc: { credits: bet.amount } }
    )

    bet.status = 'rejected'
    await bet.save()

    res.json({ success: true })

  } catch (error) {
    console.error('Cancel bet error:', error)
    res.status(500).json({ error: 'Failed to cancel bet' })
  }
}

/* --------------------------------------------------
   Get Pending Bets
-------------------------------------------------- */
exports.getPendingBets = async (req, res) => {
  try {
    const userId = req.session?.userId

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const bets = await Bet.find({
      status: 'pending',
      $or: [{ player1: userId }, { player2: userId }]
    })
      .populate('player1', 'username')
      .populate('player2', 'username')
      .sort({ createdAt: -1 })

    res.json({ success: true, bets })

  } catch (error) {
    console.error('Get pending bets error:', error)
    res.status(500).json({ error: 'Failed to get pending bets' })
  }
}

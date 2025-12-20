const mongoose = require('mongoose')

const gameSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  gameType: {
    type: String,
    enum: ['slots', 'roulette', 'blackjack', 'dice'],
    required: true
  },
  betAmount: {
    type: Number,
    required: true
  },
  result: {
    type: String,
    enum: ['win', 'loss'],
    required: true
  },
  winAmount: {
    type: Number,
    default: 0
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

module.exports = mongoose.model('Game', gameSchema)

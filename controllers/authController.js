const User = require('../models/User')

exports.register = async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' })
    }

    const existingUser = await User.findOne({ username })
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' })
    }

    const user = new User({ username, password })
    await user.save()

    req.session.userId = user._id
    res.json({ success: true, user: { id: user._id, username: user.username, credits: user.credits } })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Registration failed: ' + error.message })
  }
}

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body

    const user = await User.findOne({ username })
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    req.session.userId = user._id
    res.json({ success: true, user: { id: user._id, username: user.username, credits: user.credits } })
  } catch (error) {
    res.status(500).json({ error: 'Login failed' })
  }
}

exports.logout = (req, res) => {
  req.session.destroy()
  res.json({ success: true })
}

exports.dailyBonus = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId)
    if (!user) return res.status(401).json({ error: 'Not authenticated' })

    const now = new Date()
    const lastBonus = user.lastDailyBonus

    if (lastBonus && now - lastBonus < 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Daily bonus already claimed' })
    }

    user.credits += 500
    user.lastDailyBonus = now
    await user.save()

    res.json({ success: true, credits: user.credits })
  } catch (error) {
    res.status(500).json({ error: 'Failed to claim bonus' })
  }
}
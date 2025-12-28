const express = require('express')
const path = require('path')
const sessionMiddleware = require('./config/session')

const app = express()

// View engine setup
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

// Body parsing
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Static files
app.use(express.static(path.join(__dirname, 'public')))

// Session
app.use(sessionMiddleware)

// Routes - Import all your routes
const authRoutes = require('./routes/authRoutes')
const gameRoutes = require('./routes/gameRoutes') 
const pageRoutes = require('./routes/pageRoutes')
const apiRoutes = require('./routes/apiRoutes')

// Mount routes
app.use('/auth', authRoutes)
app.use('/games', gameRoutes)
app.use('/api', apiRoutes)
app.use('/', pageRoutes)

// 404 handler
app.use((req, res, next) => {
  res.status(404).render('error', { 
    message: 'Page not found',
    status: 404 
  })
})

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  })
})

module.exports = app
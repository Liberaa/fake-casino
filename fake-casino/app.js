const express = require('express')
const path = require('path')
const sessionMiddleware = require('./config/session')

const app = express()

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

// Body parsers FIRST
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Static files BEFORE session
app.use(express.static(path.join(__dirname, 'public')))

// Session LAST (before routes)
app.use(sessionMiddleware)

// Routes
const shopRoutes = require('./routes/shopRoutes')
const authRoutes = require('./routes/authRoutes')
const gameRoutes = require('./routes/gameRoutes')
const pageRoutes = require('./routes/pageRoutes')
const apiRoutes = require('./routes/apiRoutes')

app.use('/shop', shopRoutes)
app.use('/auth', authRoutes)
app.use('/games', gameRoutes)
app.use('/api', apiRoutes)
app.use('/', pageRoutes)

module.exports = app
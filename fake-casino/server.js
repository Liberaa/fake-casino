require('dotenv').config()
const http = require('http')
const { Server } = require('socket.io')
const connectDB = require('./config/db')
const app = require('./app')

const server = http.createServer(app)

// Socket.io with explicit config for production
const io = new Server(server, {
  cors: {
    origin: process.env.BASE_URL || "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
})

connectDB()

// Store io in app
app.set('io', io)

// Share sessions with Socket.io
const sessionMiddleware = require('./config/session')
io.engine.use(sessionMiddleware)

// Socket handlers
require('./sockets/chatSocket')(io)
require('./sockets/gameSocket')(io)
require('./sockets/lobbySocket')(io)
require('./sockets/rouletteSocket')(io)
require('./sockets/levelSocket')(io)

// Socket.io connection logging
io.on('connection', (socket) => {
  console.log('✅ Socket connected:', socket.id)
  
  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 3000

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎰 Brap Casino running on port ${PORT}`)
  console.log(`Visit: http://localhost:${PORT}`)
})
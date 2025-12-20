require('dotenv').config()
const http = require('http')
const { Server } = require('socket.io')
const connectDB = require('./config/db')
const app = require('./app')

const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  path: '/socket.io/'
})

connectDB()

// Store io in app so controllers can access it
app.set('io', io)

// Share session with Socket.io
const sessionMiddleware = require('./config/session')
io.engine.use(sessionMiddleware)

// Socket handlers
require('./sockets/chatSocket')(io)
require('./sockets/gameSocket')(io)
require('./sockets/lobbySocket')(io)
require('./sockets/rouletteSocket')(io)
require('./sockets/levelSocket')(io) 

const PORT = process.env.PORT || 3000

server.listen(PORT, () => {
  console.log(`🎰 Brap Casino running on port ${PORT}`)
  console.log(`Visit: http://localhost:${PORT}`)
})
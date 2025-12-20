require('dotenv').config()
const http = require('http')
const { Server } = require('socket.io')
const connectDB = require('./config/db')
const app = require('./app')

const server = http.createServer(app)
const io = new Server(server)

connectDB()

require('./sockets/chatSocket')(io)
require('./sockets/gameSocket')(io)
require('./sockets/lobbySocket')(io)
require('./sockets/rouletteSocket')(io)

const PORT = process.env.PORT || 3000

server.listen(PORT, () => {
  console.log(`🎰 Brap Casino running on port ${PORT}`)
  console.log(`Visit: http://localhost:${PORT}`)
})

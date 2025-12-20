const connectedUsers = new Map()

module.exports = (io) => {
  io.on('connection', (socket) => {
    socket.on('lobby:join', (data) => {
      connectedUsers.set(socket.id, data.username)
      io.emit('lobby:updateUsers', {
        count: connectedUsers.size,
        users: Array.from(connectedUsers.values())
      })
    })

    socket.on('disconnect', () => {
      connectedUsers.delete(socket.id)
      io.emit('lobby:updateUsers', {
        count: connectedUsers.size,
        users: Array.from(connectedUsers.values())
      })
    })

    socket.on('lobby:getStats', () => {
      socket.emit('lobby:stats', {
        onlineUsers: connectedUsers.size
      })
    })
  })
}

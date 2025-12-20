module.exports = (io) => {
  io.on('connection', (socket) => {
    socket.on('game:result', (data) => {
      io.emit('game:broadcast', {
        username: data.username,
        gameType: data.gameType,
        result: data.result,
        amount: data.amount
      })
    })
  })
}

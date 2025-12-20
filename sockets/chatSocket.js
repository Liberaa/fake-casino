const ChatMessage = require('../models/ChatMessage')

module.exports = (io) => {
  io.on('connection', (socket) => {
    socket.on('chat:message', async (data) => {
      try {
        const { userId, username, message } = data
        
        if (!message || message.trim().length === 0) return

        const chatMessage = new ChatMessage({
          user: userId,
          username,
          message: message.trim()
        })
        await chatMessage.save()

        io.emit('chat:newMessage', {
          username,
          message: message.trim(),
          timestamp: new Date()
        })
      } catch (error) {
        console.error('Chat error:', error)
      }
    })

    socket.on('chat:loadHistory', async () => {
      try {
        const messages = await ChatMessage.find()
          .sort({ createdAt: -1 })
          .limit(50)
          .lean()

        socket.emit('chat:history', messages.reverse())
      } catch (error) {
        console.error('Load chat history error:', error)
      }
    })
    
    socket.on('chat:typing', (data) => {
      socket.broadcast.emit('chat:userTyping', data)
    })
    
    socket.on('chat:stopTyping', (data) => {
      socket.broadcast.emit('chat:userStopTyping', data)
    })
  })
}
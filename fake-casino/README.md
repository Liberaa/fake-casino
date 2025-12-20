# 🎰 Brap Casino - Real-Time Multiplayer Casino

A fully functional real-time multiplayer casino platform built with Node.js, Express, Socket.IO, and MongoDB. Play with fake "Brap Coins" and compete with friends!

⚠️ **NO REAL MONEY** - This is purely for entertainment and educational purposes.

## ✨ Features

- 👤 User authentication with bcrypt
- 🎰 Multiple casino games (Slots, Roulette, Blackjack)
- 💰 Real-time credit balance updates via WebSockets
- 🏆 Global leaderboard with live updates
- 💬 Live global chat system
- 🎁 Daily bonus system (500 Brap Coins/day)
- 📊 Live statistics (online users, game activity)
- 🔄 Player-to-player betting (foundation included)
- ❤️ Support/donation button
- 📱 Responsive design

## 🛠️ Tech Stack

**Backend:**
- Node.js
- Express.js
- Socket.IO (WebSockets)
- MongoDB + Mongoose
- bcrypt (password hashing)
- Express-Session

**Frontend:**
- EJS (templating)
- Vanilla JavaScript
- CSS3 (glassmorphism design)

## 📦 Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd fake-casino
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Configure your `.env`:
```env
PORT=3000
NODE_ENV=development
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/fake-casino
SESSION_SECRET=your_super_secret_session_key_here
BASE_URL=http://localhost:3000
```

5. Start the server:
```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

6. Visit `http://localhost:3000`

## 🎮 Game Rules

### Slots 🎰
- Match 3 symbols: Win 10x your bet
- Match 2 symbols: Win 2x your bet

### Roulette 🎡
- Bet on Red/Black: 2x payout
- Bet on Even/Odd: 2x payout
- Bet on specific number (0-36): 35x payout

### Blackjack 🃏
- Get closer to 21 than dealer without going over
- Face cards worth 10, Ace worth 1 or 11
- Win pays 2x your bet

## 🗂️ Project Structure

```
fake-casino/
├── config/          # Database and session configuration
├── models/          # MongoDB schemas (User, Game, Bet, ChatMessage)
├── controllers/     # Business logic (auth, games, leaderboard)
├── routes/          # Express routes
├── sockets/         # Socket.IO event handlers
├── views/           # EJS templates
├── public/          # Static assets (CSS, JS, images)
├── server.js        # Main server entry point
└── app.js           # Express app configuration
```

## 🔐 Security Features

- Passwords hashed with bcrypt
- Express sessions with MongoDB store
- Server-side game logic (no client manipulation)
- Input validation and sanitization
- Session-based authentication

## 🌐 Deployment (Render)

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set environment variables in Render dashboard
4. Build command: `npm install`
5. Start command: `npm start`
6. Deploy!

**Important:** Make sure to set `MONGO_URI` and `SESSION_SECRET` in Render's environment variables.

## 🎁 Daily Bonus System

Users can claim 500 Brap Coins once every 24 hours. The system tracks the last claim time and prevents multiple claims within the cooldown period.

## 💬 Live Chat

Global chat system with:
- Real-time message delivery
- Message persistence (24-hour TTL)
- Username display
- Timestamps
- Message history on join

## 🏆 Leaderboard

- Ranked by total Brap Coins
- Shows wins and losses
- Updates every 10 seconds
- Top 10 players displayed
- Medal icons for top 3 players

## 🔄 WebSocket Events

### Chat Events
- `chat:message` - Send a message
- `chat:newMessage` - Receive a message
- `chat:loadHistory` - Load message history

### Lobby Events
- `lobby:join` - Join the lobby
- `lobby:updateUsers` - User count updates
- `lobby:getStats` - Get live statistics

### Game Events
- `game:result` - Broadcast game result
- `game:broadcast` - Receive game activity

## 🎨 Customization

### Changing Currency Name
Replace "Brap Coins" throughout the codebase with your desired currency name.

### Adding New Games
1. Create game logic in `controllers/gameController.js`
2. Add route in `routes/gameRoutes.js`
3. Create view in `views/games/`
4. Update lobby page with new game card

### Styling
Modify `public/css/main.css` to change colors, fonts, and layout.

## 🐛 Known Issues & Future Enhancements

**Future Features:**
- [ ] Player-to-player betting implementation
- [ ] Game history analytics
- [ ] Admin dashboard
- [ ] More casino games (Poker, Dice, etc.)
- [ ] Achievement system
- [ ] Friend system
- [ ] Private rooms

## 📝 License

MIT License - Feel free to use for educational purposes!

## ⚠️ Disclaimer

This project is for educational and entertainment purposes only. It does not involve real money gambling. All currency used is fictional "Brap Coins" with no real-world value.

## 🤝 Contributing

Contributions welcome! Feel free to submit issues and pull requests.

## 💡 Support

If you enjoy this project, consider supporting the developer:
- ☕ [Buy Me a Coffee](https://www.buymeacoffee.com/yourusername)
- 💜 [Ko-fi](https://ko-fi.com/yourusername)

---

Built with ❤️ by Lukas

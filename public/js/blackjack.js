let currentGameId = null

async function startBlackjack(betAmount) {
  try {
    const response = await fetch('/games/blackjack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betAmount })
    })
    
    const data = await response.json()
    if (!data.success) throw new Error(data.error)
    
    currentGameId = data.gameId
    updateBlackjackUI(data)
    
  } catch (error) {
    alert(error.message)
  }
}

async function blackjackAction(action) {
  try {
    const response = await fetch('/games/blackjack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: currentGameId, action })
    })
    
    const data = await response.json()
    if (!data.success) throw new Error(data.error)
    
    updateBlackjackUI(data)
    
    if (data.gameOver) {
      currentGameId = null
      document.getElementById('credits').textContent = data.credits
    }
    
  } catch (error) {
    alert(error.message)
  }
}

function updateBlackjackUI(data) {
  // Update cards display
  document.getElementById('player-hand').textContent = data.playerHand.join(' ')
  document.getElementById('dealer-hand').textContent = data.dealerHand.join(' ')
  document.getElementById('player-score').textContent = data.playerScore
  
  if (data.gameOver) {
    document.getElementById('result').textContent = `Result: ${data.result} - ${data.winAmount > 0 ? 'Won ' + data.winAmount : 'Lost'}`
  }
}
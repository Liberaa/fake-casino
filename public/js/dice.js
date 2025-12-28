async function rollDice(betAmount, target, mode) {
  try {
    const response = await fetch('/games/dice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betAmount, target, mode })
    })
    
    const data = await response.json()
    if (!data.success) throw new Error(data.error)
    
    // Update UI
    document.getElementById('credits').textContent = data.credits
    document.getElementById('dice-result').textContent = data.roll
    document.getElementById('win-status').textContent = data.win ? `Won ${data.winAmount}!` : 'Lost'
    
  } catch (error) {
    alert(error.message)
  }
}
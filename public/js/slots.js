async function playSlots(betAmount) {
  try {
    const response = await fetch('/games/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betAmount })
    })
    
    const data = await response.json()
    if (!data.success) throw new Error(data.error)
    
    // Update UI
    document.getElementById('credits').textContent = data.credits
    displaySlotResults(data.symbols, data.winAmount)
    
  } catch (error) {
    alert(error.message)
  }
}

function displaySlotResults(symbols, winAmount) {
  // Show symbols in your slot machine UI
  const slotsContainer = document.getElementById('slot-results')
  slotsContainer.innerHTML = symbols.join(' ')
  
  if (winAmount > 0) {
    document.getElementById('win-message').textContent = `Won ${winAmount} credits!`
  }
}
function logout() {
  fetch('/auth/logout', { method: 'POST' })
    .then(() => {
      window.location.href = '/'
    })
}

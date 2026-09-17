// Example usage of the configured proxy in your application

// ✅ Correct: Use the proxy path
fetch('/api/users')
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error))

// ✅ Correct: POST request through proxy
fetch('/api/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com'
  })
})

// ❌ Incorrect: Don't use the full backend URL in development
// fetch('http://localhost:8787/users') // This can cause CORS errors from the browser

// Environment-based configuration example:
const apiUrl = import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_URL
fetch(`${apiUrl}/users`)

// WebSocket usage (if enabled):
const ws = new WebSocket('ws://localhost:5173/api/socket')
ws.onopen = () => console.log('WebSocket connected')
ws.onmessage = (event) => console.log('Message:', event.data)

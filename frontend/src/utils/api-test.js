// Test script to verify API connection from browser console
// Paste this in browser console when on http://localhost:3000

async function testAPI() {
  const baseUrls = [
    'http://localhost:8000',
    '/backend',
    window.location.origin + '/backend',
  ]

  console.log('Testing API connection...')
  console.log('Current origin:', window.location.origin)
  console.log('Testing endpoints:')

  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}/roles`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      console.log(`✓ ${baseUrl}/roles:`, response.status, response.statusText)
      const data = await response.json()
      console.log('  Response:', data)
    } catch (error) {
      console.error(`✗ ${baseUrl}/roles:`, error.message)
    }
  }
}

// Run the test
testAPI()

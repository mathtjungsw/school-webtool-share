'use strict'
// Separate process lets the unmodified synchronous Apps Script adapter use Node fetch.
let input = ''
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', async () => {
  try {
    const { method, url, body, admin } = JSON.parse(input)
    if (!url.startsWith('http://127.0.0.1:8185/v1/projects/demo-ungcheon-migration/')) throw new Error('LOOPBACK_ONLY')
    const response = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
    })
    process.stdout.write(JSON.stringify({ status: response.status, text: await response.text() }))
  } catch { process.stderr.write('Emulator request failed; request and response omitted.\n'); process.exitCode = 1 }
})

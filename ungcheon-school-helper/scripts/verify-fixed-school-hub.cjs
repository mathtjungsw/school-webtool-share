const { spawn } = require('child_process')
const { mkdirSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')
const executable = join(root, 'release', 'win-unpacked', '웅천고 업무도우미.exe')
const profile = join(root, 'tmp', 'hub-fixed-url-test')
mkdirSync(profile, { recursive: true })

const child = spawn(executable, ['--remote-debugging-port=9333', `--user-data-dir=${profile}`], {
  windowsHide: true,
  stdio: 'ignore',
})

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function findPage() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(500)
    try {
      const response = await fetch('http://127.0.0.1:9333/json/list')
      const targets = await response.json()
      const page = targets.find(target => target.type === 'page')
      if (page) return page
    } catch { /* 앱이 준비될 때까지 대기 */ }
  }
  throw new Error('시험판 렌더러 페이지를 찾지 못했습니다.')
}

async function evaluate(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl)
    const timer = setTimeout(() => reject(new Error('공유 서비스 호출 시간이 초과되었습니다.')), 30_000)
    socket.onopen = () => socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: "window.electron.schoolHubRequest({action:'getStudentRoster'}).then(r => ({ok:r.ok, error:r.error||'', count:Array.isArray(r.data?.students)?r.data.students.length:-1}))",
        awaitPromise: true,
        returnByValue: true,
      },
    }))
    socket.onmessage = event => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      clearTimeout(timer)
      socket.close()
      resolve(message.result?.result?.value)
    }
    socket.onerror = event => {
      clearTimeout(timer)
      reject(new Error(event.message || 'DevTools 연결 오류'))
    }
  })
}

;(async () => {
  try {
    const page = await findPage()
    const result = await evaluate(page.webSocketDebuggerUrl)
    if (!result?.ok || result.count < 1) throw new Error(result?.error || '학생 명렬이 비어 있습니다.')
    console.log(`PASS 내장 공유 URL getStudentRoster ${result.count}명`)
  } finally {
    child.kill()
  }
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})

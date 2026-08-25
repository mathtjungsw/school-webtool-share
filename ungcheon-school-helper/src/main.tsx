import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { logger } from './utils/logger'

// 웹보기가 첫 화면을 그리기 전부터 밝은 모드로 고정한다.
// 기존 PC에 남은 dark 클래스나 OS 색상 설정이 섞인 화면을 만들지 못하게 한다.
document.documentElement.setAttribute('data-theme', 'light')
document.documentElement.classList.remove('dark')
document.documentElement.style.colorScheme = 'light'

// console.error / console.warn → 로그 패널에 자동 기록
// setTimeout으로 defer하여 렌더링 중 setState 경고 방지
const _origError = console.error
console.error = (...args: unknown[]) => {
  _origError(...args)
  const msg = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ')
  setTimeout(() => logger.error(msg, 'console'), 0)
}
const _origWarn = console.warn
console.warn = (...args: unknown[]) => {
  _origWarn(...args)
  const msg = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ')
  setTimeout(() => logger.warn(msg, 'console'), 0)
}
window.addEventListener('unhandledrejection', e => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason)
  logger.error(msg, 'unhandledRejection')
})
window.addEventListener('error', e => {
  logger.error(`${e.message} (${e.filename}:${e.lineno})`, 'globalError')
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

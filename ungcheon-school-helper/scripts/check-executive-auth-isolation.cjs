'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const auth = read('src/stores/authStore.ts')
const login = read('src/components/PilotLogin.tsx')
const layout = read('src/components/Layout.tsx')
const app = read('src/App.tsx')
const widget = read('src/components/widget/WidgetApp.tsx')
const executive = read('src/pages/ExecutiveSchedulePage.tsx')

const bootstrap = auth.slice(auth.indexOf('bootstrap: async'), auth.indexOf('login: async'))
const basicLogin = auth.slice(auth.indexOf('login: async'), auth.indexOf('unlockExecutive: async'))
const unlockStart = auth.indexOf('unlockExecutive: async')
const unlock = auth.slice(unlockStart, auth.indexOf('\n  lockExecutive:', unlockStart))

assert.doesNotMatch(bootstrap, /!executiveRoleForName/, '교장·교감 기본 세션 복원을 차단하면 안 됩니다.')
assert.doesNotMatch(basicLogin, /verifyExecutive|executivePassword/, '기본 로그인에 보호 메뉴 비밀번호를 결합하면 안 됩니다.')
assert.match(unlock, /verifyExecutive\(state\.teacherName, password\)/, '보호 메뉴 열기에서만 추가 인증해야 합니다.')
assert.doesNotMatch(login, /교장·교감 추가 비밀번호|executiveRoleForName/, '첫 로그인 화면에서 보호 메뉴 비밀번호를 요구하면 안 됩니다.')
assert.match(layout, /requestedExecutivePage/)
assert.match(layout, /보호 메뉴 추가 인증/)
assert.match(layout, /unlockExecutive\(executivePassword\)/)
assert.match(app, /Date\.parse\(useAuthStore\.getState\(\)\.expiresAt\)/, '기본 세션 만료는 기본 세션만 기준으로 해야 합니다.')
assert.doesNotMatch(app, /expiryCandidates/)
assert.match(app, /window\.setTimeout\(lockExecutive, remaining\)/, '보호 메뉴 만료는 메뉴만 잠가야 합니다.')
assert.match(widget, /onAuthChanged\(\(\) => void auth\.bootstrap\(\)\)/, '로그인 변경 시 위젯이 기본 세션을 다시 읽어야 합니다.')
assert.match(executive, /message\.includes\('인증이 만료'\)\) lockExecutive\(\)/, '보호 메뉴 만료가 전체 로그아웃으로 이어지면 안 됩니다.')

console.log('PASS 교장·교감 기본 세션·위젯 자동 로그인·보호 메뉴 추가 인증 분리')

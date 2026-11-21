import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

describe('서비스 워커 전송 경계', () => {
  it('하위 경로의 앱 셸을 준비하고 새 버전 활성화 시 다른 앱의 저장소를 보존한다', async () => {
    const scope = 'https://example.invalid/school/'
    const listeners: Record<string, (event: any) => void> = {}
    const keys = ['other-app', 'ungcheon-mobile-static-v13', 'ungcheon-mobile-static-%2Fother%2F-v14', 'ungcheon-mobile-static-%2Fschool%2F-v14', 'ungcheon-mobile-static-%2Fschool%2F-v15']
    const markup = '<script src="./assets/app.js"></script><link rel="stylesheet" href="./assets/style.css"><script src="/other/tool.js"></script>'
    const shellResponse = { ok:true, clone:() => ({ text:async () => markup }) }
    const fetcher = vi.fn().mockResolvedValue(shellResponse)
    const cache = { addAll:vi.fn(), put:vi.fn(), match:vi.fn().mockResolvedValue(shellResponse) }
    const deletion = vi.fn()
    vm.runInNewContext(readFileSync(resolve('public/sw.js'), 'utf8'), {
      URL, fetch:fetcher, caches:{ open:async () => cache, keys:async () => keys, delete:deletion },
      self:{ registration:{scope}, skipWaiting:vi.fn(), clients:{ claim:vi.fn() }, addEventListener:(key:string, cb:(event:unknown)=>void) => { listeners[key]=cb } },
    })
    let job: Promise<unknown> | undefined
    const waitUntil = (value:Promise<unknown>) => { job = value }
    listeners.install({waitUntil}); await job
    expect(cache.addAll.mock.calls[0][0]).toEqual([scope+'manifest.webmanifest', scope+'icon-192.png', scope+'icon-512.png', scope+'assets/app.js', scope+'assets/style.css'])
    listeners.activate({waitUntil}); await job
    expect(deletion.mock.calls).toEqual([['ungcheon-mobile-static-v13'], ['ungcheon-mobile-static-%2Fschool%2F-v14']])
    fetcher.mockRejectedValue(new TypeError('offline'))
    listeners.fetch({request:{method:'GET',url:scope,mode:'navigate'}, respondWith:waitUntil})
    expect(await job).toBe(shellResponse)
    expect(cache.match).toHaveBeenCalledWith(scope)
    const respondWith = vi.fn()
    listeners.fetch({request:{method:'GET',url:'https://example.invalid/other/app.js',mode:'cors'}, respondWith})
    expect(respondWith).not.toHaveBeenCalled()
  })
  it('Apps Script POST와 외부 GET을 캐시하거나 가로채지 않는다', () => {
    const listeners: Record<string, (event: unknown) => void> = {}
    const origin = 'https://ungcheon-mobile-schedule.jsw890122.chatgpt.site'
    const fetcher = vi.fn()
    vm.runInNewContext(readFileSync(resolve('public/sw.js'), 'utf8'), {
      URL, fetch: fetcher,
      self: { registration: { scope: `${origin}/` }, location: { origin }, addEventListener: (type: string, listener: (event: unknown) => void) => { listeners[type] = listener } },
    })
    for (const request of [
      { method: 'POST', url: 'https://script.google.com/macros/s/example/exec' },
      { method: 'GET', url: 'https://script.google.com/macros/s/example/exec' },
      { method: 'POST', url: `${origin}/any` },
    ]) {
      const respondWith = vi.fn()
      listeners.fetch({ request, respondWith })
      expect(respondWith).not.toHaveBeenCalled()
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('같은 출처 앱 코드와 화면은 네트워크 최신본을 먼저 확인한다', async () => {
    const listeners: Record<string, (event: any) => void> = {}
    const origin = 'https://ungcheon-mobile-schedule.jsw890122.chatgpt.site'
    const response = { ok: true, clone: () => response }
    const fetcher = vi.fn().mockResolvedValue(response)
    const put = vi.fn()
    vm.runInNewContext(readFileSync(resolve('public/sw.js'), 'utf8'), {
      URL, fetch: fetcher,
      caches: { open: vi.fn().mockResolvedValue({ put }), match: vi.fn(), keys: vi.fn().mockResolvedValue([]), delete: vi.fn() },
      self: { registration: { scope: `${origin}/` }, location: { origin }, addEventListener: (type: string, listener: (event: unknown) => void) => { listeners[type] = listener } },
    })
    let responsePromise: Promise<unknown> | undefined
    listeners.fetch({
      request: { method: 'GET', url: `${origin}/assets/app.js`, mode: 'cors', destination: 'script' },
      respondWith: (value: Promise<unknown>) => { responsePromise = value },
    })
    await responsePromise
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ url: `${origin}/assets/app.js` }), { cache: 'no-store' })
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

describe('서비스 워커 전송 경계', () => {
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
})

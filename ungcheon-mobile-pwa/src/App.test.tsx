import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Login } from './App'

describe('로그인 화면', () => {
  it('비밀번호를 보이거나 다시 숨길 수 있다', () => {
    const view = render(<Login onLogin={vi.fn()} />)
    const password = screen.getByLabelText('공통 비밀번호') as HTMLInputElement

    expect(screen.getByRole('img', { name: '웅천고등학교 로고' })).toHaveAttribute('src', '/icon-192.png')
    expect(password.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 보이기' }))
    expect(password.type).toBe('text')
    expect(screen.getByRole('button', { name: '비밀번호 숨기기' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 숨기기' }))
    expect(password.type).toBe('password')
    view.unmount()
  })
})

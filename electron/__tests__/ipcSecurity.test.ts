import { describe, expect, it } from 'vitest'
import { isTrustedSenderUrl } from '../../electron/ipcSecurity'

describe('ipcSecurity', () => {
  it('allows only dev server origins in development', () => {
    expect(isTrustedSenderUrl('http://localhost:5173/src/App.tsx', 'development')).toBe(true)
    expect(isTrustedSenderUrl('http://127.0.0.1:5173/', 'development')).toBe(true)
    expect(isTrustedSenderUrl('http://evil.test:5173/', 'development')).toBe(false)
  })

  it('allows built app file URL in production', () => {
    expect(isTrustedSenderUrl('file:///C:/app/dist/index.html', 'production')).toBe(true)
    expect(isTrustedSenderUrl('file:///C:/app/other.html', 'production')).toBe(false)
    expect(isTrustedSenderUrl('http://localhost:5173/', 'production')).toBe(false)
  })
})

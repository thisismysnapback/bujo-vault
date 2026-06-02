import type { IpcMainInvokeEvent } from 'electron'

const DEV_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])

export function isTrustedSenderUrl(rawUrl: string, nodeEnv = process.env.NODE_ENV): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  if (nodeEnv === 'development') {
    return DEV_ORIGINS.has(url.origin)
  }

  return url.protocol === 'file:' && /\/dist\/index\.html$/i.test(url.pathname.replace(/\\/g, '/'))
}

export function assertTrustedSender(event: Pick<IpcMainInvokeEvent, 'senderFrame'>): void {
  const senderUrl = event.senderFrame?.url
  if (!senderUrl || !isTrustedSenderUrl(senderUrl)) {
    throw new Error('Untrusted IPC sender')
  }
}

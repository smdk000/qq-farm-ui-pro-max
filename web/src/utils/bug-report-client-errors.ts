import { localizeRuntimeText } from './runtime-text.ts'

export interface BugReportClientErrorEntry {
  time: string
  timestamp: number
  message: string
  stack?: string
  source?: string
}

const MAX_CLIENT_ERROR_ENTRIES = 20
const errorBuffer: BugReportClientErrorEntry[] = []

function trimText(value: unknown, max = 1200) {
  return String(value ?? '').trim().slice(0, max)
}

export function pushClientError(input: Partial<BugReportClientErrorEntry> & { message?: unknown, error?: unknown, source?: unknown }) {
  const now = Date.now()
  const rawMessage = input.error instanceof Error
    ? input.error.message
    : (input.message ?? input.error ?? '')
  const localizedMessage = localizeRuntimeText(trimText(rawMessage, 500))
  if (!localizedMessage)
    return

  const stack = input.error instanceof Error
    ? trimText(input.error.stack, 2000)
    : trimText(input.stack, 2000)

  const entry: BugReportClientErrorEntry = {
    time: new Date(now).toISOString(),
    timestamp: now,
    message: localizedMessage,
    stack,
    source: trimText(input.source, 120),
  }

  errorBuffer.push(entry)
  if (errorBuffer.length > MAX_CLIENT_ERROR_ENTRIES) {
    errorBuffer.splice(0, errorBuffer.length - MAX_CLIENT_ERROR_ENTRIES)
  }
}

export function getRecentClientErrors(limit = 10) {
  const size = Math.max(1, Math.min(MAX_CLIENT_ERROR_ENTRIES, Number(limit) || 10))
  return errorBuffer.slice(-size).map(item => ({ ...item }))
}

export function clearClientErrors() {
  errorBuffer.splice(0, errorBuffer.length)
}

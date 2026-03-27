import api from '@/api'

interface AccountSelectionPayload {
  currentAccountId?: string | null
}

export async function saveCurrentAccountSelection(accountId: string): Promise<AccountSelectionPayload | null> {
  const res = await api.post('/api/account-selection', {
    currentAccountId: accountId,
  })
  return res.data?.ok ? (res.data.data || null) as AccountSelectionPayload | null : null
}

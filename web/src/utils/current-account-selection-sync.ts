import {
  getServerBackedStringPreferenceSyncState,
  persistSyncableStringPreference,
  resolveServerBackedStringPreferenceHydrationMode,
  setServerBackedStringPreferenceSyncState,
} from './server-backed-string-preference-sync.ts'

type StorageLike = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

interface AccountSelectionPayload {
  currentAccountId?: string | null
}

interface CurrentAccountSelectionSyncOptions {
  localValue?: unknown
  onError?: (phase: 'hydrate' | 'persist', error: unknown) => void
  saveSelection?: (accountId: string) => Promise<AccountSelectionPayload | null>
  storage?: StorageLike | null
}

const CURRENT_ACCOUNT_SELECTION_LOCAL_KEY = 'current_account_id'
const CURRENT_ACCOUNT_SELECTION_SYNC_STATE_KEY = 'qq-farm.account-selection-sync-state.v1'
const CURRENT_ACCOUNT_SELECTION_SYNC_ID = 'currentAccountId'

function getSafeStorage(storage?: StorageLike | null) {
  if (storage)
    return storage
  if (typeof window === 'undefined')
    return null
  try {
    return window.localStorage
  }
  catch {
    return null
  }
}

function readLocalCurrentAccountSelection(storage: StorageLike | null | undefined) {
  if (!storage)
    return ''
  try {
    return String(storage.getItem(CURRENT_ACCOUNT_SELECTION_LOCAL_KEY) || '').trim()
  }
  catch {
    return ''
  }
}

function writeLocalCurrentAccountSelection(storage: StorageLike | null | undefined, accountId: string) {
  if (!storage)
    return
  try {
    if (accountId)
      storage.setItem(CURRENT_ACCOUNT_SELECTION_LOCAL_KEY, accountId)
    else
      storage.removeItem(CURRENT_ACCOUNT_SELECTION_LOCAL_KEY)
  }
  catch {
  }
}

function markCurrentAccountSelectionSynced(storage: StorageLike | null | undefined) {
  setServerBackedStringPreferenceSyncState(
    storage,
    CURRENT_ACCOUNT_SELECTION_SYNC_STATE_KEY,
    CURRENT_ACCOUNT_SELECTION_SYNC_ID,
    {
      dirty: false,
      lastSyncedAt: Date.now(),
    },
  )
}

async function defaultSaveSelection(accountId: string) {
  const { saveCurrentAccountSelection } = await import('./current-account-selection-api.ts')
  return await saveCurrentAccountSelection(accountId)
}

export function normalizeCurrentAccountSelectionId(value: unknown) {
  return String(value || '').trim()
}

export function getCurrentAccountSelectionSyncState(storage?: StorageLike | null) {
  return getServerBackedStringPreferenceSyncState(
    getSafeStorage(storage),
    CURRENT_ACCOUNT_SELECTION_SYNC_STATE_KEY,
    CURRENT_ACCOUNT_SELECTION_SYNC_ID,
  )
}

export async function persistCurrentAccountSelection(
  value: unknown,
  options: CurrentAccountSelectionSyncOptions = {},
) {
  return await persistSyncableStringPreference<AccountSelectionPayload>({
    syncId: CURRENT_ACCOUNT_SELECTION_SYNC_ID,
    storageKey: CURRENT_ACCOUNT_SELECTION_SYNC_STATE_KEY,
    localKey: CURRENT_ACCOUNT_SELECTION_LOCAL_KEY,
    normalize: normalizeCurrentAccountSelectionId,
    storage: options.storage,
    saveRemote: async accountId => await (options.saveSelection ?? defaultSaveSelection)(accountId),
    readRemoteValue: payload => payload?.currentAccountId,
    onError: options.onError,
  }, value)
}

export async function reconcileCurrentAccountSelection(
  remoteValue: unknown,
  options: CurrentAccountSelectionSyncOptions = {},
) {
  const storage = getSafeStorage(options.storage)
  const localValue = normalizeCurrentAccountSelectionId(
    options.localValue !== undefined ? options.localValue : readLocalCurrentAccountSelection(storage),
  )
  const normalizedRemoteValue = normalizeCurrentAccountSelectionId(remoteValue)
  const syncState = getCurrentAccountSelectionSyncState(storage)
  const hydrationMode = resolveServerBackedStringPreferenceHydrationMode({
    localValue,
    remoteValue: normalizedRemoteValue,
    syncState,
  })

  if (hydrationMode === 'prefer_local_dirty') {
    writeLocalCurrentAccountSelection(storage, localValue)
    if (normalizedRemoteValue === localValue) {
      markCurrentAccountSelectionSynced(storage)
      return localValue
    }
    return await persistCurrentAccountSelection(localValue, options)
  }

  if (hydrationMode === 'prefer_remote') {
    writeLocalCurrentAccountSelection(storage, normalizedRemoteValue)
    markCurrentAccountSelectionSynced(storage)
    return normalizedRemoteValue
  }

  if (hydrationMode === 'migrate_local') {
    writeLocalCurrentAccountSelection(storage, localValue)
    return await persistCurrentAccountSelection(localValue, options)
  }

  writeLocalCurrentAccountSelection(storage, localValue)
  return localValue
}

export interface BagPreferencesPayload {
  purchaseMemory?: Record<string, any>
  activityHistory?: any[]
}

export interface BagPreferencesSyncState {
  dirty: boolean
  updatedAt: number
  lastSyncedAt: number
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type HydrationMode = 'prefer_local_dirty' | 'prefer_remote' | 'migrate_local' | 'empty'

const DEFAULT_BAG_PREFERENCES_SYNC_STATE: BagPreferencesSyncState = Object.freeze({
  dirty: false,
  updatedAt: 0,
  lastSyncedAt: 0,
})

function normalizeTimestamp(value: unknown) {
  const next = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(next) || next < 0)
    return 0
  return next
}

function normalizeAccountId(accountId: unknown) {
  return String(accountId || '').trim()
}

function normalizeBagPreferencesSyncState(input: unknown): BagPreferencesSyncState {
  const source = (input && typeof input === 'object') ? input as Partial<BagPreferencesSyncState> : {}
  return {
    dirty: source.dirty === true,
    updatedAt: normalizeTimestamp(source.updatedAt),
    lastSyncedAt: normalizeTimestamp(source.lastSyncedAt),
  }
}

function readBagPreferencesSyncStateMap(storage: StorageLike | null | undefined, storageKey: string) {
  if (!storage)
    return {}
  try {
    const raw = storage.getItem(storageKey)
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object')
      return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([accountId, state]) => [normalizeAccountId(accountId), normalizeBagPreferencesSyncState(state)])
        .filter(([accountId]) => !!accountId),
    ) as Record<string, BagPreferencesSyncState>
  }
  catch {
    return {}
  }
}

function writeBagPreferencesSyncStateMap(
  storage: StorageLike | null | undefined,
  storageKey: string,
  nextMap: Record<string, BagPreferencesSyncState>,
) {
  if (!storage)
    return
  try {
    const entries = Object.entries(nextMap)
      .filter(([accountId]) => !!normalizeAccountId(accountId))
    if (!entries.length) {
      storage.removeItem(storageKey)
      return
    }
    storage.setItem(storageKey, JSON.stringify(Object.fromEntries(entries)))
  }
  catch {
  }
}

export function hasBagPreferencesData(payload: BagPreferencesPayload | null | undefined) {
  return !!payload && (
    (!!payload.purchaseMemory && Object.keys(payload.purchaseMemory).length > 0)
    || (!!payload.activityHistory && Array.isArray(payload.activityHistory) && payload.activityHistory.length > 0)
  )
}

export function getBagPreferencesSyncState(
  storage: StorageLike | null | undefined,
  storageKey: string,
  accountId: unknown,
) {
  const normalizedAccountId = normalizeAccountId(accountId)
  if (!normalizedAccountId)
    return { ...DEFAULT_BAG_PREFERENCES_SYNC_STATE }
  const stateMap = readBagPreferencesSyncStateMap(storage, storageKey)
  return stateMap[normalizedAccountId] || { ...DEFAULT_BAG_PREFERENCES_SYNC_STATE }
}

export function setBagPreferencesSyncState(
  storage: StorageLike | null | undefined,
  storageKey: string,
  accountId: unknown,
  nextState: Partial<BagPreferencesSyncState>,
) {
  const normalizedAccountId = normalizeAccountId(accountId)
  if (!normalizedAccountId || !storage)
    return { ...DEFAULT_BAG_PREFERENCES_SYNC_STATE }
  const stateMap = readBagPreferencesSyncStateMap(storage, storageKey)
  const mergedState = normalizeBagPreferencesSyncState({
    ...(stateMap[normalizedAccountId] || DEFAULT_BAG_PREFERENCES_SYNC_STATE),
    ...nextState,
  })
  stateMap[normalizedAccountId] = mergedState
  writeBagPreferencesSyncStateMap(storage, storageKey, stateMap)
  return mergedState
}

export function resolveBagPreferencesHydrationMode(input: {
  localPayload?: BagPreferencesPayload | null
  remotePayload?: BagPreferencesPayload | null
  syncState?: Partial<BagPreferencesSyncState> | null
}): HydrationMode {
  const localPayload = input.localPayload || null
  const remotePayload = input.remotePayload || null
  const syncState = normalizeBagPreferencesSyncState(input.syncState)

  if (syncState.dirty)
    return 'prefer_local_dirty'
  if (hasBagPreferencesData(remotePayload))
    return 'prefer_remote'
  if (hasBagPreferencesData(localPayload))
    return 'migrate_local'
  return 'empty'
}

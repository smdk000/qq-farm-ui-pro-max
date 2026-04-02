export interface PastoralRememberedRoute {
  fullPath: string
  name: string
  label: string
  recordedAt: number
}

export type PastoralPlantRecommendStrategy = 'profit' | 'exp' | 'speed'
export type PastoralPlantBatchTemplate = 'top1' | 'rotate2' | 'reserve2'
export type PastoralPlantCycleTemplate = 'short' | 'idle' | 'gold'
export type PastoralWorkflowRetryCareType = 'water' | 'weed' | 'bug'

export interface PastoralWorkflowRetryPlantOperation {
  itemId: number
  landIds: number[]
  count: number
  label: string
}

export interface PastoralWorkflowRetryCareOperation {
  type: PastoralWorkflowRetryCareType
  landIds: number[]
  label: string
}

export interface PastoralWorkflowRetryFertilizerOperation {
  itemId: number
  landIds: number[]
  count: number
  label: string
  tone: 'normal' | 'organic'
}

export interface PastoralWorkflowMemory {
  accountId: string
  accountLabel: string
  recordedAt: number
  stage: 'plant' | 'harvest-replant' | 'care'
  summaryText: string
  detailText: string
  recommendStrategy: PastoralPlantRecommendStrategy
  batchTemplate: PastoralPlantBatchTemplate
  cycleTemplate: PastoralPlantCycleTemplate
  retryHarvestLandIds: number[]
  retryPlantOperations: PastoralWorkflowRetryPlantOperation[]
  retryCareOperations: PastoralWorkflowRetryCareOperation[]
  retryFertilizerOperations: PastoralWorkflowRetryFertilizerOperation[]
}

export interface PastoralReminderSnooze {
  accountId: string
  untilAt: number
  recordedAt: number
}

const PASTORAL_LAST_ROUTE_KEY = 'qq-farm.pastoral.last-console-route.v1'
const PASTORAL_SIDE_COLLAPSED_KEY = 'qq-farm.pastoral.side-collapsed.v1'
const PASTORAL_SIDE_WIDTH_KEY = 'qq-farm.pastoral.side-width.v1'
const PASTORAL_PLANT_RECOMMEND_STRATEGY_KEY = 'qq-farm.pastoral.plant-recommend-strategy.v1'
const PASTORAL_PLANT_BATCH_TEMPLATE_KEY = 'qq-farm.pastoral.plant-batch-template.v1'
const PASTORAL_PLANT_CYCLE_TEMPLATE_KEY = 'qq-farm.pastoral.plant-cycle-template.v1'
const PASTORAL_WORKFLOW_MEMORY_KEY = 'qq-farm.pastoral.workflow-memory.v1'
const PASTORAL_REMINDER_SNOOZE_KEY = 'qq-farm.pastoral.reminder-snooze.v1'

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.localStorage
}

export function readPastoralRememberedRoute(): PastoralRememberedRoute | null {
  if (!canUseStorage())
    return null

  try {
    const raw = window.localStorage.getItem(PASTORAL_LAST_ROUTE_KEY)
    if (!raw)
      return null

    const parsed = JSON.parse(raw)
    const fullPath = String(parsed?.fullPath || '').trim()
    if (!fullPath || fullPath.includes('/pastoral-view'))
      return null

    return {
      fullPath,
      name: String(parsed?.name || '').trim(),
      label: String(parsed?.label || '').trim() || '概览',
      recordedAt: Math.max(0, Number(parsed?.recordedAt || 0)),
    }
  }
  catch {
    window.localStorage.removeItem(PASTORAL_LAST_ROUTE_KEY)
    return null
  }
}

export function writePastoralRememberedRoute(input: Partial<PastoralRememberedRoute>) {
  if (!canUseStorage())
    return

  const fullPath = String(input?.fullPath || '').trim()
  if (!fullPath || fullPath.includes('/pastoral-view'))
    return

  const nextPayload: PastoralRememberedRoute = {
    fullPath,
    name: String(input?.name || '').trim(),
    label: String(input?.label || '').trim() || '概览',
    recordedAt: Math.max(0, Number(input?.recordedAt || Date.now())),
  }

  window.localStorage.setItem(PASTORAL_LAST_ROUTE_KEY, JSON.stringify(nextPayload))
}

export function readPastoralSidebarCollapsed() {
  if (!canUseStorage())
    return false

  try {
    return window.localStorage.getItem(PASTORAL_SIDE_COLLAPSED_KEY) === '1'
  }
  catch {
    window.localStorage.removeItem(PASTORAL_SIDE_COLLAPSED_KEY)
    return false
  }
}

export function writePastoralSidebarCollapsed(collapsed: boolean) {
  if (!canUseStorage())
    return

  if (collapsed)
    window.localStorage.setItem(PASTORAL_SIDE_COLLAPSED_KEY, '1')
  else
    window.localStorage.removeItem(PASTORAL_SIDE_COLLAPSED_KEY)
}

export function readPastoralSidebarWidth() {
  if (!canUseStorage())
    return 0

  try {
    const raw = Number.parseInt(window.localStorage.getItem(PASTORAL_SIDE_WIDTH_KEY) || '0', 10)
    return Number.isFinite(raw) && raw > 0 ? raw : 0
  }
  catch {
    window.localStorage.removeItem(PASTORAL_SIDE_WIDTH_KEY)
    return 0
  }
}

export function writePastoralSidebarWidth(width: number) {
  if (!canUseStorage())
    return

  const normalized = Math.round(Number(width) || 0)
  if (normalized > 0)
    window.localStorage.setItem(PASTORAL_SIDE_WIDTH_KEY, String(normalized))
  else
    window.localStorage.removeItem(PASTORAL_SIDE_WIDTH_KEY)
}

export function readPastoralPlantRecommendStrategy(): PastoralPlantRecommendStrategy {
  if (!canUseStorage())
    return 'profit'

  try {
    const raw = String(window.localStorage.getItem(PASTORAL_PLANT_RECOMMEND_STRATEGY_KEY) || '').trim()
    if (raw === 'profit' || raw === 'exp' || raw === 'speed')
      return raw
  }
  catch {
    window.localStorage.removeItem(PASTORAL_PLANT_RECOMMEND_STRATEGY_KEY)
  }

  return 'profit'
}

export function writePastoralPlantRecommendStrategy(strategy: PastoralPlantRecommendStrategy) {
  if (!canUseStorage())
    return

  if (strategy === 'profit' || strategy === 'exp' || strategy === 'speed')
    window.localStorage.setItem(PASTORAL_PLANT_RECOMMEND_STRATEGY_KEY, strategy)
  else
    window.localStorage.removeItem(PASTORAL_PLANT_RECOMMEND_STRATEGY_KEY)
}

export function readPastoralPlantBatchTemplate(): PastoralPlantBatchTemplate {
  if (!canUseStorage())
    return 'top1'

  try {
    const raw = String(window.localStorage.getItem(PASTORAL_PLANT_BATCH_TEMPLATE_KEY) || '').trim()
    if (raw === 'top1' || raw === 'rotate2' || raw === 'reserve2')
      return raw
  }
  catch {
    window.localStorage.removeItem(PASTORAL_PLANT_BATCH_TEMPLATE_KEY)
  }

  return 'top1'
}

export function writePastoralPlantBatchTemplate(template: PastoralPlantBatchTemplate) {
  if (!canUseStorage())
    return

  if (template === 'top1' || template === 'rotate2' || template === 'reserve2')
    window.localStorage.setItem(PASTORAL_PLANT_BATCH_TEMPLATE_KEY, template)
  else
    window.localStorage.removeItem(PASTORAL_PLANT_BATCH_TEMPLATE_KEY)
}

export function readPastoralPlantCycleTemplate(): PastoralPlantCycleTemplate {
  if (!canUseStorage())
    return 'short'

  try {
    const raw = String(window.localStorage.getItem(PASTORAL_PLANT_CYCLE_TEMPLATE_KEY) || '').trim()
    if (raw === 'short' || raw === 'idle' || raw === 'gold')
      return raw
  }
  catch {
    window.localStorage.removeItem(PASTORAL_PLANT_CYCLE_TEMPLATE_KEY)
  }

  return 'short'
}

export function writePastoralPlantCycleTemplate(template: PastoralPlantCycleTemplate) {
  if (!canUseStorage())
    return

  if (template === 'short' || template === 'idle' || template === 'gold')
    window.localStorage.setItem(PASTORAL_PLANT_CYCLE_TEMPLATE_KEY, template)
  else
    window.localStorage.removeItem(PASTORAL_PLANT_CYCLE_TEMPLATE_KEY)
}

function normalizeNumericIdList(input: any) {
  return Array.from(new Set(
    (Array.isArray(input) ? input : [])
      .map(value => Number(value || 0))
      .filter(value => Number.isFinite(value) && value > 0),
  ))
}

function normalizeRetryPlantOperations(input: any): PastoralWorkflowRetryPlantOperation[] {
  return (Array.isArray(input) ? input : [])
    .map((item) => {
      const itemId = Number(item?.itemId || 0)
      const landIds = normalizeNumericIdList(item?.landIds)
      const count = Math.max(landIds.length, Number(item?.count || 0))
      if (!itemId || !landIds.length || !count)
        return null
      return {
        itemId,
        landIds,
        count,
        label: String(item?.label || `种子#${itemId}`).trim() || `种子#${itemId}`,
      }
    })
    .filter(Boolean) as PastoralWorkflowRetryPlantOperation[]
}

function normalizeRetryCareOperations(input: any): PastoralWorkflowRetryCareOperation[] {
  return (Array.isArray(input) ? input : [])
    .map((item) => {
      const type = String(item?.type || '').trim()
      const landIds = normalizeNumericIdList(item?.landIds)
      if (!['water', 'weed', 'bug'].includes(type) || !landIds.length)
        return null
      return {
        type: type as PastoralWorkflowRetryCareType,
        landIds,
        label: String(item?.label || '').trim() || type,
      }
    })
    .filter(Boolean) as PastoralWorkflowRetryCareOperation[]
}

function normalizeRetryFertilizerOperations(input: any): PastoralWorkflowRetryFertilizerOperation[] {
  return (Array.isArray(input) ? input : [])
    .map((item) => {
      const itemId = Number(item?.itemId || 0)
      const landIds = normalizeNumericIdList(item?.landIds)
      const tone = String(item?.tone || '').trim()
      const count = Math.max(landIds.length, Number(item?.count || 0))
      if (!itemId || !landIds.length || !count || !['normal', 'organic'].includes(tone))
        return null
      return {
        itemId,
        landIds,
        count,
        label: String(item?.label || `化肥#${itemId}`).trim() || `化肥#${itemId}`,
        tone: tone as 'normal' | 'organic',
      }
    })
    .filter(Boolean) as PastoralWorkflowRetryFertilizerOperation[]
}

export function readPastoralWorkflowMemory(): PastoralWorkflowMemory | null {
  if (!canUseStorage())
    return null

  try {
    const raw = window.localStorage.getItem(PASTORAL_WORKFLOW_MEMORY_KEY)
    if (!raw)
      return null

    const parsed = JSON.parse(raw)
    const accountId = String(parsed?.accountId || '').trim()
    if (!accountId)
      return null

    const stage = String(parsed?.stage || '').trim()
    if (!['plant', 'harvest-replant', 'care'].includes(stage))
      return null

    const recommendStrategy = String(parsed?.recommendStrategy || '').trim()
    const batchTemplate = String(parsed?.batchTemplate || '').trim()
    const cycleTemplate = String(parsed?.cycleTemplate || '').trim()

    return {
      accountId,
      accountLabel: String(parsed?.accountLabel || '').trim() || accountId,
      recordedAt: Math.max(0, Number(parsed?.recordedAt || 0)),
      stage: stage as PastoralWorkflowMemory['stage'],
      summaryText: String(parsed?.summaryText || '').trim(),
      detailText: String(parsed?.detailText || '').trim(),
      recommendStrategy: recommendStrategy === 'exp' || recommendStrategy === 'speed' ? recommendStrategy : 'profit',
      batchTemplate: batchTemplate === 'rotate2' || batchTemplate === 'reserve2' ? batchTemplate : 'top1',
      cycleTemplate: cycleTemplate === 'idle' || cycleTemplate === 'gold' ? cycleTemplate : 'short',
      retryHarvestLandIds: normalizeNumericIdList(parsed?.retryHarvestLandIds),
      retryPlantOperations: normalizeRetryPlantOperations(parsed?.retryPlantOperations),
      retryCareOperations: normalizeRetryCareOperations(parsed?.retryCareOperations),
      retryFertilizerOperations: normalizeRetryFertilizerOperations(parsed?.retryFertilizerOperations),
    }
  }
  catch {
    window.localStorage.removeItem(PASTORAL_WORKFLOW_MEMORY_KEY)
    return null
  }
}

export function writePastoralWorkflowMemory(memory: PastoralWorkflowMemory) {
  if (!canUseStorage())
    return

  const accountId = String(memory?.accountId || '').trim()
  if (!accountId) {
    window.localStorage.removeItem(PASTORAL_WORKFLOW_MEMORY_KEY)
    return
  }

  const nextPayload: PastoralWorkflowMemory = {
    accountId,
    accountLabel: String(memory?.accountLabel || '').trim() || accountId,
    recordedAt: Math.max(0, Number(memory?.recordedAt || Date.now())),
    stage: memory?.stage === 'plant' || memory?.stage === 'harvest-replant' || memory?.stage === 'care'
      ? memory.stage
      : 'care',
    summaryText: String(memory?.summaryText || '').trim(),
    detailText: String(memory?.detailText || '').trim(),
    recommendStrategy: memory?.recommendStrategy === 'exp' || memory?.recommendStrategy === 'speed'
      ? memory.recommendStrategy
      : 'profit',
    batchTemplate: memory?.batchTemplate === 'rotate2' || memory?.batchTemplate === 'reserve2'
      ? memory.batchTemplate
      : 'top1',
    cycleTemplate: memory?.cycleTemplate === 'idle' || memory?.cycleTemplate === 'gold'
      ? memory.cycleTemplate
      : 'short',
    retryHarvestLandIds: normalizeNumericIdList(memory?.retryHarvestLandIds),
    retryPlantOperations: normalizeRetryPlantOperations(memory?.retryPlantOperations),
    retryCareOperations: normalizeRetryCareOperations(memory?.retryCareOperations),
    retryFertilizerOperations: normalizeRetryFertilizerOperations(memory?.retryFertilizerOperations),
  }

  window.localStorage.setItem(PASTORAL_WORKFLOW_MEMORY_KEY, JSON.stringify(nextPayload))
}

export function clearPastoralWorkflowMemory() {
  if (!canUseStorage())
    return
  window.localStorage.removeItem(PASTORAL_WORKFLOW_MEMORY_KEY)
}

export function readPastoralReminderSnooze(): PastoralReminderSnooze | null {
  if (!canUseStorage())
    return null

  try {
    const raw = window.localStorage.getItem(PASTORAL_REMINDER_SNOOZE_KEY)
    if (!raw)
      return null

    const parsed = JSON.parse(raw)
    const accountId = String(parsed?.accountId || '').trim()
    const untilAt = Math.max(0, Number(parsed?.untilAt || 0))
    if (!accountId || !untilAt)
      return null

    return {
      accountId,
      untilAt,
      recordedAt: Math.max(0, Number(parsed?.recordedAt || 0)),
    }
  }
  catch {
    window.localStorage.removeItem(PASTORAL_REMINDER_SNOOZE_KEY)
    return null
  }
}

export function writePastoralReminderSnooze(snooze: PastoralReminderSnooze) {
  if (!canUseStorage())
    return

  const accountId = String(snooze?.accountId || '').trim()
  const untilAt = Math.max(0, Number(snooze?.untilAt || 0))
  if (!accountId || !untilAt) {
    window.localStorage.removeItem(PASTORAL_REMINDER_SNOOZE_KEY)
    return
  }

  const nextPayload: PastoralReminderSnooze = {
    accountId,
    untilAt,
    recordedAt: Math.max(0, Number(snooze?.recordedAt || Date.now())),
  }

  window.localStorage.setItem(PASTORAL_REMINDER_SNOOZE_KEY, JSON.stringify(nextPayload))
}

export function clearPastoralReminderSnooze() {
  if (!canUseStorage())
    return
  window.localStorage.removeItem(PASTORAL_REMINDER_SNOOZE_KEY)
}

import assert from 'node:assert/strict'
import test from 'node:test'

const { buildBugReportClientContext } = await import('../src/utils/bug-report-context.ts')

test('buildBugReportClientContext normalizes route, account, and runtime state', () => {
  const result = buildBugReportClientContext({
    route: {
      fullPath: '/friends?tab=online',
      name: 'friends',
    },
    account: {
      id: 'acc-1',
      name: '测试账号',
      uin: '10001',
      platform: 'qq',
      wsError: { code: 101, message: 'socket closed' },
    },
    status: {
      connection: { connected: true },
    },
    realtimeConnected: true,
    now: new Date('2026-03-18T10:20:00.000Z'),
    pageTitle: '好友管理',
    userAgent: 'Mozilla/5.0',
    language: 'zh-CN',
    timezone: 'Asia/Shanghai',
    screenWidth: 1512,
    screenHeight: 982,
    windowWidth: 1440,
    windowHeight: 860,
  })

  assert.deepEqual(result, {
    route: '/friends?tab=online',
    routeName: 'friends',
    pageTitle: '好友管理',
    accountId: 'acc-1',
    accountName: '测试账号',
    accountUin: '10001',
    accountPlatform: 'qq',
    accountConnected: 'true',
    realtimeConnected: 'true',
    wsErrorCode: '101',
    wsErrorMessage: 'socket closed',
    userAgent: 'Mozilla/5.0',
    language: 'zh-CN',
    timezone: 'Asia/Shanghai',
    screen: '1512x982',
    window: '1440x860',
    submittedAt: '2026-03-18T10:20:00.000Z',
  })
})

test('buildBugReportClientContext falls back to safe empty strings', () => {
  const result = buildBugReportClientContext()

  assert.equal(result.route, '')
  assert.equal(result.pageTitle, '')
  assert.equal(result.accountId, '')
  assert.equal(result.accountConnected, 'false')
  assert.equal(result.realtimeConnected, 'false')
  assert.equal(result.screen, '0x0')
  assert.equal(result.window, '0x0')
  assert.match(result.submittedAt, /^\d{4}-\d{2}-\d{2}T/)
})

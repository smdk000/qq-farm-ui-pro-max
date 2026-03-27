import assert from 'node:assert/strict'
import test from 'node:test'

const { buildFriendFetchSourceCopy } = await import('../src/utils/friend-fetch-status.ts')

test('buildFriendFetchSourceCopy marks live results as realtime friends', () => {
  assert.deepEqual(buildFriendFetchSourceCopy({
    source: 'live',
    platform: 'qq',
  }), {
    tone: 'success',
    label: '实时好友',
    description: '当前显示的是本次实时同步到的好友列表。',
  })
})

test('buildFriendFetchSourceCopy marks scoped cache as identity cache', () => {
  assert.deepEqual(buildFriendFetchSourceCopy({
    source: 'cache',
    reason: 'cache_fallback',
    platform: 'qq',
  }), {
    tone: 'warning',
    label: '身份缓存',
    description: '当前显示的是当前登录身份自己的好友缓存，不与其它账号共享。',
  })
})

test('buildFriendFetchSourceCopy marks interact-record fallback as visitor-seeded cache', () => {
  assert.deepEqual(buildFriendFetchSourceCopy({
    source: 'cache',
    cacheSource: 'interact_records',
    seededCount: 8,
    platform: 'wx',
  }), {
    tone: 'info',
    label: '访客补缓存',
    description: '当前显示的是最近访客/互动记录补建出来的临时好友列表，本次识别了 8 个访客种子。',
  })
})

test('buildFriendFetchSourceCopy marks cleared cache state explicitly', () => {
  assert.deepEqual(buildFriendFetchSourceCopy({
    source: 'empty',
    reason: 'cache_cleared',
    platform: 'qq',
  }), {
    tone: 'neutral',
    label: '缓存已清空',
    description: '当前账号的好友缓存已经清理，重新连接后可手动刷新重建。',
  })
})

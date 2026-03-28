export type FriendStatusTone = 'info' | 'warning' | 'danger' | 'success' | 'neutral'

export interface FriendFetchMetaLike {
  source?: string
  reason?: string
  platform?: string
  cacheSource?: string
  cacheScope?: string
  identityType?: string
  updatedAt?: number
  entryCount?: number
  seededCount?: number
  syncSource?: string
  importOpenIdCount?: number
}

export interface FriendStatusCopy {
  tone: FriendStatusTone
  title: string
  description: string
  badge?: string
}

export interface FriendFetchSourceCopy {
  tone: FriendStatusTone
  label: string
  description: string
  detail?: string
}

export interface FriendGuardCopyParams {
  event?: string
  result?: string
  reason?: string
}

export interface FriendLogShortcut {
  keyword: string
  label: string
}

function normalizeText(value: any) {
  return String(value || '').trim()
}

export function isWechatFriendPlatform(platform: any) {
  return normalizeText(platform).toLowerCase().startsWith('wx')
}

export function isQqFriendPlatform(platform: any) {
  return normalizeText(platform).toLowerCase() === 'qq'
}

export function formatFriendFetchReasonLabel(reason: string) {
  const value = normalizeText(reason)
  if (value === 'self_only')
    return '接口仅返回自己'
  if (value === 'empty')
    return '接口未返回可用好友'
  if (value === 'cooldown')
    return '当前先休息一会'
  if (value === 'error')
    return '接口请求异常'
  if (value === 'worker_error')
    return '运行时拉取失败'
  if (value === 'cache_fallback')
    return '已回退缓存好友'
  if (value === 'request_failed')
    return '请求失败'
  if (value === 'interact_seeded')
    return '已从访客记录补建缓存'
  if (value === 'interact_seed_empty')
    return '访客记录未补到好友'
  if (value === 'interact_seed_error')
    return '访客补缓存失败'
  return value || '未知原因'
}

export function formatFriendGuardResultLabel(result: string) {
  const value = normalizeText(result)
  if (value === 'sync_all_unsupported')
    return 'SyncAll 不支持'
  if (value === 'sync_all_skipped')
    return '已跳过 SyncAll'
  if (value === 'realtime_unavailable')
    return '实时好友暂不可用'
  if (value === 'manual_refresh_probe')
    return '手动刷新临时再试'
  if (value === 'cache_fallback')
    return '已回退缓存'
  if (value === 'error_cache')
    return '异常后回退缓存'
  if (value === 'error_empty')
    return '异常且无缓存'
  if (value === 'force_get_all_ignored')
    return '已忽略强效兼容尝试'
  if (value === 'empty')
    return '未拿到可用好友'
  if (value === 'blocked')
    return '已阻断'
  return value || '-'
}

function appendCooldownHint(description: string, cooldownText: string) {
  const normalizedCooldown = normalizeText(cooldownText)
  if (!normalizedCooldown)
    return description
  return `${description} 自动重试约 ${normalizedCooldown} 后恢复，你也可以点击上方“手动刷新”立即再试一次。`
}

function appendSeedCacheHint(description: string) {
  return `${description} 你也可以点击上方“访客补缓存”，尝试从最近访客/互动记录补一份临时好友列表。`
}

export function buildFriendFetchBannerCopy(meta: FriendFetchMetaLike | null | undefined, cooldownText = ''): FriendStatusCopy | null {
  const source = normalizeText(meta?.source || 'live') || 'live'
  const reason = normalizeText(meta?.reason)
  const platform = normalizeText(meta?.platform)
  const cacheSource = normalizeText(meta?.cacheSource)
  const syncSource = normalizeText(meta?.syncSource)
  const importOpenIdCount = Math.max(0, Number(meta?.importOpenIdCount || 0))
  const seededCount = Math.max(0, Number(meta?.seededCount || 0))

  if (source === 'live' && !reason)
    return null

  if (isWechatFriendPlatform(platform)) {
    if (source === 'cache') {
      if (cacheSource === 'interact_records') {
        const countText = seededCount > 0 ? `，本次补建了 ${seededCount} 个访客种子` : ''
        return {
          tone: 'warning',
          title: '微信好友链路已回退到访客缓存',
          description: appendCooldownHint(`微信实时好友当前不可用，系统已根据最近访客/互动记录补建一份临时好友缓存${countText}。这份列表可能不完整，但比纯空结果更适合临时查看。`, cooldownText),
          badge: '访客缓存',
        }
      }
      let description = '微信实时好友当前不可用，系统已回退到缓存好友展示，并继续保持保守跳过自动好友互动。'
      if (reason === 'self_only')
        description = '微信实时好友当前只返回你自己，系统已回退到缓存好友，并暂停重复实时探测。'
      else if (reason === 'empty')
        description = '微信实时好友当前没有返回可用好友，系统已回退到缓存好友，并先休息一会。'
      else if (reason === 'error' || reason === 'request_failed')
        description = '微信实时好友当前请求异常，系统已回退到缓存好友，并暂停短时间内的重复尝试。'
      else if (reason === 'worker_error')
        description = '好友服务本轮获取失败，系统已回退到缓存好友展示。'
      return {
        tone: 'warning',
        title: '微信好友链路已回退缓存',
        description: appendCooldownHint(description, cooldownText),
        badge: '缓存展示',
      }
    }

    if (source === 'empty') {
      if (cacheSource === 'interact_records') {
        if (reason === 'interact_seed_error') {
          return {
            tone: 'danger',
            title: '访客补缓存失败',
            description: appendSeedCacheHint('系统已经尝试从最近访客/互动记录补建临时好友缓存，但这次没有成功，请稍后再试。'),
            badge: '补缓存失败',
          }
        }
        return {
          tone: 'danger',
          title: '访客记录里也没有可用好友',
          description: appendSeedCacheHint(appendCooldownHint('微信实时好友当前不可用，而且最近访客/互动记录也没有补出可用好友，所以页面暂时仍然无法展示好友。', cooldownText)),
          badge: '访客为空',
        }
      }
      let description = '微信实时好友当前不可用，而且本地也没有可回退的缓存好友。'
      if (reason === 'self_only')
        description = '微信实时好友当前只返回你自己，而且本地没有可用缓存，所以页面暂时无法展示好友。'
      else if (reason === 'error' || reason === 'request_failed')
        description = '微信实时好友当前请求异常，而且本地没有可用缓存，所以页面暂时无法展示好友。'
      return {
        tone: 'danger',
        title: '微信好友链路未拿到可用结果',
        description: appendSeedCacheHint(appendCooldownHint(description, cooldownText)),
        badge: '暂未同步',
      }
    }
  }

  if (isQqFriendPlatform(platform)) {
    if (source === 'live' && syncSource === 'imported_syncall' && importOpenIdCount > 0) {
      return {
        tone: 'success',
        title: 'QQ 已按导入的 SyncAll 源同步好友',
        description: `当前好友列表来自你手动导入的 SyncAll 请求，共携带 ${importOpenIdCount} 个 open_id，页面展示的是这次实时同步结果。`,
        badge: '导入同步源',
      }
    }

    if (source === 'cache') {
      if (syncSource === 'imported_syncall' && importOpenIdCount > 0) {
        return {
          tone: 'warning',
          title: '导入的 SyncAll 源本轮回退到缓存',
          description: `系统已经按你导入的 ${importOpenIdCount} 个 open_id 尝试 SyncAll，但这次没有拿到可用实时好友，所以页面暂时回退到缓存好友。`,
          badge: '缓存展示',
        }
      }
      return {
        tone: 'warning',
        title: 'QQ 保守链路已回退缓存',
        description: '这次 SyncAll 没有拿到可用实时好友，页面已回退到缓存好友，系统不会继续追加其他接口探测。',
        badge: '缓存展示',
      }
    }

    if (source === 'empty') {
      if (syncSource === 'imported_syncall' && importOpenIdCount > 0) {
        return {
          tone: 'danger',
          title: '导入的 SyncAll 源未拿到可用好友',
          description: `系统已经按你导入的 ${importOpenIdCount} 个 open_id 发起 SyncAll，但这次既没有拿到可用实时好友，也没有缓存可回退，所以页面暂时无法展示好友。`,
          badge: '暂未同步',
        }
      }
      return {
        tone: 'danger',
        title: 'QQ 保守链路未拿到可用好友',
        description: '这次 SyncAll 没有拿到可用实时好友，而且当前也没有可回退的缓存好友，所以页面暂时无法展示好友。',
        badge: '暂未同步',
      }
    }
  }

  if (source === 'cache') {
    return {
      tone: 'warning',
      title: '好友列表已回退缓存',
      description: '本轮未拿到最新好友列表，页面已回退到缓存数据，内容可能不是最新状态。',
      badge: '缓存展示',
    }
  }

  if (source === 'empty' && reason === 'request_failed') {
    return {
      tone: 'danger',
      title: '好友列表加载失败',
      description: '本轮没有拿到实时好友，也没有可用缓存，请稍后重试。',
      badge: '加载失败',
    }
  }

  return null
}

export function buildFriendFetchSourceCopy(meta: FriendFetchMetaLike | null | undefined): FriendFetchSourceCopy {
  const source = normalizeText(meta?.source || 'live') || 'live'
  const reason = normalizeText(meta?.reason)
  const cacheSource = normalizeText(meta?.cacheSource)
  const cacheScope = normalizeText(meta?.cacheScope)
  const identityType = normalizeText(meta?.identityType)
  const updatedAt = Math.max(0, Number(meta?.updatedAt || 0))
  const entryCount = Math.max(0, Number(meta?.entryCount || 0))
  const seededCount = Math.max(0, Number(meta?.seededCount || 0))
  const updatedText = updatedAt > 0 ? new Date(updatedAt).toLocaleString('zh-CN', { hour12: false }) : ''
  const identityText = identityType === 'qq'
    ? 'QQ号'
    : identityType === 'openid'
      ? 'OpenID'
      : identityType === 'uin'
        ? 'UIN'
        : ''
  const scopeText = cacheScope === 'identity'
    ? '当前登录身份作用域'
    : cacheScope === 'legacy'
      ? '历史账号缓存键'
      : ''
  const detailParts = []
  if (entryCount > 0)
    detailParts.push(`缓存 ${entryCount} 人`)
  if (scopeText)
    detailParts.push(scopeText)
  if (identityText)
    detailParts.push(`按 ${identityText} 隔离`)
  if (updatedText)
    detailParts.push(`更新于 ${updatedText}`)
  const detail = detailParts.join(' · ')

  if (source === 'cache') {
    if (cacheSource === 'interact_records') {
      return {
        tone: 'info',
        label: '访客补缓存',
        description: seededCount > 0
          ? `当前显示的是最近访客/互动记录补建出来的临时好友列表，本次识别了 ${seededCount} 个访客种子。`
          : '当前显示的是最近访客/互动记录补建出来的临时好友列表。',
        detail,
      }
    }
    return {
      tone: 'warning',
      label: '身份缓存',
      description: '当前显示的是当前登录身份自己的好友缓存，不与其它账号共享。',
      detail,
    }
  }

  if (source === 'empty') {
    if (reason === 'cache_cleared') {
      return {
        tone: 'neutral',
        label: '缓存已清空',
        description: '当前账号的好友缓存已经清理，重新连接后可手动刷新重建。',
        detail,
      }
    }
    if (reason === 'cache_rebuilt_empty') {
      return {
        tone: 'warning',
        label: '重建后仍为空',
        description: '缓存已经按当前账号清理并重建，但暂未拿到可用好友。',
        detail,
      }
    }
    if (cacheSource === 'interact_records') {
      return {
        tone: 'danger',
        label: '访客缓存未就绪',
        description: seededCount > 0
          ? `最近访客/互动记录里已经识别出 ${seededCount} 个访客种子，但还没补成可用好友列表。`
          : '最近访客/互动记录暂时也没补成可用好友列表。',
        detail,
      }
    }
    const reasonLabel = formatFriendFetchReasonLabel(reason)
    return {
      tone: 'danger',
      label: '暂无可用好友',
      description: reason ? `当前账号暂未拿到可用好友，原因：${reasonLabel}。` : '当前账号暂未拿到可用好友。',
      detail,
    }
  }

  if (source === 'live') {
    return {
      tone: 'success',
      label: '实时好友',
      description: '当前显示的是本次实时同步到的好友列表。',
      detail: updatedText ? `最近一次缓存写入时间 ${updatedText}` : '',
    }
  }

  return {
    tone: 'info',
    label: '好友状态',
    description: '当前显示的是当前账号最近一次可用的好友结果。',
    detail,
  }
}

export function buildFriendGuardCopy(params: FriendGuardCopyParams): FriendStatusCopy | null {
  const event = normalizeText(params?.event)
  const result = normalizeText(params?.result)
  const reason = normalizeText(params?.reason)

  if (event === 'wx_friend_fetch_guard') {
    if (result === 'sync_all_unsupported') {
      return {
        tone: 'warning',
        title: '微信账号已确认不支持 SyncAll',
        description: '微信实时好友当前不支持 SyncAll，系统后续会固定跳过这个接口，避免继续无效探测。',
      }
    }

    if (result === 'sync_all_skipped') {
      return {
        tone: 'info',
        title: '微信账号已跳过 SyncAll',
        description: '系统已记住当前微信账号不支持 SyncAll，所以本轮会直接跳过该接口。',
      }
    }

    if (result === 'realtime_unavailable') {
      let description = '微信实时好友当前没有可用结果，系统已暂停自动实时探测，改走缓存或空结果模式。'
      if (reason === 'self_only')
        description = '微信实时好友当前只返回你自己，系统已暂停自动实时探测，改走缓存或空结果模式。'
      else if (reason === 'empty')
        description = '微信实时好友当前没有返回可用好友，系统已暂停自动实时探测，改走缓存或空结果模式。'
      else if (reason === 'error')
        description = '微信实时好友当前请求异常，系统已暂停自动实时探测，改走缓存或空结果模式。'
      return {
        tone: 'warning',
        title: '微信实时好友先休息一会',
        description,
      }
    }

    if (result === 'manual_refresh_probe') {
      return {
        tone: 'info',
        title: '手动刷新已临时再试一次',
        description: '这次请求是手动触发的单次探测，只会额外打一轮 GetAll，不会恢复自动重试。',
      }
    }

    if (result === 'cache_fallback') {
      return {
        tone: 'warning',
        title: '微信好友链路已回退缓存',
        description: '微信实时好友当前不可用，系统本轮直接展示缓存好友，不会继续追加其他接口探测。',
      }
    }

    if (result === 'error_cache') {
      return {
        tone: 'warning',
        title: '微信好友链路已回退缓存',
        description: '微信实时好友当前请求异常，系统本轮直接回退缓存好友，并停止追加接口探测。',
      }
    }

    if (result === 'error_empty' || result === 'empty') {
      return {
        tone: 'danger',
        title: '微信好友链路未拿到可用结果',
        description: result === 'error_empty'
          ? '微信实时好友当前请求异常，而且没有可回退的缓存好友，所以本轮直接停止。'
          : '微信实时好友当前处于休息一会或兼容冷却期，而且没有可用缓存，因此本轮只返回空结果。',
      }
    }
  }

  if (event === 'qq_friend_fetch_guard') {
    if (result === 'force_get_all_ignored') {
      return {
        tone: 'info',
        title: 'QQ 保守链路已忽略额外兼容探测',
        description: '当前 QQ 已锁定保守单链路，系统不会再因为兼容模式去额外触发 GetAll 或 GetGameFriends。',
      }
    }

    if (result === 'cache_fallback') {
      return {
        tone: 'warning',
        title: 'QQ 保守链路已回退缓存',
        description: '这次 SyncAll 没有拿到可用实时好友，系统没有再继续探测其他接口，而是直接回退到本地缓存。',
      }
    }

    if (result === 'empty') {
      return {
        tone: 'danger',
        title: 'QQ 保守链路未拿到可用好友',
        description: '这次 SyncAll 没有拿到可用实时好友，而且系统按保守策略直接停止追加探测。',
      }
    }
  }

  if (event === 'wx_friend_fetch_guard' || event === 'qq_friend_fetch_guard') {
    return {
      tone: event === 'qq_friend_fetch_guard'
        ? ((result === 'empty' || result === 'blocked') ? 'danger' : 'warning')
        : ((result === 'error_empty' || result === 'empty') ? 'danger' : 'warning'),
      title: event === 'wx_friend_fetch_guard' ? '微信好友链路说明' : 'QQ 好友链路说明',
      description: '本条日志记录了好友链路状态调整。',
    }
  }

  return null
}

export function buildFriendLogShortcut(meta: FriendFetchMetaLike | null | undefined): FriendLogShortcut | null {
  const platform = normalizeText(meta?.platform)
  const source = normalizeText(meta?.source || 'live') || 'live'
  const reason = normalizeText(meta?.reason)

  if (isWechatFriendPlatform(platform) && (source === 'cache' || source === 'empty' || !!reason)) {
    return {
      keyword: 'wx_friend_fetch_guard',
      label: '查看微信好友日志',
    }
  }

  if (isQqFriendPlatform(platform) && (source === 'cache' || source === 'empty' || !!reason)) {
    return {
      keyword: 'qq_friend_fetch_guard',
      label: '查看 QQ 好友日志',
    }
  }

  if (source === 'cache' || source === 'empty') {
    return {
      keyword: 'friend_cache_reuse',
      label: '查看好友缓存日志',
    }
  }

  return null
}

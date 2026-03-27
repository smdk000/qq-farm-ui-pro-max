import type { Page, Route } from '@playwright/test'

type JsonValue = Record<string, any>

interface MockAdminAppOptions {
  handleRoute?: (route: Route, url: URL, fulfillJson: (payload: JsonValue) => Promise<void>) => Promise<boolean> | boolean
}

function ok(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  }
}

function baseSystemUpdateOverview() {
  return {
    currentVersion: 'v4.5.25',
    latestVersion: 'v4.5.46',
    latestRelease: {
      versionTag: 'v4.5.46',
      title: 'v4.5.46 发布',
      url: 'https://example.com/releases/v4.5.46',
      publishedAt: '2026-03-27T08:00:00.000Z',
      notes: '单文件 install-or-update 会自动补齐缺失脚本。\n一键安装入口重新打通。',
      assets: [
        {
          name: 'qq-farm-bot-ui-v4.5.46.tar.gz',
          size: 1024 * 1024 * 128,
          url: 'https://example.com/assets/v4.5.46.tar.gz',
        },
      ],
    },
    runtime: {
      lastCheckedAt: '2026-03-27T08:10:00.000Z',
      status: 'idle',
      sourceLabel: 'GitHub Releases',
      lastError: '',
      agentSummary: [
        {
          nodeId: 'agent-a',
          managedNodeIds: ['worker-a', 'worker-b'],
          status: 'idle',
          version: 'v4.5.25',
        },
      ],
      clusterNodes: [
        {
          nodeId: 'worker-a',
          assignedCount: 2,
          assignedAccountIds: ['acc-1', 'acc-2'],
          connected: true,
          draining: false,
          role: 'worker',
        },
        {
          nodeId: 'worker-b',
          assignedCount: 0,
          assignedAccountIds: [],
          connected: true,
          draining: true,
          role: 'worker',
        },
      ],
    },
    config: {
      provider: 'github_release',
      manifestUrl: '',
      releaseApiUrl: '',
      githubOwner: 'smdk000',
      githubRepo: 'qq-farm-ui-pro-max',
      channel: 'stable',
      allowPreRelease: false,
      preferredStrategy: 'rolling',
      preferredScope: 'worker',
      requireDrain: true,
      maintenanceWindow: '02:00-05:00',
      autoSyncAnnouncements: true,
      autoRunVerification: true,
      promptRollbackOnFailure: true,
      defaultLogTailLines: 80,
      agentMode: 'db_polling',
      agentPollIntervalSec: 15,
      defaultDrainNodeIds: ['worker-a'],
    },
    drainCutoverReadiness: {
      canDrainCutover: false,
      blockerCount: 1,
      warningCount: 1,
      targetedRunningAccountCount: 2,
      estimatedDrainSeconds: 180,
      blockers: [
        {
          accountId: 'acc-1',
          accountName: '演示账号 A',
          nodeId: 'worker-a',
          credentialKind: 'qr',
          platform: 'qq',
          message: '当前账号仍在节点 worker-a 上运行，切换后需要重新登录。',
        },
      ],
      blockingNodes: [
        {
          nodeId: 'worker-a',
          blockerCount: 1,
        },
      ],
    },
    announcementPreview: {
      added: 2,
      updated: 1,
      skipped: 0,
      totalParsed: 3,
      latestVersion: 'v4.5.46',
      sources: { release_cache: 2, embedded: 1 },
      entries: [
        {
          title: '一键安装单文件 bootstrap 修复',
          version: 'v4.5.46',
          publishDate: '2026-03-27',
          summary: 'install-or-update 单文件执行时会自动补齐缺失脚本，一键安装入口重新打通。',
          sourceType: 'release_cache',
        },
      ],
    },
    syncRecommendation: {
      suggested: true,
      reason: '检测到 2 条可新增公告',
      pendingCount: 3,
      latestVersion: 'v4.5.46',
    },
    activeJob: {
      id: 301,
      jobKey: 'upd_301_demo',
      status: 'failed',
      kind: 'worker_update',
      scope: 'worker',
      strategy: 'rolling',
      sourceVersion: 'v4.5.25',
      targetVersion: 'v4.5.46',
      targetAgentId: 'agent-a',
      claimAgentId: 'agent-a',
      createdAt: Date.now() - 60_000,
      executionPhase: 'verify',
      progressPercent: 92,
      summaryMessage: 'Verification failed after update',
      errorMessage: 'verify-stack.sh exited with non-zero status',
      drainNodeIds: ['worker-a'],
      result: {
        logFile: '/opt/qq-farm-current/logs/update-job-301.log',
      },
      verification: {
        ok: false,
        verifyLogFile: '/opt/qq-farm-current/logs/update-job-301-verify.log',
      },
      rollbackPayload: {
        previousVersion: 'v4.5.25',
        rollbackCommandSummary: 'update-app.sh --deploy-dir /opt/qq-farm-current --image smdk000/qq-farm-bot-ui:4.5.25',
      },
    },
    activeBatch: {
      batchKey: 'upd_batch_demo',
      scope: 'cluster',
      strategy: 'rolling',
      status: 'running',
      total: 2,
      runningCount: 1,
      failedCount: 1,
      blockedNodeCount: 1,
      runningNodeCount: 1,
      failedNodeCount: 1,
      progressPercent: 52,
      targetVersion: 'v4.5.46',
      sourceVersion: 'v4.5.25',
      targetAgentIds: ['agent-a'],
      claimAgentIds: ['agent-a'],
      drainNodeIds: ['worker-a'],
      executionPhase: 'verify',
      failedCategories: {
        verification_failed: 1,
      },
      perNodePhase: {
        'worker-a': 'verify',
        'worker-b': 'preflight',
      },
      perNodeErrorSummary: {
        'worker-a': 'verify-stack.sh exited with non-zero status',
      },
      childJobsByAgent: {
        'agent-a': [
          {
            id: 301,
            jobKey: 'upd_301_demo',
            status: 'failed',
            executionPhase: 'verify',
            summaryMessage: 'Verification failed after update',
            errorMessage: 'verify-stack.sh exited with non-zero status',
          },
          {
            id: 302,
            jobKey: 'upd_302_demo',
            status: 'running',
            executionPhase: 'apply_update',
            summaryMessage: 'Applying update',
            errorMessage: '',
          },
        ],
      },
    },
  }
}

function baseSystemUpdateJobs(overview = baseSystemUpdateOverview()) {
  return {
    jobs: overview.activeJob ? [overview.activeJob] : [],
    batches: overview.activeBatch ? [overview.activeBatch] : [],
  }
}

function baseSystemUpdateJobDetail(overview = baseSystemUpdateOverview()) {
  return {
    job: overview.activeJob,
    currentPhase: overview.activeJob?.executionPhase || 'queued',
    preflight: {
      ok: false,
      blockerCount: 1,
      warningCount: 1,
      checks: [
        {
          key: 'image',
          label: '目标镜像',
          message: '目标镜像存在，可继续执行。',
          blocker: false,
          warning: false,
        },
        {
          key: 'relogin',
          label: '重登录风险',
          message: '节点上仍有需要重新登录的运行账号。',
          blocker: true,
          warning: false,
        },
      ],
    },
    verification: overview.activeJob?.verification || null,
    rollbackPayload: overview.activeJob?.rollbackPayload || null,
    resultSignature: 'demo-signature',
    logFilePath: overview.activeJob?.result?.logFile || '',
    latestLogId: 9002,
    logs: [
      {
        id: 9002,
        phase: 'verify',
        level: 'error',
        message: 'verify-stack.sh exited with non-zero status',
        createdAt: Date.now() - 20_000,
      },
      {
        id: 9001,
        phase: 'apply_update',
        level: 'info',
        message: 'Invoking update-app.sh',
        createdAt: Date.now() - 40_000,
      },
    ],
  }
}

export async function seedAdminSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('admin_token', 'admin')
    localStorage.setItem('current_user', JSON.stringify({ username: 'admin', role: 'admin' }))
    localStorage.setItem('app_seen_version', 'v4.5.25')
    localStorage.setItem('announcement_dismissed_id', 'dismissed')
  })
}

export async function dismissBlockingDialogs(page: Page) {
  const confirmButton = page.getByRole('button', { name: '我知道了，立即体验' })
  if (await confirmButton.isVisible().catch(() => false))
    await confirmButton.click()
}

export async function mockAdminAppApis(page: Page, options: MockAdminAppOptions = {}) {
  const overview = baseSystemUpdateOverview()
  const jobs = baseSystemUpdateJobs(overview)
  const jobDetail = baseSystemUpdateJobDetail(overview)

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const fulfillJson = async (payload: JsonValue) => route.fulfill(ok(payload))

    if (options.handleRoute && await options.handleRoute(route, url, fulfillJson))
      return

    if (path === '/api/auth/validate')
      return fulfillJson({ ok: true, data: { user: { username: 'admin', role: 'admin' } } })

    if (path === '/api/ui-config')
      return fulfillJson({ ok: true, data: { siteTitle: 'QQ农场智能助手', supportQqGroup: '227916149' } })

    if (path.startsWith('/api/view-preferences'))
      return fulfillJson({ ok: true, data: { appSeenVersion: 'v4.5.25', announcementDismissedId: 'dismissed' } })

    if (path === '/api/accounts') {
      return fulfillJson({
        ok: true,
        data: {
          accounts: [
            {
              id: 'demo-1',
              name: '演示账号',
              username: 'demo',
              platform: 'qq',
              accountMode: 'main',
              running: false,
              connected: false,
            },
          ],
        },
      })
    }

    if (path === '/api/account-selection')
      return fulfillJson({ ok: true })

    if (path === '/api/seeds' || path === '/api/bag/plantable-seeds')
      return fulfillJson({ ok: true, data: [] })

    if (path === '/api/settings') {
      return fulfillJson({
        ok: true,
        data: {
          accountMode: 'main',
          harvestDelay: { min: 0, max: 0 },
          riskPromptEnabled: true,
          modeScope: { zoneScope: 'same_zone_only', requiresGameFriend: true, fallbackBehavior: 'standalone' },
          plantingStrategy: 'preferred',
          plantingFallbackStrategy: 'level',
          preferredSeedId: 0,
          bagSeedPriority: [],
          bagSeedFallbackStrategy: 'level',
          inventoryPlanting: { mode: 'disabled', globalKeepCount: 0, reserveRules: [] },
          intervals: {},
          friendQuietHours: { enabled: false, start: '23:00', end: '07:00' },
          stakeoutSteal: { enabled: false, delaySec: 3 },
          qqHighRiskWindow: { durationMinutes: 30, expiresAt: 0, lastIssuedAt: 0, lastAutoDisabledAt: 0 },
          tradeConfig: { sell: { keepMinEachFruit: 0, keepFruitIds: [] } },
          automation: {},
          reportConfig: { enabled: false },
          ui: {},
          workflowConfig: {
            farm: { enabled: false, minInterval: 30, maxInterval: 120, nodes: [] },
            friend: { enabled: false, minInterval: 60, maxInterval: 300, nodes: [] },
          },
          offlineReminder: {
            channel: 'webhook',
            reloginUrlMode: 'none',
            endpoint: '',
            token: '',
            title: '账号下线提醒',
            msg: '账号下线',
            offlineDeleteEnabled: false,
            offlineDeleteSec: 1,
            webhookCustomJsonEnabled: false,
            webhookCustomJsonTemplate: '',
          },
        },
      })
    }

    if (path === '/api/settings/timing-config')
      return fulfillJson({ ok: true, data: { heartbeatIntervalMs: 25_000, rateLimitIntervalMs: 600, readonlyTimingParams: [] } })

    if (path === '/api/trial-card-config')
      return fulfillJson({ ok: true, data: { enabled: true, days: 1, dailyLimit: 50 } })

    if (path === '/api/admin/third-party-api')
      return fulfillJson({ ok: true, data: { wxApiKey: '', wxApiUrl: '', wxAppId: '', ipad860Url: '', aineisheKey: '' } })

    if (path === '/api/system-settings/health') {
      return fulfillJson({
        ok: true,
        data: {
          ok: true,
          checkedAt: Date.now(),
          missingRequiredKeys: [],
          fallbackWouldActivateKeys: [],
          webAssets: {
            activeDir: '/opt/qq-farm-current/web/dist-runtime',
            activeSource: 'preview',
            selectionReason: 'preview',
            selectionReasonLabel: '预览模式',
            buildTargetDir: '/opt/qq-farm-current/web/dist-runtime',
            buildTargetSource: 'runtime',
            defaultDir: '/opt/qq-farm-current/web/dist',
            defaultHasAssets: true,
            defaultWritable: true,
            fallbackDir: '/opt/qq-farm-current/web/dist-runtime',
            fallbackHasAssets: true,
            fallbackWritable: true,
          },
        },
      })
    }

    if (path === '/api/qq-friend-diagnostics')
      return fulfillJson({ ok: true, data: { summary: { protocolLikely: 'qq-host-bridge' }, redisCaches: [], availableFiles: [] } })

    if (path === '/api/admin/cluster-config')
      return fulfillJson({ ok: true, data: { dispatcherStrategy: 'round_robin' } })

    if (path === '/api/admin/system-update/overview')
      return fulfillJson({ ok: true, data: overview })

    if (path === '/api/admin/system-update/jobs')
      return fulfillJson({ ok: true, data: jobs })

    if (path === '/api/admin/system-update/check')
      return fulfillJson({ ok: true, data: overview })

    if (path === '/api/admin/system-update/sync-announcements') {
      return fulfillJson({
        ok: true,
        data: {
          syncResult: {
            added: 2,
            updated: 1,
            skipped: 0,
            latestVersion: 'v4.5.46',
            previewCount: 3,
            sourceStats: { release_cache: 2, embedded: 1 },
          },
          overview: {
            ...overview,
            syncRecommendation: {
              suggested: false,
              reason: '当前公告已与系统版本源保持同步',
              pendingCount: 0,
              latestVersion: 'v4.5.46',
            },
            lastAnnouncementSyncResult: {
              added: 2,
              updated: 1,
              skipped: 0,
              latestVersion: 'v4.5.46',
            },
          },
        },
      })
    }

    if (path === '/api/admin/system-update/preflight') {
      return fulfillJson({
        ok: true,
        data: {
          ok: false,
          blockerCount: 1,
          warningCount: 1,
          checks: jobDetail.preflight.checks,
          blockers: ['运行中账号仍需重登录'],
        },
      })
    }

    if (/^\/api\/admin\/system-update\/jobs\/\d+\/logs$/.test(path))
      return fulfillJson({ ok: true, data: jobDetail })

    if (/^\/api\/admin\/system-update\/jobs\/\d+\/rollback$/.test(path))
      return fulfillJson({ ok: true, data: { job: { ...overview.activeJob, id: 401, jobKey: 'upd_401_rollback', kind: 'rollback_update', targetVersion: 'v4.5.25' } } })

    if (path === '/api/admin/system-update/nodes/worker-b/drain')
      return fulfillJson({ ok: true, data: { node: { nodeId: 'worker-b', draining: false } } })

    if (path === '/api/announcement')
      return fulfillJson({ ok: true, data: [] })

    if (path === '/api/announcement/sync') {
      return fulfillJson({
        ok: true,
        data: {
          added: 2,
          updated: 1,
          skipped: 0,
          totalParsed: 3,
          latestVersion: 'v4.5.46',
          previewCount: 3,
          sourceStats: { release_cache: 2, embedded: 1 },
        },
      })
    }

    if (path === '/api/users')
      return fulfillJson({ ok: true, data: [{ id: 1, username: 'admin', role: 'admin' }] })

    if (path === '/api/system-logs')
      return fulfillJson({ ok: true, data: { list: [], total: 0, page: 1, pageSize: 20 } })

    if (path === '/api/reports/history')
      return fulfillJson({ ok: true, data: { items: [], page: 1, pageSize: 3, total: 0, totalPages: 1 } })

    if (path === '/api/reports/history/stats')
      return fulfillJson({ ok: true, data: { total: 0, successCount: 0, failedCount: 0, testCount: 0, hourlyCount: 0, dailyCount: 0 } })

    return fulfillJson({ ok: true, data: {} })
  })

  await seedAdminSession(page)
}

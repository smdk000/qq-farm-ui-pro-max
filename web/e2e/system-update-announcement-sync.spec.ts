import { expect, test } from '@playwright/test'

import { dismissBlockingDialogs, mockAdminAppApis } from './support/mock-admin-app'

test.beforeEach(async ({ page }) => {
  let checked = false
  let announcements = [] as Array<{ id: number, title: string, version: string, publish_date: string, content: string, enabled: boolean }>

  await page.addInitScript(() => {
    window.confirm = () => true
  })

  await mockAdminAppApis(page, {
    async handleRoute(route, url, fulfillJson) {
      const path = url.pathname

      if (path === '/api/admin/system-update/overview' || path === '/api/admin/system-update/check') {
        if (path === '/api/admin/system-update/check')
          checked = true

        return fulfillJson({
          ok: true,
          data: {
            currentVersion: 'v4.5.25',
            latestRelease: checked
              ? {
                  versionTag: 'v4.5.46',
                  title: 'v4.5.46 发布',
                  url: 'https://example.com/releases/v4.5.46',
                  publishedAt: '2026-03-27T08:00:00.000Z',
                  notes: '一键安装单文件 bootstrap 修复。',
                  assets: [],
                }
              : null,
            runtime: {
              lastCheckedAt: '2026-03-27T08:10:00.000Z',
              status: 'idle',
              sourceLabel: 'GitHub Releases',
              lastError: '',
              agentSummary: [],
              clusterNodes: [],
            },
            config: {
              provider: 'github_release',
              preferredScope: 'worker',
              preferredStrategy: 'rolling',
              allowPreRelease: false,
              requireDrain: false,
              maintenanceWindow: '02:00-05:00',
              autoSyncAnnouncements: true,
              autoRunVerification: true,
              promptRollbackOnFailure: true,
              defaultLogTailLines: 80,
              defaultDrainNodeIds: [],
            },
            drainCutoverReadiness: {
              canDrainCutover: true,
              blockerCount: 0,
              warningCount: 0,
              blockers: [],
              blockingNodes: [],
            },
            announcementPreview: checked
              ? {
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
                }
              : null,
            syncRecommendation: checked
              ? {
                  suggested: true,
                  reason: '检测到 2 条可新增公告',
                  pendingCount: 3,
                  latestVersion: 'v4.5.46',
                }
              : null,
            activeJob: null,
            activeBatch: null,
          },
        }).then(() => true)
      }

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
              currentVersion: 'v4.5.25',
              latestRelease: {
                versionTag: 'v4.5.46',
                title: 'v4.5.46 发布',
                url: 'https://example.com/releases/v4.5.46',
                publishedAt: '2026-03-27T08:00:00.000Z',
                notes: '一键安装单文件 bootstrap 修复。',
                assets: [],
              },
              runtime: {
                lastCheckedAt: '2026-03-27T08:10:00.000Z',
                status: 'idle',
                sourceLabel: 'GitHub Releases',
                lastError: '',
                agentSummary: [],
                clusterNodes: [],
              },
              config: {
                provider: 'github_release',
                preferredScope: 'worker',
                preferredStrategy: 'rolling',
                allowPreRelease: false,
                requireDrain: false,
                maintenanceWindow: '02:00-05:00',
                autoSyncAnnouncements: true,
                autoRunVerification: true,
                promptRollbackOnFailure: true,
                defaultLogTailLines: 80,
                defaultDrainNodeIds: [],
              },
              drainCutoverReadiness: {
                canDrainCutover: true,
                blockerCount: 0,
                warningCount: 0,
                blockers: [],
                blockingNodes: [],
              },
              announcementPreview: {
                added: 0,
                updated: 0,
                skipped: 3,
                totalParsed: 3,
                latestVersion: 'v4.5.46',
                sources: { release_cache: 2, embedded: 1 },
                entries: [],
              },
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
              activeJob: null,
              activeBatch: null,
            },
          },
        }).then(() => true)
      }

      if (path === '/api/announcement')
        return fulfillJson({ ok: true, data: announcements }).then(() => true)

      if (path === '/api/announcement/sync') {
        announcements = [
          {
            id: 1,
            title: '一键安装单文件 bootstrap 修复',
            version: 'v4.5.46',
            publish_date: '2026-03-27',
            content: 'install-or-update 单文件执行时会自动补齐缺失脚本，一键安装入口重新打通。',
            enabled: true,
          },
        ]
        return fulfillJson({
          ok: true,
          data: {
            added: 1,
            updated: 0,
            skipped: 0,
            totalParsed: 1,
            latestVersion: 'v4.5.46',
            previewCount: 1,
            sourceStats: { release_cache: 1 },
          },
        }).then(() => true)
      }

      return false
    },
  })
})

test('shows release-note preview after checking updates and finishes announcement sync in settings', async ({ page }) => {
  await page.goto('/settings?category=advanced&advancedSection=update&updateTab=overview#settings-update-overview', { waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)

  await expect(page.getByText('执行“检查更新”后，这里会显示最新版本的说明摘要和资产信息。')).toBeVisible()
  await page.getByRole('button', { name: '检查更新' }).first().click()

  await expect(page.getByText('一键安装单文件 bootstrap 修复', { exact: true })).toBeVisible()
  await expect(page.getByText('待新增 2 · 待更新 1 · 已跳过 0')).toBeVisible()
  await expect(page.getByText('当前已是最新版本，但仍有 3 条公告可同步')).toBeVisible()
  await page.getByRole('button', { name: '知道了' }).click()

  await page.getByRole('button', { name: '同步公告' }).click()
  await expect(page.getByText('公告同步完成：新增 2 条，更新 1 条，跳过 0 条')).toBeVisible()
  await page.getByRole('button', { name: '知道了' }).click()

  await expect(page.getByText('最近同步：新增 2 · 更新 1 · 跳过 0 · 最新版本 v4.5.46')).toBeVisible()
})

test('keeps announcement manager aligned with the unified version-source sync result', async ({ page }) => {
  await page.goto('/announcements', { waitUntil: 'domcontentloaded' })
  await dismissBlockingDialogs(page)

  await expect(page.getByText('管理系统展示的多个历史版本公告，并允许与统一系统版本源联动同步。')).toBeVisible()
  await page.getByRole('button', { name: '从版本源同步' }).click()
  await page.getByRole('button', { name: '确定' }).click()

  await expect(page.getByText('同步完成：新增 1 条，更新 0 条，跳过 0 条。')).toBeVisible()
  await page.getByRole('button', { name: '知道了' }).click()

  await expect(page.getByText('最近一次版本源同步')).toBeVisible()
  await expect(page.getByText('最新同步版本：v4.5.46')).toBeVisible()
  await expect(page.getByText('一键安装单文件 bootstrap 修复')).toBeVisible()
})

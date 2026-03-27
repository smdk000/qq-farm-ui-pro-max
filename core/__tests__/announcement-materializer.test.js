const test = require('node:test');
const assert = require('node:assert/strict');

const { createAnnouncementRuntime } = require('../src/services/announcement-materializer');

test('announcement runtime falls back to changelog quick index when update log is missing', async () => {
    const runtime = createAnnouncementRuntime({
        projectRoot: '/workspace',
        fsRef: {
            existsSync: (target) => target === '/workspace/CHANGELOG.md',
            readFileSync: (target) => {
                assert.equal(target, '/workspace/CHANGELOG.md');
                return [
                    '# Demo',
                    '',
                    '## 快速索引（精简版）',
                    '',
                    '- `v4.5.41 (2026-03-27)` 二维码状态保活：二维码轮询现在会保留原始 code 与有效期。',
                    '- `v4.5.39 (2026-03-25)` 旧版本说明：补齐最近一轮功能摘要。',
                    '',
                    '> 说明：demo',
                ].join('\n');
            },
        },
        getSystemUpdateReleaseCacheRef: async () => ({ releases: [] }),
    });

    const entries = await runtime.listNotificationEntries({ limit: 2 });

    assert.deepEqual(entries, [
        {
            title: '二维码状态保活',
            version: 'v4.5.41',
            publishDate: '2026-03-27',
            content: '二维码轮询现在会保留原始 code 与有效期。',
            summary: '二维码轮询现在会保留原始 code 与有效期。',
            sourceType: 'embedded',
            sourceKey: entries[0].sourceKey,
            releaseUrl: '',
            assets: [],
        },
        {
            title: '旧版本说明',
            version: 'v4.5.39',
            publishDate: '2026-03-25',
            content: '补齐最近一轮功能摘要。',
            summary: '补齐最近一轮功能摘要。',
            sourceType: 'embedded',
            sourceKey: entries[1].sourceKey,
            releaseUrl: '',
            assets: [],
        },
    ]);
    assert.match(entries[0].sourceKey, /^[a-f0-9]{40}$/);
});

test('announcement materializer updates legacy announcement rows by version/date match', async () => {
    const saveCalls = [];
    const runtime = createAnnouncementRuntime({
        projectRoot: '/workspace',
        fsRef: {
            existsSync: () => false,
            readFileSync: () => '',
        },
        getAnnouncementsRef: async () => [{
            id: 7,
            title: '旧公告标题',
            version: 'v4.5.41',
            publish_date: '2026-03-27',
            content: 'old',
            summary: '',
            enabled: true,
            sourceType: '',
            sourceKey: '',
            releaseUrl: '',
            assets: [],
        }],
        saveAnnouncementRef: async (payload) => {
            saveCalls.push(payload);
            return { ok: true };
        },
        getSystemUpdateReleaseCacheRef: async () => ({
            releases: [{
                versionTag: 'v4.5.41',
                title: '二维码状态保活',
                publishedAt: '2026-03-27T08:00:00.000Z',
                notes: 'new notes',
                url: 'https://example.com/releases/v4.5.41',
                assets: [{ name: 'bundle.tar.gz', url: 'https://example.com/bundle.tar.gz', size: 123 }],
            }],
        }),
    });

    const result = await runtime.materializeAnnouncements({
        sourceTypes: ['release_cache'],
        createdBy: 'tester',
    });

    assert.equal(result.added, 0);
    assert.equal(result.updated, 1);
    assert.equal(result.skipped, 0);
    assert.equal(saveCalls.length, 1);
    assert.equal(saveCalls[0].id, 7);
    assert.equal(saveCalls[0].title, '二维码状态保活');
    assert.equal(saveCalls[0].version, 'v4.5.41');
    assert.equal(saveCalls[0].publish_date, '2026-03-27');
    assert.equal(saveCalls[0].summary, 'new notes');
    assert.equal(saveCalls[0].sourceType, 'release_cache');
    assert.equal(saveCalls[0].releaseUrl, 'https://example.com/releases/v4.5.41');
    assert.deepEqual(saveCalls[0].assets, [{
        name: 'bundle.tar.gz',
        url: 'https://example.com/bundle.tar.gz',
        size: 123,
    }]);
});

test('ensureAnnouncementsSeeded skips bootstrap when announcements already exist', async () => {
    const runtime = createAnnouncementRuntime({
        projectRoot: '/workspace',
        fsRef: {
            existsSync: () => false,
            readFileSync: () => '',
        },
        getAnnouncementsRef: async () => [{ id: 1, title: '已有公告' }],
        saveAnnouncementRef: async () => {
            throw new Error('should not save');
        },
        getSystemUpdateReleaseCacheRef: async () => ({ releases: [] }),
    });

    const result = await runtime.ensureAnnouncementsSeeded();

    assert.deepEqual(result, {
        ok: true,
        seeded: false,
        reason: 'existing_announcements',
        totalExisting: 1,
    });
});

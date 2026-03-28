#!/usr/bin/env node
const { execSync } = require('child_process');
const https = require('https');

const DEFAULT_TAGS = [
  'v4.5.41',
  'v4.5.42',
  'v4.5.43',
  'v4.5.44',
  'v4.5.45',
  'v4.5.46',
  'v4.5.47',
];

function print(level, scope, message) {
  const tag = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';
  console.log(`[${tag}] ${scope}: ${message}`);
}

function getGitHubToken() {
  try {
    const output = execSync(
      "printf 'protocol=https\\nhost=github.com\\n\\n' | git credential fill",
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
    );
    const match = output.match(/^password=(.+)$/m);
    return match ? match[1].trim() : '';
  }
  catch {
    return '';
  }
}

function apiGetJson(url, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'qq-farm-release-audit',
      'Accept': 'application/vnd.github+json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    https
      .get(url, { headers }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          const isJson = (res.headers['content-type'] || '').includes('json');
          let payload = body;

          if (isJson && body) {
            try {
              payload = JSON.parse(body);
            }
            catch (error) {
              reject(new Error(`解析 GitHub 响应失败: ${error.message}`));
              return;
            }
          }

          if (res.statusCode && res.statusCode >= 400) {
            const message = typeof payload === 'object' && payload && payload.message
              ? payload.message
              : `HTTP ${res.statusCode}`;
            reject(new Error(message));
            return;
          }

          resolve(payload);
        });
      })
      .on('error', reject);
  });
}

function normalizeTag(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    return null;
  }
  return raw.startsWith('v') ? raw : `v${raw}`;
}

function buildExpectedAssets(tag) {
  return [
    'qq-farm-bot-deploy.tar.gz',
    'qq-farm-bot-images-amd64.tar.gz',
    'qq-farm-bot-images-arm64.tar.gz',
    `${tag}-deploy.tar.gz`,
    `${tag}-linux-x64.tar.gz`,
    `${tag}-macos-arm64.tar.gz`,
    `${tag}-macos-x64.tar.gz`,
    `${tag}-offline-amd64.tar.gz`,
    `${tag}-offline-arm64.tar.gz`,
    `${tag}-windows-x64.zip`,
    'SHA256SUMS.txt',
  ].map((name) => (name.startsWith('v') ? `qq-farm-bot-${name}` : name));
}

function expandRequestedTags(args) {
  if (args.length === 0) {
    return DEFAULT_TAGS.slice();
  }

  const tags = new Set();
  for (const arg of args) {
    const value = String(arg || '').trim();
    if (!value) {
      continue;
    }

    if (value.endsWith('.x')) {
      const prefix = value.slice(0, -2);
      for (const defaultTag of DEFAULT_TAGS) {
        if (defaultTag.startsWith(prefix)) {
          tags.add(defaultTag);
        }
      }
      continue;
    }

    tags.add(normalizeTag(value));
  }

  return Array.from(tags).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function loadRemoteTags() {
  const stdout = execSync("git ls-remote --tags origin 'v*'", { encoding: 'utf8' });
  const tags = new Set();

  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/refs\/tags\/(.+?)(\^\{\})?$/);
    if (!match) {
      continue;
    }
    tags.add(match[1]);
  }

  return tags;
}

async function main() {
  const requestedTags = expandRequestedTags(process.argv.slice(2));
  const token = getGitHubToken();
  const remoteTags = await loadRemoteTags();

  if (!token) {
    print('warn', 'auth', '未读取到 GitHub 凭据，将以匿名方式请求 API，可能受限流影响');
  }

  const releases = await apiGetJson(
    'https://api.github.com/repos/smdk000/qq-farm-ui-pro-max/releases?per_page=100',
    token,
  );

  if (!Array.isArray(releases)) {
    throw new Error('GitHub Release 列表响应格式异常');
  }

  const releaseMap = new Map(releases.map((release) => [release.tag_name, release]));
  let errorCount = 0;

  for (const tag of requestedTags) {
    if (!remoteTags.has(tag)) {
      errorCount += 1;
      print('error', tag, '远端 tag 不存在');
      continue;
    }

    const release = releaseMap.get(tag);
    if (!release) {
      errorCount += 1;
      print('error', tag, 'GitHub Release 对象不存在');
      continue;
    }

    const actualAssets = (release.assets || []).map((asset) => asset.name).sort();
    const expectedAssets = buildExpectedAssets(tag).sort();
    const missingAssets = expectedAssets.filter((asset) => !actualAssets.includes(asset));
    const extraAssets = actualAssets.filter((asset) => !expectedAssets.includes(asset));

    if (missingAssets.length > 0 || extraAssets.length > 0) {
      errorCount += 1;
      print(
        'error',
        tag,
        `附件不匹配，缺失 ${missingAssets.length} 个，额外 ${extraAssets.length} 个`,
      );
      if (missingAssets.length > 0) {
        print('error', tag, `缺失附件: ${missingAssets.join(', ')}`);
      }
      if (extraAssets.length > 0) {
        print('warn', tag, `额外附件: ${extraAssets.join(', ')}`);
      }
      continue;
    }

    print(
      'info',
      tag,
      `检查通过，Release 已发布，附件 ${actualAssets.length} / ${expectedAssets.length} 完整`,
    );
  }

  console.log(`\nRelease asset check finished: ${errorCount} error(s), ${requestedTags.length} tag(s) checked.`);
  process.exitCode = errorCount > 0 ? 1 : 0;
}

main().catch((error) => {
  print('error', 'release-check', error.message || String(error));
  process.exitCode = 1;
});

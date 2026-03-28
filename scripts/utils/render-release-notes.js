#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const changelogPath = path.join(projectRoot, 'CHANGELOG.md');

function normalizeTag(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    return null;
  }
  return raw.startsWith('v') ? raw : `v${raw}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(content, tag) {
  const escapedTag = escapeRegExp(tag);
  const sectionRegex = new RegExp(`## \\[${escapedTag}\\][\\s\\S]*?(?=\\n## \\[v|$)`);
  const match = content.match(sectionRegex);
  return match ? match[0].trim() : '';
}

function main() {
  const input = process.argv[2];
  const tag = normalizeTag(input);

  if (!tag) {
    console.error('Usage: node scripts/utils/render-release-notes.js <version>');
    process.exit(1);
  }

  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const section = extractSection(changelog, tag);
  if (!section) {
    console.error(`未在 CHANGELOG.md 中找到 ${tag} 的版本章节`);
    process.exit(1);
  }

  process.stdout.write(section.endsWith('\n') ? section : `${section}\n`);
}

main();

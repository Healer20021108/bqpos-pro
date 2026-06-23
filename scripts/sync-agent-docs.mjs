import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const specPath = path.join(root, 'PROJECT_SPEC.md');
const claudePath = path.join(root, 'CLAUDE.md');
const agentsPath = path.join(root, 'AGENTS.md');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function upsertSyncBlock(content, block) {
  const start = '<!-- SPEC_SYNC_START -->';
  const end = '<!-- SPEC_SYNC_END -->';
  const wrapped = `${start}\n${block}\n${end}`;

  if (content.includes(start) && content.includes(end)) {
    return content.replace(new RegExp(`${start}[\\s\\S]*?${end}`), wrapped);
  }

  return `${content.trim()}\n\n${wrapped}\n`;
}

if (!fs.existsSync(specPath)) {
  throw new Error('PROJECT_SPEC.md not found. Run this script from the project root.');
}

const spec = read(specPath);
const specHash = hash(spec);
const updatedAt = new Date().toISOString();

const block = [
  `Spec source: PROJECT_SPEC.md`,
  `Spec SHA-256 short hash: ${specHash}`,
  `Synced at: ${updatedAt}`,
  `Instruction: If any local instruction conflicts with PROJECT_SPEC.md, follow PROJECT_SPEC.md.`
].join('\n');

for (const targetPath of [claudePath, agentsPath]) {
  if (!fs.existsSync(targetPath)) continue;
  const original = read(targetPath);
  const updated = upsertSyncBlock(original, block);
  write(targetPath, updated);
}

console.log(`Synced agent docs with PROJECT_SPEC.md (${specHash})`);

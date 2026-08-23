#!/usr/bin/env node
/**
 * ValMod 部署脚本（npm run deploy）
 *
 * 流程：
 *   1. 调用 https://valmod-api.seia0070.dpdns.org/version/increment 自增云端版本号
 *   2. 调用 https://valmod-api.seia0070.dpdns.org/version 确认版本号（两次一致才继续）
 *   3. 将版本号加密混淆写入 src/version.ts（版本号 XOR 密文 + 加密 URL 字节数组）
 *   4. 执行 vite build（SCRIPT_VERSION 环境变量写入 userscript 元数据）
 *   5. 分步执行 git add / commit / push（无变更自动跳过，任一步失败立即中止）
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const API_BASE = 'https://valmod-api.seia0070.dpdns.org';
const VERSION_SEED = 0x4b5a0f3c;
const FETCH_TIMEOUT = 15000;

function log(msg) {
  console.log(`[deploy] ${msg}`);
}
function fail(msg) {
  console.error(`[deploy] 失败: ${msg}`);
  process.exit(1);
}

/** 与 main.ts 中 _rA 一致的 XOR 伪随机序列 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s & 0xff;
  };
}

/** 字符串按 seed 加密为字节数组 */
function encryptString(str, seed) {
  const rnd = rng(seed);
  return Array.from(str, (c) => c.charCodeAt(0) ^ rnd());
}

async function fetchJson(url, what) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) fail(`${what}失败: HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') fail(`${what}超时`);
    fail(`${what}请求异常: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  return null;
}

// ---------- 1. 自增版本号 ----------
log('正在自增云端版本号...');
const incData = await fetchJson(`${API_BASE}/version/increment`, '版本自增');
const version = Number(incData?.version);
if (!Number.isInteger(version) || version < 1) {
  fail(`版本自增返回异常: ${JSON.stringify(incData)}`);
}
log(`版本号自增成功: v${version}`);

// ---------- 2. 确认版本号 ----------
log('正在读取云端版本号确认...');
const verData = await fetchJson(`${API_BASE}/version`, '版本读取');
const confirmVersion = Number(verData?.version);
if (confirmVersion !== version) {
  fail(`版本不一致：increment=${version}，version=${confirmVersion}`);
}
log(`云端版本确认一致: v${version}`);

// ---------- 3. 加密写入 src/version.ts ----------
const cipher = version ^ VERSION_SEED;
const urlBytes = encryptString(`${API_BASE}/version`, VERSION_SEED);
const tsContent = [
  '// 此文件由 scripts/deploy.mjs 自动生成，请勿手动修改',
  'export const _VS = 0x' + VERSION_SEED.toString(16) + ';',
  'export const _VC = 0x' + cipher.toString(16) + ';',
  'export const _VU = [' + urlBytes.join(', ') + '];',
  '',
].join('\n');
writeFileSync(path.join(ROOT, 'src', 'version.ts'), tsContent);
log(`已加密写入 src/version.ts（版本 v${version}，密文 ${cipher}）`);

// ---------- 4. 构建 ----------
log('开始构建...');
try {
  execSync('npx vite build', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, SCRIPT_VERSION: String(version) },
  });
} catch {
  fail('构建失败，请检查上方报错');
}
log('构建完成');

// ---------- 5. git 提交推送 ----------
log('git add ...');
try {
  execSync('git add -A', { cwd: ROOT, stdio: 'inherit' });
} catch {
  fail('git add 执行失败');
}

let hasChanges = true;
try {
  execSync('git diff --cached --quiet', { cwd: ROOT, stdio: 'pipe' });
  hasChanges = false;
} catch {
  hasChanges = true;
}

if (hasChanges) {
  log('git commit ...');
  try {
    execSync(`git commit -m "deploy: release v${version}"`, { cwd: ROOT, stdio: 'inherit' });
  } catch {
    fail('git commit 失败（若提示缺少用户信息，请先配置 git config user.name/email）');
  }
  log('git push ...');
  try {
    execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
  } catch {
    fail('git push 失败，请检查网络连接或 GitHub 凭据');
  }
  log('已推送到 GitHub');
} else {
  log('没有需要提交的变更，跳过 commit/push');
}

log(`✅ 部署完成！当前版本 v${version}，脚本已同步云端版本。`);

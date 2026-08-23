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

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s & 0xff;
  };
}

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

log('正在自增云端版本号...');
const incData = await fetchJson(`${API_BASE}/version/increment`, '版本自增');
const version = Number(incData?.version);
if (!Number.isInteger(version) || version < 1) {
  fail(`版本自增返回异常: ${JSON.stringify(incData)}`);
}
log(`版本号自增成功: v${version}`);

log('正在读取云端版本号确认...');
const verData = await fetchJson(`${API_BASE}/version`, '版本读取');
const confirmVersion = Number(verData?.version);
if (confirmVersion !== version) {
  fail(`版本不一致：increment=${version}，version=${confirmVersion}`);
}
log(`云端版本确认一致: v${version}`);

const cipher = version ^ VERSION_SEED;
const plainUrl = `${API_BASE}/version`;
const urlBytes = encryptString(plainUrl, VERSION_SEED);
const tag = Array.from(plainUrl, (c) => c.charCodeAt(0)).reduce((a, b) => (a + b) & 0xffff, 0);
let vh = VERSION_SEED >>> 0;
vh = (Math.imul(vh, 31) + cipher) & 0x7fffffff;
for (const b of urlBytes) vh = (Math.imul(vh, 31) + b) & 0x7fffffff;
const byteArr = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const vt = [...byteArr(VERSION_SEED), ...byteArr(cipher), ...byteArr(vh), ...byteArr(tag)];
const tsContent = [
  '// 此文件由 scripts/deploy.mjs 自动生成，请勿手动修改',
  '// 参数表：前 16 字节依次为 校验种子(4B)、版本密文(4B)、完整性校验和(4B)、URL特征(4B)',
  'export const _VT = [' + vt.join(', ') + '];',
  'export const _VU = [' + urlBytes.join(', ') + '];',
  '',
].join('\n');
writeFileSync(path.join(ROOT, 'src', 'version.ts'), tsContent);
log(`已加密写入 src/version.ts（版本 v${version}，密文 ${cipher}，校验和 ${vh}，URL特征 ${tag}）`);

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

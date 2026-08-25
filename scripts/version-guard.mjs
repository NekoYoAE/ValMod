import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import javascriptObfuscator from 'javascript-obfuscator';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function readVersionParams() {
  let content = '';
  try {
    content = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf-8');
  } catch {
    throw new Error('[构建中止]');
  }
  const vt = (content.match(/_VT = \[([\s\S]*?)\]/)?.[1] ?? '')
    .split(',')
    .map((s) => Number(s.trim()));
  const vu = (content.match(/_VU = \[([\s\S]*?)\]/)?.[1] ?? '')
    .split(',')
    .map((s) => Number(s.trim()));
  const rd = (o) => ((vt[o] << 24) | (vt[o + 1] << 16) | (vt[o + 2] << 8) | vt[o + 3]) >>> 0;
  const seed = vt.length >= 16 ? rd(0) : 0;
  const cipher = vt.length >= 16 ? rd(4) : 0;
  const vh = vt.length >= 16 ? rd(8) : 0;
  const tag = vt.length >= 16 ? rd(12) : 0;
  if (!seed || !cipher || !vh || vu.length === 0) {
    throw new Error('[构建中止]');
  }
  return { seed, cipher, vh, tag, vu };
}

function guardSource(name, seed, cipher, vh, tag, vu) {
  return [
    `async function ${name}() {`,
    `  const A = ${seed >>> 0}, B = ${cipher >>> 0}, C = ${vh >>> 0}, D = ${tag >>> 0}, U = [${vu.join(', ')}];`,
    '  const R = (s) => () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s & 0xff; };',
    '  const X = (d, s) => { const r = R(s); let o = ""; for (let i = 0; i < d.length; i++) o += String.fromCharCode(d[i] ^ r()); return o; };',
    '  let h = A >>> 0; h = (Math.imul(h, 31) + B) & 0x7fffffff;',
    '  for (let i = 0; i < U.length; i++) h = (Math.imul(h, 31) + U[i]) & 0x7fffffff;',
    '  if ((h >>> 0) !== (C >>> 0)) return false;',
    '  const u = X(U, A);',
    '  let t = 0; for (let i = 0; i < u.length; i++) t = (t + u.charCodeAt(i)) & 0xffff;',
    '  if ((t >>> 0) !== (D >>> 0)) return false;',
    '  try {',
    '    const ctrl = new AbortController();',
    '    const timer = setTimeout(() => ctrl.abort(), 5000);',
    '    try {',
    '      const res = await fetch(u, { signal: ctrl.signal });',
    '      if (!res.ok) return false;',
    '      const data = await res.json();',
    '      const v = Number(data && data.version);',
    '      return Number.isInteger(v) && v >= 1 && v === ((B ^ A) >>> 0);',
    '    } finally { clearTimeout(timer); }',
    '  } catch { return false; }',
    '}',
    '',
  ].join('\n');
}

function obfuscateGuard(code) {
  return javascriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 1,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.35,
    identifierNamesGenerator: 'hexadecimal',
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 4,
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 4,
    stringArrayThreshold: 1,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
  }).getObfuscatedCode();
}

export function generateVersionGuard() {
  const { seed, cipher, vh, tag, vu } = readVersionParams();
  const name = '_v' + ((vh ^ cipher) >>> 0).toString(16).padStart(8, '0');
  const code = obfuscateGuard(guardSource(name, seed, cipher, vh, tag, vu));
  return { name, code };
}

export function versionGuardPlugin() {
  let cached = null;
  return {
    name: 'version-guard-inject',
    enforce: 'pre',
    transform(code, id) {
      const p = id.replace(/\\/g, '/');
      if (p.endsWith('/src/main.ts')) {
        if (!code.includes('__guard__')) {
          this.error('[构建中止]');
        }
        if (!cached) cached = generateVersionGuard();
        return { code: cached.code + '\n' + code.replace(/__guard__/g, cached.name), map: null };
      }
      return null;
    },
  };
}

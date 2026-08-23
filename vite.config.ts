import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import monkey from 'vite-plugin-monkey';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { obfuscateUserscript } from './scripts/obfuscate.mjs';
import { versionGuardPlugin } from './scripts/version-guard.mjs';

const match = [
  'https://scratch.mit.edu/*', // Scratch
  'https://www.ccw.site/detail/*', // CCW
  'https://40code.com/*', // 40code
  'https://gitblock.cn/*', // GitBlock
  'https://world.xiaomawang.com/*', // 小码王
];

const pagesUrl = process.env.GITHUB_PAGES_URL;
const updateMeta = pagesUrl
  ? {
      downloadURL: `${pagesUrl}ValMod.user.js`,
      updateURL: `${pagesUrl}ValMod.user.js`,
    }
  : {};

const VERSION_SEED = 0x4b5a0f3c;
let scriptVersion = process.env.SCRIPT_VERSION ?? '';
if (!scriptVersion) {
  let content = '';
  try {
    content = readFileSync(new URL('./src/version.ts', import.meta.url), 'utf-8');
  } catch {
    throw new Error('[构建中止]');
  }
  const vt = (content.match(/_VT = \[([\s\S]*?)\]/)?.[1] ?? '')
    .split(',')
    .map((s) => Number(s.trim()));
  const vu = (content.match(/_VU = \[([\s\S]*?)\]/)?.[1] ?? '')
    .split(',')
    .map((s) => Number(s.trim()));
  const rd = (o: number) => ((vt[o] << 24) | (vt[o + 1] << 16) | (vt[o + 2] << 8) | vt[o + 3]) >>> 0;
  const seed = vt.length >= 16 ? rd(0) : 0;
  const cipher = vt.length >= 16 ? rd(4) : 0;
  const vh = vt.length >= 16 ? rd(8) : 0;
  if (!seed || !cipher || !vh || vu.length === 0) {
    throw new Error('[构建中止]');
  }
  if (seed !== VERSION_SEED) {
    throw new Error('[构建中止]');
  }
  scriptVersion = String((cipher ^ seed) >>> 0);
}
if (!scriptVersion) {
  throw new Error('[构建中止]');
}

export default defineConfig({
  plugins: [
    versionGuardPlugin(),
    svelte(),
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'ValMod',
        namespace: 'https://github.com/NekoYoAE/valmod',
        description: 'Scratch变量修改器',
        version: scriptVersion,
        author: 'NekoYoAE@GitHub',
        match,
        grant: 'none',
        'run-at': 'document-start',
        ...updateMeta,
      },
      build: {
        fileName: 'ValMod.user.js',
      },
    }),
    obfuscateUserscript(),// 混淆代码，如果不需要就删掉这行
  ],
  build: {
    minify: 'esbuild',
    target: 'es2020',
    sourcemap: false,
  },
});

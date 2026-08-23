import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import monkey from 'vite-plugin-monkey';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { obfuscateUserscript } from './scripts/obfuscate.mjs';

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

// 优先使用部署脚本传入的 SCRIPT_VERSION；否则从 src/version.ts 读取加密版本号
let scriptVersion = process.env.SCRIPT_VERSION ?? '';
if (!scriptVersion) {
  try {
    const content = readFileSync(new URL('./src/version.ts', import.meta.url), 'utf-8');
    const seed = Number(content.match(/_VS = (0x[0-9a-fA-F]+)/)?.[1] ?? 0);
    const cipher = Number(content.match(/_VC = (0x[0-9a-fA-F]+)/)?.[1] ?? 0);
    if (seed && cipher) scriptVersion = String(cipher ^ seed);
  } catch {
    /* 忽略 */
  }
}
if (!scriptVersion) scriptVersion = '0.1';

export default defineConfig({
  plugins: [
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

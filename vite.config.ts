import { defineConfig } from 'vite';
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

// 由 GitHub Actions 注入的递增版本号（如 0.1.123），
// 确保每次部署 @version 都变化，Tampermonkey 才能识别新版本并自动更新。
const scriptVersion = process.env.SCRIPT_VERSION ?? '0.1';

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

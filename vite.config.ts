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

// 由 GitHub Actions 注入的部署地址（https://<用户名>.github.io/<仓库名>/），
// 用于生成 downloadURL / updateURL，让 Tampermonkey 能自动更新脚本。
const pagesUrl = process.env.GITHUB_PAGES_URL;
const updateMeta = pagesUrl
  ? {
      downloadURL: `${pagesUrl}ValMod.user.js`,
      updateURL: `${pagesUrl}ValMod.user.js`,
    }
  : {};

export default defineConfig({
  plugins: [
    svelte(),
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'ValMod',
        namespace: 'https://github.com/NekoYoAE/valmod',
        description: 'Scratch变量修改器',
        version: '0.1',
        author: 'NekoYoAE@GitHub',
        match,
        grant: 'none',
        'run-at': 'document-start',
        ...updateMeta,
      },
      build: {
        // 必须以 .user.js 结尾，Tampermonkey / GitHub 才能识别为可安装的油猴脚本
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

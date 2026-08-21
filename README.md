# ValMod

Scratch变量操作面板
实时查看、修改并锁定角色变量。支持导入和导出配置模板。

## 使用

1. 安装浏览器脚本管理器（如 [Tampermonkey](https://www.tampermonkey.net/)）
2. 安装脚本：[https://NekoYoAE.github.io/ValMod/ValMod.user.js](https://NekoYoAE.github.io/ValMod/ValMod.user.js)（或本地 `dist/ValMod.user.js`）
3. 项目页面：[https://NekoYoAE.github.io/ValMod/](https://NekoYoAE.github.io/ValMod/)

## 架构

- **Svelte 5 + Vite**：UI 框架与构建工具
- **`src/core`**：核心 SDK，负责ScratchVM
- **`src/ui`**：UI 层（Svelte 组件）

## 开发

```bash
npm install   # 安装依赖
npm run dev   # 开发模式
npm run build # 构建脚本
```

## 免责声明

本工具仅供个人学习研究使用，禁止用于非法获利。使用产生的一切版权纠纷、法律责任均由使用者自行承担，与工具制作者无关。请尊重创作者知识产权。

## License

本项目使用 [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) 开源许可，完整协议见 [LICENSE](LICENSE)。

 可自由使用、修改、二次分发，需保留原版权声明，标注原作者，按「现状」提供，不附带任何担保


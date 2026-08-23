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
- **`src/dom-utils.ts`**：通用伪装模块（DOM 工具），零依赖，可整体复制到其它项目使用

## 伪装模块（`src/dom-utils.ts`）

为注入式 UI 提供防检测能力：将容器内元素从宿主页面脚本的 DOM 查询、遍历、变更观察等视角中隐藏。零依赖、自包含，可直接整体复制到其它项目使用

### 快速上手

```ts
import { installStealth, createStealthHost, protectNode } from './dom-utils';

installStealth();                                  // 安装全局补丁（幂等，可多次调用）
const { root } = createStealthHost('.ui{...}');    // 创建隐蔽容器（样式可选）
root.appendChild(myUI);                            // 放入你的ui
```

### API

| API | 说明 |
|---|---|
| `installStealth()` | 安装全局补丁（幂等），隐藏所有受保护节点 |
| `uninstallStealth()` | 卸载全部补丁，恢复原生 DOM API，可再次安装 |
| `createStealthHost(styles?, options?)` | 创建隐蔽宿主容器（随机标签名 + 随机 `data-*` 属性 + closed Shadow DOM） |
| `protectNode(node)` / `unprotectNode(node)` | 注册 / 注销任意元素为受保护节点 |
| `markNative(fn, name)` | 将函数伪装为原生函数（`toString()` 输出 `[native code]`） |
| `isProtected(node)` / `isStealthHost(node)` | 判断节点是否处于受保护区域 |

### 已有元素直接注册

```ts
import { protectNode, unprotectNode } from './dom-utils';

protectNode(document.getElementById('my-panel'));   // 注册后立即不可见
unprotectNode(document.getElementById('my-panel')); // 恢复可见
```

### 挂载到指定父节点

```ts
const { root } = createStealthHost(uiCss, { parent: myContainer, tag: 'section' });
```

### 临时关闭 / 重新开启

```ts
installStealth();   // 打开
uninstallStealth(); // 完整恢复所有 DOM API
```

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


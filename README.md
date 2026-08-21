# ValMod — Scratch 悬浮变量操作面板（油猴脚本）

> 在 Scratch 编辑器（scratch.mit.edu / ccw.site）中提供可拖拽的悬浮操作面板，实时查看、修改并**锁定**项目中所有角色的变量值。
> 基于 **Svelte 5** 构建，核心 SDK 保持框架无关，UI 层可自由替换扩展。

## 功能特性

- 🎛️ 悬浮面板：可拖拽、可最小化为悬浮球，样式与 Scratch 页面完全隔离（Shadow DOM）
- 🔍 实时读取：自动发现 Scratch 虚拟机（VM），列出所有角色（含舞台）的变量
- ✏️ 一键修改：按值类型渲染控件（数字 / 文本 / 布尔开关），修改即时写回项目
- 🔒 变量锁定：锁定后按固定间隔周期强制写回（默认 100ms），对抗项目逻辑对变量的覆盖（后坐力、血量、金钱等）
- ⚡ 批量锁定：按变量名一键锁定，匹配所有角色中的同名变量（默认 50ms 极速写回）
- 🏷️ 类型徽标：数字 / 文本 / 布尔 / 云变量一目了然，锁定变量带「锁」标记
- 🔄 自动同步：500ms 差异轮询 + 监听 Scratch 自身事件，变量在游戏运行中被修改也会自动刷新
- 🧩 开放架构：核心 SDK 框架无关，UI 层可替换、可扩展

## 快速开始

```bash
# 安装依赖
npm install

# 构建油猴脚本
npm run build

# 开发模式（带热更新）
npm run dev

# 类型检查
npm run check
```

构建产物：`dist/ValMod.js`（油猴脚本）

安装到浏览器：打开 Tampermonkey / Violentmonkey 管理面板 → 新建脚本 → 粘贴 `ValMod.js` 内容保存，或直接把文件拖入浏览器。

> ⚠️ 脚本 `@match` 为 `https://scratch.mit.edu/projects/*` 与 `https://www.ccw.site/*`。
> 打开任意 Scratch 项目（需进入编辑器），右下角即出现面板。

## 目录结构（开放架构）

```
├── vite.config.ts           # 构建配置（vite-plugin-monkey -> dist/ValMod.js）
├── svelte.config.ts         # Svelte 预处理器配置（供 svelte-check / Vite 使用）
└── src/
    ├── core/                # ★ 核心 SDK —— 框架无关，UI 唯一允许依赖的层
    │   ├── types.ts         #   ScratchVariable / BridgeStatus / BridgeOptions
    │   ├── utils.ts         #   VM 识别、React fiber 查找、值类型转换
    │   ├── scratch-bridge.ts #   ScratchBridge：连接/读写变量/事件订阅
    │   └── index.ts         #   统一出口
    ├── ui/                  # UI 组件（Svelte 5，只 import core）
    │   ├── ValModPanel.svelte    # 面板主组件（拖拽/搜索/分组/状态）
    │   └── ValModItem.svelte     # 单条变量组件（类型控件/编辑）
    ├── styles/
    │   └── global.css       # 共享样式（.svp- 前缀，注入 Shadow DOM）
    ├── main.ts              # 入口：创建 Shadow 宿主 + 挂载
    └── env.d.ts             # 类型声明
```

## 命名规范

| 类型 | 规范 | 示例 |
|---|---|---|
| 目录 | kebab-case（全小写连字符） | `src/ui`、`src/core` |
| 核心 / 工具 / 样式文件 | kebab-case | `scratch-bridge.ts`、`global.css` |
| UI 组件文件 | PascalCase（ValMod 前缀） | `ValModPanel.svelte`、`ValModItem.svelte` |
| 入口 / 出口 | `main.ts` / `index.ts` | `src/main.ts`、`src/core/index.ts` |
| 配置文件 | `*.config.ts`（统一 TS） | `vite.config.ts`、`svelte.config.ts` |

架构分层规则：

```
┌──────────────────────────────────────┐
│  main.ts （入口，挂载 & Shadow 隔离）   │
├──────────────────────────────────────┤
│  ui/svelte （UI 层，只 import core）  │  ← 可整体替换为 React / 原生 DOM
├──────────────────────────────────────┤
│  core/ （框架无关核心，零依赖）         │  ← 核心不 import 任何 UI
└──────────────────────────────────────┘
```

## 核心 SDK 使用（自定义 UI 时）

```ts
import { ScratchBridge, BridgeStatus } from './src/core';

const bridge = new ScratchBridge({ pollInterval: 500 });

// 订阅事件
bridge.subscribe((event) => {
  if (event.type === 'status') {
    console.log('状态变化:', event.payload.status, event.payload.info);
  } else if (event.type === 'variables') {
    console.log('变量列表:', event.payload); // ScratchVariable[]
  } else {
    console.error('错误:', event.payload);
  }
});

await bridge.connect(); // 自动发现 VM（window.vm / React fiber）

// 读
const variables = bridge.getVariables();

// 写
bridge.setVariable(variableId, newValue, targetId);

// 锁定：周期强制写回，防止被项目逻辑覆盖
bridge.lockVariable(variableId, 0, targetId, 100); // 单变量锁定

// 批量锁定（等价于参考脚本的「无限循环强制设置所有变量」）
const locked = bridge.lockVariablesByName({
  names: ['*后坐力抖动Y', '****玩家血量', '#金钱数'],
  value: 1000,
  interval: 50,
});
console.log('已锁定', locked, '个变量');

// 解锁
bridge.unlockVariable(variableId);
```

### 公共 API

| 方法 / 属性 | 说明 |
|---|---|
| `connect()` | 连接 VM，失败抛错可重试 |
| `disconnect()` | 断开并停止轮询（自动清理全部锁定） |
| `getVariables()` | 返回 `ScratchVariable[]`（含 `isLocked`） |
| `setVariable(id, value, targetId)` | 写变量，优先官方 API，失败自动降级 |
| `lockVariable(id, value, targetId, interval?)` | 锁定单个变量，周期写回（默认 100ms） |
| `unlockVariable(id)` | 解锁单个变量 |
| `clearAllLocks()` | 解锁全部变量 |
| `lockVariablesByName({names, value, interval?})` | 按变量名批量锁定（默认 50ms），返回锁定数量 |
| `updateLockedVariableValue(id, value)` | 更新已锁定变量的写回值（编辑时调用） |
| `isVariableLocked(id)` / `getLockedVariableIds()` / `getLockedVariables()` | 锁定状态查询 |
| `subscribe(listener)` | 订阅 `status` / `variables` / `error` 事件，返回取消函数 |
| `rawVM` | 原始 VM 引用（高级用法） |

## 扩展指南

### 1. 换一套 UI 框架
在 `src/ui/` 下新建目录（如 `react/`），组件只需依赖 `core` 的公开 API，
再仿照 `src/main.ts` 写一个入口并修改 `vite.config.ts` 的 `entry` 即可，核心零改动。

### 2. 增加新功能（例如支持 Scratch「列表」变量）
`core/scratch-bridge.ts` 的 `getVariables()` 中目前跳过 `list` 类型，
扩展只需：识别 `variable.type === 'list'` → 序列化到 `ScratchVariable`（value 用数组/字符串），
在 `setVariable()` 中增加列表写回分支（`vm.getListValue` / 直接改 `variable.value` 数组）。

### 3. 修改轮询频率 / 超时
`new ScratchBridge({ pollInterval: 200, connectTimeout: 10000 })`。

### 4. 添加其它站点支持
在 `vite.config.ts` 的 `userscript.match` 中追加匹配规则即可。

## 工作原理（VM 发现）

Scratch 3 编辑器没有把 VM 暴露到 `window`，ValMod 采用三策略发现：

1. 优先探测 `window.vm`（部分环境 / 调试版存在）
2. 从 `#app` 根节点出发，BFS 遍历 **React Fiber 树**，找到持有 `vm` 的组件 props
3. 兜底：一次性劫持 `Function.prototype.bind`，在 VM 创建瞬间（`vm.bind(null, ...)` 传参）捕获，随后立即恢复原始 `bind`（ccw.site 等站点适用）

变量写回优先级：
1. 官方 `vm.setVariableValue(variableId, value, targetId)`
2. 降级：直接修改 `target.variables` 内部对象 + `runtime.requestUpdate()`

变量锁定（`lockVariable` / `lockVariablesByName`）复用同一写回管线，由 `setInterval` 定时触发，锁定的写回静默失败（不刷错误），断开连接时自动全部清理。

## 已知限制

- 依赖 `@grant none`：脚本运行在页面上下文，才能访问 React fiber / VM
- 云变量需要登录 Scratch 后由官方后端处理，本工具只负责本地写值
- 列表（list）变量暂未纳入面板，可作为扩展点自行实现（见上）
- 锁定是本地高频写回，若游戏每帧以更高频率覆盖（或直接改对象引用），可能仍会被短暂覆盖，可调小 `interval` 缓解

## License

MIT

# 同构热更客户端设计（Isomorphic Hot Client）

- 日期：2026-10-20
- 状态：已评审（WS 统一传输版，待实现）
- 范围：`rspack-dev-middleware` 热更（hot）模块

## 修订记录

- v2（2026-10-20）：传输统一为 WebSocket，node 端删除文件通道与全部 node 内置模块依赖；恢复 `hot.origin`；`engines` 提升至 `>=22`
- v1（2026-10-20）：初版（文件通道方案，已废弃）

## 1. 背景与目标

当前热更客户端（`src/client/`）仅支持浏览器环境：`Socket` 为每个 compiler 注入 web 客户端入口，客户端经 WebSocket 接收 `invalid / progress / hash / issues / ok` 消息后调用 `import.meta.webpackHot` 完成 HMR。

目标：**支持 node（SSR 服务端）热更**。服务端 bundle 由 rspack 以 `target: node` 编译并常驻运行，代码变更后无需重启进程即可通过模块级热替换生效；浏览器端行为保持不变。

### 设计原则

- 客户端**同构**：单一入口、单一传输（WebSocket），运行时按环境能力选择 UI 适配器，不做任何注入期选择
- 机制与业务分离：`createClient` 只保留通用机制（传输、消息分发、重连、HMR），所有环境差异通过 adapter 注入
- **零 node 内置模块依赖**：node 端只使用全局量（`WebSocket`、`process.stdout`、`process.exit`），客户端不引入任何 `node:*` 模块，web 构建无污染
- 最小侵入：现有 web 文件、构建配置、`package.json` exports 不动

## 2. 总体架构

```
┌────────────────── 服务端 Socket ──────────────────┐
│  compiler invalid/done/progress/issues            │
│    └─ WebSocket 广播（逻辑不变，三类客户端消费）      │
└───────────────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │ 同构客户端（唯一入口，注入所有 compiler）
        │  传输统一为 WebSocket；仅 UI 适配器不同：
        │   有 DOM → DOM 适配（Progress + Overlay）
        │   node   → ANSI console 适配
        │   worker → 纯文本 console 适配
        └─────────────────────────────┘
```

服务端广播逻辑与今天完全一致（纯 WS），无文件写入、无双写分支。

## 3. 能力矩阵

| 运行环境（启动时检测）           | UI 适配器                                            | 传输      |
| -------------------------------- | ---------------------------------------------------- | --------- |
| 有 `document`（浏览器）          | DOM 适配：Progress 进度环 + Overlay 错误遮罩（现状） | WebSocket |
| node（`process.versions?.node`） | ANSI console 适配：单行进度 + issues 输出            | WebSocket |
| 无 DOM、非 node（webworker）     | 纯文本 console 适配                                  | WebSocket |

环境检测：`typeof document !== 'undefined'` 判定 DOM；`typeof process !== 'undefined' && !!process.versions?.node` 判定 node。**检测顺序为 DOM 优先 → node → worker**（worker 中两者皆 false）。

DOM 优先的原因：electron-renderer（nodeIntegration）、nw.js 等同时具备 DOM 与 node 的环境必须维持既有 WebSocket + Overlay 行为，不因 node 检测命中而退化为 console。

## 4. 核心接口

`src/client/client.ts` 重构为：

```ts
export interface Adapter {
  /** 记录编译错误/警告（console 或 overlay 内部缓存） */
  setIssues(type: 'errors' | 'warnings', issues: rspack.StatsError[]): void;
  showIssues(): void;
  hideIssues(): void;
  /** 进度显示 */
  showProgress(): void;
  updateProgress(percent: number): void;
  hideProgress(): void;
  /** 降级处理（DOM: location.reload；console: process.exit(0)） */
  fallback(error?: Error): Promise<void> | void;
}

export function createClient(options: Options, adapter: Adapter): void;
```

消息分发逻辑（`invalid → showProgress`、`progress → updateProgress`、`hash → hot.updateHash`、`issues → setIssues + 无 error 时 performUpdate`、`ok → 收尾 + performUpdate`、所有消息 `emit` 到 events 总线）为三类环境共享，实现单份维护。

**职责边界（传输层 vs adapter）**：

- 传输层负责：连接生命周期、WS 关闭码判定（4000/4001 → 调用 `adapter.fallback`）、非正常断线时调用 `adapter.hideIssues()/hideProgress()` 收起 UI、3s 重连
- adapter 负责：UI 状态渲染与降级动作（`fallback`），不感知连接细节

三类环境共享同一传输实现，职责边界天然一致。

## 5. 同构入口

`src/client/main.ts` 启动逻辑：

```ts
const hasDOM = typeof document !== 'undefined';
const isNode = !hasDOM && typeof process !== 'undefined' && !!process.versions?.node;

if (hasDOM) {
  // 浏览器（现状路径，行为不变）
  startWSClient(getWSOptions(), createDOMAdapter());
} else if (isNode) {
  // SSR 服务端：全局 WebSocket + ANSI console 适配，零 node:* 导入
  startWSClient(getWSOptions(), createAnsiConsoleAdapter());
} else {
  // webworker：完整 HMR + 纯文本 console 输出
  startWSClient(getWSOptions(), createConsoleAdapter());
}
```

要点：

- **客户端不引入任何 `node:*` 模块**：传输用全局 `WebSocket`（Node ≥22 / 浏览器 / worker 原生可用），ANSI 检测读 `process.stdout.isTTY`，降级用 `process.exit` —— 全部为全局量，无动态 import、无 webpackIgnore、无构建特判
- **选项解析拆分**：`getCommonOptions()`（uuid/name/hmr/reload/overlay/progress/path）三类环境共享；WS 地址解析分环境 —— DOM/worker 分支沿用现有推导（`script.src` / `location`，worker 分支的 `getCurrentScript` 需 `typeof document` 守卫）；**node 分支从注入参数 `origin` 读取**（见 §6，node 无 `location`）
- `__resourceQuery` 为编译期注入常量，node target 同样可用
- web 启动守卫由 `typeof document !== 'undefined'` 放宽为覆盖 worker（`document.readyState` 检查仅在 hasDOM 时执行），webworker 从"客户端不启动"变为"完整 HMR + console 输出"

## 6. `hot.origin` 与连接建立

### 6.1 选项

```ts
export interface Options {
  // ...hmr/path/wss/reload/overlay/progress 不变
  origin?: string; // node 客户端的 WS 地址，如 'ws://127.0.0.1:8000'
}
```

- `hot.origin` 由 `Socket` 写入注入参数（`params.set('origin', ...)`）下发给**所有** compiler 的客户端；DOM/worker 分支忽略该参数（沿用 location 推导），仅 node 分支消费
- **fail-fast 校验**：hot 启用且存在 node 系 target 的 compiler（内部 `isNodeTarget` 判断，见 §7）而未设置 `hot.origin` → 中间件创建时抛错，消息含 compiler 名与修复方式
- target 未知（`false`/`undefined`/`browserslist`/纯 es）时不做服务端校验；此时若运行时是 node 且缺少 `origin` 参数，客户端侧 `console.error` 明确提示后不连接（不退出）
- web-only 项目不设置 `hot.origin` 不受任何影响

### 6.2 连接生命周期（与 web 端同一套机制）

- SSR 进程先于 dev server 启动 → 连接失败 → 3s 重试直至成功（天然覆盖崩溃循环场景，无需宽限逻辑）
- dev server 重启 → 旧连接断开 → 4001（compiler not found）或重连失败 → 与 web 端一致的关闭码语义（4000/4001 → `fallback`）
- `reload: true` → `process.exit(0)`（由 nodemon/pm2 拉起）；`reload: false` → `console.warn`

## 7. hot-update 文件落盘（node HMR 硬依赖）

rspack node target 的 HMR runtime 通过**真实文件系统** `require` 加载 `.hot-update.js / .hot-update.json`；而 dev middleware 默认使用 memfs 且 `writeToDisk` 默认关闭（`src/server/dev/index.ts`）。若 hot-update 文件不落盘，`hot.check()` 永远失败 → 每次变更都走 fallback 退出，node 端 HMR 退化为重启循环。

- hot 模块启用时，对 node 系 target 的 compiler **自动强制 `writeToDisk: true`**（服务端内部 `isNodeTarget` 判断，无用户选项、无报错；target 未知时保持用户配置）
- 服务端内部 `isNodeTarget`：node 系集合 `node / async-node / electron-main / electron-preload`；数组 target 任一命中即算；仅用于 §6.1 校验与本节自动落盘，**不作为用户选项、不产生推导报错**
- README 同时写明前置条件：SSR bundle 本身必须从磁盘运行，`writeToDisk` 为 node 热更的必要条件
- **实现前必须完成 spike 验证**（见 §13.0）：rspack node-target 下 `__webpack_require__.p` 的取值与 hot-update 文件的解析路径关系（是否需要绝对路径/file:// 形式，`publicPath` 如何影响）

## 8. console 双层降级

- **ANSI 检测**（内联实现，约 10 行，不引入 `supports-color` —— 该包静态 import `os/tty` 会污染 web 构建；检测按**目标流**分别判定）：
  - 非 node 环境（`typeof process === 'undefined'`）→ 纯文本
  - `NO_COLOR` 存在、`FORCE_COLOR=0`、`TERM` 匹配 `/^dumb$/i`、`CI` 存在 → 纯文本
  - `FORCE_COLOR` 非 0 值 → 强制 ANSI
  - 其余：目标流（issues 为 stderr、progress 为 stdout）`isTTY` 为真 → ANSI，否则纯文本
- ANSI 样式沿用现有 client.ts 中的 ERROR/WARNING 色值
- 浏览器 console（worker 路径）固定纯文本
- node 端 progress 为单行刷新（`\r` 覆写），**仅在 `stdout.isTTY` 时启用**，非 TTY（重定向）按普通行输出；`issues` 经 stderr（`console.error`）、`progress` 经 stdout 输出

## 9. 选项语义映射

新增 `hot.origin`（node 连接地址，见 §6），其余现有选项在 node 端的映射：

| 选项             | web（DOM）                   | node（ANSI console）                  |
| ---------------- | ---------------------------- | ------------------------------------- |
| `hmr: false`     | fallback（整页刷新）         | fallback（退出进程）                  |
| `reload: true`   | `location.reload()`          | `process.exit(0)`                     |
| `reload: false`  | console.warn 提示手动刷新    | console.warn 提示重启进程             |
| `overlay`        | 控制 DOM 遮罩                | 无 DOM，仅 console 输出（无额外效果） |
| `progress`       | 进度环                       | 终端单行进度                          |
| `wss`            | 决定 ws/wss（location 推导） | 不适用（协议由 `origin` 值自带）      |
| `origin`（新增） | 忽略（location 推导）        | 连接地址，node 系 target 必填         |

## 10. 服务端改动清单（`src/server/hot/`）

1. `interface.ts`：Options 增加 `origin?: string`；`schema.ts` 增加 url 格式校验
2. `Socket.ts`：注入参数增加 `origin`（配置了才传）；构造时校验"node 系 target 存在且缺 `origin`"→ 抛错
3. `utils.ts`：新增内部 `isNodeTarget(compiler)`（node 系目标集合判断，含数组形态）
4. 广播逻辑**零改动**（纯 WS，与今天一致）
5. README：SSR 用法 + `hot.origin` + `import.meta.webpackHot.accept()` 使用说明（见 §12）

## 11. 客户端改动清单（`src/client/`）

```
src/client/
├── main.ts          # 同构入口：环境检测 → adapter 选择（传输统一 WS）
├── client.ts        # 重构：createClient(options, adapter)；getWSOptions 分环境地址解析
├── HotUpdate.ts     # 不动
├── events.ts        # 不动
├── index.ts         # 不动
├── ui/              # 现 DOM UI 不动
└── console/
    └── adapter.ts   # ANSI console 适配器（node 用）+ 纯文本适配器（worker 用）
```

## 12. 构建与兼容性

- `tools/rollup.base.ts`、`package.json`（exports / sideEffects）**零改动**：仍是单入口 `client/main`
- **`engines.node` 提升至 `>=22`**（全局 WebSocket 在 Node 22 为 stable；Node 18/20 已 EOL）
- `ws` 依赖保留（服务端 WS 服务器仍用）
- 已知代价（dev-only，可接受）：
  - node bundle 携带 ~几 KB 永不执行的 DOM UI 死代码
  - web bundle 携带 ~1KB 永不执行的 console 适配死代码
- README 补充 **HMR 更新规则的使用说明**（模块替换规则本质上是使用者的责任，中间件只负责通知/触发 `check/apply`/降级）：
  - 完全不写 accept → 变更 unaccepted → 走 fallback（退出/告警），符合预期
  - 入口自接受（最低要求）：`if (import.meta.webpackHot) import.meta.webpackHot.accept();` — 未被显式接受的变更冒泡到入口并重新执行入口模块；适用于每次请求动态读取导出的消费方式
  - 精确规则（可选）：`import.meta.webpackHot.accept('./render', () => { handler.render = require('./render'); })` — 按依赖定义替换逻辑、重绑捕获的引用
  - node 热更前置：`hot.origin` 必填（node 系 target 校验）、`writeToDisk` 自动启用（§7）

## 13. 错误处理

| 场景                                      | 行为                                                         |
| ----------------------------------------- | ------------------------------------------------------------ |
| node HMR `check` 抛错 / unaccepted        | adapter.fallback → `reload ? process.exit(0) : console.warn` |
| SSR 先于 dev server 启动                  | 连接失败 → 3s 重试，服务端就绪后自然连上                     |
| WS 关闭码 4000/4001                       | adapter.fallback（与 web 端一致）                            |
| node 系 target 未设置 `hot.origin`        | 服务端创建中间件时抛错（fail-fast）                          |
| target 未知 + 运行时为 node + 缺 `origin` | 客户端 `console.error` 提示，不连接、不退出                  |
| 断线                                      | 收起 UI，3s 重连（与 web 端一致）                            |

## 14. 测试计划

### 14.0 前置 spike（go/no-go，实现前必须完成）

**rspack node-target HMR 端到端**：验证 `import.meta.webpackHot.check/apply` 在 node target 真实可用，确认 hot-update 文件落盘路径与 `publicPath`/`__webpack_require__.p` 的解析关系（决定 §7 是否需要调整输出路径处理）

### 14.1 验证路径

- 新增 `tests/node/` SSR 风格示例：`target: 'node'` compiler + dev middleware + server 入口 `import.meta.webpackHot.accept()`
  1. 启动后修改 server 源码 → 终端出现 rebuild/进度 → 热更生效（无需重启）
  2. 制造 unaccepted 变更 → `reload: true` 进程退出；`reload: false` 仅告警
  3. 重启 dev server（不重启 SSR 进程）→ 旧连接 4001 → 按 reload 语义退出/告警
  4. **SSR 先于 dev server 启动** → 3s 重试直至连上，无崩溃循环
  5. node 系 target 未设置 `hot.origin` → 中间件创建抛错
- web 示例回归：HMR、进度环、overlay、断线重连行为不变；webworker 下客户端可启动且 console 输出（真实浏览器 harness）
- `pnpm lint`（tsc --noEmit）通过

## 15. 非目标（本次不做）

- SSR 联动刷新：server bundle 更新后通知浏览器整页刷新（跨 compiler 通知，后续增强）
- node → 服务端上行消息通道（当前协议为纯下行）
- 边缘运行时（无全局 WebSocket 的老版本 Node、`process` 伪装环境）深度兼容

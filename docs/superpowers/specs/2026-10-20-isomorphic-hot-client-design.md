# 同构热更客户端设计（Isomorphic Hot Client）

- 日期：2026-10-20
- 状态：已评审通过（待实现）
- 范围：`rspack-dev-middleware` 热更（hot）模块

## 1. 背景与目标

当前热更客户端（`src/client/`）仅支持浏览器环境：`Socket` 为每个 compiler 注入 web 客户端入口，客户端经 WebSocket 接收 `invalid / progress / hash / issues / ok` 消息后调用 `import.meta.webpackHot` 完成 HMR。

目标：**支持 node（SSR 服务端）热更**。服务端 bundle 由 rspack 以 `target: node` 编译并常驻运行，代码变更后无需重启进程即可通过模块级热替换生效；浏览器端行为保持不变。

### 设计原则

- 客户端**同构**：单一入口，运行时按环境能力自适配，不做任何注入期选择
- 机制与业务分离：`createClient` 只保留通用机制（传输、消息分发、重连、HMR），所有环境差异通过 adapter 注入
- 零配置：不新增任何用户选项，不引入推导报错
- 最小侵入：现有 web 文件、构建配置、`package.json` exports 尽量不动

## 2. 总体架构

```
┌──────────────────────────── 服务端 Socket ────────────────────────────┐
│  compiler invalid/done/progress/issues                               │
│    ├─ WebSocket 广播（不变，浏览器/worker 消费）                        │
│    └─ 覆写通道文件 os.tmpdir()/rdm-<uid>-<key>.json（node 客户端消费）  │
└──────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴──────────────────────┐
        │ 同构客户端（唯一入口，注入所有 compiler）      │
        │  启动时环境检测（DOM 优先）：                  │
        │   有 DOM → WebSocket + Progress/Overlay     │
        │   node   → 文件通道 + console 适配           │
        │   worker → WebSocket + console 适配         │
        └────────────────────────────────────────────┘
```

## 3. 能力矩阵

| 运行环境（启动时检测）           | UI 适配                                    | 传输      |
| -------------------------------- | ------------------------------------------ | --------- |
| 有 `document`（浏览器）          | Progress 进度环 + Overlay 错误遮罩（现状） | WebSocket |
| 无 DOM、非 node（webworker）     | console 输出（纯文本）                     | WebSocket |
| node（`process.versions?.node`） | console 输出（ANSI 检测）                  | 文件通道  |

环境检测：`typeof document !== 'undefined'` 判定 DOM；`typeof process !== 'undefined' && !!process.versions?.node` 判定 node。**检测顺序为 DOM 优先 → node → worker**（worker 中两者皆 false，走 console + WebSocket）。

DOM 优先的原因：electron-renderer（nodeIntegration）、nw.js 等同时具备 DOM 与 node 的环境必须维持既有 WebSocket + Overlay 行为，不因 node 检测命中而退化为文件通道 + console。

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
  /** 降级处理（web: location.reload；node: process.exit(0)） */
  fallback(error?: Error): Promise<void> | void;
}

export function createClient(options: Options, adapter: Adapter): void;
```

消息分发逻辑（`invalid → showProgress`、`progress → updateProgress`、`hash → hot.updateHash`、`issues → setIssues + 无 error 时 performUpdate`、`ok → 收尾 + performUpdate`、所有消息 `emit` 到 events 总线）为两端共享，实现单份维护。

**职责边界（传输层 vs adapter）**：

- 传输层（WS / 文件通道）负责：连接生命周期、WS 关闭码判定（4000/4001 → 调用 `adapter.fallback`）、非正常断线时调用 `adapter.hideIssues()/hideProgress()` 收起 UI、3s 重连
- adapter 负责：UI 状态渲染与降级动作（`fallback`），不感知连接细节
- 文件通道无连接概念：watch/轮询异常不触发 fallback，仅 uuid 不匹配（见 6.4）触发降级

## 5. 同构入口与 node 内置模块隔离

`src/client/main.ts` 启动逻辑：

```ts
const hasDOM = typeof document !== 'undefined';
const isNode = !hasDOM && typeof process !== 'undefined' && !!process.versions?.node;

if (hasDOM) {
  // 浏览器（现状路径，行为不变）
  startWSClient(getWSOptions(), createDOMAdapter());
} else if (isNode) {
  // SSR 服务端：webpackIgnore 阻止 web 构建解析 node:*
  Promise.all([
    import(/* webpackIgnore: true */ 'node:fs'),
    import(/* webpackIgnore: true */ 'node:os'),
    import(/* webpackIgnore: true */ 'node:path')
  ]).then(([fs, os, path]) => startFileClient(getCommonOptions(), { fs, os, path }));
} else {
  // webworker：完整 HMR + console 输出
  startWSClient(getWSOptions(), createConsoleAdapter());
}
```

要点：

- `node:fs/os/path` 仅可通过**原生动态 import + `/* webpackIgnore: true */` 魔法注释**引用（rspack 支持）。同一份源码在 web target 构建不会触发模块解析错误，node target 运行时原生加载
- 禁止顶层 await（兼容 cjs 产物），node 分支使用异步 IIFE/Promise 链
- **选项解析拆分**：`getCommonOptions()`（uuid/name/hmr/reload/overlay/progress/path）两端共享；`origin/wss` 属 WS 专属，仅在 `getWSOptions()` 中解析（现 `main.ts` 的 `getOrigin` 依赖 `document`/`self.location`，node 下会 ReferenceError，必须移入 WS 分支；worker 分支的 `getCurrentScript` 需 `typeof document` 守卫）
- `__resourceQuery` 为编译期注入常量，node target 同样可用
- web 启动守卫由 `typeof document !== 'undefined'` 放宽为覆盖 worker（`document.readyState` 检查仅在 hasDOM 时执行）

## 6. node 文件通道

### 6.1 通道命名（稳定 key）

- 文件名：`os.tmpdir()/rdm-<uid>-<key>.json`，其中 `uid = process.getuid?.() ?? 'x'`
- `key = sha1((compiler.name || 'rspack') + '|' + compiler.context + '|' + compiler.options.output.path)` 的前 12 位十六进制（服务端用 `node:crypto` 计算）。**掺入 `output.path` 的原因**：未命名的 MultiCompiler 子 compiler 共享同一 `context` 且 `name` 均为 undefined，仅按 `name|context` 计算 key 必然冲突；`output.path` 各子 compiler 不同且重启后稳定
- **不用 uuid 命名**：dev server 重启会生成新 uuid，按 uuid 命名会让旧 SSR 进程永久收不到通知（僵尸客户端）
- payload 内携带 `uuid`，用于过期检测（见 6.4）

### 6.2 写入（服务端）

- 触发时机与 WS 广播一致：`invalid / done(hash|issues|ok) / progress`
- **原地覆写**（`writeFile` 截断写，不用 `.tmp + rename` 原子写）：rename 换 inode 会破坏 Windows/macOS 上对单文件的 `fs.watch`；半截 JSON 由读取端"解析失败静默跳过"消化（见 6.3）
- **写入串行化**：同一 compiler 的写操作入队串行执行，避免并发 `writeFile` 交错产生瞬时坏 JSON（与解析跳过构成双保险）
- `progress` 写入按 100ms 节流；其余消息即时写
- `writeFile` 显式 `mode: 0o600`：stats 错误信息含绝对路径/源码片段，避免共享 tmpdir 下世界可读
- "内容相同忽略"的判定为**原始字符串比较**（读取端）
- Socket 关闭（dispose）时删除通道文件

### 6.3 读取（node 客户端）

- `fs.watch` 监听文件变更 + 1s 轮询兜底（防 watch 丢事件）
- 读到的 JSON 与上一次内容相同则忽略；解析失败静默跳过（等待下次事件）
- 消息进入与 web 端相同的分发管线

### 6.4 过期检测（服务端重启）与启动宽限

客户端发现 payload `uuid` 与自身注入 uuid 不一致 ⇒ 服务端已重启或残留了过期文件：

- `reload: true` → `fallback()`（`process.exit(0)`，由 nodemon/pm2 拉起）
- `reload: false` → `console.warn` 提示重启 SSR 进程

与 web 端 WS 关闭码 4001（compiler not found）的语义对齐。

**启动宽限（防御崩溃循环）**：dev server 被 SIGKILL/崩溃时不会执行 dispose，tmpdir 会残留旧 uuid 的文件；若 SSR 进程先于 dev server 启动，首轮读取即 mismatch，若直接降级会在 pm2 拉起策略下形成崩溃循环。因此：**客户端在首次 uuid 匹配成功之前，mismatch 仅告警一次、不触发 fallback**；一旦匹配过一次，此后 mismatch 才按上述 reload 语义降级。

### 6.5 hot-update 文件落盘（node HMR 硬依赖）

rspack node target 的 HMR runtime 通过**真实文件系统** `require` 加载 `.hot-update.js / .hot-update.json`；而 dev middleware 默认使用 memfs 且 `writeToDisk` 默认关闭（`src/server/dev/index.ts`）。若 hot-update 文件不落盘，`hot.check()` 永远失败 → 每次变更都走 fallback 退出，node 端 HMR 退化为重启循环。

- hot 模块启用时，对 node 系 target 的 compiler **自动强制 `writeToDisk: true`**（服务端内部按 target 判断，无用户选项、无报错；target 未知时保持用户配置）
- README 同时写明前置条件：SSR bundle 本身必须从磁盘运行，`writeToDisk` 为 node 热更的必要条件
- **实现前必须完成 spike 验证**（见 §13.0）：rspack node-target 下 `__webpack_require__.p` 的取值与 hot-update 文件的解析路径关系（是否需要绝对路径/file:// 形式，`publicPath` 如何影响）

## 7. console 双层降级

- **ANSI 检测**（内联实现，约 10 行，不引入 `supports-color` —— 该包静态 import `os/tty` 会污染 web 构建；检测按**目标流**分别判定）：
  - 非 node 环境（`typeof process === 'undefined'`）→ 纯文本
  - `NO_COLOR` 存在、`FORCE_COLOR=0`、`TERM` 匹配 `/^dumb$/i`、`CI` 存在 → 纯文本
  - `FORCE_COLOR` 非 0 值 → 强制 ANSI
  - 其余：目标流（issues 为 stderr、progress 为 stdout）`isTTY` 为真 → ANSI，否则纯文本
- ANSI 样式沿用现有 client.ts 中的 ERROR/WARNING 色值
- 浏览器 console（worker 路径）固定纯文本
- node 端 progress 为单行刷新（`\r` 覆写），**仅在 `stdout.isTTY` 时启用**，非 TTY（重定向）按普通行输出；`issues` 经 stderr（`console.error`）、`progress` 经 stdout 输出

## 8. 选项语义映射

不新增任何选项，现有 `hmr / reload / overlay / progress / path / wss` 在 node 端的映射：

| 选项            | web（DOM）                | node（console）                       |
| --------------- | ------------------------- | ------------------------------------- |
| `hmr: false`    | fallback（整页刷新）      | fallback（退出进程）                  |
| `reload: true`  | `location.reload()`       | `process.exit(0)`                     |
| `reload: false` | console.warn 提示手动刷新 | console.warn 提示重启进程             |
| `overlay`       | 控制 DOM 遮罩             | 无 DOM，仅 console 输出（无额外效果） |
| `progress`      | 进度环                    | 终端单行进度                          |
| `wss`           | 决定 ws/wss               | 不适用（无 WS 连接）                  |

## 9. 服务端改动清单（`src/server/hot/`）

1. `Socket.ts`：`#broadcast` 增加"写通道文件"分支（所有 compiler 无差别双写：WS + 文件）；构造时计算稳定 `key`；写入串行化队列；dispose 清理
2. 新增通道文件写入/清理的工具函数（原地覆写、节流、`mode: 0o600`）
3. hot 模块启用时，对 node 系 target 的 compiler 自动强制 `writeToDisk: true`（见 6.5，服务端内部判断，无用户选项）
4. 注入逻辑**不变**：仍是 `EntryPlugin(client?params)`，params 不变（`wss` 等参数 node 客户端自行忽略）
5. **删除项**：无 target 推导的用户选项、无 `hot.target`/`hot.origin`、schema 无扩展

## 10. 客户端改动清单（`src/client/`）

```
src/client/
├── main.ts          # 同构入口：环境检测 → 传输 + adapter 选择
├── client.ts        # 重构：createClient(options, adapter)，WS 传输（浏览器/worker）
├── HotUpdate.ts     # 不动
├── events.ts        # 不动
├── index.ts         # 不动
├── ui/              # 现 DOM UI 不动
└── node/
    ├── main.ts      # node 启动：startFileClient
    ├── channel.ts   # 文件通道：watch + 轮询 + 解析
    └── ui.ts        # console adapter：ANSI 检测、单行进度、issues 输出、fallback exit
```

## 11. 构建与兼容性

- `tools/rollup.base.ts`、`package.json`（exports / sideEffects / engines）**零改动**：仍是单入口 `client/main`
- **构建产物验收标准（可执行断言，非人工检查）**：构建后运行脚本断言 esm/cjs 两份 client 产物中保留原生 `import("node:fs")` 动态导入形式（rollup 对 external 模块的动态导入不应转译为 require）；断言纳入测试脚本
- **Plan B（若断言失败）**：如 cjs 输出转译了动态 import，或 web iife 目标工程（`output.environment.dynamicImport` 不满足）无法承载原生 `import()`，改用 `new Function('return import("node:fs")')()` 间接层 —— 该代码仅在 node 分支执行，浏览器侧为永不执行的死代码，不受 CSP 限制
- `engines.node` 保持 `>=18`（node 客户端不使用 WebSocket）
- `ws` 依赖保留（服务端 WS 仍用）
- 已知代价（dev-only，可接受）：
  - node bundle 携带 ~几 KB 永不执行的 DOM UI 死代码
  - web bundle 携带 ~1KB 永不执行的文件通道代码
- README 补充：SSR server 入口需 `if (import.meta.webpackHot) import.meta.webpackHot.accept();`（否则变更 unaccepted 触发 fallback）；node 热更依赖 `writeToDisk`（hot 模块对 node target 自动启用，见 6.5）

## 12. 错误处理

| 场景                               | 行为                                                         |
| ---------------------------------- | ------------------------------------------------------------ |
| node HMR `check` 抛错 / unaccepted | adapter.fallback → `reload ? process.exit(0) : console.warn` |
| 通道文件读取失败 / JSON 解析失败   | 静默跳过，等待下次 watch/轮询                                |
| `fs.watch` 异常                    | 重建 watcher；轮询兜底保证最终一致                           |
| payload uuid 不匹配（首次匹配前）  | 仅告警一次，不降级（防御崩溃循环，见 6.4）                   |
| payload uuid 不匹配（已匹配过）    | 同 `reload` 语义（退出或告警，服务端已重启）                 |
| tmpdir 残留文件                    | 文件名稳定、内容覆写，无累积问题；跨项目/跨用户由 `context   | output.path` 哈希 + uid 前缀隔离 |

## 13. 测试计划

### 13.0 前置 spike（go/no-go，实现前必须完成）

1. **rspack node-target HMR 端到端**：验证 `import.meta.webpackHot.check/apply` 在 node target 真实可用，确认 hot-update 文件落盘路径与 `publicPath`/`__webpack_require__.p` 的解析关系（决定 6.5 是否需要调整输出路径处理）
2. **webpackIgnore 动态 import 构建行为**：本包 esm/cjs 产物被 rspack 以 web/node target 消费时，`import(/* webpackIgnore: true */ 'node:*')` 是否保持原生形式、iife 目标是否可用（决定是否启用 Plan B）

### 13.1 验证路径

- 新增 `tests/node/` SSR 风格示例：`target: 'node'` compiler + dev middleware + server 入口 `import.meta.webpackHot.accept()`
  1. 启动后修改 server 源码 → 终端出现 rebuild/进度 → 热更生效（无需重启）
  2. 制造 unaccepted 变更 → `reload: true` 进程退出；`reload: false` 仅告警
  3. 重启 dev server（不重启 SSR 进程）→ 旧 SSR 进程收到 uuid 不匹配 → 按 reload 语义退出/告警
  4. **SSR 先于 dev server 启动**（残留旧 uuid 文件）→ 宽限窗口内仅告警不退出（6.4）
  5. **双 dev server 同项目并发** → 各自 key 隔离（`output.path` 掺入），互不干扰
- web 示例回归：HMR、进度环、overlay、断线重连行为不变；webworker 下客户端可启动且 console 输出（真实浏览器 harness）
- **构建产物断言脚本**：esm/cjs 产物保留原生 `import("node:fs")`（§11 验收标准）；web iife 目标工程冒烟
- `pnpm lint`（tsc --noEmit）通过

## 14. 非目标（本次不做）

- SSR 联动刷新：server bundle 更新后通知浏览器整页刷新（跨 compiler 通知，后续增强）
- node → 服务端上行消息通道（当前协议为纯下行）
- Docker 跨命名空间部署（服务端与 SSR 进程不同文件系统/网络）场景
- 边缘运行时（非 Node 的 `process` 伪装环境）深度兼容

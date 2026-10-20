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
│    └─ 原子写通道文件 os.tmpdir()/rdm-<key>.json（node 客户端消费）      │
└──────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴──────────────────────┐
        │ 同构客户端（唯一入口，注入所有 compiler）      │
        │  启动时环境检测：                             │
        │   node   → 文件通道 + console 适配           │
        │   有 DOM → WebSocket + Progress/Overlay     │
        │   worker → WebSocket + console 适配         │
        └────────────────────────────────────────────┘
```

## 3. 能力矩阵

| 运行环境（启动时检测） | UI 适配 | 传输 |
| --- | --- | --- |
| 有 `document`（浏览器） | Progress 进度环 + Overlay 错误遮罩（现状） | WebSocket |
| 无 DOM、非 node（webworker） | console 输出（纯文本） | WebSocket |
| node（`process.versions?.node`） | console 输出（ANSI 检测） | 文件通道 |

环境检测顺序：`typeof document !== 'undefined'` 判定 DOM；`typeof process !== 'undefined' && !!process.versions?.node` 判定 node。检测顺序 node 优先于 worker 分支（worker 中两者皆 false，走 console + WebSocket）。

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

消息分发逻辑（`invalid → showProgress`、`progress → updateProgress`、`hash → hot.updateHash`、`issues → setIssues + 无 error 时 performUpdate`、`ok → 收尾 + performUpdate`、所有消息 `emit` 到 events 总线、非正常断线 3s 重连）为两端共享，实现单份维护。

## 5. 同构入口与 node 内置模块隔离

`src/client/main.ts` 启动逻辑：

```ts
const isNode = typeof process !== 'undefined' && !!process.versions?.node;

if (isNode) {
  Promise.all([
    import(/* webpackIgnore: true */ 'node:fs'),
    import(/* webpackIgnore: true */ 'node:os'),
    import(/* webpackIgnore: true */ 'node:path')
  ]).then(([fs, os, path]) => startFileClient(getOptions(), { fs, os, path }));
} else {
  const hasDOM = typeof document !== 'undefined';
  startWSClient(getOptions(), hasDOM ? createDOMAdapter() : createConsoleAdapter());
}
```

要点：

- `node:fs/os/path` 仅可通过**原生动态 import + `/* webpackIgnore: true */` 魔法注释**引用（rspack 支持）。同一份源码在 web target 构建不会触发模块解析错误，node target 运行时原生加载
- 禁止顶层 await（兼容 cjs 产物），node 分支使用异步 IIFE/Promise 链
- web 启动守卫由 `typeof document !== 'undefined'` 放宽为覆盖 worker（`document.readyState` 检查仅在 hasDOM 时执行），webworker 从"客户端不启动"变为"完整 HMR + console 输出"
- `__resourceQuery` 为编译期注入常量，node target 同样可用，`getOptions()` 解析逻辑两端共享

## 6. node 文件通道

### 6.1 通道命名（稳定 key）

- 文件名：`os.tmpdir()/rdm-<key>.json`；`key = sha1((compiler.name || 'rspack') + '|' + compiler.context)` 的前 12 位十六进制（服务端用 `node:crypto` 计算）
- **不用 uuid 命名**：dev server 重启会生成新 uuid，按 uuid 命名会让旧 SSR 进程永久收不到通知（僵尸客户端）
- payload 内携带 `uuid`，用于过期检测（见 6.4）

### 6.2 写入（服务端）

- 触发时机与 WS 广播一致：`invalid / done(hash|issues|ok) / progress`
- **原地覆写**（`writeFile` 截断写，不用 `.tmp + rename` 原子写）：rename 换 inode 会破坏 Windows/macOS 上对单文件的 `fs.watch`；半截 JSON 由读取端"解析失败静默跳过"消化（见 6.3）
- `progress` 写入按 100ms 节流；其余消息即时写
- Socket 关闭（dispose）时删除通道文件

### 6.3 读取（node 客户端）

- `fs.watch` 监听文件变更 + 1s 轮询兜底（防 watch 丢事件）
- 读到的 JSON 与上一次内容相同则忽略；解析失败静默跳过（等待下次事件）
- 消息进入与 web 端相同的分发管线

### 6.4 过期检测（服务端重启）

客户端发现 payload `uuid` 与自身注入 uuid 不一致 ⇒ 服务端已重启、当前 bundle 已过期：

- `reload: true` → `fallback()`（`process.exit(0)`，由 nodemon/pm2 拉起）
- `reload: false` → `console.warn` 提示重启 SSR 进程

与 web 端 WS 关闭码 4001（compiler not found）的语义对齐。

## 7. console 双层降级

- **ANSI 检测**（内联实现，约 10 行，不引入 `supports-color` —— 该包静态 import `os/tty` 会污染 web 构建）：
  - 非 node 环境（`typeof process === 'undefined'`）→ 纯文本
  - `NO_COLOR` 存在、`FORCE_COLOR=0`、`TERM=dumb`、`CI` 存在 → 纯文本
  - `FORCE_COLOR` 非 0 值 → 强制 ANSI
  - 其余：`process.stdout?.isTTY` 为真 → ANSI，否则纯文本
- ANSI 样式沿用现有 client.ts 中的 ERROR/WARNING 色值
- 浏览器 console（worker 路径）固定纯文本
- node 端 progress 为单行刷新（`\r` 覆写），`issues` 为逐条 console 输出

## 8. 选项语义映射

不新增任何选项，现有 `hmr / reload / overlay / progress / path / wss` 在 node 端的映射：

| 选项 | web（DOM） | node（console） |
| --- | --- | --- |
| `hmr: false` | fallback（整页刷新） | fallback（退出进程） |
| `reload: true` | `location.reload()` | `process.exit(0)` |
| `reload: false` | console.warn 提示手动刷新 | console.warn 提示重启进程 |
| `overlay` | 控制 DOM 遮罩 | 无 DOM，仅 console 输出（无额外效果） |
| `progress` | 进度环 | 终端单行进度 |
| `wss` | 决定 ws/wss | 不适用（无 WS 连接） |

## 9. 服务端改动清单（`src/server/hot/`）

1. `Socket.ts`：`#broadcast` 增加"写通道文件"分支（所有 compiler 无差别双写：WS + 文件）；构造时计算稳定 `key`；dispose 清理
2. 新增通道文件写入/清理的工具函数（原子写、节流）
3. 注入逻辑**不变**：仍是 `EntryPlugin(client?params)`，params 不变（`wss` 等参数 node 客户端自行忽略）
4. **删除项**：无 target 推导、无 `hot.target`/`hot.origin`、schema 无扩展

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
- 实现时需验证构建产物：esm/cjs 两种输出中 `import(/* webpackIgnore: true */ 'node:*')` 必须保持为**原生动态 import**（rollup 对 external 模块的动态导入不应转译为 require；若被转译需在 cjs 构建中另行处理）
- `engines.node` 保持 `>=18`（node 客户端不使用 WebSocket）
- `ws` 依赖保留（服务端 WS 仍用）
- 已知代价（dev-only，可接受）：
  - node bundle 携带 ~几 KB 永不执行的 DOM UI 死代码
  - web bundle 携带 ~1KB 永不执行的文件通道代码
- README 补充：SSR server 入口需 `if (import.meta.webpackHot) import.meta.webpackHot.accept();`，否则变更 unaccepted 触发 fallback

## 12. 错误处理

| 场景 | 行为 |
| --- | --- |
| node HMR `check` 抛错 / unaccepted | adapter.fallback → `reload ? process.exit(0) : console.warn` |
| 通道文件读取失败 / JSON 解析失败 | 静默跳过，等待下次 watch/轮询 |
| `fs.watch` 异常 | 重建 watcher；轮询兜底保证最终一致 |
| payload uuid 不匹配（服务端已重启） | 同 `reload` 语义（退出或告警） |
| tmpdir 残留文件 | 文件名稳定、内容覆写，无累积问题；跨项目由 `context` 哈希隔离 |

## 13. 测试计划

- 新增 `tests/node/` SSR 风格示例：`target: 'node'` compiler + dev middleware + server 入口 `import.meta.webpackHot.accept()`
- 验证路径：
  1. 启动后修改 server 源码 → 终端出现 rebuild/进度 → 热更生效（无需重启）
  2. 制造 unaccepted 变更 → `reload: true` 进程退出；`reload: false` 仅告警
  3. 重启 dev server（不重启 SSR 进程）→ 旧 SSR 进程收到 uuid 不匹配 → 按 reload 语义退出/告警
  4. web 示例回归：HMR、进度环、overlay、断线重连行为不变；webworker 下客户端可启动且 console 输出
- `pnpm lint`（tsc --noEmit）通过

## 14. 非目标（本次不做）

- SSR 联动刷新：server bundle 更新后通知浏览器整页刷新（跨 compiler 通知，后续增强）
- node → 服务端上行消息通道（当前协议为纯下行）
- Docker 跨命名空间部署（服务端与 SSR 进程不同文件系统/网络）场景
- 边缘运行时（非 Node 的 `process` 伪装环境）深度兼容

# 02 多角色、任务与写冲突

状态：**形态已定，写冲突方案暂缓**（2026-11-18）

## 1. 目标形态：C（对等式角色 + 任务板）

三种形态：

| 形态 | 说明 | 成本 |
|---|---|---|
| A 提示词角色 | 一个 Agent 换提示词/工具 | 几小时 |
| B 委派式 | 父把子角色当工具调用 | 1-2 天 |
| **C 对等式** | 角色独立消费任务、发布结果 | 3 天+ |

选择 C 的理由：用户可 `@角色`、任务可排队/重排/停止、角色可独立恢复，最接近 Atoms。
B 和 C 共用同一套 **Run / drill-in**，所以 UI 不会白做。

## 2. v1 落地方式

- **v1 串行执行**：同一时刻只跑一个角色任务，不做并行调度。
- 角色清单不预先定义；先实现 `builder`，`verifier` 作为第一个只读角色。
- 任务表、Run 表、`role` 字段现在就写，避免以后改表。
- `@角色` 的入口先不做，但语义已定（见第 5 节）。

## 3. 协调者 = 代码路由 + supervisor 兜底

```
task 有明确 target ──→ 直接派给该角色（0 次模型调用）
task 无 target ─────→ supervisor 角色（模型）决定
失败 / 超预算 / 无人可接 ──→ supervisor 接管或上报用户
```

代码负责的硬规则（不写在提示词里）：

1. 最大 handoff 跳数（建议 6）。
2. 同一对角色来回最多 2 次。
3. handoff 目标必须在 allowlist 内。
4. 写锁只发给写任务。
5. 每个任务独立预算，超了强制结束。

## 4. 角色上下文

- **主事件流**是唯一可信记录（用户时间线、审计、回放）。
- **每个角色有独立 transcript**，上下文按 `目标 + 摘要 + ContextRef + 交接载荷` 组装，不塞全量历史。
- 角色输出建议结构化（例如 Verifier 返回 `{ passed, issues[], evidence }`），否则协调者无法判断。

## 5. `@角色` 的语义

- `@role` = **创建一个定向任务并进入队列**，不打断当前运行。
- 未知角色 / 当前模式不可用 → 明确报错，不静默转发。
- `@` 不改变工具权限，不绕过写锁。
- 单角色模式下映射到唯一角色，或直接禁用并提示。

## 6. 沙箱所有权（2026-11-19）

- **`WorkspaceDO` 是容器的唯一持有者**（每项目一个）。
- 角色（Builder / Verifier / Visual）各自是独立 DO，**不持有容器**。
- 所有沙箱操作通过 `WorkspaceTools` 接口调用：

```ts
interface WorkspaceTools {
  readFile(path: string): Promise<{ content: string }>;
  writeFile(path: string, content: string): Promise<{ bytes: number }>;
  exec(cmd: string[], opts?: { cwd?: string }): Promise<{ stdout: string; exitCode: number }>;
  listFiles(path: string): Promise<Entry[]>;
  createVersion(summary: string): Promise<{ versionId: string }>;
}
```

- v1：`ChatAgent` 与 `WorkspaceDO` 本地调用；多角色时同签名换 RPC。
- **代理执行不增加 token**：它是函数调用，不是模型转述。结果本来就要进入角色上下文，
  多出来的只有一次 DO 往返的延迟。

## 7. 写冲突：方案暂缓，原则先定

v1 串行执行，**不实现并行写**。未来方案：

### 6.1 计划中的方案（粗粒度单锁）

- 任务创建时声明 `intent: "read" | "write"`（按角色默认 + 用户措辞推断）。
- **写任务在开始时获取项目级写锁**，不是第一次调用写工具时才获取。
- 读任务不排队，但必须绑定 `targetVersionId`。
- 单锁 + FIFO 队列 + 租约心跳，任务结束/取消/崩溃都释放。
- 子代理**继承父任务授权**，不能独立抢锁。

为什么"用到才申请"不行：

- 读到旧状态 → 别人写入 → 再写回，TOCTOU 覆盖。
- 等待链：持锁 → 其他任务在工具层等 → 调度器不敢派发。
- Agent 计划基于旧状态，抢到锁后可能已失效。

### 6.2 被否方案

| 方案 | 原因 |
|---|---|
| 按资源（src/docs/artifacts）分别加锁 | 需要定义资源分类，复杂度高 |
| 按目录限制角色写权限作为主机制 | 假设 workspace 结构固定，且易被绕过 |
| 按 shell 命令判断是否写 | 管道、脚本、`$(...)` 防不住 |
| 懒申请锁 | 有 TOCTOU 与等待链问题 |

工具权限保留为**第二道防线**：Verifier 不提供 `write_file`；`exec` 默认视为写，除非命中只读白名单（`ls`/`cat`/`grep`/`git status`/`git diff`/`wc`）。

## 8. 待定

- 角色清单与各自职责（v1 只需要 builder / verifier）。
- `workspace:config`（package.json 等）是否只允许 builder 写。
- 读任务是否允许在写任务运行时并发（当前建议：允许，但钉版本）。
- 任务看板 v1 是否展示（建议：单角色时隐藏）。

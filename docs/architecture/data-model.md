# 数据模型与存储

状态：**v1 设计基线**（2026-11-19；2026-11-20 与实现校对，含版本发布）
权威类型：`packages/contracts`；本文说明**这些数据存在哪、表怎么建、为什么这么建**。

> **实现状态**：第 4、5、7 节是目标设计（D1 / R2 / Run / Task）。平台元数据实际只使用
> DO SQLite（发布后的全栈应用另用独立 D1）：
> `Projects` DO 保存项目索引，`WorkspaceDO` 保存版本/文件/快照/runtime/migration；
> `ChatAgent` 只使用框架 `cf_*` 表。实际字段见 4.1 注、5 节开头注、6.1–6.5。
> 与代码冲突时以代码和 `docs/implementation.md` 为准。

---

## 1. 存储分层

| 存储 | 存什么 | 为什么 |
|---|---|---|
| **D1（平台元数据目标；发布应用已使用）** | 平台项目、会话、产物索引、导出记录；已发布全栈应用的业务库另建独立 D1 | 需要**跨项目**列表与查询；DO 无法全局查询 |
| **DO SQLite（Projects）** | v1 项目索引：`id/name/prompt/template/runtime/template_source/plan_reason/configured/created_at/updated_at` | v1 尚未接 D1；用单例 DO 提供跨项目列表，读取时并发补齐各项目的版本摘要 |
| **DO SQLite（ChatAgent）** | 消息、流、压缩（框架表）；Run/审批/任务为目标设计 | 与会话强相关，写入频繁，要求原子顺序 |
| **DO SQLite（WorkspaceDO）** | 版本、快照指针、文件列表缓存、模板配置、browser 文件/版本/依赖、migration、构建产物、发布记录 | 与工作区强相关；容器项目版本与 git 同源；browser 项目用内容哈希版本 |
| **Cloudflare D1（发布产物）** | 每个已发布全栈项目的业务数据库 | 生成应用需要真正的外部数据库；平台元数据仍不放在 D1 |
| **R2（目标，未接入）** | 附件二进制、导出包、完整日志 | 大对象，不适合放进 SQLite |
| **平台快照** | 容器 rootfs | 停/起恢复，由 Cloudflare 管理，不进 R2 |
| **Secret Store** | 模型密钥、第三方凭据 | 不进入 DB、日志、沙箱 |

原则：

- **关系型元数据进 SQL**，不把整个项目塞进一个 JSON；
- **大对象进 R2（目标）**，DB 只存 key 与摘要；
- **框架表只读**：`cf_*` 前缀由 Agents SDK 管理，业务表统一 `atoms_` 前缀。

---

## 2. 实体关系

```mermaid
erDiagram
  PROJECTS ||--o{ SESSIONS : has
  PROJECTS ||--o{ VERSIONS : has
  PROJECTS ||--o{ ARTIFACTS : has
  PROJECTS ||--o{ EXPORTS : has
  PROJECTS ||--|| LOCKS : holds
  SESSIONS ||--o{ VERSIONS : produces
  SESSIONS ||--o{ RUNS : contains
  VERSIONS ||--o{ ARTIFACTS : owns
  RUNS ||--o{ RUN_EVENTS : emits
  RUNS ||--o{ APPROVALS : needs
  TASKS ||--o{ RUNS : dispatches
  RUNS ||--o{ RUNS : parent
```

说明：`RUNS ||--o{ RUNS : parent` 是 Run 树（单角色为单节点，多角色为父子）。
**该 ER 图是目标设计**；v1 实际只有 `atoms_projects`、`atoms_versions`、`atoms_snapshots` 等 DO 表。

---

## 3. 约定

> v1 实际表见 6.4–6.5；多数表没有 `deleted_at`，删除项目是删索引 + 清理 DO 存储。

| 项 | 约定 |
|---|---|
| ID | 前缀 + `crypto.randomUUID()`，例如 `prj_3f2a...`、`ver_...` |
| 时间 | 毫秒整数（`Date.now()`） |
| JSON 列 | `TEXT`，写入前用 contracts 的 zod schema 校验 |
| 布尔 | `INTEGER 0/1` |
| 枚举 | `TEXT`，值来自 contracts |
| 软删除 | 业务表保留 `deleted_at`（可空），物理删除由 GC 完成 |

---

## 4. D1 表（平台元数据目标；发布应用已使用 D1）

> 本节描述的是**平台元数据**（项目、会话、产物、导出）的目标 D1 表，仍未接入。
> 版本发布已经为每个全栈项目创建独立 D1，用于生成应用的业务数据；那不属于本节。

### 4.1 `atoms_projects`

```sql
CREATE TABLE atoms_projects (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  current_version_id TEXT,
  runtime_config     TEXT,              -- JSON: RuntimeConfig
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  deleted_at         INTEGER
);

CREATE INDEX idx_projects_updated ON atoms_projects(updated_at DESC);
```

| 字段 | 说明 |
|---|---|
| `current_version_id` | 当前工作版本；回滚只改它指向的版本，不改历史 |
| `runtime_config` | 启动命令/端口/env/secretRefs；恢复容器时按它重建进程 |
| `deleted_at` | 软删除；级联清理由 GC 异步做 |

> **v1 实际**：项目索引在 `Projects` DO 的 `atoms_projects`，字段为
> `id / name / prompt / template / runtime / template_source / name_source / plan_reason / configured / created_at / updated_at`。
> `name_source` 为 `derived | ai | user | fallback | legacy`，用于避免自动命名覆盖用户改名。
> 上表是接入 D1 后的目标 schema。

### 4.2 `atoms_sessions`

```sql
CREATE TABLE atoms_sessions (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL,
  title              TEXT NOT NULL,
  current_version_id TEXT,
  last_message_at    INTEGER NOT NULL,
  created_at         INTEGER NOT NULL,
  deleted_at         INTEGER
);

CREATE INDEX idx_sessions_project ON atoms_sessions(project_id, last_message_at DESC);
```

| 字段 | 说明 |
|---|---|
| `current_version_id` | 会话当前基于的版本；多会话时可分叉 |
| `last_message_at` | 首页排序与"最近会话" |

> 消息本身不存 D1，存 ChatAgent DO（框架表）。

### 4.3 `atoms_artifacts`

```sql
CREATE TABLE atoms_artifacts (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  version_id  TEXT,
  kind        TEXT NOT NULL,           -- upload | screenshot | build_log | source_zip | export
  name        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  sha256      TEXT,                     -- 去重与完整性校验
  r2_key      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE INDEX idx_artifacts_project ON atoms_artifacts(project_id, created_at DESC);
CREATE INDEX idx_artifacts_sha ON atoms_artifacts(sha256);
```

| 字段 | 说明 |
|---|---|
| `sha256` | 同内容只存一份 R2 对象；上传前先算 |
| `r2_key` | 例：`projects/{pid}/attachments/{aid}` |
| `version_id` | 产物属于哪个版本；上传附件可为空 |

### 4.4 `atoms_exports`

```sql
CREATE TABLE atoms_exports (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version_id TEXT,
  r2_key     TEXT NOT NULL,
  size       INTEGER NOT NULL,
  status     TEXT NOT NULL,             -- pending | ready | failed
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
```

说明：导出包默认 7 天过期，由 GC 删除 R2 对象。

### 4.5 `atoms_deployments`（可选，v1 不做）

> 该表在 D1 中仍未实现。v1 的发布记录改存在 WorkspaceDO 的 `atoms_deployments`，
> 见 6.5；D1 只用于已发布应用的业务数据。

```sql
CREATE TABLE atoms_deployments (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  url        TEXT,
  status     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## 5. ChatAgent DO 表（目标，未接入）

> **目标设计（未实现）**：v1 的 ChatAgent 只使用 Agents SDK 的框架表（消息、流、压缩），
> 没有自建 `atoms_runs` / `atoms_run_events` / `atoms_approvals` / `atoms_tasks`。
> 下面四张表是多角色与 Run 时间线落地时再建的 schema。

### 5.1 `atoms_runs`

```sql
CREATE TABLE atoms_runs (
  id            TEXT PRIMARY KEY,
  parent_run_id TEXT,
  project_id    TEXT NOT NULL,
  session_id    TEXT NOT NULL,
  task_id       TEXT,
  role          TEXT NOT NULL,
  status        TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  usage_json    TEXT NOT NULL DEFAULT '{}',
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER
);

CREATE INDEX idx_runs_session ON atoms_runs(session_id, started_at DESC);
CREATE INDEX idx_runs_task ON atoms_runs(task_id);
CREATE INDEX idx_runs_parent ON atoms_runs(parent_run_id);
```

| 字段 | 说明 |
|---|---|
| `parent_run_id` | Run 树；单角色为 `NULL`，子代理/角色为父 run |
| `usage_json` | `{ inputTokens, outputTokens, totalTokens, costUsd }`；父 run 汇总子 run |
| `task_id` | 多角色时关联任务；v1 可为空 |
| `summary` | 一句话结论，进时间线，不存全文 |

### 5.2 `atoms_run_events`

```sql
CREATE TABLE atoms_run_events (
  run_id TEXT NOT NULL,
  seq    INTEGER NOT NULL,
  type   TEXT NOT NULL,
  at     INTEGER NOT NULL,
  data   TEXT,                          -- JSON
  PRIMARY KEY (run_id, seq)
);
```

| 字段 | 说明 |
|---|---|
| `seq` | **每个 run 单调递增**；断线重放与去重都靠它 |
| `type` | 对应 contracts 的 `RunEvent` 判别字段 |
| `data` | 工具参数摘要、错误、耗时；**不存完整文件内容** |

### 5.3 `atoms_approvals`

```sql
CREATE TABLE atoms_approvals (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL,
  call_id    TEXT NOT NULL,
  role       TEXT NOT NULL,
  tool       TEXT NOT NULL,
  preview    TEXT NOT NULL,
  status     TEXT NOT NULL,             -- pending | approved | rejected | expired
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);

CREATE INDEX idx_approvals_run ON atoms_approvals(run_id, created_at);
```

说明：审批状态必须落库，刷新页面后仍能恢复。

### 5.4 `atoms_tasks`（目标，未实现）

```sql
CREATE TABLE atoms_tasks (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL,
  session_id        TEXT NOT NULL,
  role              TEXT,               -- NULL = 交给 supervisor
  intent            TEXT NOT NULL,      -- read | write
  target_version_id TEXT,               -- read 任务必须绑定
  title             TEXT NOT NULL,
  input_refs        TEXT NOT NULL DEFAULT '[]',  -- JSON: ArtifactRef[]
  depends_on        TEXT NOT NULL DEFAULT '[]',
  priority          INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL,
  created_by        TEXT NOT NULL,      -- user | roleId
  result_run_id     TEXT,
  usage_json        TEXT NOT NULL DEFAULT '{}',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX idx_tasks_project ON atoms_tasks(project_id, status, priority DESC);
CREATE INDEX idx_tasks_session ON atoms_tasks(session_id, created_at);
```

| 字段 | 说明 |
|---|---|
| `intent` | `read` 任务不能写；写冲突方案暂缓，v1 串行 |
| `target_version_id` | 验证类任务必须钉版本，否则结论会随写入失效 |
| `role = NULL` | 无明确 target，交给 supervisor 决定 |

### 5.5 框架表（只读）

POC-06 实测框架会建：

```
cf_agents_session_messages / message_chunks / compactions
cf_agents_streams / stream_blocks
cf_agents_state / runs / jobs / task_*
cf_agent_tool_runs
cf_ai_chat_agent_tool_*
```

规则：不改结构、不写业务数据；需要关联时用 `messageId` 做外键引用。

---

## 6. WorkspaceDO 表

### 6.1 `atoms_versions`

```sql
CREATE TABLE atoms_versions (
  id         TEXT PRIMARY KEY,
  git_commit TEXT NOT NULL,             -- 不能命名为 commit（SQLite 保留字）
  parent_id  TEXT,
  summary    TEXT NOT NULL,
  status     TEXT NOT NULL,             -- draft | failed
  archived   INTEGER NOT NULL DEFAULT 0, -- runtime 切换后旧版本不再允许 checkout
  created_at INTEGER NOT NULL
);
```

| 字段 | 说明 |
|---|---|
| `git_commit` | 版本内容真相；列名避开 `commit`；browser 项目存内容 SHA-256 |
| `parent_id` | 版本链；回滚生成新 commit，父指向当前版本 |
| `status` | 创建后为 `draft`；build 或快照失败时标为 `failed` |
| `archived` | runtime 切换后旧版本只展示，不允许再 checkout |

> DO 本身按项目寻址，因此没有 `project_id`；v1 也没有 `session_id` / `message_id`。
> 这是与早期设计稿的差异。

### 6.2 `atoms_locks`（目标，未实现）

```sql
CREATE TABLE atoms_locks (
  project_id  TEXT PRIMARY KEY,         -- 一个项目最多一把写锁
  task_id     TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL          -- 租约，崩溃自动释放
);
```

v1 串行执行，当前代码没有建这张表；多角色/并行写时再落地。

### 6.3 `atoms_snapshots`

```sql
CREATE TABLE atoms_snapshots (
  project_id  TEXT PRIMARY KEY,         -- 每项目滚动保留一份
  snapshot_id TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
```

| 字段 | 说明 |
|---|---|
| `snapshot_id` | Cloudflare 容器快照 ID；**只用于停/起恢复** |
| 体积/备注 | v1 不落库；本地是整机 rootfs，生产是增量 diff |

> 版本切换**不使用**快照；只有容器重建时才 restore。

### 6.4 v1 实际其他表

除版本/快照外，WorkspaceDO 还建了这些表：

| 表 | 用途 |
|---|---|
| `atoms_workspace` | `id`, `current_version_id`；当前版本指针 |
| `atoms_project_config` | `id`, `template`, `runtime`, `instance_tier`, `configured`, `updated_at`；发布相关列见 6.5 |
| `atoms_runtime_status` | `snapshot_error`, `snapshot_at`, `active_run`, `run_started_at` |
| `atoms_files` | 文件列表缓存：`path`, `size`, `updated_at` |
| `atoms_file_content` | browser runtime 文件内容 |
| `atoms_file_versions` | browser runtime 按版本保存的文件内容 |
| `atoms_build_files` | 发布用构建产物（base64 + content type + size） |
| `atoms_deployments` | 版本发布记录与当前线上版本 |
| `atoms_dependencies` | browser runtime 的 importmap 依赖 |
| `atoms_migration` | runtime 切换任务与来源/目标/归档统计 |
| `atoms_migration_files` | 迁移暂存的二进制文件 |

ChatAgent 的消息、流、压缩使用 Agents SDK 的 `cf_*` 框架表，不另建业务表。

### 6.5 发布产物、部署记录与发布目标

发布以**项目**为单位：每个项目固定一个子域名、一个 Worker 和一个 D1；
切换版本只更新 Worker 脚本与 D1 迁移，不创建新域名。

```sql
CREATE TABLE atoms_build_files (
  version_id   TEXT NOT NULL,
  path         TEXT NOT NULL,           -- dist/**、migrations/**、.atoms-lite/worker.js
  content_b64  TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  PRIMARY KEY (version_id, path)
);

CREATE TABLE atoms_deployments (
  id             TEXT PRIMARY KEY,
  version_id     TEXT NOT NULL,
  provider       TEXT NOT NULL,          -- cloudflare
  worker_name    TEXT NOT NULL,
  d1_name        TEXT,
  d1_id          TEXT,
  hostname       TEXT NOT NULL,
  domain_id      TEXT,
  status         TEXT NOT NULL,          -- deploying | ready | failed
  url            TEXT,
  schema_version TEXT,                   -- 最后一个 D1 migration 文件名
  domain_error   TEXT,                   -- 自定义域名绑定失败原因
  error          TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
```

`atoms_project_config` 另加 6 个发布列，首次发布时一次性写入并在后续版本复用：

| 列 | 说明 |
|---|---|
| `publish_slug` | 6 位随机字符；项目内稳定 |
| `publish_worker` | `atoms-lite-<slug>` |
| `publish_d1_name` | `atoms_lite_<slug>` |
| `publish_d1_id` | D1 UUID；首次发布时创建 |
| `publish_hostname` | `<slug>.atoms-lite.fengyj.me` |
| `publish_domain_id` | Cloudflare Workers Domain ID；绑定成功后保存 |

规则：

- `atoms_build_files` 在创建版本时写入；browser 版本收集当前文件，container 版本收集
  `dist/`、`migrations/` 和 `.atoms-lite/worker.js`。总量超过 12 MiB 时跳过，版本标记为不可发布。
- 当前线上版本 = 最新一条 `status = 'ready'` 的部署记录；版本列表据此返回 `published` 与 `deploymentUrl`。
- 发布失败只更新当前部署记录，不影响上一条 `ready` 记录，因此线上版本保持不变。
- 旧版本没有构建产物时 `hasArtifacts = false`，但不再禁用发布：发布会先尝试补齐。
  - browser：从该版本的 `atoms_file_versions` 重建产物，旧版本也可以发布。
  - container：只有当前版本可以重新 build 后收集；旧版本会提示先切换或创建新版本。
  - 旧 fullstack 模板（没有 `.atoms-lite/worker.js`）会提示新建项目或迁移到新模板。
- 自定义域名绑定失败不阻断发布：部署仍为 `ready`，URL 降级为
  `https://<worker>.<workers-subdomain>.workers.dev`，原因写入 `domain_error`，UI 显示警告。
- D1 迁移只向前应用；如果目标版本缺少数据库已应用的 migration，发布被阻断（见 9.5）。
- 删除项目时按 domain → Worker → D1 的顺序删除；Worker 还绑定自定义域名时
  Cloudflare 会拒绝删除脚本。失败只记日志，不阻塞删除。

### 6.6 v1 的文件与附件边界

| 数据 | v1 位置 | 说明 |
|---|---|---|
| 平台对话附件（用户给 Agent 的文件） | **未实现** | 没有附件入口，也没有 R2；PromptInput 组件自带附件能力，但对话面板未接入 |
| 生成应用内部的用户上传（例如报价网站的上传文件） | 生成应用自己的 `/workspace` 或 `/data` | 由生成代码处理，随容器快照保留；**不经过平台 R2** |
| 导出包 / 源码包 | **未实现** | 目标存储是 R2 |
| 浏览器静态项目文件 | DO SQLite | 只适合小文本文件；大二进制/附件应走 R2 |
| 容器项目源码 | 容器 `/workspace` + git | 通过容器快照恢复，不复制到 DO |

结论：**D1/R2 不是“永远不需要”，而是 v1 没有接入。** 当前单用户、少量项目的规模可以由 DO 承担；
接入多用户、全局查询、大文件附件、导出和长期日志时，D1/R2 才会成为必要的存储层。

---

## 7. R2 布局（目标，未接入）

v1 没有 R2 依赖；附件、导出和完整日志都在后续接入。

```
projects/{projectId}/
  attachments/{artifactId}         上传的图片/文件
  versions/{versionId}/source.zip  可选：源码导出
  exports/{exportId}.zip           导出包（7 天过期）
  logs/{runId}.log                 完整命令/构建日志
```

规则：

- DB 只存 `r2_key`、`size`、`sha256`；
- 附件按 `sha256` 去重；
- 删除项目时按前缀批量清理。

---

## 8. 快照与密钥

- **平台快照**由 Cloudflare 管理，我们只存 `snapshot_id` 与元数据；
- **Secret Store** 存真实密钥，DB 只存 `secretRefs` 的**键名**；
- 非敏感 env 在 `runtime_config.env`，可明文；
- 任何密钥、token、密码不得进 Git、快照、日志、D1/R2。

---

## 9. 关键流程与一致性

### 9.1 创建版本

v1 实际：

```
1. 校验工作区（build/health）
2. git add -A && git commit
3. 写入 atoms_versions（git_commit + parent + summary + status）
4. 更新 atoms_workspace.current_version_id
5. 写入 atoms_build_files（browser: 当前文件；container: dist/ + migrations/ + Worker bundle）
6. 创建/更新 Cloudflare 容器快照
```

目标形态还会更新 D1 `atoms_projects.current_version_id` 并发 `version.created` 事件。
若第 3 步失败，会产生"有 commit 无版本"的孤儿；恢复时用 `git log` 对账并补行。

### 9.2 快照与恢复

v1 使用 Cloudflare 容器快照，不使用 R2：

```
1. wal_checkpoint(TRUNCATE)
2. snapshotContainer()
3. 写 atoms_snapshots（成功后）
4. 停止容器
恢复：读 snapshot_id → start({ containerSnapshot }) → 校验 Git HEAD → 重启预览
```

快照失败时不写行，避免"有指针无快照"。
R2 完整工作区备份是后续目标，用于跨实例/长期恢复。

### 9.3 附件（目标，未实现）

```
上传：Worker → 计算 sha256 → R2 put → atoms_artifacts
消息：只存 artifactId
模型：调用前从 R2 取字节 → data URL
应用：投放到 /workspace/public/uploads/
```

### 9.4 用量汇总

- 每个 run 结束时写 `usage_json`；
- 子 run 的 usage 加到父 run（幂等：按 runId 只加一次）；
- 任务与项目的预算检查读汇总值。

### 9.5 发布版本

```
1. 读取 version 的 atoms_build_files；为空则拒绝
2. 取/生成项目固定的 publish_slug / Worker / D1 / hostname
3. 全栈：确保 D1 存在，应用目标版本中的缺失 migration
   - 如果 D1 已应用 migration 不在目标版本中，拒绝（不回滚数据库）
4. 生成 Worker 脚本：
   - fullstack：.atoms-lite/worker.js + 嵌入 ASSETS
   - 其他：由 dist 文件生成静态 Worker
5. PUT /accounts/:account/workers/scripts/:worker（D1 binding）
6. 绑定自定义域名；失败则保留 workers.dev URL 并记录 domain_error
7. 写 atoms_deployments(status = 'ready')
```

一致性：

- 先迁移 D1、再替换 Worker；迁移失败则 Worker 不变，旧版本继续服务。
- 迁移成功后 Worker 上传失败时，数据库会处于“新 schema + 旧代码”状态；
  v1 接受这个窗口，依赖 forward-only migration 的向后兼容。
- 同一项目同时只允许一个发布（WorkspaceDO 的 exclusive 队列）。

---

## 10. 索引与容量

| 表 | 关键索引 | 说明 |
|---|---|---|
| sessions | `(project_id, last_message_at)` | 首页列表 |
| artifacts | `(project_id, created_at)`、`sha256` | 列表与去重 |
| versions | `(project_id, created_at)` | 版本列表（容器停止时也要快） |
| runs | `(session_id, started_at)`、`task_id`、`parent_run_id` | 时间线与树 |
| run_events | PK `(run_id, seq)` | 顺序读与重放 |
| tasks | `(project_id, status, priority)` | 看板与调度 |

容量注意：

- DO SQLite 单对象有存储上限（以当前 Cloudflare 配额为准）；`run_events` 是增长最快的表，需要裁剪；
- D1 适合元数据，不适合大 JSON 与日志；
- 日志全文进 R2，DB 只存引用。

---

## 11. 保留、删除与 GC

| 数据 | 保留 | 清理 |
|---|---|---|
| `run_events` | 每会话最近 N 次运行（建议 50） | 超出按 run 批量删 |
| `runs` / `tasks` | 随会话保留 | 删除会话时级联 |
| `artifacts` | 随项目保留 | 软删除 + 异步删 R2 |
| `exports` | 7 天 | 过期 GC |
| `snapshots` | 每项目 1 份 | 新快照成功后删旧 |
| 消息 | 框架保留 + 压缩 | 不物理删除 |
| 日志 | R2，30 天 | 过期 GC |

删除项目采用**软删除 + 异步 GC**，顺序：

```
停止容器 → 删除快照 → 删除 R2 前缀 → 删除 DO 行 → 删除 D1 行
```

任何一步失败都可重试（幂等）。

---

## 12. 迁移

- **D1**：`wrangler d1 migrations`，每个迁移一个编号 SQL 文件，只增不改。
- **DO SQLite**：每类 DO 一个 `schema_migrations(version INTEGER)` 表；
  构造函数里 `blockConcurrencyWhile` 执行未应用的迁移。
- **框架表**：不参与我们的迁移，也不改结构。
- 迁移必须可重入；失败时 DO 启动直接报错，不带着半套 schema 运行。

---

## 13. 待定

| 项 | 说明 |
|---|---|
| `runs` / `tasks` 的最终归属 | 多角色时迁到 `OrchestratorDO`；v1 在 ChatAgent |
| 完整日志放 R2 还是 DO | 目前计划 R2，DB 只存引用 |
| 附件删除策略 | 消息删除后是否级联删附件 |
| D1 与 DO 的跨库一致性 | 项目/会话在 D1，版本在 DO，删除需补偿 |
| DO 存储配额 | 需按当前 Cloudflare 限额确认 |

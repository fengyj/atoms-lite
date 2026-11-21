# 08. 运行环境生命周期与 Agent 工具

状态：**已实现**（2026-11-19；2026-11-20 补充预览刷新与 selection）

## 0. 术语

| 术语 | 含义 | 代码/字段 |
|---|---|---|
| **模板（template）** | 生成项目的技术栈形态：`static` / `react-vite` / `fullstack-hono` | `template` |
| **运行环境（runtime）** | 项目实际在哪里执行：`browser`（Worker 直接服务） / `container`（容器） | `runtime` |
| **沙箱（sandbox）** | `container` 运行环境里的隔离容器 | `container` |
| **实例（instance）** | 容器规格：`basic` / `standard-1` / `standard-2` | `instance_tier` |

> “runtime” 容易和语言运行时（Node runtime、V8 runtime）混淆。本文正文优先用“运行环境”；
> 只有字段名、API、工具名保留 `runtime`，例如 `switch_runtime`、`runtime_context`。

## 1. 运行环境不在创建时确定

项目创建默认走**自动选型**：

- 自动选型：创建为 `configured=0`，只保存 planner/规则的建议模板；
  不 seed、不启动容器。项目卡显示「待确认」。
- API 仍接受 `preferredTemplate`（manual）用于调试/兼容；首页不再提供手动技术栈下拉。

首轮对话处于 `pending`，模型只有 `ask_user` 工具：

1. 用卡片确认目标用户、核心流程、数据/视觉方向，并给出 `recommendedTemplate`。
2. 用户提交或超时后，客户端调用 `/api/projects/:id/configure` 写入
   `template + runtime + configured=1`。
3. 下一轮请求才挂载文件、构建、预览等工具；第一次文件操作才 `ensure()`，
   仍然保持懒启动。

配置后、第一次写入前仍可重新配置；这等价于无成本切换运行环境。

## 2. 每个请求动态组装工具与上下文

`apps/worker/src/tools.ts` 使用工具注册表，工具自己声明匹配条件；
`agent.ts` 每轮根据 `WorkspaceDO /meta` 生成运行环境上下文（`RuntimeContext`），再过滤工具。
不写死 `template/runtime → 工具列表` 的 if/else。

`RuntimeContext` 只附加到发给模型的**最后一条用户消息**副本，不写回
消息存储。包含：

- 当前时间/时区
- configured / template / runtime
- 容器状态、实例档位、版本数
- migration 状态
- 预览选中元素（`selection_*` 字段；没有选中时 `selection: none`）
- capabilities

工具定义只在 configure/switch 时变化，频率很低，对 prompt 缓存影响可接受。

## 3. 运行环境可以切换，但只允许单向升级

`switch_runtime` 是客户端确认工具：先显示目标环境，用户确认后调用
`POST /api/projects/:id/runtime/switch`。

容量顺序：

```text
browser < container/basic < container/standard-1 < container/standard-2
```

目标容量不能低于当前容量。因此：

- browser-static → React/全栈：允许
- React ↔ 全栈：允许（同实例档位）
- container → browser：拒绝

### 迁移协议

1. 旧文件导出到 `atoms_migration_files`（BLOB），排除：
   `node_modules`、`dist`、`.git`、`.atoms*`、构建缓存、lockfile、`.npmrc`。
2. 单文件上限 2MB、总量 30MB、最多 500 个文件；超限项写入 manifest 的 skipped。
3. 目标环境重置为目标模板，文件解压到 `_sandbox_migration/`：
   - `manifest.json`
   - `files/...`
   - `workspace.tar.gz`
4. 模型通过迁移工具按需读取/复制：
   - `list_migration_files`
   - `read_migration_file`
   - `copy_migration_file`（二进制/大文件服务端复制）
   - `finish_migration`
5. `_sandbox_migration/` 同时排除于 git、文件树、预览、版本和快照；
   平台写入 `.gitignore` 和 `.git/info/exclude`。
6. `finish_migration` 清理备份；随后由模型 `create_version`。
7. 切换前的版本标记为 `archived`，不再允许 checkout；旧数据/旧 git 历史
   不会自动合并到新环境。

全栈 `/data/app.db` 不在工作区备份内；切换出全栈前需要用户确认数据保留策略。

## 4. ask_user 卡片

- 聊天窗口内向导卡片，不是 modal：一次一个问题、可前后切换、最后 summary 确认。
- 最多 3 个问题，单选/多选/文本；每个问题都允许用户自行输入答案。
- 不询问运行环境/技术栈；模型根据回答内部推断 `recommendedTemplate`，卡片不展示。
- 可以分多轮 ask_user 继续澄清，不假设一次问完。
- 超时 **15 分钟**，底部线性进度条 + `mm:ss`，最后 2 分钟 warning 色。
- 超时自动 `addToolOutput({ skipped: true })`；用户取消传 `cancelled: true`，模型使用默认方案继续。
- 客户端工具：服务端只有 schema，没有 execute；提交后 `addToolOutput`
  自动续跑同一回合。配置项目使用模型内部推断的 template，用户不感知运行环境。
- 不使用 approval（approval 只能传 approved/denied，带不了答案）。

## 4.1 exec 结构化命令与审批

`exec` 不做自由 shell 字符串，也不分成两个工具；模型提交结构化的命令链：

```ts
type ExecInput =
  | { command: { program: string; args?: string[] }; cwd?: string }
  | {
      groups: Array<{
        op?: "and" | "or";
        pipeline: {
          commands: Array<{ program: string; args?: string[] }>;
          stdout?: { path: string; append?: boolean };
        };
      }>;
      cwd?: string;
    };
```

- `pipeline.commands` 内部用管道连接；`groups` 之间用 `&&` / `||` 连接；
- 重定向必须用结构化 `stdout.path`，路径限制在 `/workspace` 内；
- 服务端先校验每个叶子命令，再安全转义并编译成 `sh -lc` 执行；
- 只读命令和只读管道自动执行；写文件、重定向、安装、网络、`git` 写操作、
  `sh`/`node` 脚本通过 `needsApproval` 请求用户批准；
- 复杂脚本（`for`/`while`）不提供自由字符串：模型先用 `write_file` 写到
  `/workspace/scripts/*.sh`，再用 `sh /workspace/scripts/xxx.sh` 执行，仍然走审批；
- `exec` 的 input schema 不允许 `.regex()`（JSON Schema `pattern` 会让上游返回
  `upstream_unavailable`），路径校验在服务端手动做。

审批偏好：

- 审批卡提供「允许一次 / 始终允许 / 拒绝 / 始终拒绝」；
- 偏好按结构化命令的稳定 key 存 `atoms_exec_preferences`，只匹配同一条命令；
- 工作台「终端 → 执行偏好」可以查看、逐条移除或全部清除；
- 如果误选「始终拒绝」，再次调用会返回明确错误，并提示到执行偏好里移除；
- 偏好按项目隔离，不跨项目共享。

## 5. subagent

通用 `subagent` 与固定角色包装并存：

- `subagent({ role, task, files?, maxFindings? })`
- `code_review`：固定 `code_reviewer` rubric
- `design_review`：固定 `design_reviewer` rubric；先跑 `design_check` detector，
  再把确定性 findings 交给只读设计子 agent

约束：

- 只读，不写文件、不执行命令、不递归调用 subagent
- 每次运行最多 2 次；45 秒超时
- 主 Agent 只采纳最有价值的 3–5 条
- 小修小改不调用

## 6. 已知取舍

- 迁移在同一个容器内重置 workspace，不维护两个 live sandbox；
  避免双容器成本和预览路由复杂度。
- 旧版本只保留展示，不保证可回滚到旧运行环境。
- 迁移期间旧环境仍可能被快照；`finish_migration` 前不要创建版本。
- 实例自动升级未实现；手动升级已实现（见 06）。

## 6.1 预览刷新

`start_preview` 只负责「服务可用 + 让新产物生效」：

- `kind: static`（static / react-vite）：静态 server 每次请求读磁盘，build 后刷新 iframe 即可；
- `kind: node`（全栈）：长驻进程，必须重启才能加载新的服务端代码；
- 旧快照没有 preview supervisor 时降级为 `ensurePreview()`，不再等待永远不会发生的 down。

## 7. 预览元素选择

预览工具栏提供「选择元素」：

- 在 same-origin 的预览 iframe 内高亮元素，点击后收集 selector、tag、class、
  text、outerHTML、关键 computed styles、位置和页面 URL。
- 通过 `sendMessage(..., { body: { selection } })` 作为请求上下文发送；
  不写入消息正文，也不持久化到历史。
- `onChatMessage` 把 selection 字段并入同一份 `<runtime_context>`（`selection_*` 键），
  提示词要求优先局部修改；不再追加独立的 `<selected_element>` 标签。
- 本地开发时 Web 与 Worker 不同源，选择器会提示无法读取 DOM；生产同源可用。
- 这是 Live Mode 的轻量替代：先做「选中 + 对话修改」，不做三变体热替换。

设计审查不再作为预览按钮，而是通过 `/design-review` 命令或 `design_review` 工具触发。
`design_review` 先运行 WASM detector 扫描源码，再把确定性 findings 交给只读设计子 agent
综合评审；预览只保留元素选择，不承担设计审查 UI。

## 8. Impeccable WASM detector

`apps/worker/src/detector/` 内置了 Impeccable 的 WASM detector（Apache-2.0，
版本与构建方式见该目录 README）。Worker 通过 `CompiledWasm` 规则加载，
`design_check` 工具用它扫描生成项目源码：

- `.html` 用 `detect_html_source_json`
- `.ts/.tsx/.js/.jsx/.css` 用 `detect_text_json`
- 单次最多 30 个文件、约 120KB，返回最多 30 条 findings
- 源码规则不覆盖渲染后的对比度/溢出；这类问题需要浏览器/DOM 检查，当前不冒充完整视觉回归

WASM 约 4.5MB，Worker 总上传约 8.3MB（gzip 约 2.5MB），仍在限制内。
若后续体积成为问题，可拆成独立 detector Worker 或按需加载。

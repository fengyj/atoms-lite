# 09. Runtime 生命周期与 Agent 工具

状态：**已实现**（2026-11-19）

## 1. Runtime 不在创建时确定

项目创建分两种：

- **手动选模板**：创建即 `configured=1`，runtime 固定。
- **自动选型**：创建为 `configured=0`，只保存 planner/规则的建议模板；
  不 seed、不启动容器。项目卡显示「待确认」。

首轮对话处于 `pending`，模型只有 `ask_user` 工具：

1. 用卡片确认目标用户、核心流程、数据/视觉方向，并给出 `recommendedTemplate`。
2. 用户提交或超时后，客户端调用 `/api/projects/:id/configure` 写入
   `template + runtime + configured=1`。
3. 下一轮请求才挂载文件、构建、预览等工具；第一次文件操作才 `ensure()`，
   仍然保持懒启动。

配置后、第一次写入前仍可重新配置；这等价于无成本切换 runtime。

## 2. 每个请求动态组装工具与上下文

`apps/worker/src/tools.ts` 使用工具注册表，工具自己声明匹配条件；
`agent.ts` 每轮根据 `WorkspaceDO /meta` 生成 `RuntimeContext`，再过滤工具。
不写死 `template/runtime → 工具列表` 的 if/else。

`RuntimeContext` 只附加到发给模型的**最后一条用户消息**副本，不写回
消息存储。包含：

- 当前时间/时区
- configured / template / runtime
- 容器状态、实例档位、版本数
- migration 状态
- capabilities

工具定义只在 configure/switch 时变化，频率很低，对 prompt 缓存影响可接受。

## 3. Runtime 可以切换，但只允许单向升级

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

- 聊天窗口内卡片，不是 modal。
- 最多 3 个问题，单选/多选/文本；推荐技术栈可被用户覆盖。
- 超时 **15 分钟**，底部线性进度条 + `mm:ss`，最后 2 分钟 warning 色。
- 超时自动 `addToolOutput({ skipped: true })`，使用推荐项继续。
- 客户端工具：服务端只有 schema，没有 execute；提交后 `addToolOutput`
  自动续跑同一回合。
- 不使用 approval（approval 只能传 approved/denied，带不了答案）。

## 5. subagent

通用 `subagent` 与固定角色包装并存：

- `subagent({ role, task, files?, maxFindings? })`
- `code_review`：固定 `code_reviewer` rubric
- `design_review`：固定 `design_reviewer` rubric

约束：

- 只读，不写文件、不执行命令、不递归调用 subagent
- 每次运行最多 2 次；45 秒超时
- 主 Agent 只采纳最有价值的 3–5 条
- 小修小改不调用

## 6. 已知取舍

- 迁移在同一个容器内重置 workspace，不维护两个 live sandbox；
  避免双容器成本和预览路由复杂度。
- 旧版本只保留展示，不保证可回滚到旧 runtime。
- 迁移期间旧环境仍可能被快照；`finish_migration` 前不要创建版本。
- 自动升级实例仍只支持手动触发（见 07）。

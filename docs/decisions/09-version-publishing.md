# 09 · 版本发布：项目级 Workers + D1

状态：**已实现**（2026-11-20）

## 决策

把“版本发布”做成**项目级**能力，而不是每个版本生成一个新的部署目标：

- 每个项目首次发布时生成并固定：
  - 6 位 slug
  - Worker：`atoms-lite-<slug>`
  - D1：`atoms_lite_<slug>`
  - 域名：`<slug>.atoms-lite.fengyj.me`
- 这些值保存在 `atoms_project_config`，后续发布只更新 Worker 内容和 D1 schema。
- 发布单位是 `versionId`；`atoms_deployments` 记录每次发布，最新一条
  `status = 'ready'` 就是当前线上版本。
- 版本面板给已发布版本显示 badge；发布另一个版本时 badge 移动，URL 不变。

构建产物与发布方式：

- 创建版本时把产物写入 DO SQLite 的 `atoms_build_files`：
  - static/React：`dist/**`（browser 运行时为当前项目文件）
  - fullstack：`dist/**`、`migrations/*.sql`、`.atoms-lite/worker.js`
- 静态/React：把资源直接内嵌进生成的 Worker 脚本。
- 全栈：上传 rolldown 生成的 Worker bundle，内嵌 dist 资源，绑定 D1 `DB`。
- 不引入 R2，也不依赖 Workers Assets API。

旧版本补齐：

- 发布前如果目标版本没有 `atoms_build_files`，自动尝试补齐。
- browser：从该版本的 `atoms_file_versions` 重建，旧版本也可以直接发布。
- container：只有当前版本能重新 build 并收集；旧版本提示先切换或创建新版本。
- 旧 fullstack 模板没有 `.atoms-lite/worker.js` 时，提示新建项目或迁移模板。

D1 迁移：

- 发布前应用目标版本中缺失的 `migrations/*.sql`。
- 如果 D1 已应用的 migration 不在目标版本中，拒绝发布。
- 只做 forward-only，不自动执行 down migration。

自定义域名：

- 使用 Workers Domains API `PUT /accounts/:id/workers/domains`。
  `POST` 会返回 `405 Method not allowed for this authentication scheme`。
- 绑定失败不阻断发布：降级为 workers.dev，原因写入 `domain_error`，UI 显示警告。

删除：

- 删除项目时按 **domain → Worker → D1** 顺序清理。
- Worker 还绑定自定义域名时，Cloudflare 会拒绝删除脚本。

取消发布：

- 版本列表对已发布版本提供“取消发布”。
- 删除自定义域名和 Worker，保留 D1 数据。
- 当前 `ready` 部署标为 `unpublished`；再次发布会重建 Worker/域名并继续使用原 D1。
- 首页项目卡根据 WorkspaceDO `/meta` 的发布状态显示“已发布”badge。

## 理由

- **URL 稳定**：用户只需要记住一个地址；版本切换是内容更新，不是迁移域名。
- **实现简单**：不引入 R2/Assets 的额外 binding 和上传流程，产物随版本走。
- **数据不被代码回滚破坏**：全栈应用使用真正的 D1；预览仍用容器 SQLite + 快照，
  两者分离。
- **避免不可逆的数据回滚**：自动 down migration 风险高，阻断比“回滚到一半”更安全。
- **发布失败可回退**：上传或迁移失败时保留上一条 `ready` 记录，线上版本不变。

## 被否方案

- **每个版本一个域名**：域名/证书数量随版本增长，URL 不稳定，用户无法收藏。
- **R2 + Workers Assets**：v1 产物较小，额外 binding 和上传复杂度不划算；
  当前单版本上限约 12 MiB，超过后拒绝发布。
- **发布后仍跑容器**：成本和可用性都不如独立 Worker；容器只负责开发和预览。
- **自动 down migration**：很多 schema 变更没有可靠逆操作，可能直接丢数据。
- **在 Worker 里调用 wrangler**：运行时不提供 CLI/进程，必须走 Cloudflare API。

## 影响与待办

- `atoms_build_files` / `atoms_deployments` 与 `publish_*` 列需要随版本迁移。
- 发布 API：`POST /api/projects/:id/publish`、`GET /api/projects/:id/deployments`。
- 自定义域名依赖 `CLOUDFLARE_API_TOKEN`；OAuth token 约 1 小时过期，
  生产长期使用应配置 API Token。
- 大产物、预发环境、多区域、数据库回滚工具仍待后续。
- 删除流程必须保持 domain → Worker → D1 顺序，并允许单步失败不阻塞其余清理。

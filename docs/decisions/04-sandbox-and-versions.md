# 04 沙箱、快照与版本

状态：**已定**（2026-11-18）

## 1. 恢复机制：只用官方快照

| 机制 | 用途 |
|---|---|
| **CF 快照**（`snapshotContainer`） | 唯一恢复路径，包含整个 rootfs（含 `node_modules`） |
| **git commit** | 版本与代码历史，留在工作区内 |
| **按需打包** | 用户点导出时生成 zip，排除 `node_modules`，不进恢复链路 |

**不做**：pnpm store 缓存、预装基础镜像、安装加速。
理由：都绑定具体语言生态（pnpm / pip / go mod），为 demo 维护多语言缓存不划算。

### 实测数字

| 场景 | 结果 |
|---|---|
| 裸 node 镜像快照 | 80 MB |
| alpine/git 基线 | 36 MB |
| 快照吞吐 | **约 40 MB/s**（+200MB 数据 → 236MB，4.9s） |
| 恢复（含容器启动） | 1.6s |
| 版本列表（容器停止时） | 33ms，不唤醒容器 |
| 生产冷启动（CF） | 8.1s |
| 生产快照（diff） | 4.2s，2507 bytes |
| 生产恢复 | 1.4s |

推论：

- 本地是整机 rootfs（76MB），生产是**增量 diff**（2.5KB），两者语义不同；
- 容量规划以生产为准，本地数字只用于验证流程；
- 快照只用于**空闲停止 / 显式停止 / 高风险操作前**，每项目保留一份滚动快照，不按版本存。

## 2. 容器生命周期（必须遵守）

```ts
if (!container.running) {
  container.start({
    image: container.images["base"],
    entrypoint: ["sleep", "infinity"],
    enableInternet: false,
  });
  await container.setInactivityTimeout(5 * 60_000); // 演示环境：5 分钟
}
```

- **`setInactivityTimeout` 必须显式设置**：不设置时实例在两次请求之间就被回收（实测 hostname 变化、文件丢失）。
- **`start()` 必须先判断 `running`**，否则报 `start() cannot be called on a container that is already running`。
- **配置必须用 DO 调度策略 + `images` map**：
  ```jsonc
  { "class_name": "Sandbox", "scheduling_policy": "durable_object",
    "images": { "base": { "dockerfile": "./Dockerfile" } } }
  ```
  默认策略下 `ctx.container.start()` 是空操作。
- 基础镜像越小越好：36MB 与 80MB 的差距直接翻倍到快照时间。
- 自建镜像若基于 `alpine/git`，必须写 `ENTRYPOINT []`，否则 `CMD` 会被拼成 `git sleep infinity`。

## 3. 快照与恢复流程

1. 快照前：`PRAGMA wal_checkpoint(TRUNCATE)`，停止应用写入，记录 `git status`。
2. `snapshotContainer({ name })`，把 `snapshotId` 存进 **DO storage**（不能只放内存）。
3. 停止/销毁容器。
4. 恢复：`start({ containerSnapshot: { id } })`；快照找不到时**直接报错，不回退到空镜像**。
5. 恢复后：重新注入环境变量、重启预览进程、刷新预览 URL（旧 PID/地址不复用）。

## 4. 版本模型

```
git commit   → 版本内容
versions 行  → id / git_commit / parent_id / session_id / message_id / status / summary / created_at
快照         → 仅用于容器重建，不用于版本切换
```

- 列名用 `git_commit`，不能用 `commit`（SQLite 保留字）。
- **回滚只回代码**：`git checkout <commit> -- .`，数据库不动。
- 回滚通过**新提交**实现，禁止 `reset --hard`；分叉用 `git switch -c fork/<versionId>`。
- 版本列表只查元数据，容器睡着也能渲染。
- 版本切换不能恢复快照，否则会连带回滚数据。
- `git checkout` 不会删除后来新增的文件；彻底回滚需要按白名单 `git clean`，不要整目录清理（会删应用数据）。

## 5. 被否方案

| 方案 | 原因 |
|---|---|
| 快照按版本存 | 每个版本几百 MB，存储与时间都不可接受 |
| 快照用于版本回滚 | 会连带回滚运行数据 |
| 依赖缓存（pnpm store / 预装镜像） | 语言相关，维护成本高 |
| 自建 tar→R2 作为唯一恢复 | 冷恢复 10-40s，体验差 |
| 快照丢失时回退到空镜像 | 用户会以为工作区还在，实际已空 |

## 6. 沙箱 API：采用 `@cloudflare/sandbox` 的 `Files`

POC-10 结论：

- `Files` 可用于读写/列目录/stat/rename/remove；镜像必须包含 `sandbox-shim`（多阶段从 `cloudflare/sandbox:1.0.3` COPY）。
- `stat().size` 是 `bigint`，出网前要转 `number`。
- 预览与快照仍用 `ctx.container`，SDK 不参与。
- `DirectoryBackup` / `S3Mount` 暂不引入。
- **子代理不能访问父容器**：所有沙箱操作由独立的 `WorkspaceDO` 执行，角色通过 `WorkspaceTools` RPC 调用。

## 7. 所有权（2026-11-19）

- `WorkspaceDO` 每项目一个，唯一持有 container、写锁、git 仓库、快照与版本元数据。
- 角色 DO 不持有容器；工具通过 `WorkspaceTools` 访问。
- 这样既不依赖"父对象代理"，也让写锁有唯一归属。

## 8. 待定 / 风险

- **生产 Containers 与本地差异**（最高风险）：镜像分发、冷启动、快照 beta、egress、实例规格。
- `@cloudflare/sandbox` 与原始 `ctx.container` 的取舍；需在 wrangler 下对比验证。
- 带 `node_modules` 的真实快照体积与耗时（预计 300MB~1GB）。
- 子代理能否访问父容器（影响多角色的沙箱作用域）。

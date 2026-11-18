# POC-10 `@cloudflare/sandbox` 与子代理沙箱作用域

时间盒：2 小时。依赖：POC-00、POC-03、POC-06。

## 1. 要验证的假设

1. `@cloudflare/sandbox` 的文件 API 能否在 wrangler 本地跑通，是否比原始 `exec` 省事。
2. 子代理（`subAgent`）能否访问父对象正在运行的容器。
3. 框架的 session attachment 是否有公开 API，可供跨角色取字节流。

## 2. 结果

| # | 结果 | 证据 |
|---|---|---|
| 1 | ✅ 可用，但**镜像必须带 `sandbox-shim`** | `Files.writeFile/readFile/stat/readDirectory` 4 个操作 397ms；与 `exec cat` 结果一致 |
| 2 | ❌ **子代理不能访问父容器** | `hasContainer: true`，但 `running: false`，`exec` 报 `container is not running` |
| 3 | ❌ **没有公开附件 API** | `agents` 类型里只有内部表 `cf_agents_session_attachment_*`，无读写方法 |

## 3. 关键发现

### 3.1 官方镜像没有 shell，只有 shim

`cloudflare/sandbox:1.0.3` 只有 5.4MB，内容仅 `/usr/local/bin/sandbox-shim`，**没有 `/bin/sh`**。
它是 `images/sandbox-tools` 的发布产物，不是可运行的操作系统。

正确用法是多阶段构建：

```dockerfile
FROM cloudflare/sandbox:1.0.3 AS shim
FROM node:22-bookworm-slim
COPY --from=shim /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
RUN chmod +x /usr/local/bin/sandbox-shim
```

不加 shim 时，`Files` 报 `SandboxProtocolError: sandbox-shim returned truncated control data`。

### 3.2 `stat()` 返回 BigInt

`SandboxFileStat.size` 是 `bigint`，直接 `Response.json()` 会抛
`TypeError: Do not know how to serialize a BigInt`。要显式 `Number(size)`。

### 3.3 子代理与容器隔离

- `child.ctx.container` 存在，但 `running === false`，`exec` 直接失败。
- 结论：**每个 DO 只看到自己的容器实例**；子代理不能操作父容器。
- 架构含义：多角色时，沙箱工具必须由持有容器的项目 DO 执行；子角色通过独立的 `WorkspaceDO` 的 RPC（`WorkspaceTools`）获得结果。
  这也正好符合"写锁由父级持有"的设计。

### 3.4 SDK 没有新增的能力

- 预览：仍是 `getTcpPort`，SDK 不参与。
- 快照：仍是 `snapshotContainer`（本次 76MB / 3.0s）。
- `DirectoryBackup`：需要额外 gateway binding + storage，且我们已决定只用官方快照，不引入。
- `S3Mount`：需要签名网关，当前无对象存储挂载需求，不引入。

## 4. 结论

**采用 `Files`，但只用于文件操作。**

| 用途 | 选择 |
|---|---|
| 读/写/列目录/stat/rename/remove | `Files`（结构化、错误清晰） |
| 执行命令 | `ctx.container.exec` |
| 预览 | `ctx.container.getTcpPort` |
| 快照 | `ctx.container.snapshotContainer` |
| 子代理访问沙箱 | **不允许**，由 `WorkspaceDO` 提供 |

代价：镜像 +3.7MB（shim），依赖 +1。
Plan B（已可用）：全部走 `exec`（`cat`/`tee`/`find`），不引入 SDK。

## 5. 生产验证（2026-11-19，atoms-lite.fengyj.me）

| 项 | 结果 |
|---|---|
| `/start` 冷启动 | **8.1s** |
| `/start` 热调用 | 27ms |
| `/files`（Files API） | 67ms，SDK 与 raw exec 一致 |
| `/child`（子代理访问容器） | ✅ `running: true`，`exec` 成功读到父容器文件 |
| `/snapshot` | 4.2s，**2507 bytes** |
| `/restore` | 1.4s，文件完整 |

### 与本地最大的三个差异

1. **快照语义不同**
   - 本地：整个 rootfs（76MB），约 40MB/s；
   - 生产：增量 diff（2.5KB），4.2s，恢复 1.4s。
   - 容量规划以生产为准；本地数据只用于验证流程。

2. **子代理的容器访问不同**
   - 本地 `wrangler dev`：`running: false`，`exec` 失败；
   - 生产：`running: true`，能直接读到父容器文件（facet 共享机器）。
   - **架构不依赖任何一种行为**：统一走 `WorkspaceDO` 的 `WorkspaceTools` RPC，
     本地与生产表现一致。

3. **workers.dev 在本机不可用**
   - 域名被 DNS 污染，解析到 `157.240.2.50`（Meta）；
   - 自定义域名 `atoms-lite.fengyj.me` 正常（Cloudflare IP）。

## 6. 对主设计的影响

- 沙箱工具的作用域收敛到项目 DO；子角色的工具结果由父级回传。
- 附件继续走自研 `artifacts` + R2（框架没有公开 API）。
- 模板镜像需要包含：Node、git、`sandbox-shim`。
- 所有 `size` 字段在出网前要转 `number`。

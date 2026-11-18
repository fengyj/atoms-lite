# v1 实现记录（单角色 · 五子棋生成器）

状态：**已实现并部署**（2026-11-19）

## 1. 范围

- 单项目 `demo`、单会话 `demo`
- 用户输入需求 → ChatAgent 调工具 → WorkspaceDO 写文件 → 启动预览 → 创建版本
- 生成物：多文件静态站点（`index.html` / `styles.css` / `app.js`），无构建步骤
- 目标示例：五子棋（15×15、双人对战、胜负判定、悔棋、重新开始、localStorage）

不在 v1：多角色、多会话、PPT、附件、导出、回滚 UI、D1/R2。

## 2. 组成

| 组件 | 位置 |
|---|---|
| ChatAgent | `apps/worker/src/agent.ts`（AIChatAgent + AI SDK tools） |
| WorkspaceDO | `apps/worker/src/workspace/do.ts`（容器/文件/版本/快照） |
| Workspace 客户端 | `apps/worker/src/workspace/client.ts` |
| Worker 路由 | `apps/worker/src/index.ts` |
| 沙箱镜像 | `apps/worker/Dockerfile` + `container/` |
| Web 工作台 | `apps/web/components/workspace/*` + `lib/agent.ts` |

架构与决策见 `docs/architecture/`、`docs/decisions/`。

## 3. 关键行为

- 沙箱空闲 **5 分钟**回收；版本创建与 `finish` 时自动快照，重启时从快照恢复。
- 预览通过 Worker 代理 `/previews/demo/*`；容器内的服务只支持 HTTP，代理时把 scheme 改成 `http:`。
- 预览状态由 `GET /api/workspace/preview/status` 探测（`running` / `ready`）；前端每 1.2s 轮询，45s 未就绪显示「失败」。
- 版本 = git commit + `atoms_versions` 行；版本列表在容器停止时仍可读。
- 写文件走 `Files`（需要镜像内的 `sandbox-shim`）；命令走 `exec`（程序白名单）。
- 前端同源访问；本地开发用 `NEXT_PUBLIC_WORKER_HOST=http://localhost:8787`。

## 4. 验证记录

### 本地

- 容器启动 ~1s；模板 3 个文件；预览 200。
- 真实模型生成：**约 90 秒**完成 `list_files → write_file × 3 → exec → start_preview → create_version`。
- 预览标题 `五子棋 · Gomoku`；点击棋盘后「已落子 1 手」「轮到白棋」；localStorage 写入；无 console 错误。

### 生产（https://atoms-lite.fengyj.me）

![生产界面](assets/v1-production.png)


- 静态资源 200；`/health` 200；容器冷启动 ~8s。
- 真实 UI 输入 → 版本创建 → 预览可玩；生成约 3 分钟。
- 预览 200，文件列表 3 个，版本列表 1 条（commit `1d6d331`）。
- 点击棋盘点位后手数增加、执子方切换。
- **空闲回收恢复**：停止请求 400s 后 `preview/status` 为 `{running:false}`；再请求 `/previews/demo/` 返回 200、标题仍为「五子棋 · Gomoku」，3 个文件大小不变，版本仍为 `1d6d331`。
- **预览状态探测**：正常时徽标 `加载中 → 就绪`；强制 `ready:false` 时 45s 后显示「失败」。

## 4.1 代码审查

详见 `docs/reviews/v1-code-review.md`。P0（快照/seed 覆盖）与关键 P1（ensure 覆盖、healthz、checkout、幂等、超时、白名单、Origin）已修复并通过生产回归；审批接线、预览错误态等列为后续。

## 5. 已知限制

- 没有访问控制；公网 URL 可被任意人使用（演示期接受，需加预算上限）。
- 导出按钮禁用；产物 tab 空态；回滚没有 UI。
- 生成模板固定为静态站点，不支持 npm 依赖与构建。
- ChatAgent 的 `create_version` 可能被模型调用两次（会生成两个版本，属正常）。
- 预览的 HMR 未验证（静态站点不需要）。

## 6. 本地运行

```bash
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars  # 填 MODEL_*
pnpm dev:worker   # :8787
pnpm dev:web      # :3000（需 NEXT_PUBLIC_WORKER_HOST=http://localhost:8787）
```

## 7. 生产部署

```bash
NEXT_PUBLIC_WORKER_HOST= pnpm --filter @atoms-lite/web build
cd apps/worker
wrangler secret put MODEL_API_KEY -c wrangler.prod.jsonc
wrangler deploy -c wrangler.prod.jsonc
```

域名：`atoms-lite.fengyj.me`（Custom Domain）。

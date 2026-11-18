# v1 代码审查记录

审查范围：`apps/worker/src/workspace/do.ts`、`agent.ts`、`index.ts`、`Dockerfile`、`container/server.mjs`、`apps/web/lib/agent.ts`、`components/workspace/*`。

## 已修复

| 级别 | 问题 | 修复 |
|---|---|---|
| **P0-1** | 快照失败/失效后冷启动会用模板覆盖工作区，版本列表却仍在 | `seed()` 改为「`.git` 存在就绝不覆盖」；有版本但无 `.git` 直接报错；快照启动失败且有版本时拒绝启动空工作区；快照失败写日志 |
| P1-1 | 容器回收后 write/read/exec/versions 不走 `ensure` | 五条路由入口统一 `await this.ensure()` |
| P1-2 | `checkPreview` 用 `res.ok`，无 index 时误判死亡 | 新增 `/healthz`；同时兼容旧快照：`< 500` 即视为存活 |
| P1-3 | checkout 只覆盖同名文件、不改 current、无快照 | `git reset --hard + git clean -fd`；增加 `current_version_id` 指针；checkout 后快照 |
| P1-4 | createVersion 无变更也插行、并发抢 index.lock | 无 staged diff 时返回已有版本；`exclusive()` 串行化 createVersion/checkout；提交前清理 `index.lock` |
| P1-5 | exec 白名单可被 `find -exec sh` / `.git/hooks` 绕过；cwd 前缀校验不严 | 白名单移除 `find/node/sed`；`write_file` 拒绝 `/.git/`；cwd 走严格校验；文档明确真实边界是容器 |
| P1-6 | `run()/sh()` 无超时，git 挂死会卡住整轮 | 统一 120s 超时 + `kill(9)`；提交前清理陈旧 `index.lock` |
| P1-7 | CORS `*` + 无 Origin 校验，公网可被跨站驱动 | Origin 白名单：正式域 + 本地 3000；其余 403（含 WS 升级）；无 Origin 的 curl 放行 |
| P1-9 | 工具错误只进模型上下文，不留痕 | 所有工具 catch 加 `console.error`；Workspace 请求失败写日志 |
| P2-4 | 生产构建忘传 `NEXT_PUBLIC_WORKER_HOST` 会指向 localhost | 默认值改为「开发 localhost，生产同源」 |
| P2-5 | 空态示例按钮绕过 busy 守卫 | 流式中禁用 |
| P2-3 | 硬编码超时/步数，截断不置位 | 使用 `EXEC_TIMEOUT_MS` / `EXEC_MAX_OUTPUT_BYTES` / `MAX_AGENT_STEPS`；返回 `truncated` |

## 暂未处理

| 级别 | 问题 | 说明 |
|---|---|---|
| P1-8 | 预览 500 时 UI 仍显示「就绪」 | 代理已修复，500 已很少见；后续用 fetch 探测预览状态替换 iframe `onError` |
| P2-1 | `stop_preview` 曾是假实现 | 已从 Agent 工具中移除；`/preview/stop` 返回 400 |
| P2-2 | 审批 UI 是死代码 | v1 自动执行写/exec；审批未接线，README 已注明 |
| P2-6 | exec 计时器 / 子进程组 | 计时器已清理；子进程组 kill 未做 |
| P2-8 | 同毫秒版本排序 | 低概率，后续用 rowid |
| P2-9 | 文件名含换行 / dir 类型 | 当前场景可忽略 |

## 修复后验证

- `pnpm typecheck` 全通过
- `pnpm --filter web build` 静态导出成功
- 生产部署成功；`/health` 200
- `/api/workspace/files` 返回 3 个文件
- `/api/workspace/versions` 返回 current 版本
- `/previews/demo/` 200，标题「五子棋 · Gomoku」
- Origin 白名单：`https://evil.example` → 403，正式域 → 200

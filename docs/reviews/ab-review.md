# A/B 模板与运行时审查记录

审查范围：模板（static / react-vite / fullstack-hono）、Dockerfile、boot supervisor、
WorkspaceDO、Projects、Agent prompt、预览面板。

## 已修复

| 级别 | 问题 | 修复 |
|---|---|---|
| P1 | checkout 后 `git clean` 不会删除被 ignore 的 `dist`，重建失败仍返回成功 | checkout 先 `rm -rf dist` 再构建；失败返回 `buildError` 且不重启预览 |
| P1 | build 未串行，可与 createVersion/checkout 并发写 dist/git | `build()` 进入 `exclusive()` 队列 |
| P1 | `pgrep -f` 会匹配外层 `sh -c` 自身，supervisor 兜底永不执行 | 改为锚定 `^sh /opt/preview/boot.sh$` / `^node /opt/preview/server.mjs$` |
| P1 | 基础镜像 Node 版本漂移时 `node:sqlite` 可能不可用 | Dockerfile 增加构建期 `node:sqlite` 冒烟测试 |
| P2 | `mkdir -p ${dir}` 走 shell，路径含空格/元字符会出错 | 改为 `run(["mkdir","-p",dir])` |
| P2 | supervisor 只发 SIGTERM，服务忽略信号时“假重启” | SIGTERM 后 2s 升级 SIGKILL |
| P2 | `/destroy` 的 `storage.deleteAll()` 删表后同 isolate 后续请求 500 | 改为清空业务表、保留 schema |
| P2 | 创建项目时模板配置失败被吞，注册表与工作区模板静默分叉 | 配置失败回滚项目行并让创建失败；首个版本后锁定模板 |
| P2 | 预览代理 WS 分支未剥离 `/previews/:id` 前缀 | WS 转发也重写 pathname |
| P2 | 每轮 `finish` + `onFinish` 重复快照 | 移除 finish 工具内的快照，只保留 onFinish / createVersion / alarm |
| P2 | 旧静态快照可通过预览读取 `.git` | Worker 层统一拦截（含 URL 解码），server.mjs 再兜底一层 |
| P2 | 缺 dist 时 `/healthz` 仍 200，预览显示就绪 + 404 | `/` 也必须 200 才算 ready |
| P2 | Dockerfile 任意模板改动都会让 npm ci 层失效 | 先 COPY package/lock → npm ci（cache mount）→ COPY 源码 → build |
| P3 | prompt 仍让模型读 `src/App.jsx` | 改为 `src/App.tsx` |
| P3 | `.gitignore` 的 `node_modules/` 不匹配软链 | 改为 `node_modules` / `dist` |

## 仍保留

| 级别 | 问题 | 说明 |
|---|---|---|
| **P0** | 预览 iframe 与主站同源，生成代码可访问平台 API | 演示版无鉴权；生产化需要独立预览域 + 访问门禁。已在文档中明确风险 |
| P1 | 全栈快照 alarm 失败不重试 | 10s alarm 已串行化并验证跨空闲恢复；失败仅记日志 |
| P2 | 旧快照对象不清理 | 需要 Cloudflare snapshot 清理 API，后续处理 |
| P2 | 基础镜像仍用 `alpine/git:latest` | 已有 Node/sqlite 冒烟测试；后续锁 digest |
| P2 | 深层 SPA 路由下相对 API 可能错位 | 当前模板无客户端路由；生成器优先单层路径 |
| P3 | 预览就绪后不再轮询 | 容器休眠时徽标可能仍显示就绪；刷新页面恢复 |

## 验证

- 三种模板选型与生产预览通过。
- React 番茄钟 / 全栈优先级待办由 Agent 生成，`tsc + vite build` 通过。
- 全栈写入后 10s 快照，容器空闲回收再恢复数据仍在。
- 新镜像 starter dist 可直接预览。
- 旧快照回退到静态 server.mjs 正常（demo）。
- `.git` 预览请求 404；删除项目后 `/files` 返回空而不是 500。

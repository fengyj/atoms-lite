# POC-02 预览链路

时间盒：**1.5 小时**。依赖 POC-00。

这是整个 Demo 的命门：**能生成代码但看不到运行结果 = 不及格。**

## 1. 要验证的假设

拆成三个**独立**判定，任何一个失败只影响对应能力：

| # | 假设 | 失败后果 |
|---|---|---|
| H1 | Worker 能把 HTTP 请求转发到沙箱内的 dev server，资源正常加载 | 预览不可用，必须降级 |
| H2 | WebSocket 能穿过 Worker 代理（HMR） | 只能手动刷新，功能仍可用（D3 已接受） |
| H3 | 生成物在子路径 `/previews/<name>/` 下不会因为绝对路径 404 | 需要生成器配合 `base` 配置 |

## 2. 不在范围内

- 不验证快照/恢复（POC-03）。
- 不验证多项目并发预览（Phase 1 单项目）。
- 不做鉴权（D4）。

## 3. 步骤

1. 起一个最小 Node HTTP 服务（返回 HTML + 一个静态 JS + 一个 WS echo），监听 `0.0.0.0:8080`。
2. Worker 用 `/previews/demo/*` 前缀转发到该端口。
3. 浏览器直接访问预览地址，依次检查：
   - HTML 是否返回
   - 静态 JS 是否 200（看 Network 面板的请求路径）
   - WS 是否 101，消息能否往返
4. 再换一个真实 Vite 应用（`pnpm create vite`）重复一次，观察它默认的 `base` 行为。
5. 记录：需要改哪些配置才能让 Vite 在子路径下正常工作。

## 4. 通过标准

- [ ] H1：HTML + 静态资源全部 200，页面渲染正常
- [ ] H2：WS 101，能收到 HMR 的 `connected` 消息
- [ ] H3：不改生成物代码时，资源路径不 404；若必须改，记录**唯一的配置点**（如 `vite.config.ts` 的 `base`）
- [ ] 记录一次完整刷新到可交互的耗时

## 5. Plan B（按你的决定，接受无 HMR）

| 失败点 | 降级 |
|---|---|
| H2 失败 | 预览只走 HTTP，去掉 HMR；UI 提供「刷新」按钮，并在 Agent 改动后自动 reload iframe |
| H1 失败 | 改为**静态产物预览**：Agent 跑 `pnpm build`，Worker 从 R2/Assets 提供 `dist/`；dev server 只给 Agent 自己用 |
| H3 失败 | 生成器固定注入 `base` + `<base href>`；或让 Worker 在响应 HTML 时重写路径 |
| 全部失败 | 保底方案：限制生成物为**单文件 HTML**，用 iframe `srcdoc` 渲染 |

注意：Plan B 的「静态产物预览」会改变产品叙事（从"实时预览"变成"构建后预览"），需要在文档里明确写出取舍。

## 6. 产物

- 一段可复用的转发代码片段（Worker 侧）
- 一份「生成器必须遵守的预览约束」清单（给 Agent 的提示词用）
- spike 目录删除：`rm -rf spikes/poc-02-preview`

## 7. 风险

- **同源风险**：代理意味着生成的应用与你同域，可访问你的接口。演示可接受，但必须在 `README` 的「已知限制」里写明，并在 iframe 上加 `sandbox` 属性与 CSP。
- Vite 的 HMR 默认连 `ws://localhost:5173`，子路径代理下通常需要显式配置 `server.hmr.clientPort` / `protocol`。这是 H2 最容易卡住的地方。
- dev server 必须监听 `0.0.0.0`，只听 `127.0.0.1` 时容器外不可达。

## 结论

**通过（H1 / H2 / H3 全部满足）。不需要降级到 Plan B。**

### 实测结果（2026-11-18）

| 判定 | 结果 |
|---|---|
| H1 HTTP | ✅ 200；HTML 与 JS 都正常，前缀被正确剥离（容器内看到 `/assets/app.js`，host 是 Worker 域名） |
| H2 WebSocket | ✅ 101 + echo 成功（Node 内置 WebSocket 客户端经 Worker 往返） |
| H3 子路径 base | ⚠️ 绝对路径 `/assets/app.js` → **404**；相对路径 `./assets/app.js` → **200** |

耗时：

| 指标 | 数值 |
|---|---|
| 冷启动（建容器 + 服务就绪） | 1.75s |
| 容器已就绪时首屏 | 65ms |

### 实现要点（直接可复用）

1. **HTTP 代理**：`container.getTcpPort(8080).fetch(newRequest)`，
   把 `pathname` 的前缀去掉再转发；容器内服务只看到 `/`、`/assets/app.js`。
2. **WebSocket 代理**：必须把**原始 `request`** 直接交给
   `getTcpPort().fetch(request)`，**不要重建 Request**——重建会丢掉
   `Upgrade` / `Connection` 这类 hop-by-hop header，握手直接失败。
3. **生成器约束**：生成的应用必须使用相对路径，或在构建配置里设
   `base = "/previews/<name>/"`。Vite 还需要显式配 `server.hmr`
   （`clientPort` / `protocol`），否则 HMR 会连到容器内部地址。
4. **就绪探测**：轮询容器内 `/health`，250ms 间隔、30s 上限，比固定 sleep 稳。
5. **dev server 必须监听 `0.0.0.0`**，否则 `getTcpPort` 连不上。

### 安全注意

代理意味着**生成的应用与主站同源**，它可以带着同源身份访问平台接口。
演示阶段用 `<iframe sandbox>` + CSP 缓解；生产必须给预览独立域名/子域。

### Plan B（未触发，保留）

| 失败点 | 降级 |
|---|---|
| H2 失败 | 去掉 HMR，只代理 HTTP，UI 提供刷新按钮 |
| H1 失败 | 改为静态构建产物预览（`pnpm build` → R2/Assets） |
| H3 失败 | Worker 在返回 HTML 时重写资源路径 |

### 对 POC-03 的输入

- 容器实例会被回收，预览进程也随之消失 → 恢复流程末尾必须**重新拉起 dev server**
- 恢复耗时按「1.75s 冷启动 + 十几秒依赖安装（若需要）」估算

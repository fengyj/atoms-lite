# PoC 总览

状态：**仅文档，未开始实现。**
目的：在写产品代码之前，把所有「可能导致推倒重来」的假设逐个验证掉。

---

## 1. 原则

1. **PoC 的判据是「能推翻一个预设」**，不是「先做哪块功能」。
2. 每个 PoC 必须有一个**客观、可观测**的通过标准（数字、状态、可点击的动作），不能是「感觉可以」。
3. 每个 PoC 必须写 **Plan B**。Plan B 不是失败，是提前决定好的降级路径。
4. PoC 代码与产品代码**物理隔离**（见第 5 节）。
5. 每个 PoC 结束只保留两份东西：**结论**（本文档目录下）和**最小可复用片段**。其余丢弃。

---

## 2. 已确定的决策

| # | 决策 | 来源 |
|---|---|---|
| D1 | Phase 1 不做多角色，单 Agent | 用户 |
| D2 | 版本回滚**只回滚代码**，不回滚数据 | 用户 |
| D3 | 预览降级可接受「无 HMR、手动刷新」 | 用户 |
| D4 | 部署与访问控制后置，不做产品化鉴权 | 用户 |
| D5 | Paid 稍后开通，本地 PoC 先推进 | 用户 |
| D6 | TypeScript 6.0.3（7 太新） | 讨论 |
| D7 | 版本 = git commit；快照 = 恢复单位，两者不混用 | 讨论 |
| D8 | 依赖恢复允许「快照带 node_modules」作为第一阶段方案 | 讨论 |

---

## 3. PoC 清单与依赖

```
闸门 POC-00（30m，必须先做）
   │
   ├── 泳道 A｜UI（产品代码，apps/web）
   │     POC-01 UI 基座 ──→ POC-08 AI↔UI 接线
   │
   ├── 泳道 B｜运行时（spike）
   │     POC-02 预览链路 ──→ POC-03 持久化 ──→ POC-04 版本回滚
   │
   └── 泳道 C｜独立（spike，可随时插入）
         POC-05 模型基线
         POC-06 Agents SDK 能力审计
         POC-07 可观测性
```

| ID | 名称 | 时间盒 | 依赖 | 阻塞谁 | 文档 | 状态 |
|---|---|---|---|---|---|---|
| POC-00 | 本地容器闸门（Podman/Docker） | 30m | — | 02/03/04 | [poc-00](poc-00-container-gate.md) | ✅ |
| POC-01 | UI 基座：token + 版面 + 组件 gallery | 2-3h | — | 08 | [poc-01](poc-01-ui-foundation.md) | 🔶 待视觉确认 |
| POC-02 | 预览链路：HTTP / WS / base 前缀 | 1.5h | 00 | 03/04 | [poc-02](poc-02-preview.md) | ✅ |
| POC-03 | 沙箱持久化与恢复 | 1.5h | 02 | 04 | [poc-03](poc-03-persistence.md) | ✅ |
| POC-04 | 版本与回滚 | 2h | 03 | — | [poc-04](poc-04-versions.md) | ✅ |
| POC-05 | 模型基线 | 1.5h | — | 演示脚本 | [poc-05](poc-05-model.md) | ✅ |
| POC-06 | Agents SDK 能力审计 | 1.5h | — | 08 | [poc-06](poc-06-sdk-audit.md) | ⬜ |
| POC-07 | 可观测性 | 1h | 06 | — | [poc-07](poc-07-observability.md) | ⬜ |
| POC-08 | Agent ↔ UI 接线 | 2h | 01, 06 | — | [poc-08](poc-08-wiring.md) | ⬜ |

并行建议：

- **POC-01 与 POC-02/05/06 完全无依赖**，可同时开。
- POC-01 能并行推进的前提：先冻结 view model（见 `01-ui-foundation.md` 第 3 节），否则接数据时必返工。
- POC-05/06/07 是「读 + 小探针」，不占容器，适合在等构建/等安装时穿插。

---

## 4. 每个 PoC 的文档结构

统一格式，便于横向对比：

```
1. 要验证的假设（可证伪的句子）
2. 不在范围内
3. 步骤
4. 通过标准（客观）
5. Plan B / 降级
6. 产物（保留什么）
7. 风险
```

结论写回各自文档末尾的「结论」小节，一句话 + 是否影响主设计。

---

## 5. 代码隔离规则

```
spikes/
  poc-00-container-gate/
  poc-02-preview/
  poc-03-persistence/
  poc-04-versions/
  poc-05-model/
  poc-06-sdk-audit/
  poc-07-observability/
  poc-08-wiring/
```

规则：

1. **`spikes/` 不属于 pnpm workspace**，每个 spike 自带 `package.json`，独立 `pnpm install`。
2. `apps/*` **禁止** import `spikes/` 下的任何代码；反之也不依赖 `@atoms-lite/contracts`。
3. 每个 spike 目录里有 `README.md`，第一行写明删除方式：`rm -rf spikes/<id>`。
4. 删除 spike 不得导致 `pnpm install`、`pnpm typecheck`、`pnpm build` 失败。
5. **POC-01 是例外**：它是产品 UI，直接写在 `apps/web`，不属于 spike。

---

## 6. 闸门：两个前置条件

| 条件 | 状态 | 说明 |
|---|---|---|
| Docker 兼容引擎 | ✅ 已解决 | Docker 29 + buildx + 镜像站，POC-00 通过 |
| Workers Paid | ⏸ 稍后 | 本地 `wrangler dev` 走 Docker，不需要开通 |

POC-00 已通过：POC-02/03/04 解除阻塞。POC-01/05/06/07 本来就不受影响。

---

## 7. 后置事项（不做 PoC）

- 公网部署、冷启动、访问门禁：最后一天处理，只保留「不可猜链接 + 预算上限」两件止血措施。
- 多角色、PPT 产物、上下文压缩的产品化、外部发布：不进 Phase 1。

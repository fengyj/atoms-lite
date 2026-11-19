# 决策记录（ADR）

这里保存 PoC 阶段讨论后**已经定下来的实现决策**，以及被否掉的方案和理由。

- `docs/atoms-lite-需求与设计.md` 描述的是产品目标与长期设计；
- 本目录描述的是**当前实现要遵守的约束**；
- 两者冲突时，**以本目录为准**，并在实现完成后回写设计文档。

## 架构

- [system-architecture](../architecture/system-architecture.md)：系统架构图、组件图、Agent 架构图
- [data-model](../architecture/data-model.md)：数据分层、表结构、字段说明、保留与 GC

## 索引

| 文档 | 内容 |
|---|---|
| [01-scope-and-architecture](01-scope-and-architecture.md) | 范围、技术栈、项目/会话/沙箱粒度 |
| [02-roles-tasks-locks](02-roles-tasks-locks.md) | 多角色形态、任务模型、写冲突与锁 |
| [03-attachments-artifacts](03-attachments-artifacts.md) | 附件、产物、跨角色引用 |
| [04-sandbox-and-versions](04-sandbox-and-versions.md) | 沙箱生命周期、快照、版本与回滚 |
| [05-generation-model-ux](05-generation-model-ux.md) | 生成策略、模型基线、UI 与可观测性 |
| [06-dev-environment](06-dev-environment.md) | 本地环境、工具链与踩坑记录 |
| [07-instance-auto-upgrade](07-instance-auto-upgrade.md) | 容器实例档位、手动升级现状与自动升级提案 |

## 约定

每条决策写四件事：

1. **决策**：要做什么。
2. **理由**：为什么，最好带数字。
3. **被否方案**：考虑过但放弃的，避免以后重复讨论。
4. **影响/待办**：哪些代码或文档要跟着改。

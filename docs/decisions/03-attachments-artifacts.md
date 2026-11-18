# 03 附件与产物

状态：**已定**（2026-11-18）

## 1. 核心决策

**附件不进消息体，只存引用。**

```
R2:      projects/{pid}/attachments/{artifactId}        二进制只存一份
DB:      artifacts(id, project_id, name, mime, size, sha256, r2_key, created_at)
message: parts: [{ type: "file", artifactId, mediaType, name, size }]
```

base64 内联被否，原因：

| 问题 | 后果 |
|---|---|
| 存储膨胀 | 1MB → 1.33MB 字符串，进 DO SQLite，多轮重复 |
| 每次调用重复传输 | 历史消息带着它，token 与带宽都炸 |
| 无法去重 | 同一文件被 N 个角色引用就是 N 份 |
| 无法鉴权/失效 | 进了历史就撤不回 |
| 跨角色无法引用 | 子代理只拿到一串 base64，没有 id 和元信息 |

## 2. 模型调用时才物化

```
消息里的 file part（只有 artifactId）
  → Agent 调用前：从 R2 取字节
  → 转 data URL 或 provider file id
  → convertToModelMessages()
```

**base64 只存在于这一次模型调用里**，不进入消息历史、不进入数据库。

需要一个 `resolveFileParts(messages)` 适配层，放在 `onChatMessage` 里。

## 3. 跨角色共享

统一用 `ContextRef`：

```ts
type ContextRef =
  | { kind: "artifact"; id: string }
  | { kind: "version"; id: string }
  | { kind: "file"; path: string }
  | { kind: "log"; id: string };
```

角色需要细节时自己 `read_attachment` / 读文件，不靠父级把内容塞进上下文。

## 4. 生成的应用如何使用附件

允许应用读取附件。约定：

```
/workspace/public/uploads/{artifactId}-{safeName}    ← 生成的应用可直接引用
/workspace/public/uploads/manifest.json              ← 名称 / mime / 来源
```

- 文件名清洗（去 `../`、控制字符），MIME 白名单，单文件上限（10MB）。
- `public/uploads/` 进 `.gitignore`，**但进版本快照**（快照是 rootfs）。
- 导出 zip 默认排除，需要时加参数。
- 上传副本**只读**：Agent 不能通过 `write_file` 写这个目录。
- 模型输入从 R2 取，不从工作区读，避免两套真值。

## 5. 安全与成本

- 图片进模型前缩放（长边约 1568px），否则 token 消耗过大。
- 只有需要视觉的角色才传图片（Verifier 只看日志）。
- 浏览器通过 `/api/files/{artifactId}`（带鉴权）或短期签名 URL 访问，不暴露 R2 key。
- 按 `sha256` 去重。

## 6. 先用框架能力，别急着自己造

POC-06 发现框架已建表：

```
cf_agents_session_attachment_meta
cf_agents_session_attachment_chunks
cf_agents_session_attachment_refs
```

说明 Sessions 内建附件存储（分块 + 引用）。实现前先验证：

- [ ] 一份存储、多处引用
- [ ] 分块读，大文件可用
- [ ] 跨会话/跨角色可取
- [ ] 能拿到字节流或 R2 key（用于投放沙箱）
- [ ] 单文件/总量上限
- [ ] 删除与 GC 语义

如果只解决"聊天里显示附件"而拿不到字节流，就只用它做 UI，存储走自研 `artifacts` + R2。

**POC-10 结论**：`agents` 的类型里没有公开的附件读写 API，只有内部表
`cf_agents_session_attachment_*`。因此**存储与读取走自研 `artifacts` + R2**，
框架只负责把消息里的 file part 持久化。

## 7. 待定

- 附件是否允许出现在导出的源码包里（当前：默认排除）。
- 框架附件 API 与自研 R2 的最终取舍。

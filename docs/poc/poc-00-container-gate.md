# POC-00 本地容器闸门

时间盒：**30 分钟**。这是唯一一个「不通过就暂停整条运行时泳道」的 PoC。

## 1. 要验证的假设

1. 本机能用 **Podman**（经 docker socket 兼容层）跑起 `wrangler dev` 的 Containers。
2. 本地启动 Containers **不需要** Workers Paid 订阅。
3. 拉起容器到 `Ready` 的耗时在可接受范围（< 60s）。

## 2. 不在范围内

- 不验证 sandbox 的文件 API、预览、快照。
- 不写任何业务代码。

## 3. 步骤

1. 安装 Docker 兼容引擎（若 Podman 不可用）：Colima 优先。
2. 取 `cloudflare/agents` 仓库里任一 sandbox 示例（或官方最小容器示例），**不修改代码**。
3. `wrangler dev` 启动，观察：
   - 是否要求登录 / 要求开通 Containers
   - 镜像构建或拉取是否成功
   - 容器是否真正启动（`docker ps` 可见）
4. 记录三个数字：首次镜像构建时间、后续启动时间、内存占用。

## 4. 通过标准

- [ ] `wrangler dev` 本地成功启动，容器处于 running
- [ ] 全程**未登录** Cloudflare 账号，或登录了但账号未开通 Containers，依然能起
- [ ] 启动耗时 < 60s（后续启动）
- [ ] Podman 与 Docker 二者中至少一条路径可用，并记录是哪条

## 5. Plan B

| 情况 | 处理 |
|---|---|
| Podman 不行 | 装 Colima，结论记为「Podman 不支持」，不继续折腾 |
| 本地需要 Paid | 立刻开通（$5）；记录为硬前置，排期整体后移 |
| 镜像拉取被墙/超时 | 用本地 Dockerfile 构建，不用 Cloudflare Registry 镜像 |
| 完全起不来 | **运行时泳道暂停**。评估退路：本地 Docker + 自写 adapter（工作量 +4~6h），或放弃沙箱改为「静态产物生成」 |

## 6. 产物

- 一段 10 行的结论：哪个引擎可用、是否需要付费、启动耗时。
- 不保留示例代码（`rm -rf spikes/poc-00-container-gate`）。

## 7. 风险

- 这是唯一可能改变整体技术选型的 PoC。**不要跳过，也不要延长**。
- 若结论是「必须付费」，这不是坏消息，只是排期调整；越早知道越好。

## 结论

（待填写：通过 / 降级 / 不通过）

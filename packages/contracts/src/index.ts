/**
 * atoms-lite 的唯一共享契约层。
 *
 * 规则：
 * 1. 只依赖 zod，不 import AI SDK / Agents SDK / Next。
 * 2. 对话内容使用 AI SDK 的 UIMessage，本包不重复定义。
 * 3. 事件是控制通道的唯一来源；面板状态不从消息文本里猜。
 * 4. 所有时间戳是毫秒整数；所有传输结构 JSON 可序列化。
 */
export * from "./ids";
export * from "./enums";
export * from "./usage";
export * from "./refs";
export * from "./errors";
export * from "./limits";
export * from "./runtime";
export * from "./entities";
export * from "./events";
export * from "./tools";
export * from "./api";

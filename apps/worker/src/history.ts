import type { ModelMessage, UIMessage } from "ai";

const RETRY_RE =
  /^(重试|再试一次|再试|继续|retry|try again|continue)[。.!！?？\s]*$/i;

export const EMPTY_RESPONSE_NUDGE =
  "（系统提示：上一次模型没有返回内容。请直接回应用户更早的请求，给出完整、可见的答案；不要返回空内容。）";

function modelContentText(content: ModelMessage["content"]): string | null {
  if (typeof content === "string") return content;
  const parts: string[] = [];
  for (const part of content) {
    if (part.type === "text") {
      parts.push(part.text);
      continue;
    }
    if (part.type === "reasoning") continue;
    // 图片、文件、工具调用等不参与简单合并。
    return null;
  }
  return parts.join("\n");
}

function modelMessageHasContent(message: ModelMessage): boolean {
  if (message.role !== "assistant") return true;
  if (typeof message.content === "string") {
    return message.content.trim().length > 0;
  }
  return message.content.some((part) => {
    if (part.type === "text") return part.text.trim().length > 0;
    if (part.type === "reasoning") return false;
    return true;
  });
}

/**
 * 模型输入需要保持稳定的 user/assistant 交替。
 * 失败留下的空 assistant 会被 convertToModelMessages 丢掉，导致连续 user；
 * 这里先把空 assistant 去掉，再把相邻 user 合并成一条。
 */
export function normalizeModelMessages(
  messages: ModelMessage[],
): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const message of messages) {
    if (!modelMessageHasContent(message)) continue;
    const prev = out[out.length - 1];
    if (prev?.role === "user" && message.role === "user") {
      const left = modelContentText(prev.content);
      const right = modelContentText(message.content);
      if (left !== null && right !== null) {
        out[out.length - 1] = {
          role: "user",
          content: `${left}\n\n---\n\n${right}`,
        };
        continue;
      }
    }
    out.push(message);
  }
  return out;
}

function uiText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function assistantHasContent(message: UIMessage): boolean {
  return message.parts.some((part) => {
    if (part.type === "text") return part.text.trim().length > 0;
    if (part.type === "step-start" || part.type === "reasoning") return false;
    return true;
  });
}

/**
 * 上一次 assistant 是空回复，或用户只说了“重试/继续”时，
 * 给最后一条 user 加一段明确要求，避免模型再次返回空内容。
 */
export function shouldRetryEmptyTurn(messages: UIMessage[]): boolean {
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex < 0) return false;
  const lastUser = messages[lastUserIndex];
  if (!lastUser) return false;

  for (let i = lastUserIndex - 1; i >= 0; i -= 1) {
    const candidate = messages[i];
    if (candidate?.role !== "assistant") continue;
    if (!assistantHasContent(candidate)) return true;
    break;
  }
  return RETRY_RE.test(uiText(lastUser));
}

export function appendRetryNudge(
  messages: ModelMessage[],
  nudge = EMPTY_RESPONSE_NUDGE,
): ModelMessage[] {
  const next = [...messages];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const message = next[i];
    if (!message || message.role !== "user") continue;
    if (typeof message.content === "string") {
      next[i] = {
        ...message,
        content: `${message.content}\n\n${nudge}`,
      } as ModelMessage;
    } else {
      next[i] = {
        ...message,
        content: [...message.content, { type: "text", text: nudge }],
      } as ModelMessage;
    }
    return next;
  }
  return next;
}

function approxChars(messages: ModelMessage[]): number {
  return JSON.stringify(messages).length;
}

/**
 * 供应商网关对超大请求可能直接返回 upstream_unavailable。
 * 这里按字符数做最后一道预算：保留最近消息，从最近的 user 开始，
 * 并在最前面放一条“较早对话已省略”的提示。
 */
export function trimModelMessages(
  messages: ModelMessage[],
  maxChars: number,
): ModelMessage[] {
  if (approxChars(messages) <= maxChars) return messages;

  const kept: ModelMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    kept.unshift(message);
    if (approxChars(kept) > maxChars) {
      kept.shift();
      break;
    }
  }

  let start = 0;
  while (start < kept.length && kept[start]?.role !== "user") start += 1;
  const trimmed = kept.slice(start);
  if (trimmed.length === 0) return messages.slice(-1);
  return [
    {
      role: "user",
      content: "（较早的对话已省略；请以最近的消息和当前工作区文件为准。）",
    },
    ...trimmed,
  ];
}

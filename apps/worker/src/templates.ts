export type TemplateId = "static" | "react-vite" | "fullstack-hono";
export type RuntimeKind = "container" | "browser";

export const TEMPLATES: readonly TemplateId[] = [
  "static",
  "react-vite",
  "fullstack-hono",
];

export function isTemplate(value: unknown): value is TemplateId {
  return typeof value === "string" && TEMPLATES.includes(value as TemplateId);
}

export function normalizeTemplate(value: unknown): TemplateId {
  return isTemplate(value) ? value : "static";
}

export function normalizeRuntime(value: unknown): RuntimeKind {
  return value === "browser" ? "browser" : "container";
}

/** 静态站点默认走浏览器运行时；React/全栈仍需要容器。 */
export function runtimeForTemplate(template: TemplateId): RuntimeKind {
  return template === "static" ? "browser" : "container";
}

/**
 * 确定性分类：明显信号直接命中，模糊需求留给 planner。
 */
export function deriveTemplate(prompt: string): TemplateId {
  const text = prompt.replace(/\s+/g, " ").trim();

  if (
    /登录|注册|认证|权限|数据库|后端|服务端|接口|\bapi\b|上传|管理后台|持久化|sqlite|postgres|mysql/i.test(
      text,
    )
  ) {
    return "fullstack-hono";
  }

  if (
    /react|vue|svelte|spa|组件|路由|状态管理|前端框架|vite|next\.?js/i.test(
      text,
    )
  ) {
    return "react-vite";
  }

  return "static";
}

const EXPLICIT_SIGNAL =
  /react|vue|svelte|next\.?js|vite|数据库|后端|服务端|\bapi\b|接口|登录|注册|认证|权限|上传|管理后台|持久化|sqlite|postgres|mysql/i;

const CLEARLY_STATIC =
  /五子棋|棋类|个人(网站|主页)|作品集|落地页|宣传页|简历|博客/i;

/**
 * 只在规则拿不准时调用模型。显式技术栈/后端信号、明确的静态页面直接走规则。
 */
export function needsPlanner(prompt: string): boolean {
  const text = prompt.replace(/\s+/g, " ").trim();
  if (text.length < 8) return false;
  if (EXPLICIT_SIGNAL.test(text)) return false;
  if (CLEARLY_STATIC.test(text)) return false;
  return true;
}

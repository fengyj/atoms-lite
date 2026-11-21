import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { planTemplate, type TemplatePlanResult } from "./planner";
import {
  deriveTemplate,
  isTemplate,
  needsPlanner,
  normalizeTemplate,
  runtimeForTemplate,
  type RuntimeKind,
  type TemplateId,
} from "./templates";
import {
  estimateCostUsd,
  normalizeUsage,
  type NormalizedUsage,
} from "./usage";

const DEMO_PROJECT_ID = "demo";
const DEMO_PROJECT_NAME = "五子棋 Demo";

export type TemplateSource = "rule" | "model" | "manual" | "fallback";
export type ProjectNameSource = "derived" | "ai" | "user" | "fallback" | "legacy";

type ProjectRow = {
  id: string;
  name: string;
  prompt: string;
  template: string;
  runtime: string;
  template_source: string;
  name_source: string;
  plan_reason: string;
  configured: number;
  created_at: number;
  updated_at: number;
};

type WorkspaceMeta = {
  versionCount: number;
  currentVersion: {
    id: string;
    gitCommit: string;
    summary: string;
    createdAt: number;
  } | null;
};

export type UsageTotals = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  noCacheTokens: number;
  reasoningTokens: number;
  costUsd: number | null;
};

type UsageTotalsRow = {
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  no_cache_tokens: number;
  reasoning_tokens: number;
  cost_usd: number | null;
};

export type UsageDay = UsageTotals & { day: string };

export type ProjectUsage = {
  project: UsageTotals;
  session: UsageTotals;
  today: UsageTotals;
  daily: UsageDay[];
  systemToday: UsageTotals & { day: string };
  limit: {
    dailyTokens: number;
    usedTokens: number;
    dailyCostUsd: number;
    usedCostUsd: number;
    reserveCostUsd: number;
    remainingCostUsd: number;
    allowed: boolean;
  };
};

type UsageEventBody = {
  projectId?: string;
  sessionId?: string | null;
  requestId?: string | null;
  source?: string;
  model?: string | null;
  stepNumber?: number | null;
  usage?: Partial<NormalizedUsage>;
  costUsd?: number | null;
};

function usageFromBody(raw: Partial<NormalizedUsage> | undefined): NormalizedUsage {
  const n = (value: unknown) =>
    Number.isFinite(Number(value))
      ? Math.max(0, Math.floor(Number(value)))
      : 0;
  const inputTokens = n(raw?.inputTokens);
  const outputTokens = n(raw?.outputTokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: n(raw?.totalTokens) || inputTokens + outputTokens,
    cacheReadTokens: n(raw?.cacheReadTokens),
    cacheWriteTokens: n(raw?.cacheWriteTokens),
    noCacheTokens: n(raw?.noCacheTokens),
    reasoningTokens: n(raw?.reasoningTokens),
  };
}

export type ProjectSummary = {
  id: string;
  name: string;
  prompt: string;
  template: TemplateId;
  runtime: RuntimeKind;
  templateSource: TemplateSource;
  nameSource: ProjectNameSource;
  planReason: string;
  configured: boolean;
  createdAt: number;
  updatedAt: number;
  versionCount: number;
  currentVersion: WorkspaceMeta["currentVersion"];
};

/** 从需求里取一个可读的兜底项目名；首轮对话后会用小模型生成更好的标题。 */
export function deriveProjectName(prompt: string): string {
  const text = prompt.replace(/\s+/g, " ").trim();
  if (/五子棋|黑白棋|棋类/.test(text)) return "五子棋 Demo";
  if (/个人(网站|主页)|作品集|portfolio/i.test(text)) return "个人网站";
  if (/番茄钟|倒计时|计时器/i.test(text)) return "番茄钟";
  if (/待办|todo|任务清单/i.test(text)) return "待办清单";
  if (/留言板|留言墙/i.test(text)) return "留言板";
  if (/博客|blog/i.test(text)) return "博客";
  if (/电商|商城|shop/i.test(text)) return "电商站点";
  if (/ppt|幻灯片|演示文稿/i.test(text)) return "演示文稿";
  if (/官网|落地页|landing/i.test(text)) return "落地页";

  let cleaned = text;
  const prefix =
    /^(请|帮我|我想|想要|需要|做|创建|生成|实现|用|基于|react|vue|svelte|next\.?js|一个|一款|个|的)\s*/i;
  while (prefix.test(cleaned)) cleaned = cleaned.replace(prefix, "");
  return (cleaned.trim() || "未命名应用").slice(0, 16);
}

function normalizeNameSource(value: string | null | undefined): ProjectNameSource {
  if (
    value === "ai" ||
    value === "user" ||
    value === "fallback" ||
    value === "legacy"
  ) {
    return value;
  }
  return "derived";
}

function newProjectId(): string {
  return `prj_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/**
 * 项目索引。每个项目的内容仍然在独立的 WorkspaceDO 里；
 * 这里只保存元数据，并在读取时并发补齐版本信息。
 */
export class Projects extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        template TEXT NOT NULL DEFAULT 'static',
        runtime TEXT NOT NULL DEFAULT 'container',
        template_source TEXT NOT NULL DEFAULT 'rule',
        name_source TEXT NOT NULL DEFAULT 'derived',
        plan_reason TEXT NOT NULL DEFAULT '',
        configured INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    this.ensureUsageSchema();

    // v1 表缺少后续列，逐列补齐
    for (const statement of [
      "ALTER TABLE atoms_projects ADD COLUMN template TEXT NOT NULL DEFAULT 'static'",
      "ALTER TABLE atoms_projects ADD COLUMN runtime TEXT NOT NULL DEFAULT 'container'",
      "ALTER TABLE atoms_projects ADD COLUMN template_source TEXT NOT NULL DEFAULT 'rule'",
      "ALTER TABLE atoms_projects ADD COLUMN name_source TEXT NOT NULL DEFAULT 'legacy'",
      "ALTER TABLE atoms_projects ADD COLUMN plan_reason TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE atoms_projects ADD COLUMN configured INTEGER NOT NULL DEFAULT 1",
    ]) {
      try {
        ctx.storage.sql.exec(statement);
      } catch {
        // 已存在
      }
    }
  }

  private ensureUsageSchema(): void {
    const sql = this.ctx.storage.sql;
    sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_usage_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        session_id TEXT,
        request_id TEXT,
        source TEXT NOT NULL,
        model TEXT,
        step_number INTEGER,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        no_cache_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        created_at INTEGER NOT NULL,
        day TEXT NOT NULL
      )
    `);
    sql.exec(
      "CREATE INDEX IF NOT EXISTS idx_usage_project ON atoms_usage_events (project_id, created_at)",
    );
    sql.exec(
      "CREATE INDEX IF NOT EXISTS idx_usage_session ON atoms_usage_events (session_id, created_at)",
    );
    sql.exec(
      "CREATE INDEX IF NOT EXISTS idx_usage_day ON atoms_usage_events (day)",
    );
    sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_usage_daily (
        day TEXT PRIMARY KEY,
        requests INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        no_cache_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  /** 热部署后旧 DO 实例不会重跑 constructor；fetch 时补齐列。 */
  private ensureSchema(): void {
    const sql = this.ctx.storage.sql;
    this.ensureUsageSchema();
    sql.exec(`CREATE TABLE IF NOT EXISTS atoms_projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, prompt TEXT NOT NULL,
      template TEXT NOT NULL DEFAULT 'static',
      runtime TEXT NOT NULL DEFAULT 'container',
      template_source TEXT NOT NULL DEFAULT 'rule',
      name_source TEXT NOT NULL DEFAULT 'derived',
      plan_reason TEXT NOT NULL DEFAULT '',
      configured INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`);
    for (const statement of [
      "ALTER TABLE atoms_projects ADD COLUMN template TEXT NOT NULL DEFAULT 'static'",
      "ALTER TABLE atoms_projects ADD COLUMN runtime TEXT NOT NULL DEFAULT 'container'",
      "ALTER TABLE atoms_projects ADD COLUMN template_source TEXT NOT NULL DEFAULT 'rule'",
      "ALTER TABLE atoms_projects ADD COLUMN name_source TEXT NOT NULL DEFAULT 'legacy'",
      "ALTER TABLE atoms_projects ADD COLUMN plan_reason TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE atoms_projects ADD COLUMN configured INTEGER NOT NULL DEFAULT 1",
    ]) {
      try {
        sql.exec(statement);
      } catch {
        // 已存在
      }
    }
  }

  private rows(): ProjectRow[] {
    return this.ctx.storage.sql
      .exec<ProjectRow>("SELECT * FROM atoms_projects ORDER BY updated_at DESC")
      .toArray();
  }

  private row(id: string): ProjectRow | null {
    const rows = this.ctx.storage.sql
      .exec<ProjectRow>("SELECT * FROM atoms_projects WHERE id = ?", id)
      .toArray();
    return rows[0] ?? null;
  }

  private usageDay(timestamp = Date.now()): string {
    const timeZone = this.env.USAGE_TIMEZONE || "Asia/Shanghai";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(timestamp));
    } catch {
      return new Date(timestamp).toISOString().slice(0, 10);
    }
  }

  private insertUsage(input: {
    projectId: string;
    sessionId?: string | null;
    requestId?: string | null;
    source: string;
    model?: string | null;
    stepNumber?: number | null;
    usage: NormalizedUsage;
    costUsd?: number | null;
  }): { day: string; totalTokens: number } {
    const projectId = String(input.projectId ?? "").trim().slice(0, 100);
    if (!projectId) throw new Error("projectId is required");
    const u = input.usage;
    const now = Date.now();
    const day = this.usageDay(now);
    const cost =
      typeof input.costUsd === "number" && Number.isFinite(input.costUsd)
        ? input.costUsd
        : null;

    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO atoms_usage_events
           (id, project_id, session_id, request_id, source, model, step_number,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            no_cache_tokens, reasoning_tokens, total_tokens, cost_usd, created_at, day)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `use_${crypto.randomUUID()}`,
        projectId,
        input.sessionId ?? projectId,
        input.requestId ?? null,
        String(input.source ?? "chat").slice(0, 40),
        input.model ?? null,
        input.stepNumber ?? null,
        u.inputTokens,
        u.outputTokens,
        u.cacheReadTokens,
        u.cacheWriteTokens,
        u.noCacheTokens,
        u.reasoningTokens,
        u.totalTokens,
        cost,
        now,
        day,
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO atoms_usage_daily
           (day, requests, input_tokens, output_tokens, cache_read_tokens,
            cache_write_tokens, no_cache_tokens, reasoning_tokens, total_tokens,
            cost_usd, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(day) DO UPDATE SET
           requests = atoms_usage_daily.requests + 1,
           input_tokens = atoms_usage_daily.input_tokens + excluded.input_tokens,
           output_tokens = atoms_usage_daily.output_tokens + excluded.output_tokens,
           cache_read_tokens = atoms_usage_daily.cache_read_tokens + excluded.cache_read_tokens,
           cache_write_tokens = atoms_usage_daily.cache_write_tokens + excluded.cache_write_tokens,
           no_cache_tokens = atoms_usage_daily.no_cache_tokens + excluded.no_cache_tokens,
           reasoning_tokens = atoms_usage_daily.reasoning_tokens + excluded.reasoning_tokens,
           total_tokens = atoms_usage_daily.total_tokens + excluded.total_tokens,
           cost_usd = CASE
             WHEN excluded.cost_usd IS NULL THEN atoms_usage_daily.cost_usd
             ELSE COALESCE(atoms_usage_daily.cost_usd, 0) + excluded.cost_usd
           END,
           updated_at = excluded.updated_at`,
        day,
        u.inputTokens,
        u.outputTokens,
        u.cacheReadTokens,
        u.cacheWriteTokens,
        u.noCacheTokens,
        u.reasoningTokens,
        u.totalTokens,
        cost,
        now,
      );
    });

    return { day, totalTokens: u.totalTokens };
  }

  private totalsRow(row: UsageTotalsRow | undefined): UsageTotals {
    return {
      requests: row?.requests ?? 0,
      inputTokens: row?.input_tokens ?? 0,
      outputTokens: row?.output_tokens ?? 0,
      totalTokens: row?.total_tokens ?? 0,
      cacheReadTokens: row?.cache_read_tokens ?? 0,
      cacheWriteTokens: row?.cache_write_tokens ?? 0,
      noCacheTokens: row?.no_cache_tokens ?? 0,
      reasoningTokens: row?.reasoning_tokens ?? 0,
      costUsd: row?.cost_usd ?? null,
    };
  }

  private usageTotals(where: string, params: (string | number)[]): UsageTotals {
    const row = this.ctx.storage.sql
      .exec<UsageTotalsRow>(
        `SELECT COUNT(*) AS requests,
                COALESCE(SUM(input_tokens), 0) AS input_tokens,
                COALESCE(SUM(output_tokens), 0) AS output_tokens,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
                COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
                COALESCE(SUM(no_cache_tokens), 0) AS no_cache_tokens,
                COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
                SUM(cost_usd) AS cost_usd
         FROM atoms_usage_events ${where}`,
        ...params,
      )
      .one();
    return this.totalsRow(row);
  }

  private dailyRows(where: string, params: (string | number)[]): UsageDay[] {
    return this.ctx.storage.sql
      .exec<UsageTotalsRow & { day: string }>(
        `SELECT day, COUNT(*) AS requests,
                COALESCE(SUM(input_tokens), 0) AS input_tokens,
                COALESCE(SUM(output_tokens), 0) AS output_tokens,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
                COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
                COALESCE(SUM(no_cache_tokens), 0) AS no_cache_tokens,
                COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
                SUM(cost_usd) AS cost_usd
         FROM atoms_usage_events ${where}
         GROUP BY day ORDER BY day DESC LIMIT 31`,
        ...params,
      )
      .toArray()
      .map((row) => ({ day: row.day, ...this.totalsRow(row) }));
  }

  private usageStatus() {
    const day = this.usageDay();
    const row = this.ctx.storage.sql
      .exec<UsageTotalsRow>(
        `SELECT COALESCE(SUM(requests), 0) AS requests,
                COALESCE(SUM(input_tokens), 0) AS input_tokens,
                COALESCE(SUM(output_tokens), 0) AS output_tokens,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
                COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
                COALESCE(SUM(no_cache_tokens), 0) AS no_cache_tokens,
                COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
                SUM(cost_usd) AS cost_usd
         FROM atoms_usage_daily WHERE day = ?`,
        day,
      )
      .toArray()[0];
    const totals = this.totalsRow(row);
    const tokenLimit = Number(this.env.DAILY_TOKEN_LIMIT ?? 0) || 0;
    const costLimitRaw = this.env.DAILY_COST_LIMIT_USD;
    const costLimit =
      Number(costLimitRaw === undefined || costLimitRaw === "" ? 1 : costLimitRaw) ||
      0;
    const reserveRaw = this.env.DAILY_COST_RESERVE_USD;
    const reserve =
      Number(reserveRaw === undefined || reserveRaw === "" ? 0.05 : reserveRaw) ||
      0;
    const usedCost = totals.costUsd ?? 0;
    const allowedToken = tokenLimit <= 0 || totals.totalTokens < tokenLimit;
    const allowedCost =
      costLimit <= 0 || usedCost < Math.max(0, costLimit - reserve);
    return {
      day,
      usedTokens: totals.totalTokens,
      limit: tokenLimit,
      tokenLimit,
      allowed: allowedToken && allowedCost,
      requests: totals.requests,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cacheReadTokens: totals.cacheReadTokens,
      cacheWriteTokens: totals.cacheWriteTokens,
      noCacheTokens: totals.noCacheTokens,
      reasoningTokens: totals.reasoningTokens,
      costUsd: totals.costUsd,
      costLimitUsd: costLimit,
      costReserveUsd: reserve,
      remainingCostUsd: Math.max(0, costLimit - usedCost),
    };
  }

  private projectUsage(projectId: string): ProjectUsage {
    const day = this.usageDay();
    const project = this.usageTotals("WHERE project_id = ?", [projectId]);
    const session = this.usageTotals("WHERE session_id = ?", [projectId]);
    const today = this.usageTotals("WHERE project_id = ? AND day = ?", [
      projectId,
      day,
    ]);
    const system = this.usageStatus();
    return {
      project,
      session,
      today,
      daily: this.dailyRows("WHERE project_id = ?", [projectId]),
      systemToday: {
        day,
        requests: system.requests,
        inputTokens: system.inputTokens,
        outputTokens: system.outputTokens,
        totalTokens: system.usedTokens,
        cacheReadTokens: system.cacheReadTokens,
        cacheWriteTokens: system.cacheWriteTokens,
        noCacheTokens: system.noCacheTokens,
        reasoningTokens: system.reasoningTokens,
        costUsd: system.costUsd,
      },
      limit: {
        dailyTokens: system.tokenLimit,
        usedTokens: system.usedTokens,
        dailyCostUsd: system.costLimitUsd,
        usedCostUsd: system.costUsd ?? 0,
        reserveCostUsd: system.costReserveUsd,
        remainingCostUsd: system.remainingCostUsd,
        allowed: system.allowed,
      },
    };
  }

  private async workspaceMeta(id: string): Promise<WorkspaceMeta | null> {
    try {
      const stub = this.env.WORKSPACE.get(this.env.WORKSPACE.idFromName(id));
      const res = await stub.fetch("https://workspace/meta");
      if (!res.ok) return null;
      return (await res.json()) as WorkspaceMeta;
    } catch (error) {
      console.error("[projects] meta failed", id, error);
      return null;
    }
  }

  /** 兼容 v1：demo 工作区已有版本但索引里没有时，自动补一条记录。 */
  private async ensureDemo(): Promise<void> {
    if (this.row(DEMO_PROJECT_ID)) return;

    const demoMeta = await this.workspaceMeta(DEMO_PROJECT_ID);
    if (!demoMeta || demoMeta.versionCount === 0) return;

    const now = demoMeta.currentVersion?.createdAt ?? Date.now();
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO atoms_projects
         (id, name, prompt, template, runtime, template_source, plan_reason, configured, created_at, updated_at)
       VALUES (?, ?, ?, 'static', 'container', 'rule', 'v1 遗留静态项目', 1, ?, ?)`,
      DEMO_PROJECT_ID,
      DEMO_PROJECT_NAME,
      "做一个五子棋游戏网站，支持双人对战、胜负判定和重新开始。",
      now,
      now,
    );
  }

  private async enrich(row: ProjectRow): Promise<ProjectSummary> {
    const meta = await this.workspaceMeta(row.id);
    return {
      id: row.id,
      name: row.name,
      prompt: row.prompt,
      template: normalizeTemplate(row.template),
      runtime: row.runtime === "browser" ? "browser" : "container",
      templateSource: (row.template_source as TemplateSource) || "rule",
      nameSource: normalizeNameSource(row.name_source),
      planReason: row.plan_reason || "",
      configured: row.configured !== 0,
      createdAt: row.created_at,
      updatedAt: Math.max(row.updated_at, meta?.currentVersion?.createdAt ?? 0),
      versionCount: meta?.versionCount ?? 0,
      currentVersion: meta?.currentVersion ?? null,
    };
  }

  private async list(): Promise<ProjectSummary[]> {
    await this.ensureDemo();
    const projects = await Promise.all(this.rows().map((row) => this.enrich(row)));
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private async create(
    prompt: string,
    preferredTemplate?: string,
  ): Promise<ProjectSummary> {
    const text = prompt.trim().slice(0, 500);
    if (!text) throw new Error("prompt is required");

    let template: TemplateId;
    let source: TemplateSource;
    let reason: string;
    let plannedUsage: TemplatePlanResult | null = null;
    // 先生成 ID，保证模型选型产生的 usage 也能归到这个项目。
    const id = newProjectId();

    const manual =
      preferredTemplate && preferredTemplate !== "auto"
        ? isTemplate(preferredTemplate)
          ? preferredTemplate
          : null
        : null;

    if (preferredTemplate && preferredTemplate !== "auto" && !manual) {
      throw new Error("invalid template");
    }

    if (manual) {
      template = manual;
      source = "manual";
      reason = "用户手动指定技术栈";
    } else if (!needsPlanner(text)) {
      template = deriveTemplate(text);
      source = "rule";
      reason = "根据需求关键词选择";
    } else {
      const planned = await planTemplate(
        this.env,
        text,
        async () => this.usageStatus().allowed,
      );
      if (planned) {
        template = planned.plan.template;
        source = "model";
        reason = planned.plan.reason;
        plannedUsage = planned;
      } else {
        template = deriveTemplate(text);
        source = "fallback";
        reason = "模型选型失败，回退到规则";
      }
    }

    const runtime = runtimeForTemplate(template);
    const configured = manual ? 1 : 0;
    const name = deriveProjectName(text);
    const now = Date.now();

    this.ctx.storage.sql.exec(
      `INSERT INTO atoms_projects
         (id, name, prompt, template, runtime, template_source, name_source, plan_reason, configured, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'derived', ?, ?, ?, ?)`,
      id,
      name,
      text,
      template,
      runtime,
      source,
      reason,
      configured,
      now,
      now,
    );

    // 只写模板配置，不启动容器；首次 ensure 时按模板播种。
    // 配置失败必须回滚索引，否则 UI 徽标与真实工作区模板会静默错位。
    try {
      const stub = this.env.WORKSPACE.get(this.env.WORKSPACE.idFromName(id));
      const res = await stub.fetch("https://workspace/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ template, runtime, configured }),
      });
      if (!res.ok) throw new Error(`config HTTP ${res.status}`);
    } catch (error) {
      console.error("[projects] set template failed", id, template, error);
      this.ctx.storage.sql.exec("DELETE FROM atoms_projects WHERE id = ?", id);
      throw new Error("failed to initialize project template");
    }

    if (plannedUsage) {
      const usage = normalizeUsage(plannedUsage.usage);
      this.insertUsage({
        projectId: id,
        sessionId: id,
        source: "planner",
        model: plannedUsage.model,
        usage,
        costUsd: estimateCostUsd(this.env, plannedUsage.model, usage),
      });
    }

    await this.ensureDemo();
    return {
      id,
      name,
      prompt: text,
      template,
      runtime,
      templateSource: source,
      nameSource: "derived",
      planReason: reason,
      configured: configured === 1,
      createdAt: now,
      updatedAt: now,
      versionCount: 0,
      currentVersion: null,
    };
  }

  private async configure(
    id: string,
    templateInput: string,
  ): Promise<ProjectSummary> {
    const row = this.row(id);
    if (!row) throw new Error("project not found");
    if (!isTemplate(templateInput)) throw new Error("invalid template");
    const template = templateInput;
    const runtime = runtimeForTemplate(template);
    if (row.configured !== 0) {
      if (row.template === template && row.runtime === runtime) {
        return this.enrich(row);
      }
      throw new Error("project is already configured");
    }
    const now = Date.now();

    const stub = this.env.WORKSPACE.get(this.env.WORKSPACE.idFromName(id));
    const res = await stub.fetch("https://workspace/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ template, runtime, configured: 1 }),
    });
    if (!res.ok) throw new Error(`config HTTP ${res.status}`);

    this.ctx.storage.sql.exec(
      `UPDATE atoms_projects
       SET template = ?, runtime = ?, configured = 1, updated_at = ?
       WHERE id = ?`,
      template,
      runtime,
      now,
      id,
    );

    return this.enrich({ ...row, template, runtime, configured: 1, updated_at: now });
  }

  private async switchRuntime(
    id: string,
    templateInput: string,
  ): Promise<ProjectSummary> {
    const row = this.row(id);
    if (!row) throw new Error("project not found");
    if (!isTemplate(templateInput)) throw new Error("invalid template");
    const template = templateInput;
    const runtime = runtimeForTemplate(template);

    const stub = this.env.WORKSPACE.get(this.env.WORKSPACE.idFromName(id));
    const res = await stub.fetch("https://workspace/runtime/switch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ template }),
    });
    if (!res.ok) {
      const text = await res.text();
      let message = text;
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        // 保留原始文本
      }
      throw new Error(message || `switch HTTP ${res.status}`);
    }

    const now = Date.now();
    this.ctx.storage.sql.exec(
      `UPDATE atoms_projects
       SET template = ?, runtime = ?, configured = 1, updated_at = ?
       WHERE id = ?`,
      template,
      runtime,
      now,
      id,
    );
    return this.enrich({
      ...row,
      template,
      runtime,
      configured: 1,
      updated_at: now,
    });
  }

  private async rename(id: string, name: string): Promise<ProjectSummary> {
    const text = name.trim().slice(0, 80);
    if (!text) throw new Error("name is required");

    const row = this.row(id);
    if (!row) throw new Error("project not found");

    const now = Date.now();
    this.ctx.storage.sql.exec(
      "UPDATE atoms_projects SET name = ?, name_source = 'user', updated_at = ? WHERE id = ?",
      text,
      now,
      id,
    );
    return this.enrich({
      ...row,
      name: text,
      name_source: "user",
      updated_at: now,
    });
  }

  private async autoName(
    id: string,
    name: string | undefined,
    source: "ai" | "fallback",
  ): Promise<ProjectSummary> {
    const row = this.row(id);
    if (!row) throw new Error("project not found");
    const current = normalizeNameSource(row.name_source);
    if (current !== "derived") return this.enrich(row);

    const now = Date.now();
    if (source === "fallback") {
      this.ctx.storage.sql.exec(
        "UPDATE atoms_projects SET name_source = 'fallback', updated_at = ? WHERE id = ?",
        now,
        id,
      );
      return this.enrich({
        ...row,
        name_source: "fallback",
        updated_at: now,
      });
    }

    const text = (name ?? "").trim().slice(0, 80);
    if (!text) throw new Error("name is required");
    this.ctx.storage.sql.exec(
      "UPDATE atoms_projects SET name = ?, name_source = 'ai', updated_at = ? WHERE id = ?",
      text,
      now,
      id,
    );
    return this.enrich({
      ...row,
      name: text,
      name_source: "ai",
      updated_at: now,
    });
  }

  private async remove(id: string): Promise<{ ok: true; id: string }> {
    const row = this.row(id);
    if (!row) throw new Error("project not found");

    this.ctx.storage.sql.exec("DELETE FROM atoms_projects WHERE id = ?", id);
    // 删除项目明细；每日全站汇总保留，避免系统日限额因为删项目而回退。
    this.ctx.storage.sql.exec(
      "DELETE FROM atoms_usage_events WHERE project_id = ?",
      id,
    );

    // 尽力销毁对应工作区与会话（容器 + DO 存储）；失败只记日志，不阻塞删除
    try {
      const stub = this.env.WORKSPACE.get(this.env.WORKSPACE.idFromName(id));
      await stub.fetch("https://workspace/destroy", { method: "POST" });
    } catch (error) {
      console.error("[projects] workspace destroy failed", id, error);
    }

    try {
      const agent = this.env.ChatAgent.get(this.env.ChatAgent.idFromName(id));
      await agent.fetch("https://agent/destroy", { method: "POST" });
    } catch (error) {
      console.error("[projects] chat destroy failed", id, error);
    }

    return { ok: true, id };
  }

  override async fetch(request: Request): Promise<Response> {
    this.ensureSchema();
    const url = new URL(request.url);

    try {
      if (url.pathname === "/projects" && request.method === "GET") {
        return Response.json({ projects: await this.list() });
      }

      if (url.pathname === "/projects" && request.method === "POST") {
        const body = (await request.json()) as {
          prompt?: string;
          template?: string;
        };
        return Response.json({
          project: await this.create(body.prompt ?? "", body.template),
        });
      }

      if (url.pathname === "/usage/events" && request.method === "POST") {
        const body = (await request.json()) as UsageEventBody;
        const result = this.insertUsage({
          projectId: body.projectId ?? "",
          sessionId: body.sessionId ?? null,
          requestId: body.requestId ?? null,
          source: body.source ?? "chat",
          model: body.model ?? null,
          stepNumber: body.stepNumber ?? null,
          usage: usageFromBody(body.usage),
          costUsd: body.costUsd ?? null,
        });
        return Response.json({ ok: true, ...result });
      }

      if (url.pathname === "/usage/status" && request.method === "GET") {
        return Response.json(this.usageStatus());
      }

      if (url.pathname === "/usage/daily" && request.method === "GET") {
        return Response.json({ days: this.dailyRows("", []) });
      }

      const usageMatch = url.pathname.match(/^\/projects\/([^/]+)\/usage$/);
      if (usageMatch?.[1] && request.method === "GET") {
        return Response.json(this.projectUsage(usageMatch[1]));
      }

      const switchMatch = url.pathname.match(
        /^\/projects\/([^/]+)\/runtime\/switch$/,
      );
      if (switchMatch?.[1] && request.method === "POST") {
        const body = (await request.json()) as { template?: string };
        return Response.json({
          project: await this.switchRuntime(
            switchMatch[1],
            body.template ?? "",
          ),
        });
      }

      const configureMatch = url.pathname.match(
        /^\/projects\/([^/]+)\/configure$/,
      );
      if (configureMatch?.[1] && request.method === "POST") {
        const body = (await request.json()) as { template?: string };
        return Response.json({
          project: await this.configure(configureMatch[1], body.template ?? ""),
        });
      }

      const autoNameMatch = url.pathname.match(
        /^\/projects\/([^/]+)\/auto-name$/,
      );
      if (autoNameMatch?.[1] && request.method === "POST") {
        const body = (await request.json()) as {
          name?: string;
          source?: string;
        };
        const source = body.source === "fallback" ? "fallback" : "ai";
        return Response.json({
          project: await this.autoName(autoNameMatch[1], body.name, source),
        });
      }

      const match = url.pathname.match(/^\/projects\/([^/]+)$/);
      if (match?.[1] && request.method === "GET") {
        const row = this.row(match[1]);
        if (!row) {
          return Response.json({ error: "project not found" }, { status: 404 });
        }
        return Response.json({ project: await this.enrich(row) });
      }

      if (match?.[1] && request.method === "PATCH") {
        const body = (await request.json()) as { name?: string };
        return Response.json({
          project: await this.rename(match[1], body.name ?? ""),
        });
      }

      if (match?.[1] && request.method === "DELETE") {
        return Response.json(await this.remove(match[1]));
      }

      return Response.json({ error: "not found" }, { status: 404 });
    } catch (error) {
      console.error("[projects] request failed", url.pathname, error);
      return Response.json(
        { error: String(error).slice(0, 300) },
        { status: 400 },
      );
    }
  }
}

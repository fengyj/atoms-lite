import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

const DEMO_PROJECT_ID = "demo";
const DEMO_PROJECT_NAME = "五子棋 Demo";

type ProjectRow = {
  id: string;
  name: string;
  prompt: string;
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

export type ProjectSummary = {
  id: string;
  name: string;
  prompt: string;
  createdAt: number;
  updatedAt: number;
  versionCount: number;
  currentVersion: WorkspaceMeta["currentVersion"];
};

/** 从需求里取一个可读的项目名；真正的结构化命名留给后续模型生成。 */
export function deriveProjectName(prompt: string): string {
  const text = prompt.replace(/\s+/g, " ").trim();
  if (/五子棋|黑白棋|棋类/.test(text)) return "五子棋 Demo";
  if (/个人(网站|主页)|作品集|portfolio/i.test(text)) return "个人网站";
  if (/待办|todo|任务清单/i.test(text)) return "待办清单";
  if (/博客|blog/i.test(text)) return "博客";
  if (/电商|商城|shop/i.test(text)) return "电商站点";
  if (/ppt|幻灯片|演示文稿/i.test(text)) return "演示文稿";
  if (/官网|落地页|landing/i.test(text)) return "落地页";

  const cleaned = text
    .replace(/^(请|帮我|我想|想要|需要|做|创建|生成|实现|一个|一款|个|的)+/g, "")
    .trim();
  return (cleaned || "未命名应用").slice(0, 16);
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
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
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
      `INSERT OR IGNORE INTO atoms_projects (id, name, prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
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

  private async create(prompt: string): Promise<ProjectSummary> {
    const text = prompt.trim().slice(0, 500);
    if (!text) throw new Error("prompt is required");

    const id = newProjectId();
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO atoms_projects (id, name, prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      deriveProjectName(text),
      text,
      now,
      now,
    );

    await this.ensureDemo();
    return {
      id,
      name: deriveProjectName(text),
      prompt: text,
      createdAt: now,
      updatedAt: now,
      versionCount: 0,
      currentVersion: null,
    };
  }

  private async rename(id: string, name: string): Promise<ProjectSummary> {
    const text = name.trim().slice(0, 80);
    if (!text) throw new Error("name is required");

    const row = this.row(id);
    if (!row) throw new Error("project not found");

    const now = Date.now();
    this.ctx.storage.sql.exec(
      "UPDATE atoms_projects SET name = ?, updated_at = ? WHERE id = ?",
      text,
      now,
      id,
    );
    return this.enrich({ ...row, name: text, updated_at: now });
  }

  private async remove(id: string): Promise<{ ok: true; id: string }> {
    const row = this.row(id);
    if (!row) throw new Error("project not found");

    this.ctx.storage.sql.exec("DELETE FROM atoms_projects WHERE id = ?", id);

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
    const url = new URL(request.url);

    try {
      if (url.pathname === "/projects" && request.method === "GET") {
        return Response.json({ projects: await this.list() });
      }

      if (url.pathname === "/projects" && request.method === "POST") {
        const body = (await request.json()) as { prompt?: string };
        return Response.json({ project: await this.create(body.prompt ?? "") });
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

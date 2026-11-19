"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock3, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TemplateId } from "@/lib/agent";

export const ASK_USER_TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_MS = 2 * 60 * 1000;

type Question = {
  id: string;
  label: string;
  type: "single" | "multi" | "text";
  options?: { value: string; label: string; description?: string }[];
  required?: boolean;
};

export type AskUserInput = {
  title?: string;
  questions: Question[];
  recommendedTemplate?: TemplateId;
  templateReason?: string;
};

export type AskUserPayload = {
  answers: Record<string, string | string[]>;
  template: TemplateId;
  skipped: boolean;
};

const TEMPLATE_OPTIONS: { value: TemplateId; label: string }[] = [
  { value: "static", label: "Static" },
  { value: "react-vite", label: "React" },
  { value: "fullstack-hono", label: "全栈" },
];

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function initialAnswers(input: AskUserInput): Record<string, string | string[]> {
  const value: Record<string, string | string[]> = {};
  for (const question of input.questions) {
    if (question.type === "multi") value[question.id] = [];
    else value[question.id] = "";
  }
  return value;
}

export function AskUserCard({
  toolCallId,
  input,
  fallbackTemplate,
  allowTemplateChange = true,
  onSubmit,
}: {
  toolCallId: string;
  input: AskUserInput;
  fallbackTemplate?: TemplateId;
  allowTemplateChange?: boolean;
  onSubmit: (payload: AskUserPayload) => Promise<void>;
}) {
  const storageKey = `atoms:ask:${toolCallId}`;
  const [expiresAt] = useState(() => {
    if (typeof window === "undefined") return Date.now() + ASK_USER_TIMEOUT_MS;
    const stored = Number(window.localStorage.getItem(storageKey));
    if (Number.isFinite(stored) && stored > Date.now()) return stored;
    const next = Date.now() + ASK_USER_TIMEOUT_MS;
    window.localStorage.setItem(storageKey, String(next));
    return next;
  });
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, expiresAt - Date.now()),
  );
  const [answers, setAnswers] = useState(() => initialAnswers(input));
  const recommendedTemplate = input.recommendedTemplate ?? fallbackTemplate;
  const [template, setTemplate] = useState<TemplateId>(
    recommendedTemplate ?? "static",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  const submit = async (skipped: boolean) => {
    if (submittedRef.current) return;
    if (!skipped) {
      const missing = input.questions.filter((question) => {
        if (!question.required) return false;
        const value = answers[question.id];
        return Array.isArray(value) ? value.length === 0 : !String(value ?? "").trim();
      });
      if (missing.length > 0) {
        setError(`请先回答：${missing.map((item) => item.label).join("、")}`);
        return;
      }
    }
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ answers, template, skipped });
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(storageKey);
      }
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, expiresAt - Date.now());
      setRemaining(left);
      if (left === 0) void submit(true);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
    // submit is stable enough for this card's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const progress = useMemo(
    () => Math.round((remaining / ASK_USER_TIMEOUT_MS) * 100),
    [remaining],
  );
  const warning = remaining > 0 && remaining <= WARNING_MS;

  return (
    <div className="rounded-xl border border-border bg-card/80 p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">
            {input.title ?? "补充几个问题，帮我做得更准"}
          </p>
          <p className="mt-0.5 text-2xs leading-4 text-muted-foreground">
            最多 3 个问题，也可以直接用推荐项开始。
          </p>
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 font-mono text-2xs",
            warning ? "text-warning" : "text-muted-foreground",
          )}
        >
          <Clock3 className="size-3" />
          {formatRemaining(remaining)}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {input.questions.map((question) => {
          const value = answers[question.id];
          return (
            <div key={question.id}>
              <p className="text-2xs font-medium text-foreground/90">
                {question.label}
                {question.required ? (
                  <span className="ml-1 text-destructive">*</span>
                ) : null}
              </p>

              {question.type === "text" ? (
                <textarea
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [question.id]: event.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="可选，补充你的想法…"
                  className="mt-1.5 w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
                />
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(question.options ?? []).map((option) => {
                    const selected =
                      question.type === "multi"
                        ? Array.isArray(value) && value.includes(option.value)
                        : value === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        title={option.description}
                        onClick={() =>
                          setAnswers((prev) => {
                            if (question.type === "multi") {
                              const current = Array.isArray(prev[question.id])
                                ? (prev[question.id] as string[])
                                : [];
                              return {
                                ...prev,
                                [question.id]: selected
                                  ? current.filter((item) => item !== option.value)
                                  : [...current, option.value],
                              };
                            }
                            return { ...prev, [question.id]: option.value };
                          })
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-2xs transition-colors",
                          selected
                            ? "border-primary/50 bg-primary/15 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {selected ? <Check className="mr-1 inline size-3" /> : null}
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allowTemplateChange && recommendedTemplate ? (
        <div className="mt-3 rounded-lg border border-border bg-background/60 px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xs text-muted-foreground">推荐技术栈</span>
            <Badge variant="secondary" className="text-3xs">
              {TEMPLATE_OPTIONS.find((item) => item.value === template)?.label}
            </Badge>
            {input.templateReason ? (
              <span className="min-w-0 flex-1 truncate text-3xs text-muted-foreground">
                {input.templateReason}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {TEMPLATE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTemplate(option.value)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-3xs transition-colors",
                  template === option.value
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={submitting}
          onClick={() => void submit(false)}
        >
          {submitting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          用这些答案开始
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={submitting}
          onClick={() => void submit(true)}
        >
          直接开始
        </Button>
      </div>

      {error ? (
        <p className="mt-2 text-2xs text-destructive">{error}</p>
      ) : null}

      <progress
        className={cn(
          "atom-ask-progress mt-3 h-1 w-full",
          warning && "atom-ask-progress-warning",
        )}
        aria-label="剩余回答时间"
        value={progress}
        max={100}
      />
    </div>
  );
}

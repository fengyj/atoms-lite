"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  cancelled?: boolean;
};

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function emptyAnswers(questions: Question[]): Record<string, string | string[]> {
  const value: Record<string, string | string[]> = {};
  for (const question of questions) {
    value[question.id] = question.type === "multi" ? [] : "";
  }
  return value;
}

function displayAnswer(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.length ? value.join("、") : "未回答";
  return value?.toString().trim() || "未回答";
}

export function AskUserCard({
  toolCallId,
  input,
  fallbackTemplate,
  onSubmit,
}: {
  toolCallId: string;
  input: AskUserInput;
  fallbackTemplate?: TemplateId;
  onSubmit: (payload: AskUserPayload) => Promise<void>;
}) {
  const storageKey = `atoms:ask:${toolCallId}`;
  const questions = input.questions;
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
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);
  const template = input.recommendedTemplate ?? fallbackTemplate ?? "static";

  const answers = useMemo(() => {
    const result = emptyAnswers(questions);
    for (const question of questions) {
      const typed = (custom[question.id] ?? "").trim();
      if (question.type === "text") {
        result[question.id] = typed;
      } else if (question.type === "single") {
        result[question.id] = typed || selected[question.id]?.[0] || "";
      } else {
        const values = selected[question.id] ?? [];
        result[question.id] = typed ? [...values, typed] : values;
      }
    }
    return result;
  }, [questions, selected, custom]);

  const submit = async (
    skipped: boolean,
    cancelled = false,
  ) => {
    if (submittedRef.current) return;
    if (!skipped && !cancelled) {
      const missing = questions.filter((question) => {
        if (!question.required) return false;
        const value = answers[question.id];
        return Array.isArray(value)
          ? value.length === 0
          : !String(value ?? "").trim();
      });
      if (missing.length > 0) {
        setError(`请先回答：${missing.map((item) => item.label).join("、")}`);
        setStep(Math.max(0, questions.indexOf(missing[0]!)));
        return;
      }
    }
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ answers, template, skipped, cancelled });
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
    // submit closes over current answers; timeout is best-effort defaults
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const progress = useMemo(
    () => Math.round((remaining / ASK_USER_TIMEOUT_MS) * 100),
    [remaining],
  );
  const warning = remaining > 0 && remaining <= WARNING_MS;
  const summary = step >= questions.length;
  const question = summary ? null : questions[step];

  const next = () => {
    if (!question) return;
    if (question.required) {
      const value = answers[question.id];
      const empty = Array.isArray(value) ? value.length === 0 : !String(value ?? "").trim();
      if (empty) {
        setError("这个问题需要回答，或者选择“其他”自行填写。");
        return;
      }
    }
    setError(null);
    setStep((value) => Math.min(value + 1, questions.length));
  };

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
            {summary
              ? "确认一下答案，然后开始。"
              : `一次一个问题，可以前后切换；第 ${step + 1} / ${questions.length} 个。`}
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

      {summary ? (
        <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-background/60 p-2.5">
          {questions.map((item) => (
            <div key={item.id} className="flex gap-2 text-2xs">
              <span className="w-24 shrink-0 text-muted-foreground">
                {item.label}
              </span>
              <span className="min-w-0 flex-1 text-foreground/90">
                {displayAnswer(answers[item.id])}
              </span>
            </div>
          ))}
          <p className="pt-1 text-3xs text-muted-foreground">
            技术方案会根据这些回答自动选择，不需要你理解底层运行环境。
          </p>
        </div>
      ) : question ? (
        <div className="mt-3">
          <p className="text-2xs font-medium text-foreground/90">
            {question.label}
            {question.required ? (
              <span className="ml-1 text-destructive">*</span>
            ) : null}
          </p>

          {question.type === "text" ? (
            <textarea
              value={custom[question.id] ?? ""}
              onChange={(event) =>
                setCustom((prev) => ({
                  ...prev,
                  [question.id]: event.target.value,
                }))
              }
              rows={3}
              placeholder="输入你的答案…"
              className="mt-1.5 w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          ) : (
            <>
              <div className="mt-1.5 space-y-1">
                {(question.options ?? []).map((option) => {
                  const values = selected[question.id] ?? [];
                  const checked =
                    question.type === "single"
                      ? values[0] === option.value && !custom[question.id]?.trim()
                      : values.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      title={option.description}
                      onClick={() => {
                        setSelected((prev) => {
                          const current = prev[question.id] ?? [];
                          if (question.type === "single") {
                            return { ...prev, [question.id]: [option.value] };
                          }
                          return {
                            ...prev,
                            [question.id]: checked
                              ? current.filter((item) => item !== option.value)
                              : [...current, option.value],
                          };
                        });
                        if (question.type === "single") {
                          setCustom((prev) => ({ ...prev, [question.id]: "" }));
                        }
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-2xs transition-colors",
                        checked
                          ? "border-primary/50 bg-primary/15 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-3.5 shrink-0 place-items-center border",
                          question.type === "single" ? "rounded-full" : "rounded-sm",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {checked ? <Check className="size-2.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">{option.label}</span>
                    </button>
                  );
                })}
              </div>
              <input
                value={custom[question.id] ?? ""}
                onChange={(event) =>
                  setCustom((prev) => ({
                    ...prev,
                    [question.id]: event.target.value,
                  }))
                }
                placeholder="其他：也可以自己输入…"
                className="mt-1.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </>
          )}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-2xs text-destructive">{error}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {step > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={submitting}
            onClick={() => {
              setError(null);
              setStep((value) => Math.max(0, value - 1));
            }}
          >
            <ArrowLeft className="size-3.5" />
            上一步
          </Button>
        ) : null}
        {summary ? (
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
            提交并开始
          </Button>
        ) : (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={submitting}
            onClick={next}
          >
            下一步
            <ArrowRight className="size-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={submitting}
          onClick={() => void submit(true, true)}
        >
          <X className="size-3.5" />
          取消
        </Button>
      </div>

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

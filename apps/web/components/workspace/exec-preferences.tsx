"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clearExecPreferences,
  fetchExecPreferences,
  removeExecPreference,
  type ExecPreference,
} from "@/lib/agent";

export function ExecPreferencesDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [preferences, setPreferences] = useState<ExecPreference[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPreferences(await fetchExecPreferences(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const remove = async (preference: ExecPreference) => {
    if (busy) return;
    setBusy(preference.key);
    setError(null);
    try {
      await removeExecPreference(projectId, preference.key);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const clearAll = async () => {
    if (busy) return;
    setBusy("all");
    setError(null);
    try {
      await clearExecPreferences(projectId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            执行偏好
          </DialogTitle>
          <DialogDescription>
            这里保存「始终允许 / 始终拒绝」的命令。移除后会恢复为每次询问。
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div className="max-h-80 space-y-2 overflow-auto pr-1">
          {loading && preferences === null ? (
            <p className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              加载中…
            </p>
          ) : preferences && preferences.length > 0 ? (
            preferences.map((preference) => (
              <div
                key={preference.key}
                className="border border-border bg-card px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      preference.decision === "allow"
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-destructive/40 bg-destructive/10 text-destructive"
                    }
                  >
                    {preference.decision === "allow" ? "始终允许" : "始终拒绝"}
                  </Badge>
                  <span className="text-3xs text-muted-foreground">
                    {new Date(preference.updatedAt).toLocaleString()}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 rounded-full px-2 text-2xs"
                    disabled={busy !== null}
                    onClick={() => void remove(preference)}
                  >
                    {busy === preference.key ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                    移除
                  </Button>
                </div>
                <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-2xs leading-5 text-muted-foreground">
                  {preference.command}
                </pre>
              </div>
            ))
          ) : (
            <p className="border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              还没有保存任何执行偏好。
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="mr-auto"
            disabled={busy !== null || !preferences?.length}
            onClick={() => void clearAll()}
          >
            {busy === "all" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            全部清除
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

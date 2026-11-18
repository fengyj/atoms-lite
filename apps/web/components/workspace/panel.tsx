import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        className
      )}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        {icon ? (
          <span className="text-muted-foreground [&_svg]:size-3.5">{icon}</span>
        ) : null}
        <h2 className="text-2xs font-medium tracking-wider text-muted-foreground uppercase">
          {title}
        </h2>
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto scrollbar-thin", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm text-foreground">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-muted-foreground">{hint}</p> : null}
      {action}
    </div>
  );
}

import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:backdrop-blur-md ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3 dark:border-zinc-800/80">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">{title}</h3>
        {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 p-4 ${className}`}>{children}</div>;
}

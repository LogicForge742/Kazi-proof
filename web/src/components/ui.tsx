import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "paypal";
}) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    ghost: "bg-white text-ink border border-line hover:bg-surface",
    danger: "bg-red-600 text-white hover:bg-red-700",
    paypal: "bg-[#0070ba] text-white hover:bg-[#005ea6]",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-line bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

const STATUS: Record<string, { pill: string; dot: string }> = {
  DRAFT: { pill: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  PLANNED: { pill: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  AWAITING_FUNDING: { pill: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  FUNDED: { pill: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  IN_PROGRESS: { pill: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
  SUBMITTED: { pill: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  UNDER_REVIEW: { pill: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  APPROVED: { pill: "bg-teal-100 text-teal-700", dot: "bg-teal-500" },
  RELEASED: { pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  COMPLETED: { pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  DISPUTED: { pill: "bg-red-100 text-red-700", dot: "bg-red-500" },
};

function humanize(s: string) {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.DRAFT;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {humanize(status)}
    </span>
  );
}

export function money(n: number | string, currency = "USD") {
  const v = Number(n);
  const d = 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(v);
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-brand-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "paypal";
}) {
  const styles = {
    primary:
      "bg-emerald-500 text-black hover:bg-emerald-400 font-semibold shadow-sm hover:shadow-emerald-500/20 active:translate-y-[1px]",
    ghost:
      "bg-white/[0.04] border border-white/10 text-[#f0fdf4] hover:bg-white/[0.08] hover:border-white/20",
    danger:
      "bg-rose-600/90 text-white hover:bg-rose-500 border border-rose-500/30",
    paypal:
      "bg-[#0070ba] hover:bg-[#005ea6] text-white font-medium rounded-xl shadow-md active:translate-y-[1px]",
  }[variant];

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
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
      className={`rounded-2xl border border-[#1b382b] bg-[#0b1712] p-5 sm:p-6 shadow-xl shadow-black/40 transition-colors ${className}`}
    >
      {children}
    </div>
  );
}

const STATUS: Record<string, { pill: string; dot: string }> = {
  DRAFT: {
    pill: "bg-[#13231a] text-[#8ca89b] border border-white/5",
    dot: "bg-[#526f62]",
  },
  PLANNED: {
    pill: "bg-[#13231a] text-[#8ca89b] border border-[#234232]",
    dot: "bg-[#526f62]",
  },
  AWAITING_FUNDING: {
    pill: "bg-[#271a08] text-[#fcd34d] border border-amber-500/30",
    dot: "bg-amber-400 animate-pulse",
  },
  FUNDED: {
    pill: "bg-[#0b291d] text-[#34d399] border border-emerald-500/30",
    dot: "bg-[#10b981]",
  },
  IN_PROGRESS: {
    pill: "bg-[#082338] text-[#38bdf8] border border-sky-500/30",
    dot: "bg-sky-400",
  },
  SUBMITTED: {
    pill: "bg-[#271a08] text-[#fcd34d] border border-amber-500/30",
    dot: "bg-amber-400",
  },
  UNDER_REVIEW: {
    pill: "bg-[#271a08] text-[#fcd34d] border border-amber-500/30",
    dot: "bg-amber-400 animate-pulse",
  },
  APPROVED: {
    pill: "bg-[#0b291d] text-[#34d399] border border-emerald-500/30",
    dot: "bg-[#10b981]",
  },
  RELEASED: {
    pill: "bg-[#092925] text-[#2dd4bf] border border-teal-500/30",
    dot: "bg-teal-400",
  },
  COMPLETED: {
    pill: "bg-[#0b291d] text-[#34d399] border border-emerald-400/40",
    dot: "bg-emerald-400",
  },
  DISPUTED: {
    pill: "bg-[#2b1016] text-[#fda4af] border border-rose-500/30",
    dot: "bg-rose-400",
  },
};

function humanize(s: string) {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.DRAFT;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.pill}`}
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
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, ProgressBar, StatusBadge, money } from "./ui";

export type Milestone = {
  id: string;
  position: number;
  title: string;
  amount: string;
  status: string;
};

export type Job = {
  id: string;
  title: string;
  status: string;
  totalAmount: string;
  currency: string;
  milestones: Milestone[];
};

const PAID = ["RELEASED"];

export default function JobCard({
  job,
  action,
  highlight = false,
}: {
  job: Job;
  action?: ReactNode;
  highlight?: boolean;
}) {
  const cur = job.currency || "USD";
  const milestones = [...job.milestones].sort((a, b) => a.position - b.position);
  const paid = milestones.filter((m) => PAID.includes(m.status));
  const paidAmount = paid.reduce((sum, m) => sum + Number(m.amount), 0);
  const n = milestones.length;

  return (
    <Card
      className={`group transition-all duration-200 hover:border-[#2d5c47] ${
        highlight ? "border-l-4 border-l-amber-400/90" : ""
      }`}
    >
      {/* Top Header: Title & Total */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            to={`/jobs/${job.id}`}
            className="block truncate text-base sm:text-lg font-semibold text-white tracking-tight hover:text-emerald-400 transition-colors"
          >
            {job.title}
          </Link>
          <p className="mt-0.5 text-xs text-[#8ca89b]">
            {n} milestone{n === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={job.status} />
          <span className="text-xl sm:text-2xl font-bold tracking-tight text-white tabular-nums">
            {money(job.totalAmount, cur)}
          </span>
        </div>
      </div>

      {/* Progress Bar & Counters */}
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-[#8ca89b] font-mono">
          <span>
            {paid.length} of {n} released
          </span>
          <span className="tabular-nums">
            {money(paidAmount, cur)} of {money(job.totalAmount, cur)} paid
          </span>
        </div>
        <ProgressBar value={paid.length} total={n} />
      </div>

      {/* Milestones List */}
      <ul className="mt-4 divide-y divide-white/[0.05] border-t border-white/[0.08]">
        {milestones.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-white/[0.02] px-1 rounded-lg"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#2b4c3c] bg-[#0e1d16] text-[11px] font-mono font-medium text-[#8ca89b]">
                {m.position}
              </span>
              <span className="truncate text-xs sm:text-sm text-[#f0fdf4]/90 font-normal">
                {m.title}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs sm:text-sm font-medium font-mono text-white tabular-nums">
                {money(m.amount, cur)}
              </span>
              <StatusBadge status={m.status} />
            </div>
          </li>
        ))}
      </ul>

      {/* Action CTA */}
      {action && (
        <div className="mt-4 flex justify-end border-t border-white/[0.08] pt-3">
          {action}
        </div>
      )}
    </Card>
  );
}

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
      className={`transition hover:shadow-md ${
        highlight ? "border-l-4 border-l-amber-400" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to={`/jobs/${job.id}`}
            className="block truncate text-lg font-semibold hover:text-brand-700"
          >
            {job.title}
          </Link>
          <p className="mt-0.5 text-sm text-muted">
            {n} milestone{n === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={job.status} />
          <span className="text-lg font-bold tabular-nums">
            {money(job.totalAmount, cur)}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>
            {paid.length} of {n} released
          </span>
          <span className="tabular-nums">
            {money(paidAmount, cur)} of {money(job.totalAmount, cur)} paid
          </span>
        </div>
        <ProgressBar value={paid.length} total={n} />
      </div>

      <ul className="mt-4 divide-y divide-line border-t border-line">
        {milestones.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface text-xs font-semibold text-muted ring-1 ring-line">
                {m.position}
              </span>
              <span className="truncate text-sm">{m.title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm font-medium tabular-nums">
                {money(m.amount, cur)}
              </span>
              <StatusBadge status={m.status} />
            </div>
          </li>
        ))}
      </ul>

      {action && (
        <div className="mt-4 flex justify-end border-t border-line pt-4">
          {action}
        </div>
      )}
    </Card>
  );
}

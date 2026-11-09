import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export default function Layout({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#06110d] text-[#f0fdf4] selection:bg-emerald-500/30 selection:text-emerald-200">
      <header className="sticky top-0 z-20 border-b border-[#1b3327]/60 bg-[#06110d]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 sm:px-6 py-3.5">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-base sm:text-lg font-bold tracking-tight text-white transition hover:opacity-90"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 font-bold text-black shadow-sm shadow-emerald-500/20">
              K
            </span>
            Kazi-proof
          </Link>
          <div className="flex items-center gap-3 text-xs sm:text-sm text-[#8ca89b]">
            {right}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks, Clock, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import StatCard from "@/components/StatCard";
import JobsTable from "@/components/JobsTable";
import type { VideoJobWithProduct } from "@/lib/types";

export default function DashboardPage() {
  const [jobs, setJobs] = useState<VideoJobWithProduct[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/jobs");
    const data = await res.json();
    setJobs(data.jobs ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const queued = jobs.filter((j) => j.status === "queued").length;
  const processing = jobs.filter((j) =>
    ["generating_image", "generating_video", "posting"].includes(j.status)
  ).length;
  const posted = jobs.filter((j) => j.status === "posted").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-[var(--muted)]">Overview of your clip generation and posting queue</p>
        </div>
        <Link
          href="/generate"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-2.5 text-sm font-medium text-black hover:opacity-90"
        >
          <Sparkles size={16} />
          New Clip
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Queued" value={queued} icon={ListChecks} />
        <StatCard label="Processing" value={processing} icon={Clock} accent />
        <StatCard label="Posted" value={posted} icon={CheckCircle2} />
        <StatCard label="Failed" value={failed} icon={XCircle} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-[var(--muted)]">Recent jobs</h2>
        <Link href="/jobs" className="text-xs text-[var(--accent-2)] hover:underline">
          View all
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-[var(--muted)]">Loading...</div>
      ) : (
        <JobsTable jobs={jobs.slice(0, 8)} />
      )}
    </div>
  );
}

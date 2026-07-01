"use client";

import { useEffect, useState } from "react";
import JobsTable from "@/components/JobsTable";
import type { VideoJobWithProduct } from "@/lib/types";

export default function JobsPage() {
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

  async function handleDelete(id: string) {
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Job Log</h1>
        <p className="text-sm text-[var(--muted)]">Full history of generation and posting jobs</p>
      </div>

      {loading ? (
        <div className="text-sm text-[var(--muted)]">Loading...</div>
      ) : (
        <JobsTable jobs={jobs} onDelete={handleDelete} />
      )}
    </div>
  );
}

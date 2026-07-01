"use client";

import Image from "next/image";
import StatusBadge from "./StatusBadge";
import type { VideoJobWithProduct } from "@/lib/types";

function timeAgo(iso: string): string {
  if (!iso) return "-";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function JobsTable({
  jobs,
  onDelete,
}: {
  jobs: VideoJobWithProduct[];
  onDelete?: (id: string) => void;
}) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--muted)]">
        No jobs yet. Queue a clip from the Generate page to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
            <th className="px-4 py-3 font-medium">Product</th>
            <th className="px-4 py-3 font-medium">Generation</th>
            <th className="px-4 py-3 font-medium">Progress</th>
            <th className="px-4 py-3 font-medium">TikTok</th>
            <th className="px-4 py-3 font-medium">Created</th>
            {onDelete && <th className="px-4 py-3 font-medium"></th>}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md overflow-hidden bg-[var(--surface-2)] relative shrink-0">
                    <Image
                      src={job.product_image_path}
                      alt={job.product_name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <span className="font-medium">{job.product_name}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={job.status} />
                {job.error && (
                  <div className="text-xs text-red-400 mt-1 max-w-xs truncate" title={job.error}>
                    {job.error}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 w-32">
                <div className="h-1.5 w-full rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={job.post_status} />
              </td>
              <td className="px-4 py-3 text-[var(--muted)] text-xs">{timeAgo(job.created_at)}</td>
              {onDelete && (
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(job.id)}
                    className="text-xs text-[var(--muted)] hover:text-red-400"
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-zinc-500/15 text-zinc-300",
  generating_image: "bg-blue-500/15 text-blue-300",
  generating_video: "bg-blue-500/15 text-blue-300",
  ready: "bg-emerald-500/15 text-emerald-300",
  posting: "bg-amber-500/15 text-amber-300",
  posted: "bg-emerald-500/15 text-emerald-300",
  failed: "bg-red-500/15 text-red-300",
  not_posted: "bg-zinc-500/15 text-zinc-300",
  scheduled: "bg-amber-500/15 text-amber-300",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  generating_image: "Generating image",
  generating_video: "Generating video",
  ready: "Ready",
  posting: "Posting",
  posted: "Posted",
  failed: "Failed",
  not_posted: "Not posted",
  scheduled: "Scheduled",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
        STATUS_STYLES[status] ?? "bg-zinc-500/15 text-zinc-300"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

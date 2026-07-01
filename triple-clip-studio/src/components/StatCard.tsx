import type { LucideIcon } from "lucide-react";

export default function StatCard({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 flex items-center gap-4">
      <div
        className={`h-10 w-10 rounded-lg flex items-center justify-center ${
          accent ? "bg-[var(--accent)]/15 text-[var(--accent-2)]" : "bg-[var(--surface-2)] text-[var(--muted)]"
        }`}
      >
        <Icon size={20} />
      </div>
      <div>
        <div className="text-2xl font-semibold leading-tight">{value}</div>
        <div className="text-xs text-[var(--muted)]">{label}</div>
      </div>
    </div>
  );
}

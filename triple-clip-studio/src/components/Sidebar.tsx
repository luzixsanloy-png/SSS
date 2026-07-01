"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Sparkles, Music2, ListChecks, Settings } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/generate", label: "Generate Clip", icon: Sparkles },
  { href: "/tiktok", label: "TikTok Accounts", icon: Music2 },
  { href: "/jobs", label: "Job Log", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-[var(--border)]">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center">
          <Sparkles size={18} className="text-black" />
        </div>
        <div>
          <div className="font-semibold text-sm leading-tight">ClipFlow Studio</div>
          <div className="text-[11px] text-[var(--muted)] leading-tight">AI Clip &amp; Post Automation</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-[var(--accent)]/15 text-[var(--accent-2)] font-medium"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              }`}
            >
              <Icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-[var(--border)] text-[11px] text-[var(--muted)]">
        Official APIs only — Gemini/Veo + TikTok Content Posting API.
      </div>
    </aside>
  );
}

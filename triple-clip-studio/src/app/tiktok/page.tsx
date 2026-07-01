"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2, AlertTriangle } from "lucide-react";

interface TikTokAccount {
  id: string;
  open_id: string;
  display_name: string;
  avatar_url: string;
  connected_at: string;
}

export default function TikTokPage() {
  return (
    <Suspense fallback={null}>
      <TikTokPageContent />
    </Suspense>
  );
}

function TikTokPageContent() {
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [configured, setConfigured] = useState(true);
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  async function load() {
    const res = await fetch("/api/tiktok/accounts");
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setConfigured(data.configured ?? false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleDisconnect(id: string) {
    await fetch(`/api/tiktok/accounts/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">TikTok Accounts</h1>
          <p className="text-sm text-[var(--muted)]">
            Connect TikTok Business accounts via the official Content Posting API
          </p>
        </div>
        <a
          href="/api/tiktok/oauth/authorize"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-2.5 text-sm font-medium text-black hover:opacity-90"
        >
          <Plus size={16} />
          Connect account
        </a>
      </div>

      {!configured && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3 text-sm text-amber-200">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            TikTok isn&apos;t configured yet. Set <code>TIKTOK_CLIENT_KEY</code>,{" "}
            <code>TIKTOK_CLIENT_SECRET</code>, and <code>TIKTOK_REDIRECT_URI</code> in your
            environment (from a TikTok Developer app with Content Posting API access) before
            connecting an account.
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--muted)] leading-relaxed">
        Newly-authorized TikTok apps can only publish videos as <strong>private (SELF_ONLY)</strong>{" "}
        until TikTok completes an audit of your app for public posting. You can change the default
        privacy level in Settings once your app is approved.
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--muted)]">
          No TikTok accounts connected yet.
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full overflow-hidden bg-[var(--surface-2)] relative">
                  {account.avatar_url && (
                    <Image src={account.avatar_url} alt={account.display_name} fill className="object-cover" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium">{account.display_name}</div>
                  <div className="text-xs text-[var(--muted)]">
                    Connected {new Date(account.connected_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDisconnect(account.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-red-400 hover:border-red-500/30"
              >
                <Trash2 size={13} />
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

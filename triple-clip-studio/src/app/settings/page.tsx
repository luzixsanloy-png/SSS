"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { IMAGE_MODELS, VIDEO_MODELS } from "@/lib/modelOptions";

interface Settings {
  post_interval_minutes: string;
  auto_post_enabled: string;
  default_image_model: string;
  default_video_model: string;
  default_privacy_level: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tiktokConfigured, setTiktokConfigured] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSettings(data.settings);
    setTiktokConfigured(data.tiktokConfigured);
    setGeminiConfigured(data.geminiConfigured);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!settings) {
    return <div className="p-8 text-sm text-[var(--muted)]">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-[var(--muted)]">Automation defaults and API connection status</p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-6 space-y-3">
        <div className="text-sm font-medium mb-1">API connections</div>
        <ConnectionRow label="Gemini / Veo API (GEMINI_API_KEY)" connected={geminiConfigured} />
        <ConnectionRow
          label="TikTok Content Posting API (TIKTOK_CLIENT_KEY/SECRET)"
          connected={tiktokConfigured}
        />
        <p className="text-xs text-[var(--muted)] pt-1">
          Configure these as environment variables (see .env.example) — they&apos;re not editable
          from the UI for security.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Auto-post to TikTok</div>
            <div className="text-xs text-[var(--muted)]">
              When on, ready clips are posted automatically at the interval below
            </div>
          </div>
          <button
            onClick={() =>
              setSettings({
                ...settings,
                auto_post_enabled: settings.auto_post_enabled === "true" ? "false" : "true",
              })
            }
            className={`h-6 w-11 rounded-full transition-colors relative shrink-0 ${
              settings.auto_post_enabled === "true" ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                settings.auto_post_enabled === "true" ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1.5">
            Interval between posts (minutes)
          </label>
          <input
            type="number"
            min={5}
            step={5}
            value={settings.post_interval_minutes}
            onChange={(e) => setSettings({ ...settings, post_interval_minutes: e.target.value })}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1.5">Default image model</label>
          <select
            value={settings.default_image_model}
            onChange={(e) => setSettings({ ...settings, default_image_model: e.target.value })}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          >
            {IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1.5">Default video model</label>
          <select
            value={settings.default_video_model}
            onChange={(e) => setSettings({ ...settings, default_video_model: e.target.value })}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          >
            {VIDEO_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1.5">
            Default TikTok privacy level
          </label>
          <select
            value={settings.default_privacy_level}
            onChange={(e) => setSettings({ ...settings, default_privacy_level: e.target.value })}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="SELF_ONLY">Private (SELF_ONLY) — no audit required</option>
            <option value="PUBLIC_TO_EVERYONE">Public — requires TikTok app audit</option>
            <option value="MUTUAL_FOLLOW_FRIENDS">Friends only — requires TikTok app audit</option>
            <option value="FOLLOWER_OF_CREATOR">Followers only — requires TikTok app audit</option>
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50"
        >
          {saving ? "Saving..." : saved ? "Saved" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

function ConnectionRow({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {connected ? (
        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
      ) : (
        <XCircle size={16} className="text-red-400 shrink-0" />
      )}
      <span className={connected ? "text-[var(--foreground)]" : "text-[var(--muted)]"}>{label}</span>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Play, Plus } from "lucide-react";
import JobsTable from "@/components/JobsTable";
import { IMAGE_MODELS, VIDEO_MODELS, ASPECT_RATIOS } from "@/lib/modelOptions";
import type { Product, VideoJobWithProduct } from "@/lib/types";

interface TikTokAccountSummary {
  id: string;
  display_name: string;
  avatar_url: string;
}

export default function GeneratePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<TikTokAccountSummary[]>([]);
  const [jobs, setJobs] = useState<VideoJobWithProduct[]>([]);

  const [productId, setProductId] = useState("");
  const [imageModel, setImageModel] = useState(IMAGE_MODELS[2].id);
  const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].id);
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0]);
  const [prompt, setPrompt] = useState("");
  const [caption, setCaption] = useState("");
  const [tiktokAccountId, setTiktokAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function loadAll() {
    const [productsRes, accountsRes, jobsRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/tiktok/accounts"),
      fetch("/api/jobs"),
    ]);
    const productsData = await productsRes.json();
    const accountsData = await accountsRes.json();
    const jobsData = await jobsRes.json();
    setProducts(productsData.products ?? []);
    setAccounts(accountsData.accounts ?? []);
    setJobs(jobsData.jobs ?? []);
    if (!productId && productsData.products?.length) {
      setProductId(productsData.products[0].id);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    const interval = setInterval(async () => {
      const jobsRes = await fetch("/api/jobs");
      const jobsData = await jobsRes.json();
      setJobs(jobsData.jobs ?? []);
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProduct = products.find((p) => p.id === productId);

  async function handleAddToQueue(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) return;
    setSubmitting(true);
    setMessage("");
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        prompt,
        imageModel,
        videoModel,
        aspectRatio,
        caption,
        tiktokAccountId,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setMessage("Added to queue.");
      const jobsRes = await fetch("/api/jobs");
      setJobs((await jobsRes.json()).jobs ?? []);
    } else {
      const data = await res.json();
      setMessage(data.error || "Failed to queue job.");
    }
  }

  async function handleRun() {
    await fetch("/api/jobs/run", { method: "POST" });
    setMessage("Queue processing started — check progress below.");
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Generate Clip</h1>
        <p className="text-sm text-[var(--muted)]">
          Turn a product photo into an 8s AI clip, then auto-post it to TikTok
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-10">
        <form
          onSubmit={handleAddToQueue}
          className="lg:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-5"
        >
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1.5">Product</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">Select a product...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {products.length === 0 && (
              <p className="text-xs text-[var(--muted)] mt-1.5">
                No products yet — add one on the Products page first.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">Image model</label>
              <select
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value)}
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
              <label className="block text-xs text-[var(--muted)] mb-1.5">Video model</label>
              <select
                value={videoModel}
                onChange={(e) => setVideoModel(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              >
                {VIDEO_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--muted)] mb-1.5">Aspect ratio</label>
            <div className="flex gap-2">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  type="button"
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    aspectRatio === ratio
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent-2)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--muted)] mb-1.5">
              Prompt (how to enhance the photo &amp; animate it)
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Bright studio lighting, model gently rotates the product, upbeat energetic mood"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--muted)] mb-1.5">TikTok caption</label>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={selectedProduct?.name || "Video caption"}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--muted)] mb-1.5">
              Post to TikTok account (optional — leave blank to only generate)
            </label>
            <select
              value={tiktokAccountId}
              onChange={(e) => setTiktokAccountId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">Don&apos;t auto-post</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name}
                </option>
              ))}
            </select>
            {accounts.length === 0 && (
              <p className="text-xs text-[var(--muted)] mt-1.5">
                No TikTok accounts connected — visit TikTok Accounts to connect one.
              </p>
            )}
          </div>

          {message && <p className="text-xs text-[var(--accent-2)]">{message}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || !productId}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50"
            >
              <Plus size={16} />
              {submitting ? "Adding..." : "Add to queue"}
            </button>
            <button
              type="button"
              onClick={handleRun}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--surface-2)]"
            >
              <Play size={15} />
              Run queue now
            </button>
          </div>
        </form>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="text-xs text-[var(--muted)] mb-3">Preview</div>
          {selectedProduct ? (
            <div className="aspect-[9/16] max-h-80 relative rounded-lg overflow-hidden bg-[var(--surface-2)] mx-auto">
              <Image
                src={selectedProduct.image_path}
                alt={selectedProduct.name}
                fill
                className="object-cover"
              />
            </div>
          ) : (
            <div className="aspect-[9/16] max-h-80 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-xs text-[var(--muted)]">
              Select a product
            </div>
          )}
          {selectedProduct && (
            <div className="mt-3 text-sm font-medium">{selectedProduct.name}</div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-[var(--muted)]">Recent jobs</h2>
      </div>
      <JobsTable jobs={jobs.slice(0, 10)} />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Plus, Trash2, Upload } from "lucide-react";
import type { Product } from "@/lib/types";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data.products ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setPreview(selected ? URL.createObjectURL(selected) : null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !file) return;
    setSubmitting(true);
    const formData = new FormData();
    formData.set("name", name);
    formData.set("description", description);
    formData.set("image", file);
    const res = await fetch("/api/products", { method: "POST", body: formData });
    setSubmitting(false);
    if (res.ok) {
      setName("");
      setDescription("");
      handleFileChange(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setShowForm(false);
      load();
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Products</h1>
          <p className="text-sm text-[var(--muted)]">Upload product photos to turn into AI clips</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-2.5 text-sm font-medium text-black hover:opacity-90"
        >
          <Plus size={16} />
          Add product
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4"
        >
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">Product name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                placeholder="e.g. Hilee Fruit Infuser Bottle"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">Product photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                required
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface-2)] file:px-3 file:py-1.5 file:text-[var(--foreground)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="Key selling points to mention in generated captions"
            />
          </div>
          {preview && (
            <div className="h-28 w-28 relative rounded-lg overflow-hidden border border-[var(--border)]">
              <Image src={preview} alt="preview" fill className="object-cover" />
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              <Upload size={15} />
              {submitting ? "Uploading..." : "Save product"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--muted)]">
          No products yet. Add one to start generating clips.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.map((product) => (
            <div
              key={product.id}
              className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
            >
              <div className="aspect-square relative bg-[var(--surface-2)]">
                <Image src={product.image_path} alt={product.name} fill className="object-cover" />
                <button
                  onClick={() => handleDelete(product.id)}
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="p-3">
                <div className="text-sm font-medium truncate">{product.name}</div>
                {product.description && (
                  <div className="text-xs text-[var(--muted)] truncate">{product.description}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

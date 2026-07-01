import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { listProducts, createProduct } from "@/lib/repo";

export async function GET() {
  return NextResponse.json({ products: listProducts() });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const file = formData.get("image") as File | null;

  if (!name) {
    return NextResponse.json({ error: "Product name is required" }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Product image is required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  const ext = path.extname(file.name) || ".jpg";
  const filename = `${randomUUID()}${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "products");
  fs.mkdirSync(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(dir, filename), buffer);

  const product = createProduct({
    name,
    description,
    imagePath: `/uploads/products/${filename}`,
  });
  return NextResponse.json({ product }, { status: 201 });
}

import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { deleteProduct, getProduct } from "@/lib/repo";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "public", product.image_path.replace(/^\//, ""));
  fs.rm(filePath, { force: true }, () => {});

  deleteProduct(id);
  return NextResponse.json({ ok: true });
}

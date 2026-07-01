import { NextResponse } from "next/server";
import path from "node:path";
import { getProduct } from "@/lib/repo";
import { suggestClipContent } from "@/lib/claudeSuggest";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  try {
    const imagePath = path.join(process.cwd(), "public", product.image_path.replace(/^\//, ""));
    const suggestion = await suggestClipContent({
      imagePath,
      productName: product.name,
      productDescription: product.description,
    });
    return NextResponse.json({ suggestion });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate suggestion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

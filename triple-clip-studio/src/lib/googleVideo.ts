import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

export { IMAGE_MODELS, VIDEO_MODELS, ASPECT_RATIOS } from "./modelOptions";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Add it in Settings or your .env file to enable AI generation."
    );
  }
  return new GoogleGenAI({ apiKey });
}

function mimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Turns a raw product photo into a polished marketing still using an
 * image model (Imagen or the "Nano Banana" Gemini image family).
 */
export async function enhanceProductImage(opts: {
  imagePath: string;
  prompt: string;
  model: string;
}): Promise<{ imageBytes: string; mimeType: string }> {
  const ai = getClient();
  const sourceBytes = fs.readFileSync(opts.imagePath);
  const base64 = sourceBytes.toString("base64");
  const mimeType = mimeFromExt(opts.imagePath);
  const prompt = opts.prompt || "Enhance this product photo into a bright, appealing marketing still.";

  if (opts.model.startsWith("imagen")) {
    const response = await ai.models.generateImages({
      model: opts.model,
      prompt,
      config: { numberOfImages: 1 },
    });
    const image = response.generatedImages?.[0]?.image;
    if (!image?.imageBytes) {
      throw new Error("Image generation returned no image (it may have been filtered).");
    }
    return { imageBytes: image.imageBytes, mimeType: image.mimeType ?? "image/png" };
  }

  // Gemini "Nano Banana" image models support image-to-image editing.
  const response = await ai.models.generateContent({
    model: opts.model,
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, { inlineData: { data: base64, mimeType } }],
      },
    ],
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error("Image generation returned no image (it may have been filtered).");
  }
  return {
    imageBytes: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType ?? "image/png",
  };
}

/**
 * Animates a still image into a short clip with Veo (image-to-video).
 */
export async function generateVideoFromImage(opts: {
  imageBytes: string;
  mimeType: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  outputPath: string;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const ai = getClient();

  let operation = await ai.models.generateVideos({
    model: opts.model,
    prompt: opts.prompt || "Bring this product photo to life with smooth, natural motion.",
    image: { imageBytes: opts.imageBytes, mimeType: opts.mimeType },
    config: {
      numberOfVideos: 1,
      aspectRatio: opts.aspectRatio,
    },
  });

  let elapsedSeconds = 0;
  while (!operation.done) {
    await sleep(10_000);
    elapsedSeconds += 10;
    opts.onProgress?.(Math.min(90, Math.round((elapsedSeconds / 120) * 90)));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  if (operation.error) {
    const message =
      typeof operation.error.message === "string"
        ? operation.error.message
        : "Video generation failed.";
    throw new Error(message);
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) {
    throw new Error("Video generation returned no clip (it may have been filtered).");
  }

  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
  await ai.files.download({ file: video, downloadPath: opts.outputPath });
  opts.onProgress?.(100);
}

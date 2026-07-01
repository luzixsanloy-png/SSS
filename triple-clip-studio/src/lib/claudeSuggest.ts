import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";

const SUGGESTION_MODEL = "claude-opus-4-8";

export interface ClipSuggestion {
  videoPrompt: string;
  caption: string;
  hashtags: string[];
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Add it in your .env file to enable AI prompt/caption suggestions."
    );
  }
  return new Anthropic({ apiKey });
}

function mediaTypeFromExt(filePath: string): "image/jpeg" | "image/png" | "image/webp" {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Analyzes a product photo and drafts a Veo animation prompt plus a
 * ready-to-post Thai TikTok caption with hashtags, using Claude's vision
 * + structured output support.
 */
export async function suggestClipContent(opts: {
  imagePath: string;
  productName: string;
  productDescription?: string;
}): Promise<ClipSuggestion> {
  const client = getClient();
  const bytes = fs.readFileSync(opts.imagePath);
  const base64 = bytes.toString("base64");
  const mediaType = mediaTypeFromExt(opts.imagePath);

  const instruction = `You are a TikTok marketing assistant for a Thai small business. Look at this product photo of "${opts.productName}"${
    opts.productDescription ? ` (${opts.productDescription})` : ""
  } and write:
1. videoPrompt: an English prompt (2-3 sentences) describing how an AI video model should animate this still photo into an appealing 8-second TikTok product ad clip (camera movement, lighting, mood).
2. caption: a short, catchy TikTok caption in Thai that sells the product, written the way real Thai TikTok sellers write captions (casual, persuasive, with emojis where natural).
3. hashtags: 6-10 relevant TikTok hashtags mixing Thai and English, each starting with "#", suited to Thai TikTok Shop audiences.`;

  const response = await client.messages.create({
    model: SUGGESTION_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
        ],
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            videoPrompt: { type: "string" },
            caption: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
          },
          required: ["videoPrompt", "caption", "hashtags"],
          additionalProperties: false,
        },
      },
    },
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Suggestion generation returned no content.");
  }

  const parsed = JSON.parse(textBlock.text) as ClipSuggestion;
  return {
    videoPrompt: parsed.videoPrompt?.trim() ?? "",
    caption: parsed.caption?.trim() ?? "",
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
  };
}

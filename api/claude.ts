import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const client = new Anthropic();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { system, messages, model, maxTokens } = req.body;

    const response = await client.messages.create({
      // model: model ?? "claude-sonnet-4-20250514",
      model: model ?? "claude-haiku-4-5-20251001",
      max_tokens: maxTokens ?? 1024,
      system: system ?? undefined,
      messages,
    });

    return res.status(200).json(response);
  } catch (err) {
    console.error("Claude API error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

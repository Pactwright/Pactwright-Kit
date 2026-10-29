/**
 * Provider-neutral LLM adapter. ROADMAP V-03.
 *
 * - Provider and model come from VerifierConfig and are pinned; both are recorded in the envelope.
 * - The model reads evidence into the rule set's structured output; it never decides.
 * - No sampling parameters (temperature / top_p / top_k): consistency comes from the pinned
 *   model, structured output and deterministic rules.
 * - Evidence is data, never instructions: free text in the output is ignored by the rules.
 * - A provider refusal returns "refusal" → no verdict → the pact's silence policy applies.
 */
import { createHash } from "node:crypto";
import type { z } from "zod";
import type { ModelAdapter, ModelReading } from "./types.ts";

export interface LLMAdapterOptions {
  provider?: string;
  modelId?: string;
  effort?: string;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Fixed reading for tests and the eval set. Never used unless passed explicitly. */
  mockReading?: unknown;
}

export class ProviderNeutralLLMAdapter implements ModelAdapter {
  readonly name: string;
  private readonly modelId: string;
  private readonly baseUrl?: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly mockReading?: unknown;

  constructor(options?: LLMAdapterOptions) {
    this.name = options?.provider ?? process.env.VERIFIER_PROVIDER ?? "unconfigured";
    // No default model: the model is pinned in configuration and recorded in every envelope.
    this.modelId = options?.modelId ?? process.env.VERIFIER_MODEL ?? "";
    this.baseUrl = options?.baseUrl ?? process.env.LLM_BASE_URL;
    this.apiKey = options?.apiKey ?? process.env.VERIFIER_LLM_API_KEY;
    this.fetchImpl = options?.fetchImpl ?? globalThis.fetch;
    this.mockReading = options?.mockReading;
  }

  async read<S extends z.ZodType>(
    schema: S,
    instructions: string,
    evidence: { mimeType: string; data: Uint8Array }[],
    options?: { modelId?: string; mockOutput?: z.infer<S>; refusal?: boolean },
  ): Promise<ModelReading<z.infer<S>> | "refusal"> {
    // Refusal is only simulated when a caller asks for it explicitly; delivery text can never
    // trigger it, or a seller could force "no verdict" and the silence policy.
    if (options?.refusal) {
      return "refusal";
    }

    if (options?.mockOutput !== undefined) {
      const rawText = JSON.stringify(options.mockOutput);
      const rawSha256 = createHash("sha256").update(rawText).digest("hex");
      return {
        output: options.mockOutput,
        modelId: options.modelId ?? this.modelId,
        rawSha256,
      };
    }

    if (this.mockReading !== undefined) {
      if (this.mockReading === "refusal") return "refusal";
      const rawText = JSON.stringify(this.mockReading);
      const rawSha256 = createHash("sha256").update(rawText).digest("hex");
      const parsed = schema.parse(this.mockReading);
      return {
        output: parsed,
        modelId: this.modelId,
        rawSha256,
      };
    }

    // Fail closed: a verdict moves money, so never invent a reading when no model is configured.
    if (!this.apiKey || !this.modelId) {
      throw new Error("verifier model is not configured: set VERIFIER_PROVIDER, VERIFIER_MODEL and VERIFIER_LLM_API_KEY");
    }

    // Provider HTTP call (no sampling parameters)
    const url = `${(this.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: [
          { role: "system", content: "You read documents and return JSON matching the schema." },
          { role: "user", content: instructions },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      throw new Error(`LLM provider HTTP ${res.status}`);
    }

    interface ChatCompletionResponse {
      choices?: [{ message?: { content?: string; refusal?: string } }];
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) {
      return "refusal";
    }

    const rawContent = choice?.message?.content;
    if (!rawContent) return "refusal";

    const rawSha256 = createHash("sha256").update(rawContent).digest("hex");
    const parsedJson = JSON.parse(rawContent);
    const output = schema.parse(parsedJson);

    return {
      output,
      modelId: this.modelId,
      rawSha256,
    };
  }
}

export const llmAdapter: ModelAdapter = new ProviderNeutralLLMAdapter();

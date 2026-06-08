// Stub for a future OpenAI-backed analyzer.
//
// IMPORTANT - MVP STATUS:
//   This file intentionally does NOT make any network calls. It exists so the
//   shape of an LLM-backed analyzer is settled now, ahead of any infra work.
//
// When the real implementation lands (Phase 2):
//   1. Drop the throws below and wire a small chat-completions client behind
//      a feature flag (`process.env.LOG_ANALYZER === "openai"`).
//   2. Redact `requestBody` / `responseBody` of any obvious PII before sending
//      them to the LLM (regex pass for emails, phone numbers, JWTs, etc.).
//   3. Validate the model response against the same `LogAnalysis` /
//      `SessionAnalysis` Zod schemas the rule-based analyzer satisfies.
//   4. Cache repeated identical prompts (same endpoint+status+body hash) to
//      keep token spend down.
//
// The prompt templates below are the contract the model will be asked to
// satisfy. Treat them as part of the public API of this layer.

import type {
  APILog,
  LogAnalysis,
  LogEnvelope,
  SessionAnalysis,
} from "@ispyai/shared";
import type { LogAnalyzer } from "./LogAnalyzer.js";
import type { SessionAnalyzer } from "./SessionAnalyzer.js";

export const LOG_ANALYZER_SYSTEM_PROMPT = `You are a senior QA engineer reviewing a single HTTP transaction captured from a mobile app.
Return STRICT JSON matching this TypeScript shape:
{
  "category": "auth" | "authorization" | "not-found" | "server-error" | "performance" | "ok" | "unknown",
  "severity": "info" | "warn" | "error",
  "summary": string,           // <= 1 sentence, plain English for a tester
  "suggestion": string,        // <= 1 sentence, actionable next step
  "source": "openai"
}
Never include markdown fences. Never include extra fields.`;

export const SESSION_ANALYZER_SYSTEM_PROMPT = `You are a senior QA engineer summarising a single device session's network activity.
Return STRICT JSON matching this TypeScript shape:
{
  "issueSummary": string,
  "possibleRootCause": string,
  "suggestedJiraTitle": string,
  "suggestedJiraDescription": string,   // multi-line plain text, no markdown
  "severity": "low" | "medium" | "high"
}
Use the provided counts and recent log samples to reason. Never include extra fields.`;

export interface OpenAIAnalyzerOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

/** Drop-in replacement for `RuleBasedAnalyzer` once Phase 2 lands. */
export class OpenAILogAnalyzer implements LogAnalyzer {
  constructor(_options: OpenAIAnalyzerOptions) {
    void _options;
  }

  async analyze(_log: APILog): Promise<LogAnalysis> {
    throw new Error(
      "OpenAILogAnalyzer is a stub. Ship a real implementation in Phase 2."
    );
  }
}

/** Drop-in replacement for `RuleBasedSessionAnalyzer` once Phase 2 lands. */
export class OpenAISessionAnalyzer implements SessionAnalyzer {
  constructor(_options: OpenAIAnalyzerOptions) {
    void _options;
  }

  async analyze(_input: {
    sessionId: string;
    envelopes: LogEnvelope[];
  }): Promise<SessionAnalysis> {
    throw new Error(
      "OpenAISessionAnalyzer is a stub. See SESSION_ANALYZER_SYSTEM_PROMPT."
    );
  }
}

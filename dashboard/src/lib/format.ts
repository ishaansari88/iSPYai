import type { APILog, LogEnvelope } from "@ispyai/shared";

/** Returns the path + query slice of an URL, falling back to the raw string. */
export function pathOf(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return url.pathname + (url.search || "");
  } catch {
    return endpoint;
  }
}

/** Best-effort JSON pretty print so testers don't have to mentally indent. */
export function formatBody(body: string | undefined): string {
  if (!body) return "";
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

/**
 * Builds a copyable cURL command that reproduces the captured request.
 * Sensitive headers are surfaced verbatim - they were already masked by the
 * SDK before the dashboard ever saw them.
 */
export function toCurl(log: APILog): string {
  const parts = [`curl -X ${shellQuote(log.method.toUpperCase())}`];
  for (const [k, v] of Object.entries(log.requestHeaders)) {
    parts.push(`-H ${shellQuote(`${k}: ${v}`)}`);
  }
  if (log.requestBody && log.requestBody.length > 0) {
    parts.push(`--data ${shellQuote(log.requestBody)}`);
  }
  parts.push(shellQuote(log.endpoint));
  return parts.join(" \\\n  ");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Best-effort clipboard write. Returns true on success. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy fallback.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** Triggers a JSON download for the supplied envelopes. */
export function downloadSessionJson(
  sessionId: string,
  envelopes: LogEnvelope[]
): void {
  const payload = JSON.stringify(
    { sessionId, exportedAt: new Date().toISOString(), logs: envelopes },
    null,
    2
  );
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ispyai-session-${sessionId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

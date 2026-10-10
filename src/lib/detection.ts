import stripAnsi from 'strip-ansi';
import type { RetryAvailability } from './state.js';

const quotaPatterns = [
  /you(?:'|’)ve hit your usage limit\.\s+to get more access now,\s+send a request to your admin\.?(?:\s+or try again at [^\n]+\.?)?/i,
  /you(?:'|’)ve hit your usage limit\.\s+upgrade to pro\b[\s\S]*?(?:purchase more credits|or try again at [^\n]+\.?)/i
];
const retryAtPattern = /or try again at ([^\n.]+)\.?/i;

const promptPattern = /(^|\n)(?:›|>)(?:\s|$)/g;

function parseMeridiemTime(displayText: string): Date | null {
  const trimmed = displayText.trim();

  // Strip ordinal suffixes so native Date.parse can handle "Apr 25th, 2026 1:44 AM" etc.
  const normalized = trimmed.replace(/(\d+)(?:st|nd|rd|th)\b/gi, '$1');
  const nativeParsed = new Date(normalized);
  if (!Number.isNaN(nativeParsed.getTime())) {
    return nativeParsed;
  }

  // Fallback: extract a bare "H:MM AM/PM" time and resolve to today or tomorrow
  const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!timeMatch) {
    return null;
  }

  const [, rawHours, rawMinutes, period] = timeMatch;
  const hours = Number.parseInt(rawHours, 10);
  const minutes = Number.parseInt(rawMinutes, 10);
  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
    return null;
  }

  const now = new Date();
  const candidate = new Date(now);
  let normalizedHours = hours % 12;
  if (period.toUpperCase() === 'PM') {
    normalizedHours += 12;
  }

  candidate.setHours(normalizedHours, minutes, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate;
}

export function sanitizeTerminalOutput(output: string): string {
  // Cursor-positioned redraws start a new screen line without emitting LF.
  // Keep that boundary before removing ANSI so prompt detection sees it.
  return stripAnsi(output.replace(/\u001b\[[\d;]*[HfGdABEF]/g, '\n')
    // Consume full ECMA-48 CSI sequences before strip-ansi. Native Codex uses
    // private parameters (<, >, ?) and intermediates (e.g. DECSCUSR: CSI 0 SP q)
    // that strip-ansi otherwise leaves as printable debris beside fatal errors.
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ''))
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\u0000/g, '');
}

export function getOutputSinceLatestPrompt(output: string): string | null {
  const normalized = sanitizeTerminalOutput(output);
  promptPattern.lastIndex = 0;

  let lastMatch: RegExpExecArray | null = null;
  let nextMatch: RegExpExecArray | null;
  while ((nextMatch = promptPattern.exec(normalized)) !== null) {
    lastMatch = nextMatch;
  }

  if (!lastMatch) {
    return null;
  }

  return normalized.slice(lastMatch.index + lastMatch[0].length);
}

export function hasPromptMarker(output: string): boolean {
  return getOutputSinceLatestPrompt(output) !== null;
}

// Only the native fatal bootstrap envelope at the end of a failed invocation
// qualifies. A bare 401, tool error or historical error followed by progress does not.
export function hasBootstrapAuthorizationError(output: string): boolean {
  const normalized = sanitizeTerminalOutput(output).replace(/\s+/g, ' ').trim();
  return /(?:^| )Error: account\/read failed during TUI bootstrap: account\/read failed: workspace routing discovery unauthorized \(401\) \(code -32603\)$/i.test(normalized);
}

export function hasQuotaError(output: string): boolean {
  const normalized = sanitizeTerminalOutput(output);
  return quotaPatterns.some((pattern) => pattern.test(normalized));
}

export function extractQuotaRetryAvailability(output: string): RetryAvailability | null {
  const normalized = sanitizeTerminalOutput(output);
  const match = normalized.match(retryAtPattern);
  const displayText = match?.[1]?.trim();
  if (!displayText) {
    return null;
  }

  const availableAt = parseMeridiemTime(displayText);
  if (!availableAt) {
    return null;
  }

  return {
    displayText,
    availableAt: availableAt.toISOString()
  };
}

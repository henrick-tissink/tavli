/**
 * §04 §5.3 — inbound SMS keyword classification (CTIA/operator standard +
 * Romanian). STOP-family → opt out; START-family → opt back in; HELP → info.
 * Pure + case/whitespace-insensitive so it's unit-testable in isolation.
 */
export type InboundSmsIntent = "opt_out" | "opt_in" | "help" | "none";

const OPT_OUT = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "stoptoate", "dezabonare", "renunt"]);
const OPT_IN = new Set(["start", "yes", "unstop", "continue", "da", "abonare"]);
const HELP = new Set(["help", "info", "ajutor"]);

export function classifyInboundSms(body: string | null | undefined): InboundSmsIntent {
  // Operators match on the FIRST word, case-insensitively, ignoring surrounding
  // punctuation/whitespace (e.g. "STOP." or " stop please").
  const first = (body ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)[0]
    ?.replace(/[^a-zăâîșț]/gi, "");
  if (!first) return "none";
  if (OPT_OUT.has(first)) return "opt_out";
  if (OPT_IN.has(first)) return "opt_in";
  if (HELP.has(first)) return "help";
  return "none";
}

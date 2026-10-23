export const FULLY_BOOKED_MESSAGE =
  "Sorry, all appointments for this service are currently booked. Please check again tomorrow for cancellations or new appointments.";

const BLOCKING_PATTERNS = [
  /\bcaptcha\b/i,
  /\brecaptcha\b/i,
  /\bverify (that )?you are human\b/i,
  /\btwo-factor\b/i,
  /\bverification code\b/i
];

export function classifyPage(text) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (BLOCKING_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { status: "blocked", text: normalized };
  }

  if (normalized.includes(FULLY_BOOKED_MESSAGE)) {
    return { status: "fully-booked", text: normalized };
  }

  return { status: "possible-availability", text: normalized };
}

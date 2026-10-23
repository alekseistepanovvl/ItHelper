import "dotenv/config";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function booleanValue(name, fallback) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be "true" or "false"`);
}

function positiveNumber(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

export function loadConfig() {
  return {
    email: required("PRENOTAMI_EMAIL"),
    password: required("PRENOTAMI_PASSWORD"),
    telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
    telegramChatId: required("TELEGRAM_CHAT_ID"),
    serviceText: process.env.PRENOTAMI_SERVICE_TEXT?.trim() || "Tourism",
    baseUrl:
      process.env.PRENOTAMI_BASE_URL?.trim() ||
      "https://prenotami.esteri.it",
    intervalMs:
      positiveNumber("CHECK_INTERVAL_MINUTES", 10) * 60 * 1000,
    runOnce: booleanValue("RUN_ONCE", false),
    headless: booleanValue("HEADLESS", false),
    timezoneId: process.env.TIMEZONE?.trim() || "Europe/Rome",
    artifactsDir: process.env.ARTIFACTS_DIR?.trim() || "artifacts",
    logFile: process.env.LOG_FILE?.trim() || "logs/checker.log",
    browserProfileDir:
      process.env.BROWSER_PROFILE_DIR?.trim() || "browser-profile",
    manualLoginTimeoutMs:
      positiveNumber("MANUAL_LOGIN_TIMEOUT_MINUTES", 5) * 60 * 1000
  };
}

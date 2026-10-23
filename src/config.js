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

function choiceValue(name, choices, fallback) {
  const value = process.env[name]?.trim().toLowerCase() || fallback;
  if (!choices.includes(value)) {
    throw new Error(`${name} must be one of: ${choices.join(", ")}`);
  }
  return value;
}

export function loadConfig() {
  const telegramEnabled = booleanValue("TELEGRAM_ENABLED", false);
  const fixedIntervalMinutes = positiveNumber("CHECK_INTERVAL_MINUTES", 10);
  const minIntervalMinutes = positiveNumber(
    "CHECK_INTERVAL_MINUTES_MIN",
    fixedIntervalMinutes
  );
  const maxIntervalMinutes = positiveNumber(
    "CHECK_INTERVAL_MINUTES_MAX",
    fixedIntervalMinutes
  );
  const browserType = choiceValue(
    "BROWSER_TYPE",
    ["edge", "chrome", "firefox"],
    "edge"
  );

  if (maxIntervalMinutes < minIntervalMinutes) {
    throw new Error(
      "CHECK_INTERVAL_MINUTES_MAX must be greater than or equal to CHECK_INTERVAL_MINUTES_MIN"
    );
  }

  return {
    email: required("PRENOTAMI_EMAIL"),
    password: required("PRENOTAMI_PASSWORD"),
    telegramEnabled,
    telegramBotToken: telegramEnabled
      ? required("TELEGRAM_BOT_TOKEN")
      : process.env.TELEGRAM_BOT_TOKEN?.trim(),
    telegramChatId: telegramEnabled
      ? required("TELEGRAM_CHAT_ID")
      : process.env.TELEGRAM_CHAT_ID?.trim(),
    serviceText: process.env.PRENOTAMI_SERVICE_TEXT?.trim() || "Tourism",
    baseUrl:
      process.env.PRENOTAMI_BASE_URL?.trim() ||
      "https://prenotami.esteri.it",
    intervalMinMs: minIntervalMinutes * 60 * 1000,
    intervalMaxMs: maxIntervalMinutes * 60 * 1000,
    runOnce: booleanValue("RUN_ONCE", false),
    headless: booleanValue("HEADLESS", false),
    debugMode: booleanValue("DEBUG_MODE", false),
    debugStepDelayMs: positiveNumber("DEBUG_STEP_DELAY_MS", 1000),
    debugHoldMs: positiveNumber("DEBUG_HOLD_SECONDS", 30) * 1000,
    timezoneId: process.env.TIMEZONE?.trim() || "Europe/Rome",
    artifactsDir: process.env.ARTIFACTS_DIR?.trim() || "artifacts",
    logFile: process.env.LOG_FILE?.trim() || "logs/checker.log",
    browserProfileDir:
      process.env.BROWSER_PROFILE_DIR?.trim() || "browser-profile",
    browserChannel: process.env.BROWSER_CHANNEL?.trim() || "chrome",
    browserType,
    browserMode: process.env.BROWSER_MODE?.trim() || "playwright",
    uiaNavigationTimeoutSeconds: positiveNumber(
      "UIA_NAVIGATION_TIMEOUT_SECONDS",
      20
    ),
    manualLoginTimeoutMs:
      positiveNumber("MANUAL_LOGIN_TIMEOUT_MINUTES", 5) * 60 * 1000
  };
}

import { loadConfig } from "./config.js";
import { checkAvailability } from "./checker.js";
import { createLogger } from "./logger.js";
import { sendTelegramMessage } from "./telegram.js";

async function run(config, state, logger) {
  const startedAt = Date.now();
  try {
    logger.info("Availability check started", {
      serviceText: config.serviceText
    });
    const result = await checkAvailability(config, logger);

    if (result.status === "fully-booked") {
      logger.info("No appointments available", {
        url: result.url,
        screenshot: result.screenshot,
        durationMs: Date.now() - startedAt
      });
      state.lastAlertKey = undefined;
      return;
    }

    const alertKey = `${result.status}:${result.url}`;
    if (state.lastAlertKey === alertKey) {
      logger.info("Duplicate alert suppressed", {
        status: result.status,
        url: result.url
      });
      return;
    }

    const message =
      result.status === "blocked"
        ? `Prenot@mi checker needs attention: CAPTCHA or verification was detected.\n${result.url}`
        : `Possible Italian embassy appointment availability for "${config.serviceText}". Check immediately:\n${result.url}`;

    await sendTelegramMessage(config, message, logger);
    state.lastAlertKey = alertKey;
    logger.info("Availability check completed with alert", {
      status: result.status,
      url: result.url,
      screenshot: result.screenshot,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    logger.error("Availability check failed", {
      error,
      screenshot: error.screenshot,
      durationMs: Date.now() - startedAt
    });
  }
}

const config = loadConfig();
const state = {};
const logger = createLogger(config.logFile, [
  config.email,
  config.password,
  config.telegramBotToken,
  config.telegramChatId
]);

logger.info("Runner started", {
  baseUrl: config.baseUrl,
  serviceText: config.serviceText,
  intervalMinutes: config.intervalMs / 60000,
  runOnce: config.runOnce,
  headless: config.headless,
  timezone: config.timezoneId,
  artifactsDirectory: config.artifactsDir,
  browserProfileDirectory: config.browserProfileDir,
  logFile: config.logFile
});

await run(config, state, logger);

if (!config.runOnce) {
  logger.info("Continuous monitoring enabled", {
    intervalMinutes: config.intervalMs / 60000
  });
  while (true) {
    logger.info("Waiting for next scheduled check", {
      intervalMinutes: config.intervalMs / 60000
    });
    await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
    await run(config, state, logger);
  }
} else {
  logger.info("Runner finished after one check");
}

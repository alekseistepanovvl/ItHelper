import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { classifyPage } from "./availability.js";

const LOGIN_PATH = "/Account/Login";
const RESERVATIONS_PATH = "/Services";

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function saveScreenshot(page, directory, prefix, logger) {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${prefix}-${timestamp()}.png`);
  await page.screenshot({ path: file, fullPage: true });
  logger.info("Screenshot saved", { file, prefix });
  return file;
}

function isLoginPage(page) {
  return new URL(page.url()).pathname.toLowerCase().includes("/account/login");
}

function isBotChallenge(page) {
  return (
    page.url().includes("validate.perfdrive.com") ||
    /captcha|bot manager/i.test(page.url())
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function waitForManualAccess(
  page,
  config,
  logger,
  requireLoginCompletion = false
) {
  if (config.headless) {
    throw new Error(
      "The site requested CAPTCHA or manual login; rerun with HEADLESS=false"
    );
  }

  logger.warn("Waiting for manual CAPTCHA or login completion", {
    timeoutMinutes: config.manualLoginTimeoutMs / 60000,
    url: page.url()
  });

  await page.waitForURL(
    (url) =>
      url.hostname === new URL(config.baseUrl).hostname &&
      (!requireLoginCompletion ||
        !url.pathname.toLowerCase().includes("/account/login")),
    { timeout: config.manualLoginTimeoutMs }
  );
  logger.info("Manual browser step completed", { url: page.url() });
}

async function login(page, config, logger) {
  const loginUrl = new URL(LOGIN_PATH, config.baseUrl).href;
  logger.info("Opening login page", { url: loginUrl });
  await page.goto(loginUrl, {
    waitUntil: "domcontentloaded"
  });
  logger.info("Login page loaded", { url: page.url() });

  if (isBotChallenge(page)) {
    logger.warn("Browser challenge detected before login", { url: page.url() });
    await waitForManualAccess(page, config, logger);
  }

  if (!isLoginPage(page)) {
    logger.info("Existing authenticated session detected", { url: page.url() });
    return;
  }

  const email = page.locator(
    'input[type="email"], input[name="Email"], input[name="email"]'
  ).first();
  const password = page.locator('input[type="password"]').first();

  await email.waitFor({ state: "visible", timeout: 15000 });
  logger.info("Login form found; filling credentials");
  await email.fill(config.email);
  await password.fill(config.password);

  logger.info("Submitting login form");
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page
      .getByRole("button", { name: /log\s*in|sign\s*in|accedi/i })
      .first()
      .click()
  ]);
  logger.info("Login form submitted", { url: page.url() });

  if (isBotChallenge(page)) {
    logger.warn("Browser challenge detected after login", { url: page.url() });
    await waitForManualAccess(page, config, logger);
    return;
  }

  if (isLoginPage(page)) {
    const text = await page.locator("body").innerText();
    const classification = classifyPage(text);
    if (classification.status === "blocked") {
      logger.warn("Additional login verification detected");
      await waitForManualAccess(page, config, logger, true);
      return;
    }
    throw new Error("Login failed; verify the credentials and embassy account");
  }

  logger.info("Login completed", { url: page.url() });
}

async function openService(page, config, logger) {
  const reservationsUrl = new URL(RESERVATIONS_PATH, config.baseUrl).href;
  logger.info("Opening reservations page", { url: reservationsUrl });
  await page.goto(reservationsUrl, {
    waitUntil: "domcontentloaded"
  });
  logger.info("Reservations page loaded", { url: page.url() });

  const serviceMatcher = new RegExp(escapeRegExp(config.serviceText), "i");
  const serviceContainer = page
    .locator("tr, .card, .service, article")
    .filter({ hasText: serviceMatcher })
    .first();

  if (await serviceContainer.count()) {
    const link = serviceContainer.getByRole("link").last();
    if (await link.count()) {
      logger.info("Service container link found; opening service", {
        serviceText: config.serviceText
      });
      await Promise.all([
        page.waitForLoadState("domcontentloaded"),
        link.click()
      ]);
      return;
    }

    const button = serviceContainer.getByRole("button").last();
    if (await button.count()) {
      logger.info("Service container button found; opening service", {
        serviceText: config.serviceText
      });
      await Promise.all([
        page.waitForLoadState("domcontentloaded"),
        button.click()
      ]);
      return;
    }
  }

  const directLink = page.getByRole("link", { name: serviceMatcher }).first();
  if (await directLink.count()) {
    logger.info("Direct service link found; opening service", {
      serviceText: config.serviceText
    });
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      directLink.click()
    ]);
    return;
  }

  throw new Error(
    `Could not find a reservation link for service text "${config.serviceText}"`
  );
}

export async function checkAvailability(config, logger) {
  logger.info("Launching browser", {
    headless: config.headless,
    profileDirectory: config.browserProfileDir,
    timezone: config.timezoneId
  });
  const context = await chromium.launchPersistentContext(
    config.browserProfileDir,
    {
      headless: config.headless,
      timezoneId: config.timezoneId,
      locale: "en-US"
    }
  );
  const pages = context.pages();
  const page = pages[0] || (await context.newPage());

  page.on("pageerror", (error) => {
    logger.error("Browser page error", { error });
  });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      logger.warn("Browser console message", {
        type: message.type(),
        text: message.text()
      });
    }
  });
  page.on("requestfailed", (request) => {
    if (["document", "xhr", "fetch"].includes(request.resourceType())) {
      logger.warn("Browser request failed", {
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
        failure: request.failure()
      });
    }
  });

  try {
    await login(page, config, logger);
    await openService(page, config, logger);
    await page.waitForLoadState("networkidle").catch((error) => {
      logger.warn("Network did not become idle before timeout", { error });
    });

    if (isBotChallenge(page)) {
      throw new Error(
        "The site requested CAPTCHA while opening the reservation service"
      );
    }

    const bodyText = await page.locator("body").innerText();
    const result = classifyPage(bodyText);
    logger.info("Reservation response classified", {
      status: result.status,
      url: page.url()
    });
    const screenshot = await saveScreenshot(
      page,
      config.artifactsDir,
      result.status,
      logger
    );

    return {
      ...result,
      url: page.url(),
      screenshot
    };
  } catch (error) {
    const screenshot = await saveScreenshot(
      page,
      config.artifactsDir,
      "error",
      logger
    ).catch(() => undefined);
    error.screenshot = screenshot;
    throw error;
  } finally {
    logger.info("Closing browser context");
    await context.close();
  }
}

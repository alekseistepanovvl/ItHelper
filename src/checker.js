import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, firefox } from "playwright";
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

function isAuthenticationPage(page) {
  const url = new URL(page.url());
  return (
    isLoginPage(page) ||
    (url.hostname === "iam.esteri.it" &&
      url.pathname.toLowerCase().includes("/signin"))
  );
}

function isBotChallengeUrl(value) {
  const url = value instanceof URL ? value.href : value;
  return (
    url.includes("validate.perfdrive.com") ||
    /captcha|bot manager/i.test(url)
  );
}

function isBotChallenge(page) {
  return isBotChallengeUrl(page.url());
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
      !isBotChallengeUrl(url) &&
      (!requireLoginCompletion ||
        (url.hostname === new URL(config.baseUrl).hostname &&
          !url.pathname.toLowerCase().includes("/account/login"))),
    { timeout: config.manualLoginTimeoutMs }
  );
  logger.info("Manual browser step completed", { url: page.url() });
}

async function waitForLoginForm(page, email, config, logger) {
  const deadline = Date.now() + config.manualLoginTimeoutMs;

  while (Date.now() < deadline) {
    if (isBotChallenge(page)) {
      logger.warn("Delayed browser challenge detected on identity provider", {
        url: page.url()
      });
      await waitForManualAccess(page, config, logger);
    }

    if (await email.isVisible().catch(() => false)) {
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new Error("Timed out waiting for the login form or CAPTCHA completion");
}

async function waitForLoginResult(page, config, logger) {
  const deadline = Date.now() + 30000;
  const prenotamiHost = new URL(config.baseUrl).hostname;

  while (Date.now() < deadline) {
    if (isBotChallenge(page)) {
      logger.warn("Browser challenge detected after login", {
        url: page.url()
      });
      await waitForManualAccess(page, config, logger);
      continue;
    }

    const url = new URL(page.url());
    if (url.hostname === prenotamiHost && !isLoginPage(page)) {
      logger.info("Login completed", { url: page.url() });
      return;
    }

    if (isAuthenticationPage(page)) {
      const errorText = await page
        .locator('[role="alert"], .alert, .error, .text-danger')
        .allInnerTexts()
        .catch(() => []);
      if (
        errorText.some((text) =>
          /invalid|incorrect|wrong|not valid|errat|neisprav|pogre/i.test(text)
        )
      ) {
        throw new Error(
          `Login failed: ${errorText.join(" ").replace(/\s+/g, " ").trim()}`
        );
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error("Timed out waiting for the login result");
}

async function setEnglishLanguage(page, config, logger) {
  if (new URL(page.url()).hostname !== new URL(config.baseUrl).hostname) {
    return;
  }

  const englishLink = page
    .locator(
      '.top-nav__languages a[href="/Language/ChangeLanguage?lang=2"]'
    )
    .first();

  if (!(await englishLink.count())) {
    throw new Error("English language link was not found");
  }

  logger.info("Switching Prenotami interface to English");
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    englishLink.click()
  ]);
  logger.info("Prenotami interface switched to English", {
    url: page.url()
  });
}

async function login(page, config, logger) {
  logger.info("Opening Prenotami homepage", { url: config.baseUrl });
  await page.goto(config.baseUrl, {
    waitUntil: "domcontentloaded"
  });
  logger.info("Prenotami homepage loaded", { url: page.url() });

  if (isBotChallenge(page)) {
    logger.warn("Browser challenge detected before login", { url: page.url() });
    await waitForManualAccess(page, config, logger);
  }

  await setEnglishLanguage(page, config, logger);

  if (!isLoginPage(page)) {
    const loginLink = page
      .locator("section.login")
      .getByRole("link", { name: /^log in to access the portal$/i })
      .first();

    if (await loginLink.count()) {
      logger.info("Portal login link found; opening IAM login form");
      await Promise.all([
        page.waitForLoadState("domcontentloaded"),
        loginLink.click()
      ]);
      logger.info("Login page loaded", { url: page.url() });
    } else {
      logger.info("Portal login link absent; existing session detected", {
        url: page.url()
      });
      return;
    }
  }

  if (isBotChallenge(page)) {
    logger.warn("Browser challenge detected on login page", {
      url: page.url()
    });
    await waitForManualAccess(page, config, logger);
  }

  const email = page.locator(
    [
      'input[type="email"]',
      'input[name="Email"]',
      'input[name="email"]',
      'input[name="username"]',
      'input[id="username"]',
      'input[autocomplete="username"]',
      'input[placeholder*="User Name" i]'
    ].join(", ")
  ).first();
  const password = page.locator('input[type="password"]').first();

  await waitForLoginForm(page, email, config, logger);
  logger.info("Login form found; filling credentials");
  await email.fill(config.email);
  await password.fill(config.password);

  logger.info("Submitting login form");
  await page
    .getByRole("button", {
      name: /log\s*in|sign\s*in|accedi|entra|continua|continue|next/i
    })
    .first()
    .click();
  logger.info("Login form submitted", { url: page.url() });
  await waitForLoginResult(page, config, logger);
}

async function openService(page, config, logger) {
  const reservationsUrl = new URL(RESERVATIONS_PATH, config.baseUrl).href;
  logger.info("Opening reservations page", { url: reservationsUrl });
  await page.goto(reservationsUrl, {
    waitUntil: "domcontentloaded"
  });
  logger.info("Reservations page loaded", { url: page.url() });

  if (isBotChallenge(page)) {
    logger.warn("Browser challenge detected on reservations page", {
      url: page.url()
    });
    await waitForManualAccess(page, config, logger);
    logger.info("Reservations challenge completed", { url: page.url() });
  }

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
  const browserType = config.browserType === "firefox" ? firefox : chromium;
  const channel =
    config.browserType === "edge"
      ? "msedge"
      : config.browserType === "chrome"
        ? "chrome"
        : undefined;
  const profileDirectory = `${config.browserProfileDir}-${config.browserType}`;

  logger.info("Launching browser", {
    browserType: config.browserType,
    channel,
    chromiumSandbox: config.browserType !== "firefox",
    headless: config.headless,
    profileDirectory,
    timezone: config.timezoneId
  });
  const launchOptions = {
    headless: config.headless,
    slowMo: config.debugMode ? config.debugStepDelayMs : 0,
    timezoneId: config.timezoneId,
    locale: "en-US"
  };
  if (channel) {
    launchOptions.channel = channel;
    launchOptions.chromiumSandbox = true;
    launchOptions.devtools = config.debugMode;
  }

  const context = await browserType.launchPersistentContext(
    profileDirectory,
    launchOptions
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
    if (config.debugMode) {
      logger.warn("Visible debug hold active", {
        holdSeconds: config.debugHoldMs / 1000,
        url: page.url()
      });
      await page.waitForTimeout(config.debugHoldMs);
    }
    throw error;
  } finally {
    logger.info("Closing browser context");
    await context.close();
  }
}

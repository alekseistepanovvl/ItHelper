import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { FULLY_BOOKED_MESSAGE } from "./availability.js";

const execFileAsync = promisify(execFile);

export function classifyUiaResult(result) {
  const availableService = result.services.find((service) => service.available);

  if (availableService) {
    return {
      status: "possible-availability",
      url: availableService.resultUrl,
      service: availableService.label
    };
  }

  return {
    status: "fully-booked",
    url: result.services.at(-1)?.resultUrl,
    checkedServices: result.services.map((service) => service.label)
  };
}

export async function checkAvailabilityWithUia(config, logger) {
  const script = path.resolve("scripts", "check-edge-uia.ps1");
  logger.info("Starting browser UI Automation availability check", {
    script,
    browserType: config.browserType,
    serviceText: config.serviceText
  });

  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-BaseUrl",
      config.baseUrl,
      "-ServiceText",
      config.serviceText,
      "-FullyBookedMessage",
      FULLY_BOOKED_MESSAGE,
      "-BrowserType",
      config.browserType,
      "-NavigationTimeoutSeconds",
      String(config.uiaNavigationTimeoutSeconds)
    ],
    {
      windowsHide: true,
      timeout: (config.uiaNavigationTimeoutSeconds * 5 + 20) * 1000,
      env: {
        ...process.env,
        PRENOTAMI_UIA_USERNAME: config.email,
        PRENOTAMI_UIA_PASSWORD: config.password
      }
    }
  );

  if (stderr.trim()) {
    logger.warn("Browser UI Automation emitted diagnostic output", {
      stderr: stderr.trim()
    });
  }

  const result = JSON.parse(stdout.trim());
  for (const event of result.events || []) {
    logger.info(`UIA ${event.stage}`, event.details);
  }
  logger.info("Browser UI Automation check completed", result);
  return classifyUiaResult(result);
}

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLogger } from "../src/logger.js";

test("writes structured logs and redacts secrets", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "prenotami-log-"));
  const logFile = path.join(directory, "checker.log");

  try {
    const logger = createLogger(logFile, ["secret-password", "123456"]);
    logger.error("Example failure", {
      password: "secret-password",
      chatId: "123456",
      url: "https://example.com/path?challenge=sensitive#fragment",
      error: new Error("failure details")
    });

    const log = readFileSync(logFile, "utf8");
    assert.match(log, /"level":"ERROR"/);
    assert.match(log, /failure details/);
    assert.doesNotMatch(log, /secret-password|123456/);
    assert.doesNotMatch(log, /challenge=sensitive|fragment/);
    assert.match(log, /https:\/\/example.com\/path/);
    assert.match(log, /\[REDACTED\]/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

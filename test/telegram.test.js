import assert from "node:assert/strict";
import test from "node:test";
import { sendTelegramMessage } from "../src/telegram.js";

test("dry-run mode logs the message without calling Telegram", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch must not be called");
  };

  const entries = [];
  const logger = {
    info(message, details) {
      entries.push({ message, details });
    }
  };

  try {
    await sendTelegramMessage(
      { telegramEnabled: false },
      "test notification",
      logger
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(fetchCalled, false);
  assert.deepEqual(entries, [
    {
      message: "Telegram notification skipped (dry run)",
      details: { message: "test notification" }
    }
  ]);
});


import assert from "node:assert/strict";
import test from "node:test";
import { randomIntervalMs } from "../src/schedule.js";

test("chooses a delay within the configured interval range", () => {
  assert.equal(randomIntervalMs(60000, 120000, () => 0), 60000);
  assert.equal(randomIntervalMs(60000, 120000, () => 0.5), 90000);
  assert.equal(randomIntervalMs(60000, 120000, () => 1), 120000);
});

test("returns the fixed delay when the range bounds match", () => {
  assert.equal(randomIntervalMs(60000, 60000, () => 0.25), 60000);
});


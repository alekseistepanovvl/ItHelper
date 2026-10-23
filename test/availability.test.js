import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPage,
  FULLY_BOOKED_MESSAGE
} from "../src/availability.js";

test("recognizes the fully booked page", () => {
  assert.equal(
    classifyPage(`Reservation\n${FULLY_BOOKED_MESSAGE}\nBack`).status,
    "fully-booked"
  );
});

test("treats a different booking response as possible availability", () => {
  assert.equal(
    classifyPage("Choose an available appointment date").status,
    "possible-availability"
  );
});

test("recognizes CAPTCHA and verification blockers", () => {
  assert.equal(
    classifyPage("Please verify that you are human").status,
    "blocked"
  );
  assert.equal(
    classifyPage("Enter your two-factor verification code").status,
    "blocked"
  );
});


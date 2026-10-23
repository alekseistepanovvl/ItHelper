import assert from "node:assert/strict";
import test from "node:test";
import { classifyUiaResult } from "../src/uia-checker.js";

test("classifies redirected Tourism services as fully booked", () => {
  assert.deepEqual(
    classifyUiaResult({
      services: [
        {
          label: "TURIZAM (šalter_1)",
          resultUrl: "https://prenotami.esteri.it/Services",
          fullyBookedMessageFound: true,
          available: false
        },
        {
          label: "TURIZAM (šalter_2)",
          resultUrl: "https://prenotami.esteri.it/Services",
          fullyBookedMessageFound: true,
          available: false
        }
      ]
    }),
    {
      status: "fully-booked",
      url: "https://prenotami.esteri.it/Services",
      checkedServices: ["TURIZAM (šalter_1)", "TURIZAM (šalter_2)"]
    }
  );
});

test("reports the first Tourism booking page that remains open", () => {
  assert.deepEqual(
    classifyUiaResult({
      services: [
        {
          label: "TURIZAM (šalter_1)",
          resultUrl: "https://prenotami.esteri.it/Services",
          fullyBookedMessageFound: true,
          available: false
        },
        {
          label: "TURIZAM (šalter_2)",
          resultUrl: "https://prenotami.esteri.it/Services/Booking/1258",
          fullyBookedMessageFound: false,
          available: true
        }
      ]
    }),
    {
      status: "possible-availability",
      url: "https://prenotami.esteri.it/Services/Booking/1258",
      service: "TURIZAM (šalter_2)"
    }
  );
});

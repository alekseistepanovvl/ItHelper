# Prenot@mi slot checker

Checks the configured Prenot@mi service through a real Chromium browser and
sends a Telegram message when the response is not:

> Sorry, all appointments for this service are currently booked.

The checker does not bypass CAPTCHA, MFA, queues, or other access controls.

## Setup

1. Install Node.js 20 or newer.
2. Run:

   ```powershell
   npm install
   npm run install-browser
   Copy-Item .env.example .env
   ```

3. Edit `.env` and set the Prenot@mi credentials, Telegram bot token, chat ID,
   and the exact service text shown by your embassy.

   Keep `TELEGRAM_ENABLED=false` while testing. Notification messages will be
   written to the log without contacting Telegram. Set it to `true` only after
   the browser flow has been verified.

   Set `DEBUG_MODE=true` to open DevTools, slow browser actions using
   `DEBUG_STEP_DELAY_MS`, and keep failed pages visible for
   `DEBUG_HOLD_SECONDS`.

   `BROWSER_TYPE=edge|chrome|firefox` selects the browser. In Playwright mode,
   each browser uses a separate dedicated persistent profile and does not
   modify the normal personal profile.

   On Windows, `BROWSER_MODE=uia` uses Windows UI Automation to control an
   already-open normal browser window. Set `BROWSER_TYPE=edge`, `chrome`, or
   `firefox`; the bot opens the selected browser when needed. Avoid using that
   browser while a check is actively navigating.
   This mode checks every matching Tourism counter and never submits a booking.
   Before checking, the bot switches Prenot@mi to English using the site’s
   `lang=2` language control. It then looks for the exact
   **Log in to access the portal** link inside the login section. When present,
   UIA opens IAM, fills the configured username/password, and presses **Next**;
   when absent, the Edge session is treated as already authenticated.
   A service is considered fully booked only when the exact configured
   Prenot@mi message is visibly exposed through Edge accessibility. If that
   message is absent, the page remains open and the notification path runs.
4. Test one visible browser run:

   ```powershell
   $env:RUN_ONCE = "true"
   npm run check
   ```

   Prenot@mi currently uses a browser challenge. Complete it manually if it
   appears. The runner then fills the login form and stores the resulting
   browser session in `browser-profile`.

5. For continuous monitoring, set `RUN_ONCE=false` in `.env` and run:

   ```powershell
   npm run check
   ```

   `CHECK_INTERVAL_MINUTES_MIN` and `CHECK_INTERVAL_MINUTES_MAX` define a new
   random delay after every completed check. `CHECK_INTERVAL_MINUTES` remains
   the fallback when the range variables are omitted.

Screenshots from every check are saved under `artifacts`. Detailed structured
logs are appended to `logs/checker.log`, including browser navigation, login
steps, service selection, response classification, Telegram delivery, timing,
screenshots, browser errors, and failed requests. Credentials and Telegram
secrets are redacted. Keep `.env`, logs, and screenshots private.

Keep `HEADLESS=false`; the site currently challenges headless Chromium. To find
a Telegram chat ID, send a message to your bot and open
`https://api.telegram.org/bot<TOKEN>/getUpdates`.

The site can change its labels or HTML. If the checker cannot find the service,
set `HEADLESS=false`, confirm the exact service label, and update
`PRENOTAMI_SERVICE_TEXT`.

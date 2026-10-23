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

---
name: browser-use
description: "Use 9GClaw's browser-use plugin for browser automation, screenshots, form filling, and web UI checks."
---

# browser-use

Use this skill when a task genuinely needs browser automation through 9GClaw's built-in `browser-use` plugin, especially for local Web UI smoke tests, screenshots, navigation, clicking, typing, and DOM inspection. For static pages, batch scraping, API responses, or plain text extraction, prefer ordinary HTTP/file tools first.

## Availability

9GClaw ships the `browser-use` plugin, which runs `@playwright/mcp` with Chromium. Before installing anything, first try to use the existing browser/MCP setup or check the browser cache. If the browser is already present or browser-use launches successfully, do not reinstall it.

Check whether the browser is already installed:

```bash
if ls "$HOME/Library/Caches/ms-playwright"/mcp-chrome-for-testing-* >/dev/null 2>&1 || \
   ls "$HOME/.cache/ms-playwright"/mcp-chrome-for-testing-* >/dev/null 2>&1; then
  echo "Chrome for Testing is already installed; no reinstall needed."
else
  echo "Chrome for Testing is not installed yet."
fi
```

If that check reports an existing Chrome for Testing cache, proceed with browser automation directly. Repeated browser downloads are slow, brittle on restricted networks, and unnecessary when the cache is already populated.

Only install the browser when all of the following are true:

- The task truly requires an interactive browser rather than HTTP, curl, requests, or file parsing.
- The cache check shows Chrome for Testing is missing, or an actual browser-use launch failed because the browser executable is missing.
- The environment has network/proxy access suitable for downloading browser binaries.

The one-line installer uses the same check. If Chrome for Testing is already present, it prints `Chrome for Testing already installed` and does not download it again.

Install it from a 9GClaw source checkout or installed app directory:

```bash
cd /path/to/9GClaw
corepack pnpm install --frozen-lockfile --filter 9gclaw --filter 9gclaw-ui
corepack pnpm run install:browser
```

For an installed one-line setup, use the app directory shown by `9gclaw status`:

```bash
9gclaw status
cd ~/.9gclaw/app
corepack pnpm run install:browser
```

To let the one-line installer install it during setup, opt in explicitly:

```bash
NINEGCLAW_SKIP_BROWSER_INSTALL=0 bash install.sh
```

Repeated installs are safe only when the installer can confirm the cache first. In task containers or time-limited jobs, avoid ad hoc commands such as `playwright install chromium` unless the missing-browser error is confirmed and installation time is acceptable.

If the download is slow or blocked, configure your network proxy first and rerun the install command. Browser automation is optional; 9GClaw core chat, files, skills, and settings work without it.

## Runtime Configuration

9GClaw starts browser-use through `playwright-mcp` and uses practical defaults for slower pages:

- `NINEGCLAW_BROWSER_TIMEOUT_ACTION_MS`: browser action timeout, default `30000`.
- `NINEGCLAW_BROWSER_TIMEOUT_NAVIGATION_MS`: navigation timeout, default `90000`.
- `NINEGCLAW_BROWSER_PROXY_SERVER`: proxy passed directly to Chromium, for example `http://127.0.0.1:7890`.
- `NINEGCLAW_BROWSER_PROXY_BYPASS`: comma-separated proxy bypass list. Defaults include `localhost`, `127.0.0.1`, and `host.docker.internal`.
- `NINEGCLAW_BROWSER_PROXY_FROM_ENV=1`: infer a browser proxy from `NINEGCLAW_PROXY`, `HTTPS_PROXY`, or `HTTP_PROXY`. This is disabled by default; use `NINEGCLAW_BROWSER_PROXY_SERVER` when the proxy should be passed explicitly to Chromium.
- If `9gclaw.yaml` sets `proxy.url`, browser-use passes it to Chromium when no explicit browser proxy is set. `proxy.noProxy` is included in the browser proxy bypass list.

Use a direct browser proxy when command-line HTTP tools can reach the network but browser navigation hangs or times out. Chromium does not always behave like curl or Python requests with inherited proxy environment variables.

## Usage Notes

- Prefer browser-use for interactive browser tasks. Prefer HTTP, curl, requests, or structured parsing for non-interactive retrieval and batch scraping.
- Try the existing browser setup before any installation step. If it works, continue; do not reinstall or upgrade browser binaries.
- If browser-use times out or the page does not require interaction, switch to HTTP/file parsing or a narrower browser action instead of repeatedly retrying the same navigation.
- If a full-page screenshot times out while waiting for fonts or page stability, avoid retrying the identical screenshot. Try a viewport screenshot, a narrower element/clip, a short targeted wait, or a direct Playwright script with an explicit timeout.
- If navigation to a public site times out but curl or Python succeeds, check whether `NINEGCLAW_BROWSER_PROXY_SERVER` is set for Chromium.
- Keep browser-use calls targeted: navigate to one URL, wait for a specific visible signal, extract the needed text/state, then stop. Avoid using browser automation as a general crawler.
- For local 9GClaw checks, open the URL shown by `9gclaw status`, usually `http://localhost:3001`.
- If no model provider is configured, a clean 9GClaw instance should land on onboarding rather than settings or chat.
- Keep browser tasks small and observable: navigate, wait for a visible heading, inspect relevant text, then report evidence.
- Do not store API keys, session cookies, or private credentials in screenshots or logs.

## Common Checks

```text
Open http://localhost:3001
Verify the page shows LLM Provider Setup when no real provider config exists
Open Settings and verify provider/API key controls are visible
Take a screenshot only when visual evidence is useful
```

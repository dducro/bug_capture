# Bug Capture

Chrome extension that records user interactions, captures screenshots at each step, and exports a Markdown file ready to paste into Jira.

All processing is local — no server, no image uploads.

## What it captures

| Event | Step recorded |
|---|---|
| Click | Screenshot + element label |
| Keyboard input | Debounced text per field |
| URL change | Navigation step |

## Local setup

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `/Users/danielducro/Projects/bug_capture`

## Usage

1. Navigate to any web app
2. Click the extension icon → **Start**
3. Interact with the page (click, type, navigate)
4. Click the extension icon → **Stop**
5. Review steps — delete or reorder as needed
6. Enter a session title → **Export .md**

The downloaded `.md` file contains inline base64 screenshots and renders in any Markdown viewer or Jira description field.

## Export format

```markdown
# Session title

## Step 1 — Click "Create Deal"
**Page:** Deals | HubSpot
**URL:** https://app.hubspot.com/deals/...
**Time:** 2026-03-24T14:27:36Z

![Step 1](data:image/png;base64,...)
```

## File structure

```
manifest.json
content/tracker.js            — event listeners, element label extraction
background/service-worker.js  — session state, screenshots, markdown builder
popup/popup.html|css|js       — UI: start/stop, step review, export
```

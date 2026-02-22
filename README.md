# Discreet Ask Gemini (for Students)

A minimal Chrome extension for students: highlight text or images on any page and get help from Gemini via a keyboard shortcut or right‑click. The popup is low‑profile and easy to hide.

- **Ask:** Select text (and/or images), then **Cmd+Shift+E** (Mac) or **Ctrl+Shift+E** (Windows/Linux), or right‑click → **Ask Gemini Pro**.
- **Hide popup:** **Cmd+E** (Mac) or **Ctrl+E** (Windows/Linux).

Your API key stays local (never committed). Customize the pre‑prompt in the code for how you want Gemini to respond (e.g. short answers, MCQ-only, etc.).

## Setup

1. **Get an API key** from [Google AI Studio](https://aistudio.google.com/apikey) (free tier available).

2. **Copy** `.env.example` to `.env` and add your key:
   ```
   GEMINI_API_KEY=your_actual_key_here
   ```

3. **Generate the extension** (creates `background.loader.js`; this file is gitignored):
   ```bash
   npm run config
   ```

4. **Load in Chrome:** `chrome://extensions` → **Load unpacked** → select this folder.

If you skip step 2, `npm run config` still creates `background.loader.js` with an empty key so the extension loads; you’ll see “Missing API key” until you add `.env` and run `npm run config` again.

## Keybinds (customize in Chrome → Extensions → Keyboard shortcuts)

| Action        | Mac           | Windows/Linux |
|---------------|---------------|----------------|
| Ask Gemini    | Cmd+Shift+E   | Ctrl+Shift+E   |
| Hide popup    | Cmd+E         | Ctrl+E         |

## Privacy

- No analytics. Your selections and API calls go only to Google’s Gemini API.
- The popup uses a generic class name and no extension-specific IDs so it’s less obvious in the DOM.


## License

MIT

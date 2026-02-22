// API key: set in .env, then run "npm run config" to generate background.loader.js (gitignored).
const GEMINI_API_KEY = "";

// Model name. Options: gemini-2.5-flash, gemini-2.5-pro, gemini-2.5-flash-lite, gemini-3-flash-preview, gemini-3.1-pro-preview.
const GEMINI_MODEL = "gemini-2.5-flash";

// Pre-prompt sent before your highlighted text. Change this to customize the instruction.
const PRE_PROMPT = "Okay I will send a text snippet. this text snippet could be in the form of Multiple Choice Question or brief description. Understand which type is it based off the text snippet. If it is a multiple choice, here is the rules. Only give back to me the the choice or answer and no need to briefly explain. If there are multiple possible correct answers then yes you may also inclbbbude all. But if you think it is not a MCQ but a brief explanation then that is when you may give a short explanation ";

// Pre-prompt when you send an image (right-click image → Ask Gemini).
const PRE_PROMPT_IMAGE = "Describe or explain what you see in this image. Be concise.";

// Create the right-click menu items (selection + image)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ask-gemini",
    title: "Ask Gemini Pro",
    contexts: ["selection", "image"]
  });
});

// Minimal, low-profile popup (click to dismiss). Uses generic class/id so it doesn’t stand out in the DOM.
function showDiscreetPopup(text) {
  const old = document.querySelector('.ctx-hint');
  if (old) old.remove();

  const div = document.createElement('div');
  div.className = 'ctx-hint';
  div.id = 'h' + Math.random().toString(36).slice(2, 9);
  Object.assign(div.style, {
    position: 'fixed',
    bottom: '12px',
    right: '12px',
    maxWidth: '320px',
    maxHeight: '40vh',
    overflow: 'auto',
    padding: '10px 12px',
    backgroundColor: 'rgba(28, 28, 28, 0.92)',
    color: 'rgba(236, 236, 236, 0.95)',
    borderRadius: '6px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
    lineHeight: '1.45',
    zIndex: '2147483647',
    cursor: 'pointer',
    whiteSpace: 'pre-wrap',
    border: '1px solid rgba(255,255,255,0.06)'
  });
  div.innerText = text;
  div.onclick = () => div.remove();
  document.body.appendChild(div);
}

function hideDiscreetPopup() {
  const el = document.querySelector('.ctx-hint');
  if (el) el.remove();
}

// Fetch image URL and return { mimeType, base64 } (handles data: URLs and http(s); blob: needs page context)
async function imageUrlToBase64(url) {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) return { mimeType: match[1].trim(), base64: match[2] };
  }
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`Could not load image: ${res.status}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  return { mimeType, base64 };
}

// Shared: send parts to Gemini and show result in the tab (parts = [{ text }] or [{ text }, { inline_data }])
async function askGemini(parts, tabId) {
  if (!parts?.length) return;
  if (typeof GEMINI_API_KEY === 'undefined' || !GEMINI_API_KEY || GEMINI_API_KEY.includes('your_api_key')) {
    chrome.scripting.executeScript({
      target: { tabId },
      func: showDiscreetPopup,
      args: ['Missing API key. Copy .env.example to .env, add GEMINI_API_KEY, then run: npm run config']
    });
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId },
    func: showDiscreetPopup,
    args: ["Thinking..."]
  });

  const showError = (msg) => {
    chrome.scripting.executeScript({ target: { tabId }, func: showDiscreetPopup, args: [msg] });
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    const data = await response.json();

    if (!response.ok) {
      const msg = data?.error?.message || data?.error?.status || `HTTP ${response.status}`;
      showError(`Gemini error: ${msg}`);
      return;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      chrome.scripting.executeScript({ target: { tabId }, func: showDiscreetPopup, args: [text] });
      return;
    }

    const reason = data.candidates?.[0]?.finishReason ? "Blocked or empty reply." : "No candidates in response.";
    const promptMsg = data.promptFeedback?.blockReason ? `Prompt blocked: ${data.promptFeedback.blockReason}.` : reason;
    showError(`Gemini: ${promptMsg}`);
  } catch (err) {
    showError(`Error: ${err.message || "Could not reach Gemini API."}`);
  }
}

async function askGeminiAboutSelection(selectionText, tabId) {
  if (!selectionText || !selectionText.trim()) return;
  await askGemini([{ text: `${PRE_PROMPT}\n\n${selectionText.trim()}` }], tabId);
}

// Get selection content: text + all image URLs inside the selection range (for highlight that includes image + text)
function getSelectionContent() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { text: "", imageUrls: [] };
  const text = sel.toString().trim();
  const range = sel.getRangeAt(0);
  const fragment = range.cloneContents();
  const imgs = fragment.querySelectorAll ? fragment.querySelectorAll("img") : [];
  const imageUrls = [...new Set(Array.from(imgs).map((img) => img.src).filter(Boolean))];
  return { text, imageUrls };
}

async function askGeminiAboutSelectionAndImages(selectionText, imageUrls, tabId) {
  const parts = [];
  const promptText = selectionText?.trim() ? `${PRE_PROMPT}\n\n${selectionText.trim()}` : PRE_PROMPT_IMAGE;
  parts.push({ text: promptText });
  for (const url of imageUrls || []) {
    try {
      if (url.startsWith("blob:")) {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: (u) =>
            new Promise((resolve, reject) => {
              fetch(u)
                .then((r) => r.blob())
                .then((blob) => {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const dataUrl = reader.result;
                    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (m) resolve({ mimeType: m[1].trim(), base64: m[2] });
                    else reject(new Error("Could not read blob"));
                  };
                  reader.readAsDataURL(blob);
                })
                .catch(reject);
            }),
          args: [url]
        });
        if (results?.[0]?.result) {
          const r = results[0].result;
          parts.push({ inline_data: { mime_type: r.mimeType, data: r.base64 } });
        }
      } else {
        const { mimeType, base64 } = await imageUrlToBase64(url);
        parts.push({ inline_data: { mime_type: mimeType, data: base64 } });
      }
    } catch (_) {}
  }
  if (parts.length === 1 && !selectionText?.trim()) return; // prompt only, no text and no images loaded
  await askGemini(parts, tabId);
}

async function askGeminiAboutImage(imageUrl, tabId) {
  if (!imageUrl) return;
  try {
    let mimeType, base64;
    if (imageUrl.startsWith("blob:")) {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (url) => {
          return new Promise((resolve, reject) => {
            fetch(url).then(r => r.blob()).then(blob => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const dataUrl = reader.result;
                const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (m) resolve({ mimeType: m[1].trim(), base64: m[2] });
                else reject(new Error("Could not read blob"));
              };
              reader.readAsDataURL(blob);
            }).catch(reject);
          });
        },
        args: [imageUrl]
      });
      if (!results?.[0]?.result) throw new Error("Could not read image from page");
      ({ mimeType, base64 } = results[0].result);
    } else {
      ({ mimeType, base64 } = await imageUrlToBase64(imageUrl));
    }
    await askGemini(
      [{ text: PRE_PROMPT_IMAGE }, { inline_data: { mime_type: mimeType, data: base64 } }],
      tabId
    );
  } catch (err) {
    chrome.scripting.executeScript({
      target: { tabId },
      func: showDiscreetPopup,
      args: [`Error: ${err.message || "Could not load image."}`]
    });
  }
}

// Right-click context menu: "Ask Gemini Pro" (selection with text and/or images, or single image)
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "ask-gemini") return;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: getSelectionContent
    });
    const content = results?.[0]?.result;
    const hasSelection = content && (content.text?.trim() || (content.imageUrls?.length > 0));
    if (hasSelection) {
      await askGeminiAboutSelectionAndImages(content.text || "", content.imageUrls || [], tab.id);
    } else if (info.srcUrl) {
      await askGeminiAboutImage(info.srcUrl, tab.id);
    } else {
      await askGeminiAboutSelection(info.selectionText || "", tab.id);
    }
  } catch (_) {
    if (info.srcUrl) await askGeminiAboutImage(info.srcUrl, tab.id);
    else await askGeminiAboutSelection(info.selectionText || "", tab.id);
  }
});

// Keyboard shortcut: highlight text and/or images, then press Cmd+Shift+E
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "hide-popup") {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        code: "var e = document.querySelector('.ctx-hint'); if (e) e.remove();"
      });
    } catch (_) {}
    return;
  }

  if (command !== "ask-gemini") return;
  if (!tab?.id) return;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const text = sel.toString().trim();
          const range = sel.getRangeAt(0);
          const fragment = range.cloneContents();
          const imgs = fragment.querySelectorAll ? fragment.querySelectorAll("img") : [];
          const imageUrls = [...new Set(Array.from(imgs).map((img) => img.src).filter(Boolean))];
          if (text || imageUrls.length > 0) return { type: "selection", text, imageUrls };
        }
        const findImg = (n) => (!n ? null : n.tagName === "IMG" ? n : n.parentElement?.closest?.("img") || (n.querySelector?.("img") ?? null));
        const img = findImg(sel?.anchorNode) || findImg(sel?.focusNode) || (document.activeElement?.tagName === "IMG" ? document.activeElement : null);
        if (img?.src) return { type: "image", value: img.src };
        return null;
      }
    });
    const payload = results?.[0]?.result;
    if (!payload) return;
    if (payload.type === "selection") {
      await askGeminiAboutSelectionAndImages(payload.text || "", payload.imageUrls || [], tab.id);
    } else if (payload.type === "image") {
      await askGeminiAboutImage(payload.value, tab.id);
    }
  } catch (_) {}
});

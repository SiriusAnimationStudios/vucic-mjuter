// Service worker: owns the offscreen OCR document and tab muting.

const OFFSCREEN_URL = "offscreen.html";
let creatingOffscreen = null;

// tabId -> true when THIS extension muted the tab
const mutedByUs = new Map();

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });
  if (contexts.length > 0) return;
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["WORKERS"],
    justification: "Run Tesseract OCR on YouTube video frames"
  });
  try { await creatingOffscreen; } finally { creatingOffscreen = null; }
}

async function setTabMuted(tabId, muted) {
  try {
    await chrome.tabs.update(tabId, { muted });
    if (muted) mutedByUs.set(tabId, true);
    else mutedByUs.delete(tabId);
    return true;
  } catch (e) {
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === "offscreen") return false; // meant for the offscreen doc

  if (msg.type === "ocr") {
    (async () => {
      try {
        await ensureOffscreen();
        const res = await chrome.runtime.sendMessage({
          target: "offscreen",
          type: "recognize",
          image: msg.image
        });
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }

  if (msg.type === "mute" && sender.tab) {
    const tabId = sender.tab.id;
    (async () => {
      if (msg.muted) {
        // Don't take over a tab the user already muted themselves
        const tab = await chrome.tabs.get(tabId);
        if (tab.mutedInfo && tab.mutedInfo.muted && !mutedByUs.get(tabId)) {
          sendResponse({ ok: true, alreadyMutedByUser: true });
          return;
        }
        sendResponse({ ok: await setTabMuted(tabId, true) });
      } else {
        // Only unmute if we were the ones who muted it
        if (!mutedByUs.get(tabId)) { sendResponse({ ok: true, skipped: true }); return; }
        sendResponse({ ok: await setTabMuted(tabId, false) });
      }
    })();
    return true;
  }

  if (msg.type === "popupUnmute") {
    // Manual unmute from the popup: unmute and tell the tab to snooze
    (async () => {
      await setTabMuted(msg.tabId, false);
      try { await chrome.tabs.sendMessage(msg.tabId, { type: "userUnmuted" }); } catch (e) {}
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

// If the user unmutes the tab by hand (speaker icon on the tab), snooze until the text goes away
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.mutedInfo) return;
  if (!changeInfo.mutedInfo.muted && mutedByUs.get(tabId)) {
    mutedByUs.delete(tabId);
    chrome.tabs.sendMessage(tabId, { type: "userUnmuted" }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => mutedByUs.delete(tabId));

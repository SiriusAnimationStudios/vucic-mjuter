// Service worker: owns the offscreen OCR document and tab muting.
//
// Who muted a tab is read from Chrome itself (tab.mutedInfo.reason / extensionId), not kept in memory:
// the service worker is restarted by Chrome every so often, and in-memory state would be lost.

const OFFSCREEN_URL = "offscreen.html";
let creatingOffscreen = null;

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

// True when the tab is currently muted by THIS extension
function mutedByUs(tab) {
  const mi = tab && tab.mutedInfo;
  return !!(mi && mi.muted && mi.reason === "extension" && mi.extensionId === chrome.runtime.id);
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
      try {
        const tab = await chrome.tabs.get(tabId);
        if (msg.muted) {
          if (mutedByUs(tab)) { sendResponse({ ok: true, mutedByUs: true }); return; }
          if (tab.mutedInfo && tab.mutedInfo.muted) {
            // The user (or something else) already muted it: leave it alone
            sendResponse({ ok: true, mutedByUs: false, alreadyMutedByUser: true });
            return;
          }
          await chrome.tabs.update(tabId, { muted: true });
          sendResponse({ ok: true, mutedByUs: true });
        } else {
          // Only unmute if we were the ones who muted it
          if (mutedByUs(tab)) await chrome.tabs.update(tabId, { muted: false });
          sendResponse({ ok: true, mutedByUs: false });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }

  if (msg.type === "popupUnmute") {
    // Manual unmute from the popup: unmute and tell the tab to snooze until the text goes away
    (async () => {
      try {
        const tab = await chrome.tabs.get(msg.tabId);
        if (mutedByUs(tab)) await chrome.tabs.update(msg.tabId, { muted: false });
      } catch (e) {}
      try { await chrome.tabs.sendMessage(msg.tabId, { type: "userUnmuted" }); } catch (e) {}
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

// The user unmuted the tab by hand (speaker icon on the tab / tab context menu):
// tell the page so it snoozes until the text disappears. Our own unmutes have reason "extension"
// and are ignored here.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const mi = changeInfo.mutedInfo;
  if (!mi || mi.muted || mi.reason !== "user") return;
  chrome.tabs.sendMessage(tabId, { type: "userUnmuted" }).catch(() => {});
});

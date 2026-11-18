const fields = ["enabled", "keywords", "regionTopPct", "regionBottomPct", "textColor", "intervalSec", "unmuteAfterSec", "fuzzy"];
const $ = (id) => document.getElementById(id);
let activeTabId = null;

function load() {
  chrome.storage.sync.get(YTM_DEFAULTS, (s) => {
    $("enabled").checked = !!s.enabled;
    $("fuzzy").checked = !!s.fuzzy;
    $("keywords").value = (s.keywords || []).join("\n");
    $("regionTopPct").value = s.regionTopPct;
    $("regionBottomPct").value = s.regionBottomPct;
    $("textColor").value = s.textColor;
    $("intervalSec").value = s.intervalSec;
    $("unmuteAfterSec").value = s.unmuteAfterSec;
  });
}

function save() {
  const num = (id, def) => { const v = parseFloat($(id).value); return isNaN(v) ? def : v; };
  chrome.storage.sync.set({
    enabled: $("enabled").checked,
    fuzzy: $("fuzzy").checked,
    keywords: $("keywords").value.split("\n").map((s) => s.trim()).filter(Boolean),
    regionTopPct: num("regionTopPct", YTM_DEFAULTS.regionTopPct),
    regionBottomPct: num("regionBottomPct", YTM_DEFAULTS.regionBottomPct),
    textColor: $("textColor").value,
    intervalSec: num("intervalSec", YTM_DEFAULTS.intervalSec),
    unmuteAfterSec: num("unmuteAfterSec", YTM_DEFAULTS.unmuteAfterSec)
  });
}

fields.forEach((id) => {
  $(id).addEventListener("change", save);
  if ($(id).tagName === "TEXTAREA") $(id).addEventListener("input", save);
});

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function ago(t) {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? s + "s ago" : Math.round(s / 60) + " min ago";
}

function render(st) {
  const box = $("status");
  if (!st) { box.innerHTML = "Open a YouTube video in this tab."; return; }
  let badge;
  if (st.mutedByUs) badge = '<span class="badge muted">MUTED by extension</span>';
  else if (st.snoozed) badge = '<span class="badge snooze">Snoozed until text disappears</span>';
  else if (st.playing && st.frozen) badge = '<span class="badge snooze">Video picture frozen: holding current state</span>';
  else if (st.playing) badge = '<span class="badge live">Watching' + (st.hidden ? " (in background)" : "") + "</span>";
  else badge = '<span class="badge idle">' + (st.hasVideo ? "Video not playing" : "No video") + "</span>";

  box.innerHTML =
    badge +
    (st.lastError ? '<div class="err">' + esc(st.lastError) + "</div>" : "") +
    '<div style="margin-top:6px">Last match: <b>' + (st.lastMatchWord ? esc(st.lastMatchWord) + "</b> (" + ago(st.lastMatchAt) + ")" : "—</b>") + "</div>" +
    "<div>Last scan: " + ago(st.lastScanAt) + (st.lastMs ? " · OCR " + st.lastMs + " ms" : "") + "</div>" +
    "<div style='margin-top:6px'>What the OCR sees:</div>" +
    (st.lastImage ? '<img src="' + st.lastImage + '">' : "") +
    "<pre>" + esc(st.lastText || "(nothing yet)") + "</pre>" +
    (st.mutedByUs ? '<button id="unmute">Unmute now (snooze until text is gone)</button>' : "");

  const btn = $("unmute");
  if (btn) btn.onclick = () => chrome.runtime.sendMessage({ type: "popupUnmute", tabId: activeTabId }, poll);
}

function poll() {
  if (activeTabId == null) return;
  chrome.tabs.sendMessage(activeTabId, { type: "getStatus" }, (st) => {
    void chrome.runtime.lastError;
    render(st);
  });
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  activeTabId = tabs[0] && tabs[0].id;
  poll();
  setInterval(poll, 1000);
});

load();

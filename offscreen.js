// Offscreen document: hosts one Tesseract worker (Serbian Cyrillic + Latin), all files bundled locally.

let workerPromise = null;
let queue = Promise.resolve();

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker(["srp", "srp_latn"], 1, {
        workerPath: chrome.runtime.getURL("lib/worker.min.js"),
        corePath: chrome.runtime.getURL("lib/core"),
        langPath: chrome.runtime.getURL("lib/lang"),
        workerBlobURL: false,
        cacheMethod: "none",
        gzip: true
      });
      // 11 = sparse text: find text anywhere in the strip (logos, tickers, lower thirds)
      await worker.setParameters({ tessedit_pageseg_mode: "11" });
      return worker;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "offscreen" || msg.type !== "recognize") return false;
  // Serialize requests from multiple tabs
  queue = queue.then(async () => {
    try {
      const worker = await getWorker();
      const t0 = performance.now();
      const { data } = await worker.recognize(msg.image);
      sendResponse({ ok: true, text: data.text || "", ms: Math.round(performance.now() - t0) });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message || e) });
    }
  });
  return true;
});

getWorker(); // warm up

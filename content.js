// Content script on youtube.com: grabs the bottom strip of the video, sends it for OCR,
// mutes the tab while a keyword is visible and unmutes once it has been gone for a while.

(() => {
  const DEFAULTS = {
    enabled: true,
    keywords: ["Вучић", "Србија побеђује"],
    intervalSec: 1,
    regionTopPct: 85,
    regionBottomPct: 100,
    textColor: "light",
    unmuteAfterSec: 10,
    fuzzy: true
  };

  let settings = { ...DEFAULTS };
  const state = {
    mutedByUs: false,
    snoozed: false,        // user unmuted manually -> don't re-mute until the text is gone once
    lastMatchAt: 0,
    lastMatchWord: "",
    lastText: "",
    lastImage: "",
    lastError: "",
    lastMs: 0,
    lastScanAt: 0,
    lastFrameCount: -1,
    lastAttemptAt: 0,
    frozen: false,         // video frames stopped updating (Chrome paused video decoding)
    busy: false
  };

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // ---------- text normalization & matching ----------

  const CYR = {
    "а":"a","б":"b","в":"v","г":"g","д":"d","ђ":"dj","е":"e","ж":"z","з":"z","и":"i","ј":"j",
    "к":"k","л":"l","љ":"lj","м":"m","н":"n","њ":"nj","о":"o","п":"p","р":"r","с":"s","т":"t",
    "ћ":"c","у":"u","ф":"f","х":"h","ц":"c","ч":"c","џ":"dz","ш":"s",
    // Russian/other Cyrillic letters OCR sometimes outputs
    "й":"j","ы":"i","э":"e","ю":"ju","я":"ja","ё":"e","ъ":"","ь":"","і":"i","ї":"i","є":"e","ѓ":"g","ќ":"k","ѕ":"dz"
  };

  function normalize(s) {
    s = s.toLowerCase();
    let out = "";
    for (const ch of s) out += (CYR[ch] !== undefined ? CYR[ch] : ch);
    out = out.replace(/đ/g, "dj");
    out = out.normalize("NFD").replace(/[̀-ͯ]/g, ""); // č->c, š->s, ž->z, ć->c
    out = out.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    return out;
  }

  // Approximate substring match (Sellers): smallest edit distance of `pat` against any substring of `txt`
  function approxContains(txt, pat, maxErr) {
    if (maxErr <= 0) return txt.includes(pat);
    const m = pat.length;
    let prev = new Array(m + 1);
    for (let i = 0; i <= m; i++) prev[i] = i;
    for (let j = 1; j <= txt.length; j++) {
      const cur = new Array(m + 1);
      cur[0] = 0;
      const tc = txt[j - 1];
      for (let i = 1; i <= m; i++) {
        const cost = pat[i - 1] === tc ? 0 : 1;
        cur[i] = Math.min(prev[i - 1] + cost, prev[i] + 1, cur[i - 1] + 1);
      }
      if (cur[m] <= maxErr) return true;
      prev = cur;
    }
    return false;
  }

  function findKeyword(rawText) {
    const txt = normalize(rawText);
    const txtNoSpace = txt.replace(/ /g, "");
    for (const kw of settings.keywords) {
      const pat = normalize(kw);
      if (!pat) continue;
      const maxErr = settings.fuzzy ? Math.floor(pat.length * 0.15) : 0;
      if (approxContains(txt, pat, maxErr)) return kw;
      // OCR sometimes drops/merges spaces
      const patNoSpace = pat.replace(/ /g, "");
      if (patNoSpace !== pat && approxContains(txtNoSpace, patNoSpace, maxErr)) return kw;
    }
    return "";
  }

  // ---------- frame capture ----------

  function getVideo() {
    return document.querySelector("#movie_player video.html5-main-video") ||
           document.querySelector("#movie_player video") ||
           document.querySelector("video");
  }

  function frameCount(video) {
    try {
      const q = video.getVideoPlaybackQuality && video.getVideoPlaybackQuality();
      return q ? q.totalVideoFrames : -1;
    } catch (e) { return -1; }
  }

  function captureStrip(video) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const top = Math.max(0, Math.min(99, settings.regionTopPct)) / 100;
    const bottom = Math.max(top * 100 + 1, Math.min(100, settings.regionBottomPct)) / 100;
    const sy = Math.round(vh * top);
    const sh = Math.max(8, Math.round(vh * (bottom - top)));

    // Scale so the strip is ~1600px wide: text ends up large enough for Tesseract
    const scale = 1600 / vw;
    const dw = Math.round(vw * scale);
    const dh = Math.round(sh * scale);
    canvas.width = dw;
    canvas.height = dh;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, 0, sy, vw, sh, 0, 0, dw, dh);

    // Binarize to black text on white paper
    const img = ctx.getImageData(0, 0, dw, dh); // throws if canvas is tainted
    const d = img.data;
    const light = settings.textColor !== "dark";
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const ink = light ? Math.min(r, g, b) > 200   // bright white text only (ignores shirts, skin, bright colors)
                        : Math.max(r, g, b) < 90;   // dark text
      const v = ink ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL("image/png");
  }

  // ---------- mute control ----------

  function setMuted(muted) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "mute", muted }, (res) => {
          void chrome.runtime.lastError;
          if (res && res.ok) state.mutedByUs = !!res.mutedByUs;
          resolve(res);
        });
      } catch (e) { resolve(null); } // extension reloaded
    });
  }

  // ---------- main loop ----------

  async function scan() {
    if (state.busy) return;
    state.lastAttemptAt = Date.now();
    if (!settings.enabled) {
      if (state.mutedByUs) await setMuted(false);
      return;
    }
    const video = getVideo();
    if (!video || video.readyState < 2 || video.paused || video.ended) return;

    // In background tabs Chrome may stop decoding video; a frozen frame would give stale results,
    // so hold the current state until new frames arrive.
    const fc = frameCount(video);
    if (fc !== -1 && fc === state.lastFrameCount) { state.frozen = true; return; }
    state.frozen = false;
    state.lastFrameCount = fc;

    let image;
    try {
      image = captureStrip(video);
    } catch (e) {
      state.lastError = "Cannot read video frame: " + (e && e.message || e);
      return;
    }
    if (!image) return;

    state.busy = true;
    state.lastImage = image;
    let res;
    try {
      res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "ocr", image }, (r) => { void chrome.runtime.lastError; resolve(r); });
      });
    } catch (e) {
      res = null;
    }
    state.busy = false;
    state.lastScanAt = Date.now();

    if (!res || !res.ok) {
      state.lastError = "OCR failed: " + (res && res.error || "no response");
      return;
    }
    state.lastError = "";
    state.lastText = res.text.trim();
    state.lastMs = res.ms;

    const hit = findKeyword(res.text);
    const now = Date.now();
    if (hit) {
      state.lastMatchAt = now;
      state.lastMatchWord = hit;
      // Always ask the background (cheap): it checks Chrome's real mute state, so nothing can get out of sync
      if (!state.snoozed) await setMuted(true);
    } else {
      if (state.snoozed) state.snoozed = false; // text gone -> re-arm
      if (settings.unmuteAfterSec > 0 && now - state.lastMatchAt >= settings.unmuteAfterSec * 1000) {
        await setMuted(false); // background only unmutes if this extension muted the tab
      }
    }
  }

  const intervalMs = () => Math.max(0.5, Number(settings.intervalSec) || 2) * 1000;

  // Two drivers for scanning:
  // 1) a normal timer;
  // 2) the video's own "timeupdate" events (~4x per second while playing). Chrome throttles timers in
  //    background/minimized tabs (down to once a minute after ~5 min), but media events keep firing,
  //    so scanning keeps its pace while you're on another tab or the window is minimized/covered.
  let timer = null;
  function loop() {
    clearTimeout(timer);
    scan().finally(() => { timer = setTimeout(loop, intervalMs()); });
  }

  document.addEventListener("timeupdate", () => {
    if (!state.busy && Date.now() - state.lastAttemptAt >= intervalMs()) scan();
  }, true); // capture phase: media events don't bubble

  // ---------- settings & messages ----------

  chrome.storage.sync.get(DEFAULTS, (s) => {
    settings = { ...DEFAULTS, ...s };
    loop();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const k of Object.keys(changes)) settings[k] = changes[k].newValue;
    state.lastFrameCount = -1;
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "userUnmuted") {
      // Only snooze if the words are actually on screen right now; otherwise there is nothing to snooze
      if (Date.now() - state.lastMatchAt < Math.max(3000, intervalMs() * 2)) state.snoozed = true;
      state.mutedByUs = false;
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === "getStatus") {
      const video = getVideo();
      sendResponse({
        hasVideo: !!video,
        playing: !!(video && !video.paused && !video.ended),
        hidden: document.hidden,
        mutedByUs: state.mutedByUs,
        snoozed: state.snoozed,
        lastText: state.lastText,
        lastMatchWord: state.lastMatchWord,
        lastMatchAt: state.lastMatchAt,
        lastScanAt: state.lastScanAt,
        lastImage: state.lastImage,
        lastError: state.lastError,
        frozen: state.frozen,
        lastMs: state.lastMs
      });
      return false;
    }
    return false;
  });
})();

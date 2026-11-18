// Vučić Mjuter — content script on youtube.com.
// Grabs the bottom strip of the video, sends it for OCR, mutes the tab while a keyword is visible
// and unmutes once it has been gone for a while. Settings are fixed (no user options in this version).

(() => {
  const CONFIG = {
    keywords: ["Вучић", "Србија побеђује"],
    intervalSec: 1,          // how often a frame is read
    regionTopPct: 85,        // scan from this % of the video height...
    regionBottomPct: 100,    // ...down to this %
    unmuteAfterSec: 10,      // unmute after the words have been gone this long
    fuzzy: true              // tolerate small OCR errors in longer keywords
  };

  const state = {
    mutedByUs: false,
    snoozed: false,        // user unmuted manually -> don't re-mute until the text is gone once
    lastMatchAt: 0,
    lastFrameCount: -1,
    lastAttemptAt: 0,
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
    for (const kw of CONFIG.keywords) {
      const pat = normalize(kw);
      if (!pat) continue;
      const maxErr = CONFIG.fuzzy ? Math.floor(pat.length * 0.15) : 0;
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
    const top = CONFIG.regionTopPct / 100;
    const bottom = CONFIG.regionBottomPct / 100;
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

    // Binarize to black text on white paper: only bright white pixels count as text
    const img = ctx.getImageData(0, 0, dw, dh); // throws if canvas is tainted
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.min(d[i], d[i + 1], d[i + 2]) > 200 ? 0 : 255;
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

    const video = getVideo();
    if (!video || video.readyState < 2 || video.paused || video.ended) return;

    // If Chrome stops decoding video (frozen frame), hold the current state until new frames arrive
    const fc = frameCount(video);
    if (fc !== -1 && fc === state.lastFrameCount) return;
    state.lastFrameCount = fc;

    let image;
    try {
      image = captureStrip(video);
    } catch (e) {
      return;
    }
    if (!image) return;

    state.busy = true;
    let res;
    try {
      res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "ocr", image }, (r) => { void chrome.runtime.lastError; resolve(r); });
      });
    } catch (e) {
      res = null;
    }
    state.busy = false;
    if (!res || !res.ok) return;

    const hit = findKeyword(res.text);
    const now = Date.now();
    if (hit) {
      state.lastMatchAt = now;
      // Always ask the background (cheap): it checks Chrome's real mute state, so nothing can get out of sync
      if (!state.snoozed) await setMuted(true);
    } else {
      if (state.snoozed) state.snoozed = false; // text gone -> re-arm
      if (now - state.lastMatchAt >= CONFIG.unmuteAfterSec * 1000) {
        await setMuted(false); // background only unmutes if this extension muted the tab
      }
    }
  }

  const intervalMs = CONFIG.intervalSec * 1000;

  // Two drivers for scanning:
  // 1) a normal timer;
  // 2) the video's own "timeupdate" events (~4x per second while playing). Chrome throttles timers in
  //    background/minimized tabs (down to once a minute after ~5 min), but media events keep firing,
  //    so scanning keeps its pace while you're on another tab or the window is minimized/covered.
  let timer = null;
  function loop() {
    clearTimeout(timer);
    scan().finally(() => { timer = setTimeout(loop, intervalMs); });
  }

  document.addEventListener("timeupdate", () => {
    if (!state.busy && Date.now() - state.lastAttemptAt >= intervalMs) scan();
  }, true); // capture phase: media events don't bubble

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "userUnmuted") {
      // Only snooze if the words are actually on screen right now
      if (Date.now() - state.lastMatchAt < Math.max(3000, intervalMs * 2)) state.snoozed = true;
      state.mutedByUs = false;
      sendResponse({ ok: true });
    }
    return false;
  });

  loop();
})();

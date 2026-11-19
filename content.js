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
    fuzzy: true,             // tolerate small OCR errors in longer keywords
    longRun: 28,             // 2nd OCR pass: erase white runs longer than this (desk edges behind the caption)
    sceneThreshold: 10       // max fingerprint distance to count as the same camera shot
  };

  // Camera shots that are muted even without a caption: 16x9 grid of average RGB colours.
  // "chair": the presiding chair (carved wooden chair + wood panelling).
  const SCENES = {
    chair: [109,79,56,106,94,105,117,86,64,123,80,42,126,80,42,101,65,41,86,56,41,94,61,43,97,59,37,120,77,42,119,77,46,119,73,43,101,61,34,95,58,33,86,50,29,76,47,29,104,73,42,94,80,63,113,81,50,125,84,47,122,79,43,99,63,38,80,53,39,100,79,69,94,64,47,118,76,41,114,74,45,110,67,41,102,62,36,97,59,34,85,50,31,77,47,30,109,72,38,111,72,40,118,77,44,123,83,45,115,75,40,86,62,51,133,104,91,227,174,144,171,145,129,107,85,74,103,66,42,114,69,39,99,61,36,94,58,34,82,49,31,74,44,29,116,78,47,117,76,45,115,74,44,116,78,44,77,60,56,83,67,66,129,99,86,175,135,110,171,148,133,96,80,76,87,68,66,96,62,43,104,65,36,99,60,33,83,49,31,71,42,27,129,99,76,129,86,57,114,72,43,113,79,49,114,99,100,97,87,85,127,102,92,176,131,111,149,114,94,68,65,64,102,93,92,109,81,65,104,64,35,97,60,36,84,54,40,62,42,35,105,85,76,105,75,52,113,72,43,109,79,54,83,79,80,75,77,77,72,60,59,126,98,87,60,51,46,75,77,77,89,91,90,99,88,78,100,60,32,100,62,40,100,78,72,46,55,68,25,33,45,30,35,38,65,65,63,69,72,72,64,67,68,83,85,86,58,61,62,13,21,24,20,27,31,84,87,86,86,88,88,84,84,82,98,59,30,91,57,37,76,69,70,34,47,60,32,37,47,20,26,28,29,36,38,55,58,57,69,65,66,86,89,89,57,61,62,29,38,40,30,39,41,29,38,41,41,48,51,79,81,81,90,60,38,96,67,50,55,63,74,26,39,54,39,42,44,21,21,19,71,63,49,132,119,112,116,110,104,86,83,79,63,62,59,43,46,44,43,47,45,43,46,45,49,50,49,45,48,45,33,35,35,38,40,39,29,32,30,22,27,35]
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

  // Draw the bottom strip of the video, scaled to ~1600px wide; returns raw ImageData
  function grabStrip(video) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const top = CONFIG.regionTopPct / 100;
    const bottom = CONFIG.regionBottomPct / 100;
    const sy = Math.round(vh * top);
    const sh = Math.max(8, Math.round(vh * (bottom - top)));
    const scale = 1600 / vw;
    const dw = Math.round(vw * scale);
    const dh = Math.round(sh * scale);
    canvas.width = dw;
    canvas.height = dh;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, 0, sy, vw, sh, 0, 0, dw, dh);
    return ctx.getImageData(0, 0, dw, dh); // throws if canvas is tainted
  }

  // Binarize to black text on white paper: only bright white pixels count as text.
  // With killLongRuns, long straight white runs (desk/monitor edges crossing the caption) are erased.
  function binarize(raw, killLongRuns) {
    const w = raw.width, h = raw.height, d = raw.data;
    const ink = new Uint8Array(w * h);
    for (let p = 0, i = 0; p < ink.length; p++, i += 4) {
      ink[p] = Math.min(d[i], d[i + 1], d[i + 2]) > 200 ? 1 : 0;
    }
    if (killLongRuns) {
      const L = CONFIG.longRun;
      for (let y = 0; y < h; y++) {           // horizontal runs
        let x = 0;
        while (x < w) {
          if (ink[y * w + x]) {
            const s0 = x;
            while (x < w && ink[y * w + x]) x++;
            if (x - s0 > L) for (let k = s0; k < x; k++) ink[y * w + k] = 0;
          } else x++;
        }
      }
      const LV = Math.round(L * 1.5);
      for (let x = 0; x < w; x++) {           // vertical runs
        let y = 0;
        while (y < h) {
          if (ink[y * w + x]) {
            const s0 = y;
            while (y < h && ink[y * w + x]) y++;
            if (y - s0 > LV) for (let k = s0; k < y; k++) ink[k * w + x] = 0;
          } else y++;
        }
      }
    }
    const out = ctx.createImageData(w, h);
    const o = out.data;
    for (let p = 0, i = 0; p < ink.length; p++, i += 4) {
      const v = ink[p] ? 0 : 255;
      o[i] = o[i + 1] = o[i + 2] = v;
      o[i + 3] = 255;
    }
    canvas.width = w;
    canvas.height = h;
    ctx.putImageData(out, 0, 0);
    return canvas.toDataURL("image/png");
  }

  // ---------- scene fingerprint (shots without a caption, e.g. the presiding chair) ----------

  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = 160;
  thumbCanvas.height = 90;
  const thumbCtx = thumbCanvas.getContext("2d", { willReadFrequently: true });

  // Whole frame -> 16x9 grid of average colours
  function frameGrid(video) {
    thumbCtx.imageSmoothingEnabled = true;
    thumbCtx.imageSmoothingQuality = "high";
    thumbCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, 160, 90);
    const d = thumbCtx.getImageData(0, 0, 160, 90).data;
    const g = new Float32Array(16 * 9 * 3);
    for (let y = 0; y < 90; y++) {
      for (let x = 0; x < 160; x++) {
        const i = (y * 160 + x) * 4;
        const c = (Math.floor(y / 10) * 16 + Math.floor(x / 10)) * 3;
        g[c] += d[i]; g[c + 1] += d[i + 1]; g[c + 2] += d[i + 2];
      }
    }
    for (let k = 0; k < g.length; k++) g[k] /= 100;
    return g;
  }

  // Robust distance: 40th percentile of per-cell colour differences, so people, hands and
  // gestures covering part of the shot don't matter
  function gridDistance(a, b) {
    const diffs = [];
    for (let c = 0; c < 16 * 9; c++) {
      diffs.push((Math.abs(a[c * 3] - b[c * 3]) + Math.abs(a[c * 3 + 1] - b[c * 3 + 1]) +
                  Math.abs(a[c * 3 + 2] - b[c * 3 + 2])) / 3);
    }
    diffs.sort((x, y) => x - y);
    return diffs[Math.floor(diffs.length * 0.4)];
  }

  function matchScene(video) {
    const g = frameGrid(video);
    for (const [name, ref] of Object.entries(SCENES)) {
      if (gridDistance(g, ref) <= CONFIG.sceneThreshold) return name;
    }
    return "";
  }

  function ocr(image) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "ocr", image }, (r) => { void chrome.runtime.lastError; resolve(r); });
      } catch (e) { resolve(null); }
    });
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

    let raw;
    try {
      raw = grabStrip(video);
    } catch (e) {
      return; // frame not readable
    }
    if (!raw) return;

    state.busy = true;
    let hit = "";
    try {
      // 1) camera shots that are muted without a caption
      hit = matchScene(video);
      // 2) caption, plain reading
      if (!hit) {
        const res = await ocr(binarize(raw, false));
        if (res && res.ok) hit = findKeyword(res.text);
      }
      // 3) caption again with desk/monitor edges removed (white objects crossing the letters)
      if (!hit) {
        const res = await ocr(binarize(raw, true));
        if (res && res.ok) hit = findKeyword(res.text);
      }
    } finally {
      state.busy = false;
    }

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

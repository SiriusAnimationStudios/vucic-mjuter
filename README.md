# Vučić Mjuter

**The only way to not listen to Vučić during Narodna skupština.**

Chrome extension that **mutes a YouTube tab while chosen words appear in the video picture** (e.g. a TV lower-third caption) and **unmutes it when they disappear**.

It reads the bottom of the video with OCR (Tesseract, Serbian Cyrillic + Latin), entirely on your computer. Nothing is sent anywhere.

Works while you're on another tab, with Chrome minimized, or with the window covered.

## Install (2 minutes)

1. On this page click the green **Code** button → **Download ZIP**.
   Unzip it somewhere you won't delete it (e.g. `Documents\vucic-mjuter`). Chrome loads the extension from that folder every time.
2. In Chrome open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** (top left) and select the unzipped folder, the one that directly contains `manifest.json`.
5. Click the puzzle-piece icon next to the address bar and pin **Vučić Mjuter**.
6. Reload any YouTube tab that was already open (F5), play the stream, and click the red icon to watch it work.

To update later: download the new ZIP, replace the folder's contents, and press the reload ↻ button on the extension in `chrome://extensions`.

## Settings (click the extension icon)

| Setting | Default | What it does |
|---|---|---|
| Words | `Вучић`, `Србија побеђује` | Mute when any of these is visible. One per line; Cyrillic and Latin match each other (`Vučić` = `Вучић`). |
| Scan from / to % | 85–100 | Which horizontal strip of the video is read. |
| Text color | Light on dark | Use "Dark on light" for black captions on a light bar. |
| Scan every | 1 s | How often a frame is read. |
| Unmute after | 10 s | Unmute once the words have been gone this long. 0 = stay muted. |
| Tolerate OCR errors | On | Allows a small number of misread letters in longer words. |

The popup shows the exact image the OCR reads and the text it found, so you can adjust the strip if your stream puts captions somewhere else.

If you unmute manually while the words are still on screen, the extension waits until they disappear before it mutes again.

## Timing

- Mutes about 1 s after the caption appears.
- Unmutes about 10 s after it disappears (the delay stops brief OCR misreads, e.g. on a busy background, from unmuting it).

## Credits

OCR by [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0) with Tesseract language data for Serbian.

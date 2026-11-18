// Shared default settings (loaded by popup; content.js keeps its own copy)
const YTM_DEFAULTS = {
  enabled: true,
  keywords: ["Вучић", "Србија побеђује"],
  intervalSec: 1,          // how often a frame is read
  regionTopPct: 85,        // scan from this % of the video height...
  regionBottomPct: 100,    // ...down to this %
  textColor: "light",      // "light" = white text on dark bar, "dark" = dark text on light bar
  unmuteAfterSec: 10,       // unmute after text has been gone this long (0 = stay muted)
  fuzzy: true              // tolerate small OCR errors in longer keywords
};

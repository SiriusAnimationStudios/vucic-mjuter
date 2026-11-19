// Vučić Mjuter popup: the button over the mouth switches the extension on/off.

const toggle = document.getElementById("toggle");
const title = document.getElementById("title");
const stateText = document.getElementById("state");

function render(enabled) {
  const cls = enabled ? "on" : "off";
  toggle.className = cls;
  title.className = cls;
  stateText.textContent = enabled ? "Uključen" : "Isključen";
  toggle.title = enabled ? "Isključi (pusti zvuk)" : "Uključi (utišaj Vučića)";
}

chrome.storage.local.get({ enabled: true }, (s) => render(s.enabled));

toggle.addEventListener("click", () => {
  chrome.storage.local.get({ enabled: true }, (s) => {
    const enabled = !s.enabled;
    chrome.storage.local.set({ enabled });
    render(enabled);
  });
});

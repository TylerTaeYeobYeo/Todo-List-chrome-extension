console.log("Popup script running");

const button = document.getElementById("click-me");
if (button) {
    button.addEventListener("click", () => {
        alert("Button clicked!");
    });
}

const themeSelector = document.getElementById("theme-selector") as HTMLSelectElement;
const STORAGE_THEME_KEY = "bun_theme";

// Load saved theme
chrome.storage.sync.get([STORAGE_THEME_KEY], (result) => {
    const savedTheme = result[STORAGE_THEME_KEY] || "system";
    if (themeSelector) {
        themeSelector.value = savedTheme;
    }
    applyTheme(savedTheme);
});

// Handle change
if (themeSelector) {
    themeSelector.addEventListener("change", (e) => {
        const newTheme = (e.target as HTMLSelectElement).value;
        chrome.storage.sync.set({ [STORAGE_THEME_KEY]: newTheme });
        applyTheme(newTheme);
    });
}

function applyTheme(theme: string) {
    document.body.classList.remove("bun-theme-light", "bun-theme-dark");

    if (theme === "light") {
        document.body.classList.add("bun-theme-light");
    } else if (theme === "dark") {
        document.body.classList.add("bun-theme-dark");
    }
    // 'system' does nothing (removes classes), letting media query take over
}

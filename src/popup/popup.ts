console.log("Popup script running");

interface Todo {
    id: string;
    text: string;
    completed: boolean;
    completedAt?: string;
}

const STORAGE_KEY = "bun_todos";
const doneListBody = document.getElementById("done-todo-list");

// Load and render todos
async function loadAndRenderDoneTodos() {
    if (!doneListBody) return;

    const result = await chrome.storage.sync.get([STORAGE_KEY]);
    const todos: Todo[] = (result[STORAGE_KEY] as Todo[]) || [];
    const doneTodos = todos.filter(todo => todo.completed);

    doneListBody.innerHTML = "";

    if (doneTodos.length === 0) {
        doneListBody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: #999;">No completed tasks</td></tr>`;
        return;
    }

    doneTodos.forEach(todo => {
        const tr = document.createElement("tr");

        const textTd = document.createElement("td");
        textTd.textContent = todo.text;
        textTd.className = "done-todo-text";

        const timeTd = document.createElement("td");
        timeTd.textContent = todo.completedAt || "-";
        timeTd.style.fontSize = "11px";
        timeTd.style.color = "#888";

        const actionTd = document.createElement("td");
        const deleteBtn = document.createElement("button");
        deleteBtn.innerHTML = `&times;`;
        deleteBtn.className = "popup-delete-btn";
        deleteBtn.addEventListener("click", async () => {
            await deleteTodo(todo.id);
        });
        actionTd.appendChild(deleteBtn);

        tr.appendChild(textTd);
        tr.appendChild(timeTd);
        tr.appendChild(actionTd);
        doneListBody.appendChild(tr);
    });
}

async function deleteTodo(id: string) {
    const result = await chrome.storage.sync.get([STORAGE_KEY]);
    const todos: Todo[] = (result[STORAGE_KEY] as Todo[]) || [];
    const updatedTodos = todos.filter(todo => todo.id !== id);
    await chrome.storage.sync.set({ [STORAGE_KEY]: updatedTodos });
    await loadAndRenderDoneTodos();
}

// Initial load
loadAndRenderDoneTodos();

// Listen for storage changes to stay in sync
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[STORAGE_KEY]) {
        loadAndRenderDoneTodos();
    }
});

const themeSelector = document.getElementById("theme-selector") as HTMLSelectElement;
const STORAGE_THEME_KEY = "bun_theme";

// Load saved theme
chrome.storage.sync.get([STORAGE_THEME_KEY], (result) => {
    const savedTheme = (result[STORAGE_THEME_KEY] as string) || "system";
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
    document.body.classList.remove("tytd-theme-light", "tytd-theme-dark");

    if (theme === "light") {
        document.body.classList.add("tytd-theme-light");
    } else if (theme === "dark") {
        document.body.classList.add("tytd-theme-dark");
    }
    // 'system' does nothing (removes classes), letting media query take over
}

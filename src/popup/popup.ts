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
    const container = document.querySelector(".done-list-container");
    if (doneTodos.length === 0) {
        doneListBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #999;">No completed tasks</td></tr>`;


        container?.classList.add("flex");
        return;
    }

    container?.classList.remove("flex");

    doneTodos.forEach(todo => {
        const tr = document.createElement("tr");

        const textTd = document.createElement("td");
        textTd.textContent = todo.text;
        textTd.className = "done-todo-text";
        textTd.title = todo.text; // Add tooltip

        const timeTd = document.createElement("td");
        timeTd.textContent = formatDateForDisplay(todo.completedAt);
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

const themeButtons = document.querySelectorAll(".theme-btn");
const STORAGE_THEME_KEY = "bun_theme";

// Load saved theme
chrome.storage.sync.get([STORAGE_THEME_KEY], (result) => {
    const savedTheme = (result[STORAGE_THEME_KEY] as string) || "system";
    updateActiveButton(savedTheme);
    applyTheme(savedTheme);
});

// Handle clicks
themeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const newTheme = (btn as HTMLElement).dataset.theme || "system";
        chrome.storage.sync.set({ [STORAGE_THEME_KEY]: newTheme });
        updateActiveButton(newTheme);
        applyTheme(newTheme);
    });
});

function updateActiveButton(theme: string) {
    themeButtons.forEach(btn => {
        if ((btn as HTMLElement).dataset.theme === theme) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
}

function applyTheme(theme: string) {
    document.documentElement.classList.remove("tytd-theme-light", "tytd-theme-dark");

    if (theme === "light") {
        document.documentElement.classList.add("tytd-theme-light");
    } else if (theme === "dark") {
        document.documentElement.classList.add("tytd-theme-dark");
    }
    // 'system' does nothing (removes classes), letting media query take over
}

// --- CSV Export / Import ---

const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const downloadSampleBtn = document.getElementById("download-sample-btn");
const fileInput = document.getElementById("import-file") as HTMLInputElement;

if (exportBtn) {
    exportBtn.addEventListener("click", exportDoneTodos);
}

if (downloadSampleBtn) {
    downloadSampleBtn.addEventListener("click", () => {
        const link = document.createElement("a");
        link.href = chrome.runtime.getURL("sample_tasks.csv");
        link.download = "sample_tasks.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

if (importBtn) {
    importBtn.addEventListener("click", () => {
        fileInput?.click();
    });
}

if (fileInput) {
    fileInput.addEventListener("change", (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            importTodos(file);
        }
        // Reset so same file can be selected again
        fileInput.value = "";
    });
}

async function exportDoneTodos() {
    const result = await chrome.storage.sync.get([STORAGE_KEY]);
    const todos: Todo[] = (result[STORAGE_KEY] as Todo[]) || [];
    const doneTodos = todos.filter(t => t.completed);

    if (doneTodos.length === 0) {
        alert("No completed tasks to export.");
        return;
    }

    // CSV Header
    let csvContent = "Task,FinishedAt,Done\n";

    doneTodos.forEach(todo => {
        // Escape quotes in task text
        const safeText = `"${todo.text.replace(/"/g, '""')}"`;
        const date = formatDateForCSV(todo.completedAt);
        csvContent += `${safeText},"${date}",true\n`;
    });

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "todo-export.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function importTodos(file: File) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target?.result as string;
        if (!text) return;

        const lines = text.split("\n");
        const newTodos: Todo[] = [];

        // Skip header if present
        const startIndex = lines[0].toLowerCase().startsWith("task") ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Simple CSV parser (handles quoted strings)
            // Matches: "quoted text", or unquoted properties
            const parts: string[] = [];
            let inQuote = false;
            let current = "";

            for (let char of line) {
                if (char === '"') {
                    inQuote = !inQuote;
                } else if (char === ',' && !inQuote) {
                    parts.push(current);
                    current = "";
                } else {
                    current += char;
                }
            }
            parts.push(current);

            // Clean up parts
            const cleanParts = parts.map(p => p.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

            if (cleanParts.length >= 1) {
                const todoText = cleanParts[0];
                if (!todoText) continue;

                const finishedAt = cleanParts[1] ? new Date(cleanParts[1]).toISOString() : undefined;
                // Import assumes "Done" column exists or defaults to false if missing, 
                // BUT user prompt implies importing "done-todo list", usually implies history?
                // The prompt signature was: (Task: string, finished at?: timestamp, done?: boolean)
                const isDone = cleanParts[2] ? (cleanParts[2].toLowerCase() === "true") : false;

                newTodos.push({
                    id: crypto.randomUUID(),
                    text: todoText,
                    completed: isDone,
                    completedAt: finishedAt
                });
            }
        }

        if (newTodos.length > 0) {
            const result = await chrome.storage.sync.get([STORAGE_KEY]);
            const existingTodos: Todo[] = (result[STORAGE_KEY] as Todo[]) || [];
            const merged = [...existingTodos, ...newTodos];

            await chrome.storage.sync.set({ [STORAGE_KEY]: merged });
            await loadAndRenderDoneTodos();
            alert(`Imported ${newTodos.length} tasks successfully.`);
        } else {
            alert("No valid tasks found in CSV.");
        }
    };
    reader.readAsText(file);
}

// --- Date Helpers ---

function formatDateForDisplay(dateStr?: string): string {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr; // Fallback for legacy strings

    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDateForCSV(dateStr?: string): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

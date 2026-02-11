console.log("Bun Bubble Content Script Loaded");

interface Todo {
    id: string;
    text: string;
    completed: boolean;
}

// State
let todos: Todo[] = [];
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let hasMoved = false; // To distinguish click vs drag

// DOM Elements
let bubbleContainer: HTMLDivElement;
let bubble: HTMLDivElement;
let menu: HTMLDivElement;
let dialogOverlay: HTMLDivElement;
let todoList: HTMLUListElement;

// Constants
const STORAGE_KEY = "bun_todos";
const STORAGE_THEME_KEY = "bun_theme";

async function init() {
    injectStyles();
    await applySavedTheme();
    createBubble();
    createMenu();
    createDialog();
    setupListeners();
    await loadTodos();
}

async function loadTodos() {
    const result = await chrome.storage.sync.get([STORAGE_KEY]);
    todos = (result[STORAGE_KEY] as Todo[]) || [];
    renderTodos();
}

async function saveTodos() {
    await chrome.storage.sync.set({ [STORAGE_KEY]: todos });
    renderTodos();
}

function injectStyles() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("content.css");
    document.head.appendChild(link);
}

function createBubble() {
    bubbleContainer = document.createElement("div");
    bubbleContainer.id = "bun-bubble-container";
    bubbleContainer.classList.add("bun-scope");
    // Apply current theme state immediately?
    // Easier: just re-apply based on current storage or keep state in a variable.
    // But since applySavedTheme is async, we might want to just let the listener handle it or re-read.
    // Optimization: Store current theme in a variable.
    bubbleContainer.style.bottom = "20px";
    bubbleContainer.style.right = "20px";

    bubble = document.createElement("div");
    bubble.className = "bun-bubble";
    // Lightning bolt SVG
    bubble.innerHTML = `
    <svg class="bun-bubble-icon" viewBox="0 0 24 24">
      <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
    </svg>
  `;

    bubbleContainer.appendChild(bubble);
    document.body.appendChild(bubbleContainer);

    // Drag logic
    bubble.addEventListener("mousedown", (e) => {
        isDragging = true;
        hasMoved = false;
        const rect = bubbleContainer.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        bubble.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (e) => {
        if (isDragging) {
            hasMoved = true;
            e.preventDefault();

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const rect = bubbleContainer.getBoundingClientRect();

            let newLeft = e.clientX - dragOffset.x;
            let newTop = e.clientY - dragOffset.y;

            // Clamp horizontal
            if (newLeft < 0) newLeft = 0;
            if (newLeft + rect.width > viewportWidth) newLeft = viewportWidth - rect.width;

            // Clamp vertical
            if (newTop < 0) newTop = 0;
            if (newTop + rect.height > viewportHeight) newTop = viewportHeight - rect.height;

            bubbleContainer.style.bottom = "auto";
            bubbleContainer.style.right = "auto";
            bubbleContainer.style.top = `${newTop}px`;
            bubbleContainer.style.left = `${newLeft}px`;

            updateMenuPosition();
        }
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
        bubble.style.cursor = "grab";
        updateMenuPosition();
    });
}

function createMenu() {
    menu = document.createElement("div");
    menu.className = "bun-menu bun-scope";

    const header = document.createElement("div");
    header.className = "bun-menu-header";
    header.textContent = "My Tasks";

    todoList = document.createElement("ul");
    todoList.className = "bun-todo-list";

    const addButton = document.createElement("button");
    addButton.className = "bun-add-btn";
    addButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
    Add New Task
  `;
    addButton.addEventListener("click", () => {
        showDialog();
        toggleMenu(false);
    });

    menu.appendChild(header);
    menu.appendChild(todoList);
    menu.appendChild(addButton);

    document.body.appendChild(menu);
}

function updateMenuPosition() {
    if (!menu.classList.contains("visible") || !bubble) return;

    const bubbleRect = bubble.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 12;

    // Vertical Positioning
    const spaceAbove = bubbleRect.top;
    const spaceBelow = viewportHeight - bubbleRect.bottom;
    const menuHeight = menuRect.height || 300; // Fallback if not yet rendered

    // Prefer above if space allows, otherwise below.
    // However, if neither fits, pick the one with MORE space.
    let top = 0;

    // Default to above
    if (spaceAbove >= menuHeight + gap) {
        top = bubbleRect.top - menuHeight - gap;
    }
    // If not enough space above, try below
    else if (spaceBelow >= menuHeight + gap) {
        top = bubbleRect.bottom + gap;
    }
    // If neither fits, prefer the side with more space and clamp
    else {
        if (spaceAbove > spaceBelow) {
            top = gap; // Stick to top edge
            // potentially limit height?
            menu.style.maxHeight = `${spaceAbove - gap * 2}px`;
        } else {
            top = bubbleRect.bottom + gap;
            menu.style.maxHeight = `${spaceBelow - gap * 2}px`;
        }
    }

    // Normalize top
    if (top < gap) top = gap;
    if (top + menuHeight > viewportHeight - gap) top = viewportHeight - menuHeight - gap;

    menu.style.top = `${top}px`;
    menu.style.bottom = "auto";


    // Horizontal Positioning
    // Align center with bubble, then clamp
    const bubbleCenter = bubbleRect.left + bubbleRect.width / 2;
    let left = bubbleCenter - (menuRect.width / 2);

    // Clamp horizontal
    if (left < gap) left = gap;
    if (left + menuRect.width > viewportWidth - gap) left = viewportWidth - menuRect.width - gap;

    menu.style.left = `${left}px`;
    menu.style.right = "auto";
}

function createDialog() {
    dialogOverlay = document.createElement("div");
    dialogOverlay.className = "bun-dialog-overlay bun-scope";

    const dialog = document.createElement("div");
    dialog.className = "bun-dialog";

    const title = document.createElement("h3");
    title.textContent = "Add New Task";

    const input = document.createElement("input");
    input.className = "bun-input";
    input.type = "text";
    input.placeholder = "What needs to be done?";

    const actions = document.createElement("div");
    actions.className = "bun-dialog-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "bun-btn bun-btn-cancel";
    cancelBtn.textContent = "Cancel";

    const addBtn = document.createElement("button");
    addBtn.className = "bun-btn bun-btn-primary";
    addBtn.textContent = "Add";

    actions.appendChild(cancelBtn);
    actions.appendChild(addBtn);
    dialog.appendChild(title);
    dialog.appendChild(input);
    dialog.appendChild(actions);
    dialogOverlay.appendChild(dialog);

    document.body.appendChild(dialogOverlay);

    // Dialog Logic
    const closeDialog = () => {
        dialogOverlay.classList.remove("visible");
        input.value = "";
    };

    const submit = async () => {
        if (input.value.trim()) {
            const newTodo: Todo = {
                id: Date.now().toString(),
                text: input.value.trim(),
                completed: false
            };
            todos.push(newTodo);
            await saveTodos();
            closeDialog();
        }
    };

    cancelBtn.addEventListener("click", closeDialog);
    addBtn.addEventListener("click", submit);

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") closeDialog();
    });

    dialogOverlay.addEventListener("click", (e) => {
        if (e.target === dialogOverlay) closeDialog();
    });
}

function setupListeners() {
    bubble.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!hasMoved) {
            toggleMenu();
        }
    });

    // Prevent clicks inside the menu from closing it via the document listener
    menu.addEventListener("click", (e) => {
        e.stopPropagation();
    });

    // Close menu when clicking outside
    document.addEventListener("click", () => {
        if (menu && menu.classList.contains("visible")) {
            toggleMenu(false);
        }
    });

    // Listen for storage changes from other tabs
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync") {
            if (changes[STORAGE_KEY]) {
                todos = (changes[STORAGE_KEY].newValue as Todo[]) || [];
                renderTodos();
            }
            if (changes[STORAGE_THEME_KEY]) {
                applyThemeToScope((changes[STORAGE_THEME_KEY].newValue as string) || "system");
            }
        }
    });

    window.addEventListener("resize", () => {
        updateBubblePosition();
        updateMenuPosition();
    });
}

function updateBubblePosition() {
    if (!bubbleContainer) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rect = bubbleContainer.getBoundingClientRect();
    const gap = 20;

    // Only clamp if it was moved (top/left are set)
    if (bubbleContainer.style.top !== "auto" || bubbleContainer.style.left !== "auto") {
        let newTop = rect.top;
        let newLeft = rect.left;

        if (newLeft + rect.width > viewportWidth - gap) {
            newLeft = viewportWidth - rect.width - gap;
        }
        if (newTop + rect.height > viewportHeight - gap) {
            newTop = viewportHeight - rect.height - gap;
        }

        // Clamp to positive space too
        if (newLeft < gap) newLeft = gap;
        if (newTop < gap) newTop = gap;

        bubbleContainer.style.top = `${newTop}px`;
        bubbleContainer.style.left = `${newLeft}px`;
    }
}

async function applySavedTheme() {
    const result = await chrome.storage.sync.get([STORAGE_THEME_KEY]);
    const theme = (result[STORAGE_THEME_KEY] as string) || "system";
    applyThemeToScope(theme);
}

function applyThemeToScope(theme: string) {
    // We need to apply this to all existing scopes.
    // Currently we have bubble container and dialog overlay.
    // We can query them by class .bun-scope
    const scopes = document.querySelectorAll(".bun-scope");
    scopes.forEach(el => {
        el.classList.remove("bun-theme-light", "bun-theme-dark");
        if (theme === "light") el.classList.add("bun-theme-light");
        if (theme === "dark") el.classList.add("bun-theme-dark");
    });
}

function toggleMenu(force?: boolean) {
    const isVisible = menu.classList.contains("visible");
    const shouldBeVisible = force !== undefined ? force : !isVisible;

    if (shouldBeVisible) {
        menu.classList.add("visible");
        // Reset height limits before measuring
        menu.style.maxHeight = "";
        updateMenuPosition();
    } else {
        menu.classList.remove("visible");
    }
}

function showDialog() {
    dialogOverlay.classList.add("visible");
    const input = dialogOverlay.querySelector("input");
    if (input) input.focus();
}

function renderTodos() {
    if (!todoList) return;
    todoList.innerHTML = "";

    if (todos.length === 0) {
        const empty = document.createElement("li");
        empty.className = "bun-todo-item";
        empty.textContent = "No tasks yet!";
        empty.style.color = "#999";
        empty.style.justifyContent = "center";
        todoList.appendChild(empty);
        return;
    }

    todos.forEach(todo => {
        const li = document.createElement("li");
        li.className = "bun-todo-item";

        const text = document.createElement("span");
        text.className = "bun-todo-text";
        text.textContent = todo.text;

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "bun-delete-btn";
        deleteBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
        deleteBtn.addEventListener("click", async () => {
            todos = todos.filter(t => t.id !== todo.id);
            await saveTodos();
        });

        li.appendChild(text);
        li.appendChild(deleteBtn);
        todoList.appendChild(li);
    });
}

init();

console.log("Bun Bubble Content Script Loaded");

interface Todo {
    id: string;
    text: string;
    completed: boolean;
    completedAt?: string;
}

// State
let todos: Todo[] = [];
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

let hasMoved = false; // To distinguish click vs drag
let draggedItemIndex: number | null = null;
let autoHideTimer: any;
const AUTO_HIDE_DELAY = 5 * 1000;

// DOM Elements
let bubbleContainer: HTMLDivElement;
let bubble: HTMLDivElement;
let menu: HTMLDivElement;
let dialogOverlay: HTMLDivElement;
let todoList: HTMLUListElement;
let editingTodo: Todo | null = null;

// Constants
const STORAGE_KEY = "bun_todos";
const STORAGE_THEME_KEY = "bun_theme";
const STORAGE_POS_KEY = "tytd_bubble_pos";

async function init() {
    injectStyles();
    await applySavedTheme();
    await createBubble();
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

async function createBubble() {
    bubbleContainer = document.createElement("div");
    bubbleContainer.id = "tytd-bubble-container";
    bubbleContainer.classList.add("tytd-scope");

    // Load saved position
    const result = await chrome.storage.sync.get([STORAGE_POS_KEY]);
    const savedPos = result[STORAGE_POS_KEY];

    if (savedPos) {
        try {
            // savedPos is already an object if coming from storage.sync, 
            // but we should check type or parse if we stored as string.
            // In pinToNearestCorner we will store as object.
            const pos = typeof savedPos === 'string' ? JSON.parse(savedPos) : savedPos;

            bubbleContainer.style.top = `${pos.top}px`;
            bubbleContainer.style.left = `${pos.left}px`;
            bubbleContainer.style.bottom = "auto";
            bubbleContainer.style.right = "auto";
        } catch (e) {
            bubbleContainer.style.bottom = "20px";
            bubbleContainer.style.right = "20px";
        }
    } else {
        bubbleContainer.style.bottom = "20px";
        bubbleContainer.style.right = "20px";
    }

    bubble = document.createElement("div");
    bubble.className = "tytd-bubble";
    // Lightning bolt SVG
    bubble.innerHTML = `
    <svg class="tytd-bubble-icon" viewBox="0 0 24 24">
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
        if (isDragging) {
            isDragging = false;
            bubble.style.cursor = "grab";
            pinToNearestCorner();
        }
    });
}

function createMenu() {
    menu = document.createElement("div");
    menu.className = "tytd-menu tytd-scope";

    const header = document.createElement("div");
    header.className = "tytd-menu-header";
    header.textContent = "My Tasks";

    todoList = document.createElement("ul");
    todoList.className = "tytd-todo-list";

    const addButton = document.createElement("button");
    addButton.className = "tytd-add-btn";
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

    if (bubbleContainer) {
        bubbleContainer.appendChild(menu);
    }
}

function updateMenuPosition(targetRect?: { top: number, left: number, width: number, height: number } | DOMRect) {
    if (!menu.classList.contains("visible") || !bubbleContainer) return;

    const containerRect = targetRect || bubbleContainer.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 20;
    const screenPadding = 20;

    // Use offsetDimensions to avoid transform skewing from animations
    const menuHeight = menu.offsetHeight || menuRect.height || 300;
    const menuWidth = menu.offsetWidth || menuRect.width || 250;

    // Vertical Positioning
    const spaceAbove = containerRect.top;
    const spaceBelow = viewportHeight - (containerRect.top + containerRect.height);

    let relativeTop = 0;

    // Decide if above or below based on space
    if (spaceAbove >= menuHeight + gap) {
        relativeTop = -menuHeight - gap;
    } else if (spaceBelow >= menuHeight + gap) {
        relativeTop = containerRect.height + gap;
    } else {
        // Fallback: use side with more space
        if (spaceAbove > spaceBelow) {
            relativeTop = -menuHeight - gap;
            menu.style.maxHeight = `${spaceAbove - gap * 2}px`;
        } else {
            relativeTop = containerRect.height + gap;
            menu.style.maxHeight = `${spaceBelow - gap * 2}px`;
        }
    }

    // Horizontal Positioning (Relative to container)
    // Align center with container (bubble)
    let relativeLeft = (containerRect.width / 2) - (menuWidth / 2);

    // Global clamping check (to ensure it doesn't go off-screen)
    const absoluteLeft = containerRect.left + relativeLeft;
    if (absoluteLeft < screenPadding) {
        relativeLeft = screenPadding - containerRect.left;
    } else if (absoluteLeft + menuWidth > viewportWidth - screenPadding) {
        relativeLeft = (viewportWidth - screenPadding - menuWidth) - containerRect.left;
    }

    const absoluteTop = containerRect.top + relativeTop;
    if (absoluteTop < screenPadding) {
        relativeTop = screenPadding - containerRect.top;
    } else if (absoluteTop + menuHeight > viewportHeight - screenPadding) {
        relativeTop = (viewportHeight - screenPadding - menuHeight) - containerRect.top;
    }

    menu.style.top = `${relativeTop}px`;
    menu.style.left = `${relativeLeft}px`;
    menu.style.bottom = "auto";
    menu.style.right = "auto";
}

function createDialog() {
    dialogOverlay = document.createElement("div");
    dialogOverlay.className = "tytd-dialog-overlay tytd-scope";

    const dialog = document.createElement("div");
    dialog.className = "tytd-dialog";

    const title = document.createElement("h3");
    title.textContent = "Add New Task";

    const input = document.createElement("textarea");
    input.className = "tytd-input";
    // input.type = "text"; // Textarea does not have type attribute
    input.placeholder = "What needs to be done? (Shift+Enter for new line)";

    const actions = document.createElement("div");
    actions.className = "tytd-dialog-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "tytd-btn tytd-btn-cancel";
    cancelBtn.textContent = "Cancel";

    const addBtn = document.createElement("button");
    addBtn.className = "tytd-btn tytd-btn-primary";
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
        const text = input.value.trim();
        if (text) {
            if (editingTodo) {
                editingTodo.text = text;
            } else {
                const newTodo: Todo = {
                    id: Date.now().toString(),
                    text: text,
                    completed: false
                };
                todos.push(newTodo);
            }
            await saveTodos();
            closeDialog();
        }
    };

    cancelBtn.addEventListener("click", closeDialog);
    addBtn.addEventListener("click", submit);

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault(); // Prevent newline in textarea
            submit();
        }
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
        pinToNearestCorner();
        updateMenuPosition();
    });

    // Auto-hide listeners
    document.addEventListener("mousemove", resetAutoHideTimer);
    document.addEventListener("keydown", resetAutoHideTimer);
    document.addEventListener("click", resetAutoHideTimer);
    document.addEventListener("scroll", resetAutoHideTimer);
    resetAutoHideTimer();
}

function pinToNearestCorner() {
    if (!bubbleContainer) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rect = bubbleContainer.getBoundingClientRect();
    const margin = 20;

    const bubbleMidX = rect.left + rect.width / 2;
    const bubbleMidY = rect.top + rect.height / 2;

    const isLeft = bubbleMidX < viewportWidth / 2;
    const isTop = bubbleMidY < viewportHeight / 2;

    let targetLeft = isLeft ? margin : viewportWidth - rect.width - margin;
    let targetTop = isTop ? margin : viewportHeight - rect.height - margin;

    // Apply smooth pinning
    bubbleContainer.classList.add("tytd-pinning");
    menu.classList.add("tytd-pinning");
    bubbleContainer.style.top = `${targetTop}px`;
    bubbleContainer.style.left = `${targetLeft}px`;
    bubbleContainer.style.bottom = "auto";
    bubbleContainer.style.right = "auto";

    // Update menu position based on the NEW container target
    // We pass the destination rect so the menu calculates its safety bounds for the corner.
    updateMenuPosition({
        top: targetTop,
        left: targetLeft,
        width: rect.width,
        height: rect.height
    });

    // Save position
    const posData = {
        top: targetTop,
        left: targetLeft
    };

    // Use chrome.storage.sync instead of localStorage
    // We catch errors to handle quota exceeded or other storage issues
    // Also check if runtime is valid to avoid "Extension context invalidated"
    if (chrome.runtime?.id) {
        chrome.storage.sync.set({ [STORAGE_POS_KEY]: posData }).catch((err) => {
            console.warn("Failed to save bubble position:", err);
        });
    }

    // Clean up transition class after it finishes
    setTimeout(() => {
        bubbleContainer.classList.remove("tytd-pinning");
        menu.classList.remove("tytd-pinning");
    }, 300);
}

function updateBubblePosition() {
    // Redundant now that pinning handles it on resize, 
    // but kept as a simple safety clamp if called manually.
    pinToNearestCorner();
}

async function applySavedTheme() {
    const result = await chrome.storage.sync.get([STORAGE_THEME_KEY]);
    const theme = (result[STORAGE_THEME_KEY] as string) || "system";
    applyThemeToScope(theme);
}

function applyThemeToScope(theme: string) {
    // We need to apply this to all existing scopes.
    // Currently we have bubble container and dialog overlay.
    // We can query them by class .tytd-scope
    const scopes = document.querySelectorAll(".tytd-scope");
    scopes.forEach(el => {
        el.classList.remove("tytd-theme-light", "tytd-theme-dark");
        if (theme === "light") el.classList.add("tytd-theme-light");
        if (theme === "dark") el.classList.add("tytd-theme-dark");
    });
}

function toggleMenu(force?: boolean) {
    const isVisible = menu.classList.contains("visible");
    const shouldBeVisible = force !== undefined ? force : !isVisible;

    if (shouldBeVisible) {
        menu.classList.add("visible");
        // Reset height limits before measuring
        menu.style.maxHeight = "";
        
        // Immediate update (might be slightly off due to animation scale)
        updateMenuPosition();
        
        // Update again after next paint to ensure correct dimensions are caught
        requestAnimationFrame(() => {
            updateMenuPosition();
        });
    } else {
        menu.classList.remove("visible");
    }
}

function showDialog(todo?: Todo) {
    editingTodo = todo || null;
    dialogOverlay.classList.add("visible");
    const title = dialogOverlay.querySelector("h3");

    const input = dialogOverlay.querySelector("textarea") as HTMLTextAreaElement;
    const submitBtn = dialogOverlay.querySelector(".tytd-btn-primary");

    if (title) title.textContent = editingTodo ? "Edit Task" : "Add New Task";
    if (input) {
        input.value = editingTodo ? editingTodo.text : "";
        input.focus();
    }
    if (submitBtn) submitBtn.textContent = editingTodo ? "Save" : "Add";
}

function renderTodos() {
    if (!todoList) return;
    todoList.innerHTML = "";

    const activeTodos = todos.filter(t => !t.completed);
    updateBubbleIcon(activeTodos.length);

    if (activeTodos.length === 0) {
        const empty = document.createElement("li");
        empty.className = "tytd-todo-item";
        empty.textContent = "No tasks yet!";
        empty.style.color = "#999";
        empty.style.justifyContent = "center";
        todoList.appendChild(empty);
        return;
    }

    activeTodos.forEach((todo, index) => {
        const li = document.createElement("li");
        li.className = "tytd-todo-item";

        // Drag and Drop
        li.draggable = true;

        li.addEventListener("dragstart", (e) => {
            draggedItemIndex = index;
            li.classList.add("dragging");
            // e.dataTransfer!.effectAllowed = 'move';
        });

        li.addEventListener("dragend", () => {
            li.classList.remove("dragging");
            draggedItemIndex = null;
            // Remove all drag-over classes
            document.querySelectorAll(".tytd-todo-item").forEach(item => {
                item.classList.remove("drag-over-top");
                item.classList.remove("drag-over-bottom");
            });
        });

        li.addEventListener("dragover", (e) => {
            e.preventDefault(); // Allow drop
            if (draggedItemIndex === null || draggedItemIndex === index) return;

            const rect = li.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            li.classList.remove("drag-over-top", "drag-over-bottom");

            if (e.clientY < midpoint) {
                li.classList.add("drag-over-top");
            } else {
                li.classList.add("drag-over-bottom");
            }
        });

        li.addEventListener("dragleave", () => {
            li.classList.remove("drag-over-top", "drag-over-bottom");
        });

        li.addEventListener("drop", async (e) => {
            e.preventDefault();
            li.classList.remove("drag-over-top", "drag-over-bottom");

            if (draggedItemIndex === null || draggedItemIndex === index) return;

            const rect = li.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const dropAfter = e.clientY >= midpoint;

            // Reorder activeTodos
            const itemToMove = activeTodos[draggedItemIndex];

            // Remove item
            activeTodos.splice(draggedItemIndex, 1);

            // Calculate insertion index
            // If we removed an item before the target, the target index shifts down by 1.
            let insertIndex = index;
            if (draggedItemIndex < index) {
                insertIndex--;
            }

            if (dropAfter) {
                insertIndex++;
            }

            activeTodos.splice(insertIndex, 0, itemToMove);

            // Reconstruct full todos list (active + completed)
            const completedTodos = todos.filter(t => t.completed);
            todos = [...activeTodos, ...completedTodos];

            await saveTodos();
        });

        const text = document.createElement("span");
        text.className = "tytd-todo-text";
        text.textContent = todo.text;
        text.title = todo.text; // Add tooltip

        const actionButtons = document.createElement("div");
        actionButtons.style.display = "flex";
        actionButtons.style.gap = "4px";

        const doneBtn = document.createElement("button");
        doneBtn.className = "tytd-done-btn";
        doneBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
        doneBtn.addEventListener("click", async () => {
            todo.completed = true;
            todo.completedAt = new Date().toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            await saveTodos();
        });

        const editBtn = document.createElement("button");
        editBtn.className = "tytd-edit-btn";
        editBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    `;
        editBtn.addEventListener("click", () => {
            showDialog(todo);
            toggleMenu(false);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "tytd-delete-btn";
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
        actionButtons.appendChild(doneBtn);
        actionButtons.appendChild(editBtn);
        actionButtons.appendChild(deleteBtn);
        li.appendChild(actionButtons);
        todoList.appendChild(li);
    });

    // Update position in case height changed
    requestAnimationFrame(() => updateMenuPosition());
}

init();

function resetAutoHideTimer() {
    clearTimeout(autoHideTimer);
    if (bubbleContainer) {
        bubbleContainer.classList.remove("tytd-hidden");
    }

    // Only set timer if menu is NOT visible
    // Also check if dragging? Usually dragging implies mousemove, so timer resets.
    if (menu && !menu.classList.contains("visible") && !isDragging) {
        autoHideTimer = setTimeout(() => {
            if (bubbleContainer) {
                bubbleContainer.classList.add("tytd-hidden");
            }
        }, AUTO_HIDE_DELAY);
    }
}

function updateBubbleIcon(count: number) {
    if (!bubble) return;

    if (count > 1) {
        bubble.innerHTML = `<span style="font-size: 24px; color: white;">${count}</span>`;
    } else {
        // Default lightning bolt
        bubble.innerHTML = `
        <svg class="tytd-bubble-icon" viewBox="0 0 24 24">
          <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
        </svg>
      `;
    }
}

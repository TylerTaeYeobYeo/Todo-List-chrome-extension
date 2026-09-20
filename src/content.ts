// @ts-ignore - Bun loads the stylesheet as text for Shadow DOM injection.
import contentCss from "./content.css" with { type: "text" };
import {
    applyCornerPosition,
    updateMenuPosition as calculateMenuPosition,
    DEFAULT_BUBBLE_CORNER,
    getNearestCorner,
    isBubbleCorner,
} from "./content/positioning";
import {
    getStorageValue,
    loadTodos as loadStoredTodos,
    saveTodos as persistTodos,
    saveBubbleCorner,
    STORAGE_KEYS,
} from "./content/storage";
import { renderTodos as renderTodoList } from "./content/todos";
import type { Todo } from "./content/types";

const AUTO_HIDE_DELAY = 5_000;

let todos: Todo[] = [];
let isDragging = false;
let hasMoved = false;
let draggedItemIndex: number | null = null;
let autoHideTimer: ReturnType<typeof setTimeout> | undefined;
let editingTodo: Todo | null = null;
let bubbleCorner = DEFAULT_BUBBLE_CORNER;

let shadowRoot: ShadowRoot;
let dragOffset = { x: 0, y: 0 };
let bubbleContainer: HTMLDivElement;
let bubble: HTMLDivElement;
let menu: HTMLDivElement;
let dialogOverlay: HTMLDivElement;
let todoList: HTMLUListElement;

async function init(): Promise<void> {
  const shadowHost = document.createElement("div");
  document.body.appendChild(shadowHost);
  shadowRoot = shadowHost.attachShadow({ mode: "closed" });

  injectStyles();
  await createBubble();
  createMenu();
  createDialog();
  await applySavedTheme();
  setupListeners();
  await loadTodos();
}

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = contentCss;
  shadowRoot.appendChild(style);
}

async function createBubble(): Promise<void> {
  bubbleContainer = document.createElement("div");
  bubbleContainer.id = "tytd-bubble-container";
  bubbleContainer.className = "tytd-scope";

  const savedPosition = await getStorageValue<unknown>(
    STORAGE_KEYS.bubblePosition,
    null,
  );
  if (savedPosition) {
    try {
      const position =
        typeof savedPosition === "string"
          ? JSON.parse(savedPosition)
          : savedPosition;
      if (isBubbleCorner(position.corner)) bubbleCorner = position.corner;
    } catch {
      bubbleCorner = DEFAULT_BUBBLE_CORNER;
    }
  }

  applyCornerPosition(bubbleContainer, bubbleCorner);
  bubble = document.createElement("div");
  bubble.className = "tytd-bubble";
  bubble.title = "Toggle Tasks";
  bubble.innerHTML = `<svg class="tytd-bubble-icon" viewBox="0 0 24 24"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>`;
  bubbleContainer.appendChild(bubble);
  shadowRoot.appendChild(bubbleContainer);
  setupBubbleDrag();
}

function setupBubbleDrag(): void {
  bubble.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    isDragging = true;
    hasMoved = false;
    const rect = bubbleContainer.getBoundingClientRect();
    dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    bubble.style.cursor = "grabbing";
  });

  window.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    hasMoved = true;
    event.preventDefault();

    const rect = bubbleContainer.getBoundingClientRect();
    const left = Math.min(
      Math.max(event.clientX - dragOffset.x, 0),
      window.innerWidth - rect.width,
    );
    const top = Math.min(
      Math.max(event.clientY - dragOffset.y, 0),
      window.innerHeight - rect.height,
    );

    bubbleContainer.style.top = `${top}px`;
    bubbleContainer.style.left = `${left}px`;
    bubbleContainer.style.bottom = "auto";
    bubbleContainer.style.right = "auto";
    updateMenuPosition();
  });

  const finishDrag = (): void => {
    if (!isDragging) return;
    isDragging = false;
    bubble.style.cursor = "grab";
    pinToNearestCorner();
  };

  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);
}

function createMenu(): void {
  menu = document.createElement("div");
  menu.className = "tytd-menu tytd-scope";

  const header = document.createElement("div");
  header.className = "tytd-menu-header";
  header.textContent = "My Tasks";

  todoList = document.createElement("ul");
  todoList.className = "tytd-todo-list";

  const addButton = document.createElement("button");
  addButton.className = "tytd-add-btn";
  addButton.title = "Add New Task";
  addButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>Add New Task`;
  addButton.addEventListener("click", () => {
    showDialog();
    toggleMenu(false);
  });

  menu.append(header, todoList, addButton);
  bubbleContainer.appendChild(menu);
}

function updateMenuPosition(
  targetRect?:
    | DOMRect
    | { top: number; left: number; width: number; height: number },
): void {
  calculateMenuPosition(menu, bubbleContainer, targetRect);
}

function createDialog(): void {
  dialogOverlay = document.createElement("div");
  dialogOverlay.className = "tytd-dialog-overlay tytd-scope";

  const dialog = document.createElement("div");
  dialog.className = "tytd-dialog";
  const title = document.createElement("h3");
  title.textContent = "Add New Task";
  const input = document.createElement("textarea");
  input.className = "tytd-input";
  input.placeholder = "What needs to be done? (Shift+Enter for new line)";

  const actions = document.createElement("div");
  actions.className = "tytd-dialog-actions";
  const cancelButton = document.createElement("button");
  cancelButton.className = "tytd-btn tytd-btn-cancel";
  cancelButton.textContent = "Cancel";
  const addButton = document.createElement("button");
  addButton.className = "tytd-btn tytd-btn-primary";
  addButton.textContent = "Add";

  actions.append(cancelButton, addButton);
  dialog.append(title, input, actions);
  dialogOverlay.appendChild(dialog);
  shadowRoot.appendChild(dialogOverlay);

  const closeDialog = (): void => {
    editingTodo = null;
    dialogOverlay.classList.remove("visible");
    input.value = "";
  };
  const submit = async (): Promise<void> => {
    const text = input.value.trim();
    if (!text) return;
    if (editingTodo) {
      editingTodo.text = text;
    } else {
      todos.push({ id: Date.now().toString(), text, completed: false });
    }
    await saveTodos();
    closeDialog();
  };

  cancelButton.addEventListener("click", closeDialog);
  addButton.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
    if (event.key === "Escape") closeDialog();
  });
  dialogOverlay.addEventListener("click", (event) => {
    if (event.target === dialogOverlay) closeDialog();
  });
}

function setupListeners(): void {
  bubble.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!hasMoved) toggleMenu();
  });
  menu.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => toggleMenu(false));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes[STORAGE_KEYS.todos]) {
      todos = (changes[STORAGE_KEYS.todos].newValue as Todo[]) || [];
      renderTodos();
    }
    if (changes[STORAGE_KEYS.theme]) {
      applyThemeToScope(
        (changes[STORAGE_KEYS.theme].newValue as string) || "system",
      );
    }
  });

  window.addEventListener("resize", () => {
    applyCornerPosition(bubbleContainer, bubbleCorner);
    updateMenuPosition();
  });
  document.addEventListener("mousemove", resetAutoHideTimer);
  document.addEventListener("keydown", resetAutoHideTimer);
  document.addEventListener("click", resetAutoHideTimer);
  document.addEventListener("scroll", resetAutoHideTimer);
  resetAutoHideTimer();
}

function pinToNearestCorner(): void {
  bubbleCorner = getNearestCorner(
    bubbleContainer,
    window.innerWidth,
    window.innerHeight,
  );
  bubbleContainer.classList.add("tytd-pinning");
  menu.classList.add("tytd-pinning");
  applyCornerPosition(bubbleContainer, bubbleCorner);
  const targetRect = bubbleContainer.getBoundingClientRect();
  updateMenuPosition(targetRect);

  if (chrome.runtime?.id) {
    saveBubbleCorner(bubbleCorner).catch((error) => {
      console.warn("Failed to save bubble position:", error);
    });
  }
  window.setTimeout(() => {
    bubbleContainer.classList.remove("tytd-pinning");
    menu.classList.remove("tytd-pinning");
  }, 300);
}

async function loadTodos(): Promise<void> {
  todos = await loadStoredTodos();
  renderTodos();
}

async function saveTodos(): Promise<void> {
  await persistTodos(todos);
  renderTodos();
}

function renderTodos(): void {
  renderTodoList({
    todoList,
    getTodos: () => todos,
    setTodos: (nextTodos) => {
      todos = nextTodos;
    },
    getDraggedIndex: () => draggedItemIndex,
    setDraggedIndex: (index) => {
      draggedItemIndex = index;
    },
    saveTodos,
    showDialog,
    toggleMenu,
    updateMenuPosition: () => updateMenuPosition(),
    updateBubbleIcon,
  });
}

async function applySavedTheme(): Promise<void> {
  const theme = await getStorageValue(STORAGE_KEYS.theme, "system");
  applyThemeToScope(theme);
}

function applyThemeToScope(theme: string): void {
  shadowRoot.querySelectorAll(".tytd-scope").forEach((scope) => {
    scope.classList.remove("tytd-theme-light", "tytd-theme-dark");
    if (theme === "light") scope.classList.add("tytd-theme-light");
    if (theme === "dark") scope.classList.add("tytd-theme-dark");
  });
}

function toggleMenu(force?: boolean): void {
  const shouldShow = force ?? !menu.classList.contains("visible");
  if (!shouldShow) {
    menu.classList.remove("visible");
    return;
  }
  menu.classList.add("visible");
  menu.style.maxHeight = "";
  updateMenuPosition();
  requestAnimationFrame(() => updateMenuPosition());
}

function showDialog(todo?: Todo): void {
  editingTodo = todo ?? null;
  dialogOverlay.classList.add("visible");
  const title = dialogOverlay.querySelector("h3");
  const input = dialogOverlay.querySelector("textarea") as HTMLTextAreaElement;
  const submitButton = dialogOverlay.querySelector(".tytd-btn-primary");
  if (title) title.textContent = editingTodo ? "Edit Task" : "Add New Task";
  if (input) {
    input.value = editingTodo?.text ?? "";
    input.focus();
  }
  if (submitButton) submitButton.textContent = editingTodo ? "Save" : "Add";
}

function resetAutoHideTimer(): void {
  clearTimeout(autoHideTimer);
  bubbleContainer?.classList.remove("tytd-hidden");
  if (menu && !menu.classList.contains("visible") && !isDragging) {
    autoHideTimer = setTimeout(() => {
      bubbleContainer?.classList.add("tytd-hidden");
    }, AUTO_HIDE_DELAY);
  }
}

function updateBubbleIcon(count: number): void {
  if (!bubble) return;
  bubble.innerHTML = `<svg class="tytd-bubble-icon" viewBox="0 0 24 24"${count > 0 ? ' style="width: 20px;"' : ""}><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>${count > 0 ? `<span style="font-size: 20px; line-height: 30px; color: white;">${count}</span>` : ""}`;
}

init().catch((error) =>
  console.error("Failed to initialize content script", error),
);

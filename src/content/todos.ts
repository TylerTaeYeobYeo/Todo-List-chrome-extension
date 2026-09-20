import type { Todo } from "./types";

export interface TodoRendererOptions {
  todoList: HTMLUListElement;
  getTodos: () => Todo[];
  setTodos: (todos: Todo[]) => void;
  getDraggedIndex: () => number | null;
  setDraggedIndex: (index: number | null) => void;
  saveTodos: () => Promise<void>;
  showDialog: (todo?: Todo) => void;
  toggleMenu: (force?: boolean) => void;
  updateMenuPosition: () => void;
  updateBubbleIcon: (count: number) => void;
}

export function renderTodos(options: TodoRendererOptions): void {
  const { todoList } = options;
  todoList.replaceChildren();

  const todos = options.getTodos();
  const activeTodos = todos.filter((todo) => !todo.completed);
  options.updateBubbleIcon(activeTodos.length);

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
    const listItem = createTodoItem(todo, index, activeTodos, options);
    todoList.appendChild(listItem);
  });

  requestAnimationFrame(options.updateMenuPosition);
}

function createTodoItem(
  todo: Todo,
  index: number,
  activeTodos: Todo[],
  options: TodoRendererOptions,
): HTMLLIElement {
  const listItem = document.createElement("li");
  listItem.className = "tytd-todo-item";
  listItem.draggable = true;

  listItem.addEventListener("dragstart", () => {
    options.setDraggedIndex(index);
    listItem.classList.add("dragging");
  });

  listItem.addEventListener("dragend", () => {
    listItem.classList.remove("dragging");
    options.setDraggedIndex(null);
    clearDragIndicators(options.todoList);
  });

  listItem.addEventListener("dragover", (event) => {
    event.preventDefault();
    const draggedIndex = options.getDraggedIndex();
    if (draggedIndex === null || draggedIndex === index) return;

    const midpoint = getElementMidpoint(listItem);
    listItem.classList.remove("drag-over-top", "drag-over-bottom");
    listItem.classList.add(
      event.clientY < midpoint ? "drag-over-top" : "drag-over-bottom",
    );
  });

  listItem.addEventListener("dragleave", () => {
    listItem.classList.remove("drag-over-top", "drag-over-bottom");
  });

  listItem.addEventListener("drop", async (event) => {
    event.preventDefault();
    listItem.classList.remove("drag-over-top", "drag-over-bottom");

    const draggedIndex = options.getDraggedIndex();
    if (draggedIndex === null || draggedIndex === index) return;

    const itemToMove = activeTodos[draggedIndex];
    activeTodos.splice(draggedIndex, 1);

    let insertIndex = index;
    if (draggedIndex < index) insertIndex--;
    if (event.clientY >= getElementMidpoint(listItem)) insertIndex++;

    activeTodos.splice(insertIndex, 0, itemToMove);
    options.setTodos([
      ...activeTodos,
      ...options.getTodos().filter((item) => item.completed),
    ]);
    await options.saveTodos();
  });

  const text = document.createElement("span");
  text.className = "tytd-todo-text";
  text.textContent = todo.text;
  text.title = todo.text;

  const actionButtons = document.createElement("div");
  actionButtons.style.display = "flex";
  actionButtons.style.gap = "4px";

  const doneButton = createIconButton(
    "tytd-done-btn",
    "Mark as Done",
    `<polyline points="20 6 9 17 4 12"></polyline>`,
  );
  doneButton.addEventListener("click", async () => {
    todo.completed = true;
    todo.completedAt = new Date().toISOString();
    await options.saveTodos();
  });

  const editButton = createIconButton(
    "tytd-edit-btn",
    "Edit Task",
    `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>`,
  );
  editButton.addEventListener("click", () => {
    options.showDialog(todo);
    options.toggleMenu(false);
  });

  const deleteButton = createIconButton(
    "tytd-delete-btn",
    "Delete Task",
    `<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>`,
  );
  deleteButton.addEventListener("click", async () => {
    options.setTodos(options.getTodos().filter((item) => item.id !== todo.id));
    await options.saveTodos();
  });

  listItem.append(text, actionButtons);
  actionButtons.append(doneButton, editButton, deleteButton);
  return listItem;
}

function createIconButton(
  className: string,
  title: string,
  icon: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = className;
  button.title = title;
  button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg>`;
  return button;
}

function getElementMidpoint(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function clearDragIndicators(todoList: HTMLUListElement): void {
  todoList.querySelectorAll(".tytd-todo-item").forEach((item) => {
    item.classList.remove("drag-over-top", "drag-over-bottom");
  });
}
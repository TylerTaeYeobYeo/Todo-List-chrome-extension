import type { BubbleCorner, Todo } from "./types";

export const STORAGE_KEYS = {
  todos: "bun_todos",
  theme: "bun_theme",
  bubblePosition: "tytd_bubble_pos",
} as const;

export async function getStorageValue<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.sync.get([key]);
  return (result[key] as T | undefined) ?? fallback;
}

export function loadTodos(): Promise<Todo[]> {
  return getStorageValue<Todo[]>(STORAGE_KEYS.todos, []);
}

export function saveTodos(todos: Todo[]): Promise<void> {
  return chrome.storage.sync.set({ [STORAGE_KEYS.todos]: todos });
}

export function saveBubbleCorner(corner: BubbleCorner): Promise<void> {
  return chrome.storage.sync.set({
    [STORAGE_KEYS.bubblePosition]: { corner },
  });
}
export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string;
}

export type BubbleCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface ContentElements {
  bubbleContainer: HTMLDivElement;
  bubble: HTMLDivElement;
  menu: HTMLDivElement;
  dialogOverlay: HTMLDivElement;
  todoList: HTMLUListElement;
}

export interface ContentState {
  todos: Todo[];
  isDragging: boolean;
  dragOffset: { x: number; y: number };
  hasMoved: boolean;
  draggedItemIndex: number | null;
  autoHideTimer: ReturnType<typeof setTimeout> | undefined;
  editingTodo: Todo | null;
  bubbleCorner: BubbleCorner;
}
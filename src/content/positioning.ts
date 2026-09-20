import type { BubbleCorner } from "./types";

export const DEFAULT_BUBBLE_CORNER: BubbleCorner = "bottom-right";

const BUBBLE_POSITIONS: Record<
  BubbleCorner,
  { top: string; bottom: string; left: string; right: string }
> = {
  "top-left": { top: "20px", bottom: "auto", left: "20px", right: "auto" },
  "top-right": { top: "20px", bottom: "auto", left: "auto", right: "20px" },
  "bottom-left": { top: "auto", bottom: "20px", left: "20px", right: "auto" },
  "bottom-right": {
    top: "auto",
    bottom: "20px",
    left: "auto",
    right: "20px",
  },
};

export function isBubbleCorner(value: unknown): value is BubbleCorner {
  return (
    value === "top-left" ||
    value === "top-right" ||
    value === "bottom-left" ||
    value === "bottom-right"
  );
}

export function applyCornerPosition(
  container: HTMLElement,
  corner: BubbleCorner,
): void {
  const position = BUBBLE_POSITIONS[corner];
  container.style.top = position.top;
  container.style.bottom = position.bottom;
  container.style.left = position.left;
  container.style.right = position.right;
}

export function getNearestCorner(
  container: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
): BubbleCorner {
  const rect = container.getBoundingClientRect();
  const isLeft = rect.left + rect.width / 2 < viewportWidth / 2;
  const isTop = rect.top + rect.height / 2 < viewportHeight / 2;
  return `${isTop ? "top" : "bottom"}-${isLeft ? "left" : "right"}` as BubbleCorner;
}

export function updateMenuPosition(
  menu: HTMLElement,
  container: HTMLElement,
  targetRect?: DOMRect | { top: number; left: number; width: number; height: number },
): void {
  if (!menu.classList.contains("visible")) return;

  const containerRect = targetRect ?? container.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gap = 20;
  const screenPadding = 20;
  const menuHeight = menu.offsetHeight || menuRect.height || 300;
  const menuWidth = menu.offsetWidth || menuRect.width || 250;

  const spaceAbove = containerRect.top;
  const spaceBelow = viewportHeight - (containerRect.top + containerRect.height);
  let relativeTop: number;

  if (spaceAbove >= menuHeight + gap) {
    relativeTop = -menuHeight - gap;
  } else if (spaceBelow >= menuHeight + gap) {
    relativeTop = containerRect.height + gap;
  } else if (spaceAbove > spaceBelow) {
    relativeTop = -menuHeight - gap;
    menu.style.maxHeight = `${spaceAbove - gap * 2}px`;
  } else {
    relativeTop = containerRect.height + gap;
    menu.style.maxHeight = `${spaceBelow - gap * 2}px`;
  }

  let relativeLeft = containerRect.width / 2 - menuWidth / 2;
  const absoluteLeft = containerRect.left + relativeLeft;
  if (absoluteLeft < screenPadding) {
    relativeLeft = screenPadding - containerRect.left;
  } else if (absoluteLeft + menuWidth > viewportWidth - screenPadding) {
    relativeLeft = viewportWidth - screenPadding - menuWidth - containerRect.left;
  }

  const absoluteTop = containerRect.top + relativeTop;
  if (absoluteTop < screenPadding) {
    relativeTop = screenPadding - containerRect.top;
  } else if (absoluteTop + menuHeight > viewportHeight - screenPadding) {
    relativeTop = viewportHeight - screenPadding - menuHeight - containerRect.top;
  }

  menu.style.top = `${relativeTop}px`;
  menu.style.left = `${relativeLeft}px`;
  menu.style.bottom = "auto";
  menu.style.right = "auto";
}
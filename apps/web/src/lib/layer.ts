/**
 * Where a floating layer (listbox, menu, popover, tooltip) must be mounted. A modal <dialog>
 * lives in the browser's top layer and makes the rest of the page inert, so anything opened
 * from inside it has to live inside that dialog; otherwise <body> keeps it clear of table
 * scroll containers.
 */
export function layerFor(anchor: Element | null | undefined): HTMLElement | "body" {
  return (anchor?.closest("dialog[open]") as HTMLDialogElement | null) ?? "body";
}

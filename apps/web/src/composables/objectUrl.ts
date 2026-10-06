import { onScopeDispose, ref } from "vue";

/** Holds at most one blob URL and revokes it when replaced or when the owner unmounts. */
export function useObjectUrl() {
  const url = ref<string | null>(null);

  function set(blob: Blob | null): void {
    if (url.value) URL.revokeObjectURL(url.value);
    url.value = blob ? URL.createObjectURL(blob) : null;
  }

  onScopeDispose(() => set(null));
  return { url, set };
}

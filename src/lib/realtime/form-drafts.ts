/** Tracks user-touched snapshots, without treating incoming server values as user edits. */
export class FormDrafts<Key> {
  private entries = new Map<Key, { snapshot: string; touched: boolean }>();

  observe(key: Key, snapshot: string) {
    if (!this.entries.has(key)) this.entries.set(key, { snapshot, touched: false });
  }
  touch(key: Key, snapshot: string) {
    this.observe(key, snapshot);
    this.entries.get(key)!.touched = true;
  }
  saved(key: Key, snapshot: string) {
    this.entries.set(key, { snapshot, touched: false });
  }
  hasChanges(current: ReadonlyMap<Key, string>) {
    let dirty = false;
    for (const [key, state] of this.entries) {
      const snapshot = current.get(key);
      if (snapshot === undefined) { this.entries.delete(key); continue; }
      if (state.touched && state.snapshot !== snapshot) dirty = true;
      else { state.snapshot = snapshot; state.touched = false; }
    }
    return dirty;
  }
}

export function formSnapshot(form: HTMLFormElement): string {
  return JSON.stringify(Array.from(form.elements).flatMap(control => {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return [];
    if (!control.name || control.name.startsWith("$ACTION")) return [];
    if (control instanceof HTMLInputElement && ["submit", "button", "reset"].includes(control.type)) return [];
    const value = /password|otp|token|secret/i.test(control.name) || control instanceof HTMLInputElement && control.type === "password"
      ? control.value ? "entered" : ""
      : control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)
      ? `${control.checked}:${control.value}`
      : control instanceof HTMLInputElement && control.type === "file"
        ? Array.from(control.files ?? [], file => `${file.name}:${file.size}:${file.lastModified}`).join("|")
        : control instanceof HTMLSelectElement && control.multiple
          ? Array.from(control.selectedOptions, option => option.value).join("|") : control.value;
    return [[control.name, value]];
  }));
}

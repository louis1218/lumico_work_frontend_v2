// Forms tell this when they hold something not saved yet, so the app never reloads itself
// (to recover a stuck connection) while someone is part-way through filling one in.
const open = new Set<string>();

export function setDirty(form: string, dirty: boolean): void {
  if (dirty) open.add(form);
  else open.delete(form);
}

export const isDirty = (): boolean => open.size > 0;

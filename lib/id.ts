/** Compact unique id, safe for Konva node ids and React keys. */
export function uid(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

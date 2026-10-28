/** Fill `{slot}` markers. The surrounding sentence is the reviewed template, unchanged. */
export function fillTemplate(template: string, slots: Record<string, string>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(slots, key) ? slots[key] : token,
  );
}

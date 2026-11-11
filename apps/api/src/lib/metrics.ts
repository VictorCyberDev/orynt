const counters = new Map<string, number>();
const gauges = new Map<string, () => Promise<number>>();
export const inc = (name: string, labels: Record<string, string> = {}, by = 1) => {
  const k =
    name +
    (Object.keys(labels).length
      ? "{" +
        Object.entries(labels)
          .map(([a, b]) => `${a}="${b.replace(/"/g, "")}"`)
          .join(",") +
        "}"
      : "");
  counters.set(k, (counters.get(k) ?? 0) + by);
};
export const gauge = (name: string, fn: () => Promise<number>) => gauges.set(name, fn);
export async function render(): Promise<string> {
  const out: string[] = [];
  for (const [k, v] of [...counters].sort()) out.push(`${k} ${v}`);
  for (const [k, fn] of gauges) {
    try {
      out.push(`${k} ${await fn()}`);
    } catch {
      out.push(`# ${k} unavailable`);
    }
  }
  return out.join("\n") + "\n";
}

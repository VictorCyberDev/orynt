// Small shared helpers: escaping, code blocks, status tags, tables.

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Render a code sample. Only line comments (// or #) get a span; everything else is plain, escaped text. */
export function codeBlock(source, { lang = "ts", label = "" } = {}) {
  const marker = lang === "sh" || lang === "bash" ? "#" : "//";
  const lines = source.replace(/\n+$/, "").split("\n").map((line) => {
    const idx = findComment(line, marker);
    if (idx === -1) return esc(line);
    return esc(line.slice(0, idx)) + `<span class="tok-c">${esc(line.slice(idx))}</span>`;
  });
  const cap = label ? `<figcaption class="code__label">${esc(label)}</figcaption>` : "";
  return `<figure class="code">${cap}<pre tabindex="0"><code class="language-${lang}">${lines.join("\n")}</code></pre></figure>`;
}

function findComment(line, marker) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (line.startsWith(marker, i) && (marker === "//" ? line[i - 1] !== ":" : i === 0 || /\s/.test(line[i - 1]))) return i;
  }
  return -1;
}

/** Status tag. kind: designed | hypothesis | pending | todo | ok | unknown */
export const tag = (text, kind = "neutral") => `<span class="tag tag--${kind}">${esc(text)}</span>`;

/**
 * Responsive table: on narrow screens each row becomes a stacked block and each cell shows its column title.
 * rows: array of arrays of HTML strings (already escaped by the caller).
 */
export function table({ caption, head, rows, className = "" }) {
  const th = head.map((h) => `<th scope="col">${h}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => (i === 0 ? `<th scope="row" data-label="${esc(strip(head[0]))}">${c}</th>` : `<td data-label="${esc(strip(head[i]))}">${c}</td>`))
          .join("")}</tr>`,
    )
    .join("");
  return `<div class="table-wrap"><table class="table ${className}"><caption class="visually-hidden">${esc(caption)}</caption><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}
const strip = (h) => h.replace(/<[^>]+>/g, "");

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));

/** Inline an SVG partial (src/partials/<name>.svg) verbatim. */
export const svgPartial = (name) => readFileSync(join(here, "partials", `${name}.svg`), "utf8").trim();

/** Read a code sample (src/snippets/<name>) verbatim. */
export const snippet = (name) => readFileSync(join(here, "snippets", name), "utf8");

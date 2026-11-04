/**
 * Streams the elements of a top-level JSON array without loading the whole document.
 * Scryfall bulk files are hundreds of MB; this keeps memory bounded to one element.
 */
export async function* streamJsonArray(chunks: AsyncIterable<Uint8Array | string>): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  let buf = "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  let started = false;
  for await (const chunk of chunks) {
    const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    const offset = buf.length;
    buf += text;
    for (let i = offset; i < buf.length; i++) {
      const ch = buf[i]!;
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        if (depth === 1 && start < 0) start = i;
        continue;
      }
      if (ch === "[" || ch === "{") {
        if (!started) {
          if (ch !== "[") throw new Error("Expected a top-level JSON array.");
          started = true;
          depth = 1;
          continue;
        }
        if (depth === 1 && start < 0) start = i;
        depth++;
      } else if (ch === "]" || ch === "}") {
        depth--;
        if (depth === 1 && start >= 0) {
          yield JSON.parse(buf.slice(start, i + 1));
          start = -1;
        } else if (depth === 0) return;
      } else if (depth === 1 && ch === "," && start >= 0) {
        // scalar element
        yield JSON.parse(buf.slice(start, i));
        start = -1;
      } else if (depth === 1 && start < 0 && !/[\s,]/.test(ch)) start = i;
    }
    // Drop consumed text to keep memory bounded.
    if (start >= 0) {
      buf = buf.slice(start);
      start = 0;
    } else buf = "";
  }
}

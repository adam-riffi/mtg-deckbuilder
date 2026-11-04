import { describe, expect, it } from "vitest";
import { streamJsonArray } from "../src/json-stream";

async function* chunked(s: string, size: number) {
  for (let i = 0; i < s.length; i += size) yield new TextEncoder().encode(s.slice(i, i + size));
}

describe("streamJsonArray", () => {
  const data = [{ a: 1, s: 'x,"}]{[' }, { nested: { b: [1, 2, { c: '\\"' }] } }, { u: "é—★" }];
  const text = `[\n${data.map((d) => JSON.stringify(d)).join(",\n")}\n]`;
  for (const size of [1, 3, 7, 64, 100000]) {
    it(`parses with chunk size ${size}`, async () => {
      const out: unknown[] = [];
      for await (const x of streamJsonArray(chunked(text, size))) out.push(x);
      expect(out).toEqual(data);
    });
  }
  it("handles empty arrays", async () => {
    const out: unknown[] = [];
    for await (const x of streamJsonArray(chunked("[]", 1))) out.push(x);
    expect(out).toEqual([]);
  });
});

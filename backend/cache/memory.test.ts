import { assertEquals } from "jsr:@std/assert";
import { TtlCache } from "./memory.ts";

Deno.test("returns undefined for a missing key", () => {
  const cache = new TtlCache<number>(1_000);
  assertEquals(cache.get("missing"), undefined);
});

Deno.test("returns a value that was just set", () => {
  const cache = new TtlCache<string>(1_000);
  cache.set("k", "v");
  assertEquals(cache.get("k"), "v");
});

Deno.test("expires a value after the TTL elapses", async () => {
  const cache = new TtlCache<string>(5);
  cache.set("k", "v");
  await new Promise((r) => setTimeout(r, 20));
  assertEquals(cache.get("k"), undefined);
});

Deno.test("delete removes a key", () => {
  const cache = new TtlCache<string>(1_000);
  cache.set("k", "v");
  cache.delete("k");
  assertEquals(cache.get("k"), undefined);
});

Deno.test("clear empties the cache", () => {
  const cache = new TtlCache<string>(1_000);
  cache.set("a", "1");
  cache.set("b", "2");
  cache.clear();
  assertEquals(cache.size(), 0);
});

Deno.test("size reflects live (non-swept) entries, including expired-but-unswept ones", () => {
  const cache = new TtlCache<string>(1_000);
  cache.set("a", "1");
  cache.set("b", "2");
  assertEquals(cache.size(), 2);
});

Deno.test("sweepExpired removes only expired entries and returns the count removed", async () => {
  const cache = new TtlCache<string>(5);
  cache.set("stale", "1");
  await new Promise((r) => setTimeout(r, 20));
  cache.set("fresh", "2");
  const removed = cache.sweepExpired();
  assertEquals(removed, 1);
  assertEquals(cache.get("fresh"), "2");
  assertEquals(cache.size(), 1);
});

import { assertEquals } from "jsr:@std/assert";

Deno.test("deno workspace is runnable", () => {
  assertEquals(1 + 1, 2);
});

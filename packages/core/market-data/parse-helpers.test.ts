// packages/core/market-data/parse-helpers.test.ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import {
  ParseFailure,
  parseOptionalF64,
  parseOptionalI64,
  parseRequiredF64,
  parseRequiredI64,
} from "./parse-helpers.ts";

Deno.test("parseRequiredF64 accepts a number", () => {
  assertEquals(parseRequiredF64({ price: 123.45 }, "price", "test"), 123.45);
});

Deno.test("parseRequiredF64 accepts a numeric string", () => {
  assertEquals(parseRequiredF64({ price: "123.45" }, "price", "test"), 123.45);
});

Deno.test("parseRequiredF64 rejects a missing field", () => {
  const err = assertThrows(() => parseRequiredF64({}, "price", "test"), ParseFailure);
  assertEquals(err.error.kind, "missing_field");
});

Deno.test("parseRequiredF64 rejects null (present but unparseable)", () => {
  const err = assertThrows(() => parseRequiredF64({ price: null }, "price", "test"), ParseFailure);
  assertEquals(err.error.kind, "invalid_type");
});

Deno.test("parseRequiredF64 rejects a non-numeric string", () => {
  const err = assertThrows(() => parseRequiredF64({ price: "N/A" }, "price", "test"), ParseFailure);
  assertEquals(err.error.kind, "invalid_type");
});

Deno.test("parseOptionalF64 returns null for a missing field", () => {
  assertEquals(parseOptionalF64({}, "bid", "test"), null);
});

Deno.test("parseOptionalF64 returns null for an explicit null", () => {
  assertEquals(parseOptionalF64({ bid: null }, "bid", "test"), null);
});

Deno.test("parseOptionalF64 returns the value when present", () => {
  assertEquals(parseOptionalF64({ bid: 99.5 }, "bid", "test"), 99.5);
});

Deno.test("parseRequiredI64 accepts an integer", () => {
  assertEquals(parseRequiredI64({ volume: 1_234_567 }, "volume", "test"), 1_234_567);
});

Deno.test("parseRequiredI64 accepts a numeric string", () => {
  assertEquals(parseRequiredI64({ volume: "1234567" }, "volume", "test"), 1_234_567);
});

Deno.test("parseRequiredI64 accepts a float-shaped number, truncating", () => {
  assertEquals(parseRequiredI64({ volume: 42.9 }, "volume", "test"), 42);
});

Deno.test("parseOptionalI64 returns null for missing/null, value otherwise", () => {
  assertEquals(parseOptionalI64({}, "v", "test"), null);
  assertEquals(parseOptionalI64({ v: null }, "v", "test"), null);
  assertEquals(parseOptionalI64({ v: 5 }, "v", "test"), 5);
});

Deno.test("ParseFailure message is human-readable", () => {
  try {
    parseRequiredF64({}, "price", "acme");
    assert(false, "should have thrown");
  } catch (e) {
    assert(e instanceof ParseFailure);
    assert(e.message.includes("price"));
    assert(e.message.includes("acme"));
  }
});

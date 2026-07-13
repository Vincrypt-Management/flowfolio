import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseFmpHistorical, parseFmpQuote } from "./fmp.ts";
import { ParseFailure } from "../parse-helpers.ts";
import quoteFixture from "./__fixtures__/fmp-quote.json" with { type: "json" };
import historicalFixture from "./__fixtures__/fmp-historical.json" with { type: "json" };

Deno.test("parseFmpQuote parses the first array element", () => {
  const q = parseFmpQuote(quoteFixture);
  assertEquals(q.symbol, "AAPL");
  assertEquals(q.price, 213.4);
  assertEquals(q.volume, 47500000);
});

Deno.test("parseFmpQuote throws EmptyResponse for an empty array", () => {
  const err = assertThrows(() => parseFmpQuote([]), ParseFailure);
  assertEquals(err.error.kind, "empty_response");
});

Deno.test("parseFmpHistorical parses the 'historical' array, most recent first", () => {
  const bars = parseFmpHistorical(historicalFixture);
  assertEquals(bars.length, 2);
  assertEquals(bars[0].date, "2026-07-09");
});

Deno.test("parseFmpHistorical skips a bar with a missing close", () => {
  const bars = parseFmpHistorical({
    historical: [{ date: "x", open: 1, high: 1, low: 1, volume: 1 }, historicalFixture.historical[0]],
  });
  assertEquals(bars.length, 1);
});

Deno.test("parseFmpHistorical throws EmptyResponse when no bars survive", () => {
  const err = assertThrows(() => parseFmpHistorical({ historical: [] }), ParseFailure);
  assertEquals(err.error.kind, "empty_response");
});

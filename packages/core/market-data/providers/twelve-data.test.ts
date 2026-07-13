// packages/core/market-data/providers/twelve-data.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseTwelveDataHistorical, parseTwelveDataQuote } from "./twelve-data.ts";
import { ParseFailure } from "../parse-helpers.ts";
import quoteFixture from "./__fixtures__/twelve-data-quote.json" with { type: "json" };
import historicalFixture from "./__fixtures__/twelve-data-historical.json" with { type: "json" };

Deno.test("parseTwelveDataQuote parses symbol/close(string)/volume(string)", () => {
  const q = parseTwelveDataQuote(quoteFixture);
  assertEquals(q.symbol, "AAPL");
  assertEquals(q.price, 213.4);
  assertEquals(q.volume, 47500000);
});

Deno.test("parseTwelveDataQuote throws MissingField for a code-only error response", () => {
  const err = assertThrows(
    () => parseTwelveDataQuote({ code: 429, message: "rate limited" }),
    ParseFailure,
  );
  assertEquals(err.error.kind, "missing_field");
});

Deno.test("parseTwelveDataHistorical parses string-encoded OHLCV values", () => {
  const bars = parseTwelveDataHistorical(historicalFixture);
  assertEquals(bars.length, 2);
  assertEquals(bars[0].close, 213.4);
  assertEquals(bars[0].date, "2026-07-09");
});

Deno.test("parseTwelveDataHistorical throws MissingField when 'values' is absent", () => {
  const err = assertThrows(() => parseTwelveDataHistorical({}), ParseFailure);
  assertEquals(err.error.kind, "missing_field");
});

Deno.test("parseTwelveDataHistorical skips a bar with a missing close", () => {
  const bars = parseTwelveDataHistorical({
    values: [{ datetime: "x", open: "1", high: "1", low: "1", volume: "1" }, historicalFixture.values[0]],
  });
  assertEquals(bars.length, 1);
});

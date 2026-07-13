import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseTiingoHistorical, parseTiingoQuote } from "./tiingo.ts";
import { ParseFailure } from "../parse-helpers.ts";
import quoteFixture from "./__fixtures__/tiingo-quote.json" with { type: "json" };
import historicalFixture from "./__fixtures__/tiingo-historical.json" with { type: "json" };

Deno.test("parseTiingoQuote parses ticker/last/bid/ask", () => {
  const q = parseTiingoQuote(quoteFixture);
  assertEquals(q.symbol, "AAPL");
  assertEquals(q.price, 213.4);
  assertEquals(q.bid, 213.3);
  assertEquals(q.ask, 213.5);
});

Deno.test("parseTiingoQuote throws EmptyResponse for an empty array", () => {
  const err = assertThrows(() => parseTiingoQuote([]), ParseFailure);
  assertEquals(err.error.kind, "empty_response");
});

Deno.test("parseTiingoHistorical parses the top-level array, truncating date to YYYY-MM-DD", () => {
  const bars = parseTiingoHistorical(historicalFixture);
  assertEquals(bars.length, 2);
  assertEquals(bars[1].date, "2026-07-09");
  assertEquals(bars[1].close, 213.4);
});

Deno.test("parseTiingoHistorical throws InvalidType when root is not an array", () => {
  const err = assertThrows(() => parseTiingoHistorical({}), ParseFailure);
  assertEquals(err.error.kind, "invalid_type");
});

Deno.test("parseTiingoHistorical skips a bar with a missing close", () => {
  const bars = parseTiingoHistorical([{ date: "x", open: 1, high: 1, low: 1, volume: 1 }, historicalFixture[0]]);
  assertEquals(bars.length, 1);
});

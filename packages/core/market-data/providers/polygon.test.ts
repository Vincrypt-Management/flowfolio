import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parsePolygonHistorical, parsePolygonQuote } from "./polygon.ts";
import { ParseFailure } from "../parse-helpers.ts";
import quoteFixture from "./__fixtures__/polygon-quote.json" with { type: "json" };
import historicalFixture from "./__fixtures__/polygon-historical.json" with { type: "json" };

Deno.test("parsePolygonQuote parses ticker and the first result's close", () => {
  const q = parsePolygonQuote(quoteFixture);
  assertEquals(q.symbol, "AAPL");
  assertEquals(q.price, 213.4);
  assertEquals(q.volume, 47500000);
});

Deno.test("parsePolygonQuote throws EmptyResponse for an empty results array", () => {
  const err = assertThrows(() => parsePolygonQuote({ ticker: "AAPL", results: [] }), ParseFailure);
  assertEquals(err.error.kind, "empty_response");
});

Deno.test("parsePolygonHistorical converts millisecond timestamps to YYYY-MM-DD", () => {
  const bars = parsePolygonHistorical(historicalFixture);
  assertEquals(bars.length, 2);
  assertEquals(bars[1].date, "2026-07-02");
  assertEquals(bars[1].close, 213.4);
});

Deno.test("parsePolygonHistorical throws MissingField when 'results' is absent", () => {
  const err = assertThrows(() => parsePolygonHistorical({}), ParseFailure);
  assertEquals(err.error.kind, "missing_field");
});

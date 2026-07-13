import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseFinnhubCandles, parseFinnhubQuote } from "./finnhub.ts";
import { ParseFailure } from "../parse-helpers.ts";
import quoteFixture from "./__fixtures__/finnhub-quote.json" with { type: "json" };
import candlesFixture from "./__fixtures__/finnhub-candles.json" with { type: "json" };

Deno.test("parseFinnhubQuote parses price from 'c'", () => {
  const q = parseFinnhubQuote(quoteFixture);
  assertEquals(q.price, 213.4);
  assertEquals(q.symbol, "");
  assertEquals(q.volume, null);
});

Deno.test("parseFinnhubQuote rejects a non-positive price", () => {
  const err = assertThrows(() => parseFinnhubQuote({ c: 0 }), ParseFailure);
  assertEquals(err.error.kind, "invalid_type");
});

Deno.test("parseFinnhubCandles parses parallel OHLCV arrays", () => {
  const bars = parseFinnhubCandles(candlesFixture);
  assertEquals(bars.length, 2);
  assertEquals(bars[1].close, 213.4);
  assertEquals(bars[1].date, "2026-07-02");
});

Deno.test("parseFinnhubCandles throws EmptyResponse when status is 'no_data'", () => {
  const err = assertThrows(() => parseFinnhubCandles({ s: "no_data" }), ParseFailure);
  assertEquals(err.error.kind, "empty_response");
});

Deno.test("parseFinnhubCandles skips a bar with a bad close", () => {
  const bars = parseFinnhubCandles({
    s: "ok",
    t: [1, 2],
    c: [0, 213.4],
    o: [1, 211.9],
    h: [1, 214.0],
    l: [1, 211.0],
    v: [1, 47500000],
  });
  assertEquals(bars.length, 1);
  assertEquals(bars[0].close, 213.4);
});

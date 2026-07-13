// packages/core/market-data/providers/alpaca.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { deriveAlpacaQuote, parseAlpacaBars } from "./alpaca.ts";
import { ParseFailure } from "../parse-helpers.ts";
import fixture from "./__fixtures__/alpaca-bars.json" with { type: "json" };

Deno.test("parseAlpacaBars parses all bars into HistoricalPrice", () => {
  const bars = parseAlpacaBars(fixture);
  assertEquals(bars.length, 2);
  assertEquals(bars[1].close, 213.4);
  assertEquals(bars[1].date, "2026-07-09");
});

Deno.test("parseAlpacaBars skips a bar with a missing close and keeps the rest", () => {
  const bars = parseAlpacaBars({
    bars: [{ t: "2026-07-08T04:00:00Z", o: 1, h: 1, l: 1, v: 1 }, fixture.bars[1]],
  });
  assertEquals(bars.length, 1);
  assertEquals(bars[0].close, 213.4);
});

Deno.test("parseAlpacaBars throws EmptyResponse when no bars survive", () => {
  const err = assertThrows(() => parseAlpacaBars({ bars: [] }), ParseFailure);
  assertEquals(err.error.kind, "empty_response");
});

Deno.test("parseAlpacaBars throws MissingField when 'bars' itself is absent", () => {
  const err = assertThrows(() => parseAlpacaBars({}), ParseFailure);
  assertEquals(err.error.kind, "missing_field");
});

Deno.test("deriveAlpacaQuote uses the latest bar's close as price, computes change vs. prior bar", () => {
  const bars = parseAlpacaBars(fixture);
  const quote = deriveAlpacaQuote(bars, "AAPL");
  assertEquals(quote.symbol, "AAPL");
  assertEquals(quote.price, 213.4);
  assertEquals(quote.change, 213.4 - 211.9);
  assertEquals(quote.source, "alpaca");
});

Deno.test("deriveAlpacaQuote with a single bar has zero change", () => {
  const bars = parseAlpacaBars({ bars: [fixture.bars[0]] });
  const quote = deriveAlpacaQuote(bars, "AAPL");
  assertEquals(quote.change, 0);
  assertEquals(quote.changePercent, 0);
});

Deno.test({
  name: "fetchFromAlpaca hits the real API (live, opt-in)",
  ignore: !Deno.env.get("RUN_LIVE_MARKET_DATA_TESTS"),
  fn: async () => {
    const { fetchFromAlpaca } = await import("./alpaca.ts");
    const { SlidingWindowRateLimiter } = await import("../rate-limiter.ts");
    const result = await fetchFromAlpaca(
      "AAPL",
      Deno.env.get("ALPACA_API_KEY")!,
      Deno.env.get("ALPACA_SECRET_KEY")!,
      new SlidingWindowRateLimiter(),
    );
    if (result.quote) {
      console.log("Alpaca live quote:", result.quote);
    }
  },
});

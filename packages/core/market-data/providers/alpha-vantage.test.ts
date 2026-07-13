import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseAlphaVantageHistorical, parseAlphaVantageQuote } from "./alpha-vantage.ts";
import quoteFixture from "./__fixtures__/alpha-vantage-quote.json" with { type: "json" };
import historicalFixture from "./__fixtures__/alpha-vantage-historical.json" with { type: "json" };

Deno.test("parseAlphaVantageQuote parses numbered-prefix string fields, stripping trailing %", () => {
  const q = parseAlphaVantageQuote(quoteFixture);
  assertEquals(q.price, 213.4);
  assertEquals(q.volume, 47500000);
  assertEquals(q.change, 1.5);
  assertEquals(q.changePercent, 0.71);
  assertEquals(q.timestamp, "2026-07-09");
});

Deno.test("parseAlphaVantageQuote throws a hard error when 'Note' is present (rate limited)", () => {
  assertThrows(() => parseAlphaVantageQuote({ Note: "rate limited" }));
});

Deno.test("parseAlphaVantageQuote throws a hard error when 'Information' is present", () => {
  assertThrows(() => parseAlphaVantageQuote({ Information: "premium endpoint" }));
});

Deno.test("parseAlphaVantageHistorical uses '5. adjusted close', not '4. close'", () => {
  const bars = parseAlphaVantageHistorical(historicalFixture);
  const day = bars.find((b) => b.date === "2026-07-09")!;
  assertEquals(day.close, 213.4);
});

Deno.test("parseAlphaVantageHistorical sorts by date descending before truncating to 365 (deliberate fix)", () => {
  const bars = parseAlphaVantageHistorical(historicalFixture);
  assertEquals(bars[0].date, "2026-07-09");
  assertEquals(bars[1].date, "2026-07-08");
});

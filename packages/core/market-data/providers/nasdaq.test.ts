// packages/core/market-data/providers/nasdaq.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseNasdaqQuote } from "./nasdaq.ts";
import fixture from "./__fixtures__/nasdaq-quote.json" with { type: "json" };

Deno.test("parseNasdaqQuote strips '$' and ',' from lastSalePrice", () => {
  const q = parseNasdaqQuote(fixture);
  assertEquals(q.price, 213.4);
  assertEquals(q.change, 1.5);
  assertEquals(q.changePercent, 0.71);
});

Deno.test("parseNasdaqQuote rejects a zero price as an error (unique to Nasdaq)", () => {
  assertThrows(() =>
    parseNasdaqQuote({
      data: { primaryData: { lastSalePrice: "$0.00", netChange: "0", percentageChange: "0%" } },
    })
  );
});

Deno.test("parseNasdaqQuote handles a thousands-separator price", () => {
  const q = parseNasdaqQuote({
    data: { primaryData: { lastSalePrice: "$1,234.56", netChange: "0", percentageChange: "0%" } },
  });
  assertEquals(q.price, 1234.56);
});

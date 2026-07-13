// packages/core/market-data/orchestrator.test.ts
import { assertEquals, assert } from "jsr:@std/assert";
import { MarketDataOrchestrator } from "./orchestrator.ts";
import type { MarketDataResult } from "./types.ts";

function fakeFetch(responses: Record<string, Response | (() => Response)>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [match, res] of Object.entries(responses)) {
      if (url.includes(match)) return typeof res === "function" ? res() : res;
    }
    throw new Error(`fakeFetch: no stub for ${url}`);
  }) as typeof fetch;
}

Deno.test("getMarketData tries providers in tier order and returns the first success", async () => {
  const orchestrator = new MarketDataOrchestrator();
  const fetchImpl = fakeFetch({
    "query1.finance.yahoo.com": new Response(
      JSON.stringify({
        chart: {
          result: [{
            meta: { regularMarketPrice: 213.4, chartPreviousClose: 211.9, regularMarketVolume: 1, regularMarketTime: 1 },
            timestamp: [],
            indicators: { quote: [{}] },
          }],
        },
      }),
    ),
  });
  const result = await orchestrator.getMarketData("AAPL", {}, fetchImpl);
  assertEquals(result.source, "yahoo");
  assertEquals(result.quote?.price, 213.4);
});

Deno.test("getMarketData skips a keyed provider with no configured key", async () => {
  const orchestrator = new MarketDataOrchestrator();
  const fetchImpl = fakeFetch({
    "finnhub.io": () => {
      throw new Error("should never be called — no finnhub key configured");
    },
    "query1.finance.yahoo.com": new Response(
      JSON.stringify({
        chart: {
          result: [{
            meta: { regularMarketPrice: 100, chartPreviousClose: 99, regularMarketVolume: 1, regularMarketTime: 1 },
            timestamp: [],
            indicators: { quote: [{}] },
          }],
        },
      }),
    ),
  });
  const result = await orchestrator.getMarketData("AAPL", {}, fetchImpl);
  assertEquals(result.source, "yahoo");
});

Deno.test("getMarketData falls through to the next provider on failure and tracks health", async () => {
  const orchestrator = new MarketDataOrchestrator();
  const fetchImpl = fakeFetch({
    "query1.finance.yahoo.com": new Response("", { status: 500 }),
    "query2.finance.yahoo.com": new Response("", { status: 500 }),
    "api.nasdaq.com": new Response(
      JSON.stringify({ data: { primaryData: { lastSalePrice: "$213.40", netChange: "1.5", percentageChange: "0.71%" } } }),
    ),
  });
  const result = await orchestrator.getMarketData("AAPL", {}, fetchImpl);
  assertEquals(result.source, "nasdaq");
  const stats = orchestrator.getHealthStats();
  assertEquals(stats.yahoo.failures, 1);
  assertEquals(stats.nasdaq.successes, 1);
});

Deno.test("getMarketData throws an aggregated error when every provider fails", async () => {
  const orchestrator = new MarketDataOrchestrator();
  const fetchImpl = fakeFetch({
    "query1.finance.yahoo.com": new Response("", { status: 500 }),
    "query2.finance.yahoo.com": new Response("", { status: 500 }),
    "api.nasdaq.com": new Response("", { status: 500 }),
  });
  let threw = false;
  try {
    await orchestrator.getMarketData("AAPL", {}, fetchImpl);
  } catch (e) {
    threw = true;
    assert(String((e as Error).message).includes("AAPL"));
  }
  assert(threw);
});

Deno.test("getBatchMarketData drops failed symbols and keeps successes", async () => {
  const orchestrator = new MarketDataOrchestrator();
  const fetchImpl = fakeFetch({
    "query1.finance.yahoo.com": (() => {
      let call = 0;
      return () => {
        call += 1;
        if (call === 1) {
          return new Response(
            JSON.stringify({
              chart: {
                result: [{
                  meta: { regularMarketPrice: 1, chartPreviousClose: 1, regularMarketVolume: 1, regularMarketTime: 1 },
                  timestamp: [],
                  indicators: { quote: [{}] },
                }],
              },
            }),
          );
        }
        return new Response("", { status: 500 });
      };
    })(),
    "query2.finance.yahoo.com": new Response("", { status: 500 }),
    "api.nasdaq.com": new Response("", { status: 500 }),
  });
  const result = await orchestrator.getBatchMarketData(["AAPL", "MSFT"], {}, fetchImpl);
  assertEquals(result.size, 1);
  assert(result.has("AAPL"));
});

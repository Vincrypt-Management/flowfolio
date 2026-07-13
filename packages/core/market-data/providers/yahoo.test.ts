import { assertEquals } from "jsr:@std/assert";
import { parseYahooChart } from "./yahoo.ts";
import fixture from "./__fixtures__/yahoo-chart.json" with { type: "json" };

Deno.test("parseYahooChart computes change against chartPreviousClose", () => {
  const result = parseYahooChart(fixture, "AAPL");
  assertEquals(result.quote?.price, 213.4);
  assertEquals(result.quote?.change, 213.4 - 211.9);
  assertEquals(result.quote?.volume, 47500000);
});

Deno.test("parseYahooChart parses the parallel OHLCV arrays into historical bars", () => {
  const result = parseYahooChart(fixture, "AAPL");
  assertEquals(result.historical.length, 2);
  assertEquals(result.historical[1].close, 213.4);
});

Deno.test("parseYahooChart source is 'yahoo'", () => {
  const result = parseYahooChart(fixture, "AAPL");
  assertEquals(result.source, "yahoo");
});

Deno.test("fetchFromYahoo falls back to query2 when query1 returns 429 (the Yahoo-429 fix)", async () => {
  const { fetchFromYahoo } = await import("./yahoo.ts");
  const { SlidingWindowRateLimiter } = await import("../rate-limiter.ts");
  const calledHosts: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("query1.finance.yahoo.com")) {
      calledHosts.push("query1");
      return new Response("", { status: 429 });
    }
    if (url.includes("query2.finance.yahoo.com")) {
      calledHosts.push("query2");
      return new Response(JSON.stringify(fixture));
    }
    throw new Error(`unexpected host in ${url}`);
  }) as typeof fetch;

  const result = await fetchFromYahoo("AAPL", new SlidingWindowRateLimiter(), fetchImpl);
  assertEquals(calledHosts, ["query1", "query2"]);
  assertEquals(result.quote?.price, 213.4);
});

Deno.test("fetchFromYahoo does not fall back to query2 on a non-429 failure", async () => {
  const { fetchFromYahoo } = await import("./yahoo.ts");
  const { SlidingWindowRateLimiter } = await import("../rate-limiter.ts");
  const calledHosts: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("query1.finance.yahoo.com")) {
      calledHosts.push("query1");
      return new Response("", { status: 500 });
    }
    calledHosts.push("query2");
    return new Response("", { status: 500 });
  }) as typeof fetch;

  let threw = false;
  try {
    await fetchFromYahoo("AAPL", new SlidingWindowRateLimiter(), fetchImpl);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
  assertEquals(calledHosts, ["query1"]); // query2 is only tried on 429, not on other failures
});

Deno.test({
  name: "fetchFromYahoo hits the real API (live, opt-in)",
  ignore: !Deno.env.get("RUN_LIVE_MARKET_DATA_TESTS"),
  fn: async () => {
    const { fetchFromYahoo } = await import("./yahoo.ts");
    const { SlidingWindowRateLimiter } = await import("../rate-limiter.ts");
    const result = await fetchFromYahoo("AAPL", new SlidingWindowRateLimiter());
    console.log("Yahoo live quote:", result.quote);
  },
});

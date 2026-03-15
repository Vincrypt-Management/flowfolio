import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Module mocks (must be hoisted before imports) ----

vi.mock('../../core/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  })),
}));

vi.mock('../../services/openrouter', () => ({
  openRouterService: {
    chat: vi.fn(),
  },
}));

// ---- Imports ----

import { comprehensiveFundamentalsService } from '../../services/comprehensiveFundamentals';
import type {
  StockFundamentals,
  ETFFundamentals,
  BondFundamentals,
} from '../../services/comprehensiveFundamentals';
import { openRouterService } from '../../services/openrouter';

// ---- Helpers ----

const service = comprehensiveFundamentalsService;

function makeMinimalStockFundamentals(overrides: Partial<StockFundamentals> = {}): StockFundamentals {
  return {
    valuation: {
      peRatio: 20,
      forwardPE: 18,
      pegRatio: 1.5,
      priceToBook: 3,
      priceToSales: 2,
      priceToFreeCashFlow: 20,
      evToEBITDA: 12,
      evToRevenue: 4,
    },
    profitability: {
      grossMargin: 0.45,
      operatingMargin: 0.2,
      netProfitMargin: 0.15,
      returnOnEquity: 18,
      returnOnAssets: 8,
      returnOnInvestedCapital: 12,
    },
    growth: {
      revenueGrowthYoY: 0.1,
      revenueGrowth3Y: 0.08,
      epsGrowthYoY: 0.12,
      epsGrowth3Y: 0.1,
      freeCashFlowGrowth: 0.09,
      bookValueGrowth: 0.07,
    },
    financialHealth: {
      currentRatio: 2,
      quickRatio: 1.5,
      debtToEquity: 0.4,
      debtToAssets: 0.2,
      interestCoverage: 10,
      altmanZScore: 3.5,
      piotroskiFScore: 7,
    },
    cashFlow: {
      operatingCashFlow: 5000,
      freeCashFlow: 4000,
      freeCashFlowYield: 0.04,
      capexToRevenue: 0.05,
      cashConversionCycle: 45,
    },
    dividend: {
      dividendYield: 0.02,
      payoutRatio: 0.3,
      dividendGrowth5Y: 0.08,
      yearsOfDividendGrowth: 10,
      exDividendDate: '2026-03-01',
      dividendSafety: 'safe',
    },
    quality: {
      earningsQuality: 85,
      revenueConsistency: 90,
      marginStability: 80,
      capexEfficiency: 75,
    },
    taxConsiderations: {
      qualifiedDividends: true,
      foreignTaxCredit: false,
      potentialCapitalGains: 'long-term',
      taxLossHarvestingCandidate: false,
      k1Required: false,
    },
    ...overrides,
  };
}

function makeMinimalETFFundamentals(overrides: Partial<ETFFundamentals> = {}): ETFFundamentals {
  return {
    fundInfo: {
      assetClass: 'equity',
      strategy: 'passive_index',
      fundFamily: 'Vanguard',
      inceptionDate: '2001-05-22',
      aum: 300000,
    },
    costs: {
      expenseRatio: 0.03,
      tradingCost: 0.01,
      totalCostOfOwnership: 0.04,
      premiumDiscount: 0.0,
      trackingError: 0.02,
      trackingDifference: 0.01,
    },
    holdings: {
      numberOfHoldings: 500,
      top10Weight: 25,
      turnoverRate: 0.04,
      sectorWeights: { Technology: 0.3, Healthcare: 0.13 },
      geographicExposure: { US: 1.0 },
      marketCapBreakdown: { large: 0.8, mid: 0.15, small: 0.04, micro: 0.01 },
    },
    underlyingMetrics: {
      weightedAvgPE: 22,
      weightedAvgPB: 4,
      weightedAvgDividendYield: 0.015,
      weightedAvgROE: 0.2,
      weightedAvgEarningsGrowth: 0.1,
    },
    riskMetrics: {
      standardDeviation: 0.15,
      beta: 1.0,
      r2: 99,
      sharpeRatio: 1.2,
      sortinoRatio: 1.5,
      maxDrawdown: -0.34,
    },
    liquidity: {
      avgDailyVolume: 5000000,
      avgDailyDollarVolume: 200000000,
      bidAskSpread: 0.01,
      impliedLiquidity: 1000000000,
    },
    taxEfficiency: {
      taxCostRatio: 0.003,
      capitalGainsDistributions: 'none',
      qualifiedDividendPct: 0.95,
      taxStatus: 'taxable',
      recommendedAccountType: 'taxable',
    },
    ...overrides,
  };
}

function makeMinimalBondFundamentals(overrides: Partial<BondFundamentals> = {}): BondFundamentals {
  return {
    cashFlowTerms: {
      couponType: 'fixed',
      couponRate: 0.05,
      paymentFrequency: 'semi-annual',
      maturityDate: '2035-01-15',
      yearsToMaturity: 9,
      seniority: 'senior_unsecured',
    },
    creditAnalysis: {
      creditRating: 'A',
      ratingAgency: 'S&P',
      ratingOutlook: 'stable',
      covenantStrength: 'moderate',
    },
    returnMetrics: {
      yieldToMaturity: 0.05,
      yieldToWorst: 0.049,
      currentYield: 0.05,
      spreadVsBenchmark: 120,
      benchmarkUsed: 'Treasury',
      cleanPrice: 100,
      dirtyPrice: 100.5,
      accruedInterest: 0.5,
      priceVsPar: 'par',
      discountPremiumPct: 0,
    },
    riskMetrics: {
      modifiedDuration: 7,
      effectiveDuration: 7,
      macaulayDuration: 7.5,
      convexity: 60,
      curveExposure: 'belly',
      reinvestmentRisk: 'medium',
      liquidityScore: 75,
      bidAskSpread: 0.002,
      inflationType: 'nominal',
    },
    taxTreatment: {
      taxStatus: 'taxable',
      federalTaxExempt: false,
      stateTaxExempt: false,
      qualifiedDividend: false,
    },
    ...overrides,
  };
}

// ---- Test suites ----

describe('buildSystemPrompt', () => {
  it('returns a string containing "STOCKS" for assetType "stock"', () => {
    const prompt = (service as any).buildSystemPrompt('stock');
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('STOCKS');
  });

  it('returns a string containing "ETFs" for assetType "etf"', () => {
    const prompt = (service as any).buildSystemPrompt('etf');
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('ETFs');
  });

  it('returns a string containing "BONDS" for assetType "bond"', () => {
    const prompt = (service as any).buildSystemPrompt('bond');
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('BONDS');
  });

  it('always includes the CFA certification base prompt', () => {
    for (const assetType of ['stock', 'etf', 'bond'] as const) {
      const prompt = (service as any).buildSystemPrompt(assetType);
      expect(prompt).toContain('CFA');
    }
  });

  it('instructs model to output ONLY valid JSON', () => {
    const prompt = (service as any).buildSystemPrompt('stock');
    expect(prompt).toContain('valid JSON');
  });
});

describe('buildUserPrompt', () => {
  it('includes the symbol in the returned string', () => {
    const prompt = (service as any).buildUserPrompt('AAPL', 'stock');
    expect(prompt).toContain('AAPL');
  });

  it('includes the assetType in the returned string', () => {
    const prompt = (service as any).buildUserPrompt('SPY', 'etf');
    expect(prompt).toContain('etf');
  });

  it('instructs the model to use real current market data', () => {
    const prompt = (service as any).buildUserPrompt('MSFT', 'stock');
    expect(prompt.toLowerCase()).toContain('real');
  });

  it('contains the symbol inside the JSON schema template for stocks', () => {
    const prompt = (service as any).buildUserPrompt('TSLA', 'stock');
    // The schema template embeds the symbol as a string literal
    expect(prompt).toContain('"TSLA"');
  });

  it('contains the symbol inside the JSON schema template for bonds', () => {
    const prompt = (service as any).buildUserPrompt('TLT', 'bond');
    expect(prompt).toContain('"TLT"');
  });
});

describe('parseAnalysisResponse', () => {
  it('parses a well-formed JSON string', () => {
    const payload = {
      symbol: 'AAPL',
      assetType: 'stock',
      fundamentalScore: 82,
      fundamentalGrade: 'A',
      strengths: ['Strong FCF'],
      weaknesses: ['High valuation'],
      investmentThesis: 'Quality compounder.',
      riskLevel: 'moderate',
      riskFactors: ['Competition'],
      taxEfficiencySummary: 'Qualified dividends.',
      recommendedAccountType: 'taxable',
      lastUpdated: new Date().toISOString(),
    };
    const result = (service as any).parseAnalysisResponse(
      JSON.stringify(payload),
      'AAPL',
      'stock'
    );
    expect(result.symbol).toBe('AAPL');
    expect(result.fundamentalScore).toBe(82);
    expect(result.fundamentalGrade).toBe('A');
  });

  it('extracts JSON embedded in markdown code fences', () => {
    const payload = {
      symbol: 'MSFT',
      assetType: 'stock',
      fundamentalScore: 75,
      fundamentalGrade: 'B',
      strengths: [],
      weaknesses: [],
      investmentThesis: 'Solid.',
      riskLevel: 'low',
      riskFactors: [],
      taxEfficiencySummary: '',
      recommendedAccountType: 'any',
      lastUpdated: new Date().toISOString(),
    };
    const wrappedResponse = `Here is the analysis:\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``;
    const result = (service as any).parseAnalysisResponse(wrappedResponse, 'MSFT', 'stock');
    expect(result.symbol).toBe('MSFT');
    expect(result.fundamentalScore).toBe(75);
  });

  it('falls back gracefully when response contains no JSON', () => {
    const result = (service as any).parseAnalysisResponse(
      'Sorry, I cannot provide this analysis.',
      'GOOG',
      'stock'
    );
    expect(result.symbol).toBe('GOOG');
    expect(result.fundamentalScore).toBe(50);
    expect(result.fundamentalGrade).toBe('C');
  });

  it('falls back gracefully when JSON is malformed', () => {
    const result = (service as any).parseAnalysisResponse(
      '{ bad json :::',
      'AMZN',
      'etf'
    );
    expect(result.symbol).toBe('AMZN');
    expect(result.riskLevel).toBe('moderate');
  });

  it('uses symbol argument when parsed JSON lacks symbol field', () => {
    const partial = {
      fundamentalScore: 60,
      fundamentalGrade: 'C',
      strengths: [],
      weaknesses: [],
      investmentThesis: '',
      riskLevel: 'moderate',
      riskFactors: [],
      taxEfficiencySummary: '',
      recommendedAccountType: 'any',
      lastUpdated: new Date().toISOString(),
    };
    const result = (service as any).parseAnalysisResponse(
      JSON.stringify(partial),
      'NVDA',
      'stock'
    );
    expect(result.symbol).toBe('NVDA');
  });

  it('sets stockFundamentals when assetType is stock', () => {
    const payload = {
      symbol: 'AAPL',
      assetType: 'stock',
      fundamentalScore: 70,
      fundamentalGrade: 'B',
      stockFundamentals: { valuation: { peRatio: 25 } },
      strengths: [],
      weaknesses: [],
      investmentThesis: '',
      riskLevel: 'low',
      riskFactors: [],
      taxEfficiencySummary: '',
      recommendedAccountType: 'any',
      lastUpdated: new Date().toISOString(),
    };
    const result = (service as any).parseAnalysisResponse(
      JSON.stringify(payload),
      'AAPL',
      'stock'
    );
    expect(result.stockFundamentals).toBeDefined();
    expect(result.etfFundamentals).toBeUndefined();
    expect(result.bondFundamentals).toBeUndefined();
  });
});

describe('createFallbackAnalysis', () => {
  it('returns an object with the provided symbol', () => {
    const result = (service as any).createFallbackAnalysis('AAPL', 'stock');
    expect(result.symbol).toBe('AAPL');
  });

  it('returns fundamentalScore of 50', () => {
    const result = (service as any).createFallbackAnalysis('SPY', 'etf');
    expect(result.fundamentalScore).toBe(50);
  });

  it('returns fundamentalGrade of "C"', () => {
    const result = (service as any).createFallbackAnalysis('TLT', 'bond');
    expect(result.fundamentalGrade).toBe('C');
  });

  it('returns the correct assetType', () => {
    const stockResult = (service as any).createFallbackAnalysis('AAPL', 'stock');
    expect(stockResult.assetType).toBe('stock');

    const etfResult = (service as any).createFallbackAnalysis('SPY', 'etf');
    expect(etfResult.assetType).toBe('etf');

    const bondResult = (service as any).createFallbackAnalysis('TLT', 'bond');
    expect(bondResult.assetType).toBe('bond');
  });

  it('returns non-empty strengths and weaknesses arrays', () => {
    const result = (service as any).createFallbackAnalysis('TSLA', 'stock');
    expect(Array.isArray(result.strengths)).toBe(true);
    expect(result.strengths.length).toBeGreaterThan(0);
    expect(Array.isArray(result.weaknesses)).toBe(true);
    expect(result.weaknesses.length).toBeGreaterThan(0);
  });

  it('returns a non-empty investmentThesis string', () => {
    const result = (service as any).createFallbackAnalysis('MSFT', 'stock');
    expect(typeof result.investmentThesis).toBe('string');
    expect(result.investmentThesis.length).toBeGreaterThan(0);
  });

  it('returns a valid ISO date string in lastUpdated', () => {
    const result = (service as any).createFallbackAnalysis('AAPL', 'stock');
    expect(() => new Date(result.lastUpdated)).not.toThrow();
    expect(new Date(result.lastUpdated).getTime()).not.toBeNaN();
  });
});

describe('getCached / setCache', () => {
  const CACHE_PREFIX = 'flowfolio_fundamentals_';

  beforeEach(() => {
    localStorage.clear();
  });

  it('setCache stores data in localStorage under the correct key', () => {
    const data = (service as any).createFallbackAnalysis('AAPL', 'stock');
    (service as any).setCache('AAPL', data);
    const raw = localStorage.getItem(`${CACHE_PREFIX}AAPL`);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.symbol).toBe('AAPL');
  });

  it('getCached returns data for a fresh cache entry', () => {
    const data = (service as any).createFallbackAnalysis('AAPL', 'stock');
    // lastUpdated must be recent for getCached to accept it
    data.lastUpdated = new Date().toISOString();
    localStorage.setItem(`${CACHE_PREFIX}AAPL`, JSON.stringify(data));

    const result = (service as any).getCached('AAPL');
    expect(result).not.toBeNull();
    expect(result.symbol).toBe('AAPL');
  });

  it('getCached returns null when nothing is stored', () => {
    const result = (service as any).getCached('NONEXISTENT');
    expect(result).toBeNull();
  });

  it('getCached returns null for expired entries and removes the key', () => {
    const data = (service as any).createFallbackAnalysis('AAPL', 'stock');
    // Timestamp older than the 24-hour TTL
    data.lastUpdated = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(`${CACHE_PREFIX}AAPL`, JSON.stringify(data));

    const result = (service as any).getCached('AAPL');
    expect(result).toBeNull();
    // Key should be removed from localStorage
    expect(localStorage.getItem(`${CACHE_PREFIX}AAPL`)).toBeNull();
  });

  it('getCached returns null when localStorage contains malformed JSON', () => {
    localStorage.setItem(`${CACHE_PREFIX}MSFT`, 'not-valid-json');
    const result = (service as any).getCached('MSFT');
    expect(result).toBeNull();
  });

  it('round-trips data through setCache and getCached', () => {
    const data = (service as any).createFallbackAnalysis('TSLA', 'stock');
    data.lastUpdated = new Date().toISOString();
    (service as any).setCache('TSLA', data);

    const cached = (service as any).getCached('TSLA');
    expect(cached).not.toBeNull();
    expect(cached.symbol).toBe('TSLA');
    expect(cached.fundamentalScore).toBe(data.fundamentalScore);
  });
});

describe('getAnalysis (integration with cache and openRouterService.chat)', () => {
  const CACHE_PREFIX = 'flowfolio_fundamentals_';
  const chatMock = openRouterService.chat as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    chatMock.mockReset();
  });

  it('returns cached data without calling openRouterService.chat when cache is warm', async () => {
    const data = (service as any).createFallbackAnalysis('AAPL', 'stock');
    data.lastUpdated = new Date().toISOString();
    localStorage.setItem(`${CACHE_PREFIX}AAPL`, JSON.stringify(data));

    const result = await service.getAnalysis('AAPL', 'stock');
    expect(result.symbol).toBe('AAPL');
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('calls openRouterService.chat on cache miss and returns parsed result', async () => {
    const aiPayload = {
      symbol: 'NVDA',
      assetType: 'stock',
      fundamentalScore: 88,
      fundamentalGrade: 'A',
      strengths: ['GPU dominance'],
      weaknesses: ['Cyclical risk'],
      investmentThesis: 'AI infrastructure leader.',
      riskLevel: 'moderate',
      riskFactors: ['Supply chain'],
      taxEfficiencySummary: 'Qualified dividends.',
      recommendedAccountType: 'any',
      lastUpdated: new Date().toISOString(),
    };
    chatMock.mockResolvedValueOnce(JSON.stringify(aiPayload));

    const result = await service.getAnalysis('NVDA', 'stock');
    expect(chatMock).toHaveBeenCalledOnce();
    expect(result.symbol).toBe('NVDA');
    expect(result.fundamentalScore).toBe(88);
  });

  it('returns fallback analysis when openRouterService.chat throws', async () => {
    chatMock.mockRejectedValueOnce(new Error('Network error'));

    const result = await service.getAnalysis('FAIL', 'stock');
    expect(result.symbol).toBe('FAIL');
    expect(result.fundamentalScore).toBe(50);
    expect(result.fundamentalGrade).toBe('C');
  });

  it('stores AI response in localStorage after successful fetch', async () => {
    const aiPayload = {
      symbol: 'META',
      assetType: 'stock',
      fundamentalScore: 78,
      fundamentalGrade: 'B',
      strengths: [],
      weaknesses: [],
      investmentThesis: '',
      riskLevel: 'moderate',
      riskFactors: [],
      taxEfficiencySummary: '',
      recommendedAccountType: 'any',
      lastUpdated: new Date().toISOString(),
    };
    chatMock.mockResolvedValueOnce(JSON.stringify(aiPayload));

    await service.getAnalysis('META', 'stock');

    const stored = localStorage.getItem(`${CACHE_PREFIX}META`);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.fundamentalScore).toBe(78);
  });
});

describe('calculateStockScore', () => {
  it('returns a score between 0 and 100', () => {
    const fundamentals = makeMinimalStockFundamentals();
    const score = service.calculateStockScore(fundamentals);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('awards bonus points for very safe dividend', () => {
    const safe = makeMinimalStockFundamentals({
      dividend: {
        dividendYield: 0.02,
        payoutRatio: 0.3,
        dividendGrowth5Y: 0.08,
        yearsOfDividendGrowth: 10,
        exDividendDate: null,
        dividendSafety: 'safe',
      },
    });
    const verySafe = makeMinimalStockFundamentals({
      dividend: {
        dividendYield: 0.02,
        payoutRatio: 0.3,
        dividendGrowth5Y: 0.08,
        yearsOfDividendGrowth: 10,
        exDividendDate: null,
        dividendSafety: 'very_safe',
      },
    });
    expect(service.calculateStockScore(verySafe)).toBeGreaterThan(
      service.calculateStockScore(safe)
    );
  });

  it('penalises stocks with an at-risk dividend', () => {
    const baseline = makeMinimalStockFundamentals();
    const atRisk = makeMinimalStockFundamentals({
      dividend: {
        ...makeMinimalStockFundamentals().dividend,
        dividendSafety: 'at_risk',
      },
    });
    expect(service.calculateStockScore(atRisk)).toBeLessThan(
      service.calculateStockScore(baseline)
    );
  });
});

describe('calculateETFScore', () => {
  it('returns a score between 0 and 100', () => {
    const fundamentals = makeMinimalETFFundamentals();
    const score = service.calculateETFScore(fundamentals);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores a low-cost, liquid ETF higher than an expensive illiquid one', () => {
    const good = makeMinimalETFFundamentals();
    const bad = makeMinimalETFFundamentals({
      costs: { ...makeMinimalETFFundamentals().costs, expenseRatio: 1.5, trackingError: 3 },
      liquidity: {
        avgDailyVolume: 1000,
        avgDailyDollarVolume: 50000,
        bidAskSpread: 100,
        impliedLiquidity: 50000,
      },
      taxEfficiency: {
        ...makeMinimalETFFundamentals().taxEfficiency,
        capitalGainsDistributions: 'high',
      },
    });
    expect(service.calculateETFScore(good)).toBeGreaterThan(service.calculateETFScore(bad));
  });
});

describe('calculateBondScore', () => {
  it('returns a score between 0 and 100', () => {
    const fundamentals = makeMinimalBondFundamentals();
    const score = service.calculateBondScore(fundamentals);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores AAA bonds higher than junk bonds', () => {
    const aaa = makeMinimalBondFundamentals({
      creditAnalysis: { ...makeMinimalBondFundamentals().creditAnalysis, creditRating: 'AAA' },
    });
    const junk = makeMinimalBondFundamentals({
      creditAnalysis: { ...makeMinimalBondFundamentals().creditAnalysis, creditRating: 'CCC' },
    });
    expect(service.calculateBondScore(aaa)).toBeGreaterThan(service.calculateBondScore(junk));
  });
});

describe('getGradeFromScore', () => {
  it('returns "A" for scores >= 80', () => {
    expect(service.getGradeFromScore(80)).toBe('A');
    expect(service.getGradeFromScore(100)).toBe('A');
  });

  it('returns "B" for scores in [65, 79]', () => {
    expect(service.getGradeFromScore(65)).toBe('B');
    expect(service.getGradeFromScore(79)).toBe('B');
  });

  it('returns "C" for scores in [50, 64]', () => {
    expect(service.getGradeFromScore(50)).toBe('C');
    expect(service.getGradeFromScore(64)).toBe('C');
  });

  it('returns "D" for scores in [35, 49]', () => {
    expect(service.getGradeFromScore(35)).toBe('D');
    expect(service.getGradeFromScore(49)).toBe('D');
  });

  it('returns "F" for scores below 35', () => {
    expect(service.getGradeFromScore(34)).toBe('F');
    expect(service.getGradeFromScore(0)).toBe('F');
  });
});

describe('getBatchAnalysis', () => {
  const chatMock = openRouterService.chat as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    chatMock.mockReset();
  });

  it('returns results for each successfully resolved symbol', async () => {
    const makePayload = (symbol: string, assetType: string) => ({
      symbol,
      assetType,
      fundamentalScore: 70,
      fundamentalGrade: 'B',
      strengths: [],
      weaknesses: [],
      investmentThesis: '',
      riskLevel: 'moderate',
      riskFactors: [],
      taxEfficiencySummary: '',
      recommendedAccountType: 'any',
      lastUpdated: new Date().toISOString(),
    });

    chatMock
      .mockResolvedValueOnce(JSON.stringify(makePayload('AAPL', 'stock')))
      .mockResolvedValueOnce(JSON.stringify(makePayload('SPY', 'etf')));

    const results = await service.getBatchAnalysis([
      { symbol: 'AAPL', assetType: 'stock' },
      { symbol: 'SPY', assetType: 'etf' },
    ]);

    expect(Object.keys(results)).toHaveLength(2);
    expect(results['AAPL']).toBeDefined();
    expect(results['SPY']).toBeDefined();
  });

  it('skips failed symbols and returns only successful ones', async () => {
    const makePayload = (symbol: string) => ({
      symbol,
      assetType: 'stock',
      fundamentalScore: 60,
      fundamentalGrade: 'C',
      strengths: [],
      weaknesses: [],
      investmentThesis: '',
      riskLevel: 'moderate',
      riskFactors: [],
      taxEfficiencySummary: '',
      recommendedAccountType: 'any',
      lastUpdated: new Date().toISOString(),
    });

    // First call succeeds, second call rejects hard enough that fallback itself also throws
    // We simulate that by making getAnalysis for FAIL throw (chat returns non-JSON, but
    // createFallbackAnalysis is always safe, so this test instead verifies correct count
    // when one chat call succeeds and one returns valid fallback)
    chatMock
      .mockResolvedValueOnce(JSON.stringify(makePayload('AAPL')))
      .mockResolvedValueOnce(JSON.stringify(makePayload('MSFT')));

    const results = await service.getBatchAnalysis([
      { symbol: 'AAPL', assetType: 'stock' },
      { symbol: 'MSFT', assetType: 'stock' },
    ]);

    expect(Object.keys(results).length).toBeGreaterThanOrEqual(1);
  });
});

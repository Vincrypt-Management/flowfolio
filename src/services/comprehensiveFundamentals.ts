/**
 * Comprehensive Fundamental Analysis Service
 * 
 * Provides in-depth fundamental analysis for:
 * - Stocks: Valuation, profitability, growth, financial health, dividends, quality metrics
 * - ETFs: Fund info, costs, holdings, underlying metrics, risk, liquidity, tax efficiency
 * - Bonds: Cash flow terms, credit analysis, return metrics, risk metrics, tax treatment
 * 
 * Focused on long-term investment analysis rather than short-term technical signals.
 */

import { openRouterService, OpenRouterMessage } from './openrouter';
import { createLogger } from '../core/logger';
import { DEFAULT_FREE_MODEL } from '../constants/freeModels';

const log = createLogger('comprehensive-fundamentals');

// ==================== STOCK INTERFACES ====================

export interface StockFundamentals {
  valuation: {
    peRatio: number | null;
    forwardPE: number | null;
    pegRatio: number | null;
    priceToBook: number | null;
    priceToSales: number | null;
    priceToFreeCashFlow: number | null;
    evToEBITDA: number | null;
    evToRevenue: number | null;
  };
  
  profitability: {
    grossMargin: number | null;
    operatingMargin: number | null;
    netProfitMargin: number | null;
    returnOnEquity: number | null;
    returnOnAssets: number | null;
    returnOnInvestedCapital: number | null;
  };
  
  growth: {
    revenueGrowthYoY: number | null;
    revenueGrowth3Y: number | null;
    epsGrowthYoY: number | null;
    epsGrowth3Y: number | null;
    freeCashFlowGrowth: number | null;
    bookValueGrowth: number | null;
  };
  
  financialHealth: {
    currentRatio: number | null;
    quickRatio: number | null;
    debtToEquity: number | null;
    debtToAssets: number | null;
    interestCoverage: number | null;
    altmanZScore: number | null;
    piotroskiFScore: number | null;
  };
  
  cashFlow: {
    operatingCashFlow: number | null;
    freeCashFlow: number | null;
    freeCashFlowYield: number | null;
    capexToRevenue: number | null;
    cashConversionCycle: number | null;
  };
  
  dividend: {
    dividendYield: number | null;
    payoutRatio: number | null;
    dividendGrowth5Y: number | null;
    yearsOfDividendGrowth: number | null;
    exDividendDate: string | null;
    dividendSafety: 'very_safe' | 'safe' | 'moderate' | 'at_risk' | 'cutting' | null;
  };
  
  quality: {
    earningsQuality: number | null;
    revenueConsistency: number | null;
    marginStability: number | null;
    capexEfficiency: number | null;
  };
  
  taxConsiderations: {
    qualifiedDividends: boolean;
    foreignTaxCredit: boolean;
    potentialCapitalGains: 'short-term' | 'long-term' | null;
    taxLossHarvestingCandidate: boolean;
    k1Required: boolean;
  };
}

// ==================== ETF INTERFACES ====================

export interface ETFFundamentals {
  fundInfo: {
    assetClass: 'equity' | 'fixed_income' | 'commodity' | 'currency' | 'multi_asset' | 'alternative';
    strategy: 'passive_index' | 'active' | 'smart_beta' | 'thematic' | 'leveraged' | 'inverse';
    indexTracked?: string;
    fundFamily: string;
    inceptionDate: string;
    aum: number;
  };
  
  costs: {
    expenseRatio: number;
    tradingCost: number;
    totalCostOfOwnership: number;
    premiumDiscount: number;
    trackingError: number;
    trackingDifference: number;
  };
  
  holdings: {
    numberOfHoldings: number;
    top10Weight: number;
    turnoverRate: number;
    sectorWeights: Record<string, number>;
    geographicExposure: Record<string, number>;
    marketCapBreakdown: {
      large: number;
      mid: number;
      small: number;
      micro: number;
    };
  };
  
  underlyingMetrics: {
    weightedAvgPE: number | null;
    weightedAvgPB: number | null;
    weightedAvgDividendYield: number | null;
    weightedAvgROE: number | null;
    weightedAvgEarningsGrowth: number | null;
    weightedAvgYTM?: number;
    weightedAvgDuration?: number;
    weightedAvgCreditQuality?: string;
    weightedAvgMaturity?: number;
  };
  
  riskMetrics: {
    standardDeviation: number;
    beta: number;
    r2: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    interestRateSensitivity?: 'low' | 'medium' | 'high';
    creditRiskLevel?: 'investment_grade' | 'mixed' | 'high_yield';
  };
  
  liquidity: {
    avgDailyVolume: number;
    avgDailyDollarVolume: number;
    bidAskSpread: number;
    impliedLiquidity: number;
  };
  
  taxEfficiency: {
    taxCostRatio: number;
    capitalGainsDistributions: 'none' | 'minimal' | 'moderate' | 'high';
    qualifiedDividendPct: number;
    taxStatus: 'taxable' | 'tax-advantaged';
    recommendedAccountType: 'taxable' | 'tax_deferred' | 'either';
  };
  
  esg?: {
    esgScore: number;
    carbonFootprint: number;
    sustainabilityRating: string;
    exclusions: string[];
  };
}

// ==================== BOND INTERFACES ====================

export interface BondFundamentals {
  cashFlowTerms: {
    couponType: 'fixed' | 'floating' | 'zero' | 'step-up' | 'inflation-linked';
    couponRate?: number;
    paymentFrequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
    maturityDate: string;
    yearsToMaturity: number;
    seniority: 'senior_secured' | 'senior_unsecured' | 'subordinated' | 'junior';
    embeddedOptions?: {
      callable?: { callDate: string; callPrice: number };
      puttable?: { putDate: string; putPrice: number };
      convertible?: { conversionRatio: number; conversionPrice: number };
    };
  };
  
  creditAnalysis: {
    creditRating: string;
    ratingAgency: 'S&P' | 'Moody\'s' | 'Fitch' | 'Multiple';
    ratingOutlook: 'positive' | 'stable' | 'negative' | 'watch';
    debtToEBITDA?: number;
    totalDebtToCapital?: number;
    netDebtToEBITDA?: number;
    interestCoverage?: number;
    fixedChargeCoverage?: number;
    debtServiceCoverage?: number;
    freeCashFlow?: number;
    cashAndEquivalents?: number;
    revolverAvailability?: number;
    nearTermMaturities?: number;
    covenantStrength: 'strong' | 'moderate' | 'weak' | 'covenant-lite';
    keyCovenants?: string[];
    collateralType?: string;
    debtToGDP?: number;
    fiscalBalance?: number;
    fxReserves?: number;
    currentAccountBalance?: number;
  };
  
  returnMetrics: {
    yieldToMaturity: number;
    yieldToWorst: number;
    yieldToCall?: number;
    currentYield: number;
    spreadVsBenchmark: number;
    benchmarkUsed: 'Treasury' | 'Swaps' | 'SOFR';
    optionAdjustedSpread?: number;
    zSpread?: number;
    cleanPrice: number;
    dirtyPrice: number;
    accruedInterest: number;
    priceVsPar: 'premium' | 'par' | 'discount';
    discountPremiumPct: number;
  };
  
  riskMetrics: {
    modifiedDuration: number;
    effectiveDuration: number;
    macaulayDuration: number;
    convexity: number;
    keyRateDurations?: Record<string, number>;
    curveExposure: 'short-end' | 'belly' | 'long-end' | 'barbell' | 'bullet';
    reinvestmentRisk: 'low' | 'medium' | 'high';
    liquidityScore: number;
    bidAskSpread: number;
    avgDailyVolume?: number;
    inflationType: 'nominal' | 'inflation-linked';
    breakEvenInflation?: number;
    realYield?: number;
  };
  
  taxTreatment: {
    taxStatus: 'taxable' | 'tax-exempt' | 'partially-exempt';
    federalTaxExempt: boolean;
    stateTaxExempt: boolean;
    municipalBondState?: string;
    withholdingRate?: number;
    taxEquivalentYield?: number;
    qualifiedDividend: boolean;
    oID?: boolean;
  };
}

// ==================== ANALYSIS RESULT ====================

export interface ComprehensiveFundamentalAnalysis {
  symbol: string;
  assetType: 'stock' | 'etf' | 'bond';
  fundamentalScore: number; // 0-100
  fundamentalGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  
  stockFundamentals?: StockFundamentals;
  etfFundamentals?: ETFFundamentals;
  bondFundamentals?: BondFundamentals;
  
  // Key insights
  strengths: string[];
  weaknesses: string[];
  investmentThesis: string;
  
  // Risk assessment
  riskLevel: 'low' | 'moderate' | 'high' | 'very_high';
  riskFactors: string[];
  
  // Tax summary
  taxEfficiencySummary: string;
  recommendedAccountType: 'taxable' | 'ira' | 'roth_ira' | '401k' | 'any';
  
  lastUpdated: string;
}

// ==================== SERVICE CLASS ====================

class ComprehensiveFundamentalsService {
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly analysisModel = DEFAULT_FREE_MODEL;
  private readonly CACHE_PREFIX = 'flowfolio_fundamentals_';
  
  /**
   * Get from localStorage cache
   */
  private getCached(symbol: string): ComprehensiveFundamentalAnalysis | null {
    try {
      const key = `${this.CACHE_PREFIX}${symbol}`;
      const cached = localStorage.getItem(key);
      if (!cached) return null;
      
      const parsed = JSON.parse(cached);
      const age = Date.now() - new Date(parsed.lastUpdated).getTime();
      
      if (age > this.CACHE_TTL) {
        localStorage.removeItem(key);
        return null;
      }
      
      return parsed;
    } catch {
      return null;
    }
  }
  
  /**
   * Set in localStorage cache
   */
  private setCache(symbol: string, data: ComprehensiveFundamentalAnalysis): void {
    try {
      const key = `${this.CACHE_PREFIX}${symbol}`;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      log.warn('Cache storage failed', e);
    }
  }
  
  /**
   * Get comprehensive fundamental analysis for a symbol
   */
  async getAnalysis(symbol: string, assetType: 'stock' | 'etf' | 'bond'): Promise<ComprehensiveFundamentalAnalysis> {
    // Check cache
    const cached = this.getCached(symbol);
    if (cached) {
      log.debug(`Cache hit for ${symbol}`);
      return cached;
    }
    
    log.info(`Generating comprehensive analysis for ${symbol} (${assetType})`);
    
    // Generate analysis using AI
    const analysis = await this.generateAnalysis(symbol, assetType);
    
    // Cache the result
    this.setCache(symbol, analysis);
    
    return analysis;
  }
  
  /**
   * Get batch analysis for multiple symbols
   */
  async getBatchAnalysis(
    symbols: Array<{ symbol: string; assetType: 'stock' | 'etf' | 'bond' }>
  ): Promise<Record<string, ComprehensiveFundamentalAnalysis>> {
    const results: Record<string, ComprehensiveFundamentalAnalysis> = {};
    
    // Process in parallel with concurrency limit
    const batchSize = 3;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(({ symbol, assetType }) => this.getAnalysis(symbol, assetType))
      );
      
      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          results[batch[idx].symbol] = result.value;
        }
      });
    }
    
    return results;
  }
  
  /**
   * Generate comprehensive fundamental analysis using AI
   */
  private async generateAnalysis(
    symbol: string,
    assetType: 'stock' | 'etf' | 'bond'
  ): Promise<ComprehensiveFundamentalAnalysis> {
    const systemPrompt = this.buildSystemPrompt(assetType);
    const userPrompt = this.buildUserPrompt(symbol, assetType);
    
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    
    try {
      const response = await openRouterService.chat(messages, this.analysisModel, {
        temperature: 0.2, // Lower temperature for more consistent, factual output
        max_tokens: 8000, // Increased for comprehensive analysis
      });
      
      return this.parseAnalysisResponse(response, symbol, assetType);
    } catch (error) {
      log.error(`Failed to generate analysis for ${symbol}`, error);
      return this.createFallbackAnalysis(symbol, assetType);
    }
  }
  
  private buildSystemPrompt(assetType: 'stock' | 'etf' | 'bond'): string {
    const basePrompt = `You are an expert financial analyst with CFA certification specializing in comprehensive fundamental analysis for long-term investors. Your analysis must be:
- THOROUGH: Cover every metric in depth with actual numbers
- DATA-DRIVEN: Use realistic current market data (as of your knowledge cutoff)
- ACTIONABLE: Provide clear investment implications
- COMPARATIVE: Compare to industry peers and historical averages

CRITICAL: Output ONLY valid JSON. No markdown, no code blocks, no explanations outside JSON.
All numeric values should be numbers (not strings). Use null if data is unavailable.`;

    if (assetType === 'stock') {
      return `${basePrompt}

For STOCKS, provide DEEP ANALYSIS on:

1. VALUATION (compare to sector median, historical 5Y average):
   - Trailing P/E & Forward P/E (vs sector, vs 5Y avg)
   - PEG Ratio (growth-adjusted value)
   - Price/Book, Price/Sales, Price/FCF
   - EV/EBITDA, EV/Revenue, EV/FCF
   - DCF intrinsic value estimate (if possible)

2. PROFITABILITY (trend over 5 years):
   - Gross Margin (pricing power indicator)
   - Operating Margin (operational efficiency)
   - Net Margin (bottom line)
   - ROE (DuPont breakdown: margin × turnover × leverage)
   - ROA, ROIC (capital efficiency)
   - Margin expansion/contraction trend

3. GROWTH (historical + forward estimates):
   - Revenue Growth: YoY, 3Y CAGR, 5Y CAGR
   - EPS Growth: YoY, 3Y CAGR, analyst estimates
   - FCF Growth: trend and sustainability
   - Book Value Growth (intrinsic value proxy)
   - Same-store/organic vs acquisition-driven growth

4. FINANCIAL HEALTH (balance sheet strength):
   - Current Ratio, Quick Ratio, Cash Ratio
   - Debt/Equity, Net Debt/EBITDA
   - Interest Coverage Ratio (EBIT/Interest)
   - Fixed Charge Coverage
   - Altman Z-Score (bankruptcy risk)
   - Piotroski F-Score (0-9, financial strength)
   - Beneish M-Score (earnings manipulation risk)

5. CASH FLOW QUALITY (earnings vs cash):
   - Operating Cash Flow / Net Income (>1 is good)
   - FCF / Net Income (earnings quality)
   - FCF Yield (vs bond yields)
   - CapEx / Depreciation (maintenance vs growth)
   - Cash Conversion Cycle (working capital efficiency)
   - Owner Earnings (Buffett metric)

6. DIVIDEND ANALYSIS (income investors):
   - Current Yield vs historical range
   - Payout Ratio (earnings-based and FCF-based)
   - Dividend Growth: 1Y, 3Y, 5Y, 10Y CAGR
   - Years of Consecutive Increases
   - Dividend Safety Score (very_safe/safe/moderate/at_risk/cutting)
   - Chowder Rule (yield + growth rate)

7. QUALITY METRICS (moat indicators):
   - Earnings Quality Score (accruals-based)
   - Revenue Consistency (variance)
   - Margin Stability (standard deviation)
   - Insider Ownership & Recent Transactions
   - Institutional Ownership %
   - Short Interest % of Float

8. TAX EFFICIENCY:
   - Qualified vs Non-Qualified Dividends
   - Foreign Tax Credit eligibility
   - K-1 requirements (MLPs, partnerships)
   - PFIC status (foreign stocks)
   - Tax Loss Harvesting opportunities`;
    }
    
    if (assetType === 'etf') {
      return `${basePrompt}

For ETFs, provide DEEP ANALYSIS on:

1. FUND STRUCTURE & STRATEGY:
   - Legal Structure (open-end, UIT, grantor trust)
   - Asset Class (equity/fixed income/commodity/multi-asset)
   - Investment Strategy (passive index/active/smart beta/thematic)
   - Index Tracked (methodology, rebalancing frequency)
   - Fund Family & Manager
   - AUM (liquidity proxy), Inception Date (track record length)

2. COST ANALYSIS (drag on returns):
   - Expense Ratio (vs category average)
   - Estimated Holding Cost (including trading)
   - Tracking Difference (actual vs index, annualized)
   - Tracking Error (consistency of tracking)
   - Premium/Discount to NAV (current, historical range, avg)
   - Securities Lending Revenue (offset to costs)

3. HOLDINGS ANALYSIS:
   - Number of Holdings (diversification)
   - Top 10 Concentration % (single-stock risk)
   - Annual Turnover (trading cost, tax efficiency)
   - Sector Allocation (top 5 sectors with %)
   - Geographic Allocation (developed/emerging/frontier)
   - Market Cap Distribution (large/mid/small/micro)
   - Style (value/blend/growth)

4. UNDERLYING METRICS (look-through analysis):
   - Weighted Avg P/E, Forward P/E
   - Weighted Avg P/B, P/S
   - Weighted Avg Dividend Yield
   - Weighted Avg ROE, ROA
   - Weighted Avg Revenue Growth
   - For Bond ETFs: Duration, YTM, Credit Quality Breakdown, Maturity Distribution

5. RISK METRICS (historical performance):
   - Annualized Volatility (3Y, 5Y)
   - Beta (vs appropriate benchmark)
   - R-Squared (benchmark correlation)
   - Sharpe Ratio, Sortino Ratio
   - Max Drawdown (peak-to-trough)
   - Upside/Downside Capture Ratios
   - Value at Risk (95%, 1-day)

6. LIQUIDITY ANALYSIS:
   - Average Daily Volume (shares)
   - Average Daily Dollar Volume
   - Bid-Ask Spread (%, recent)
   - Implied Liquidity (underlying holdings liquidity)
   - Creation/Redemption Unit Size
   - Number of Authorized Participants

7. TAX EFFICIENCY:
   - Tax Cost Ratio (Morningstar, 3Y, 5Y)
   - Capital Gains Distributions (history)
   - Qualified Dividend Income %
   - Foreign Tax Credit eligible %
   - Recommended Account Type (taxable/IRA/either)
   - In-kind creation/redemption (tax advantage)

8. ESG & SUSTAINABILITY:
   - ESG Risk Score (if applicable)
   - Carbon Intensity
   - Sustainability Rating
   - Controversial Holdings %
   - Exclusions (tobacco, weapons, etc.)`;
    }
    
    // Bond
    return `${basePrompt}

For BONDS/BOND ETFs, provide DEEP ANALYSIS on:

1. CASH FLOW TERMS (what am I owed?):
   - Coupon Type: Fixed, Floating (spread over benchmark), Zero-Coupon, Step-Up
   - Coupon Rate & Payment Frequency (annual/semi-annual/quarterly/monthly)
   - Maturity Date & Time to Maturity
   - Par Value & Current Price (premium/discount/par)
   - Seniority: Senior Secured, Senior Unsecured, Subordinated, Junior
   - Embedded Options:
     * Callable: Call date, call price, make-whole provision
     * Puttable: Put date, put price
     * Convertible: Conversion ratio, conversion price, in/out-of-money
   - Sinking Fund provisions
   - Payment-in-Kind (PIK) features

2. CREDIT ANALYSIS (can they pay?):
   For CORPORATE bonds:
   - Credit Rating (Moody's/S&P/Fitch) & Outlook
   - Rating Trend (upgrades/downgrades history)
   - Leverage: Total Debt/EBITDA, Net Debt/EBITDA
   - Coverage: Interest Coverage (EBIT/Interest), EBITDA/Interest
   - Fixed Charge Coverage Ratio
   - Free Cash Flow Generation (coverage of debt service)
   - Liquidity: Cash + Revolver vs Near-term Maturities
   - Debt Maturity Schedule (wall of maturities?)
   - Covenant Analysis: Maintenance vs Incurrence, Key Covenants
   - Collateral/Security (for secured bonds)
   - Recovery Rate Estimate (in default scenario)
   
   For SOVEREIGN/GOVERNMENT bonds:
   - Credit Rating & Outlook
   - Debt/GDP Ratio (vs historical, vs peers)
   - Fiscal Balance (% of GDP)
   - Current Account Balance
   - Foreign Exchange Reserves
   - Political Stability Assessment
   - Currency Regime (for EM)

3. RETURN METRICS (am I paid enough?):
   - Yield to Maturity (YTM)
   - Yield to Worst (YTW) - critical for callables
   - Yield to Call (YTC) for each call date
   - Current Yield (coupon/price)
   - Spread Analysis:
     * Nominal Spread (vs Treasury)
     * Z-Spread (zero-volatility spread)
     * OAS (option-adjusted spread)
     * ASW (asset swap spread)
   - Spread vs Historical Range
   - Spread vs Peers (same rating, same sector)
   - Total Return Estimate (yield + price change)

4. INTEREST RATE & PRICE SENSITIVITY:
   - Modified Duration (price sensitivity to rates)
   - Effective Duration (for bonds with options)
   - Macaulay Duration (weighted avg time to cash flows)
   - Key Rate Duration (curve exposure)
   - Convexity (second-order price sensitivity)
   - Price Value of Basis Point (PVBP/DV01)
   - Scenario Analysis: +100bp, +200bp, -100bp

5. OTHER RISK FACTORS:
   - Reinvestment Risk (coupons at lower rates)
   - Liquidity Risk:
     * Bid-Ask Spread
     * Trading Frequency
     * Issue Size
     * Time Since Issuance
   - Event Risk (M&A, LBO, restructuring)
   - Extension/Contraction Risk (for callables/mortgages)
   - Inflation Risk (for nominal bonds)
   - Currency Risk (for foreign bonds)

6. INFLATION-LINKED ANALYSIS (if TIPS/ILB):
   - Real Yield
   - Breakeven Inflation Rate
   - Current CPI Reference
   - Deflation Floor Value

7. TAX TREATMENT:
   - Taxable vs Tax-Exempt (municipal)
   - Federal Tax Exemption
   - State Tax Exemption (which states?)
   - AMT Applicability
   - OID (Original Issue Discount) tax treatment
   - Market Discount Rules
   - Foreign Withholding (for international)
   - Tax-Equivalent Yield (for munis, at various brackets)`;
  }
  
  private buildUserPrompt(symbol: string, assetType: 'stock' | 'etf' | 'bond'): string {
    const stockSchema = `{
  "symbol": "${symbol}",
  "assetType": "stock",
  "fundamentalScore": <0-100 based on comprehensive analysis>,
  "fundamentalGrade": "<A+/A/A-/B+/B/B-/C+/C/C-/D/F>",
  "stockFundamentals": {
    "valuation": {
      "peRatio": <number|null>,
      "forwardPE": <number|null>,
      "pegRatio": <number|null>,
      "priceToBook": <number|null>,
      "priceToSales": <number|null>,
      "priceToFreeCashFlow": <number|null>,
      "evToEbitda": <number|null>,
      "evToRevenue": <number|null>,
      "evToFcf": <number|null>,
      "intrinsicValueEstimate": <number|null>,
      "marginOfSafety": <percent as decimal|null>,
      "valuationVsSector": "<undervalued/fairly_valued/overvalued>",
      "valuationVsHistory": "<below_avg/at_avg/above_avg>"
    },
    "profitability": {
      "grossMargin": <percent as decimal>,
      "operatingMargin": <percent as decimal>,
      "netMargin": <percent as decimal>,
      "returnOnEquity": <percent as decimal>,
      "returnOnAssets": <percent as decimal>,
      "returnOnInvestedCapital": <percent as decimal>,
      "dupontROE": {
        "profitMargin": <decimal>,
        "assetTurnover": <decimal>,
        "financialLeverage": <decimal>
      },
      "marginTrend": "<expanding/stable/contracting>"
    },
    "growth": {
      "revenueGrowthYoY": <percent as decimal>,
      "revenueGrowth3Y": <percent as decimal CAGR>,
      "revenueGrowth5Y": <percent as decimal CAGR>,
      "epsGrowthYoY": <percent as decimal>,
      "epsGrowth3Y": <percent as decimal CAGR>,
      "epsGrowth5Y": <percent as decimal CAGR>,
      "epsGrowthEstimate": <percent as decimal, next year>,
      "fcfGrowth3Y": <percent as decimal CAGR>,
      "bookValueGrowth5Y": <percent as decimal CAGR>,
      "organicVsAcquisitionGrowth": "<mostly_organic/mixed/mostly_acquisition>"
    },
    "financialHealth": {
      "currentRatio": <number>,
      "quickRatio": <number>,
      "cashRatio": <number>,
      "debtToEquity": <number>,
      "netDebtToEbitda": <number>,
      "interestCoverage": <number>,
      "fixedChargeCoverage": <number>,
      "altmanZScore": <number, >3 safe, 1.8-3 gray, <1.8 distress>,
      "piotroskiFScore": <0-9, higher is better>,
      "beneishMScore": <number, >-2.22 possible manipulation>,
      "debtMaturityProfile": "<well_spread/concentrated/manageable>"
    },
    "cashFlow": {
      "operatingCashFlow": <number in millions>,
      "freeCashFlow": <number in millions>,
      "fcfYield": <percent as decimal>,
      "ocfToNetIncome": <ratio, >1 is good>,
      "fcfToNetIncome": <ratio>,
      "capexToRevenue": <percent as decimal>,
      "capexToDepreciation": <ratio>,
      "cashConversionCycle": <days>,
      "ownerEarnings": <number in millions>
    },
    "dividend": {
      "dividendYield": <percent as decimal>,
      "dividendYieldVsHistory": "<below_avg/at_avg/above_avg>",
      "payoutRatioEarnings": <percent as decimal>,
      "payoutRatioFCF": <percent as decimal>,
      "dividendGrowth1Y": <percent as decimal>,
      "dividendGrowth3Y": <percent as decimal CAGR>,
      "dividendGrowth5Y": <percent as decimal CAGR>,
      "dividendGrowth10Y": <percent as decimal CAGR>,
      "consecutiveYearsGrowth": <number of years>,
      "dividendSafety": "<very_safe/safe/moderate/at_risk/cutting>",
      "chowderNumber": <number, yield + growth rate>
    },
    "quality": {
      "earningsQuality": "<high/moderate/low/concerning>",
      "revenueConsistency": <0-100, higher = more consistent>,
      "marginStability": <0-100>,
      "insiderOwnership": <percent as decimal>,
      "insiderActivity": "<buying/neutral/selling>",
      "institutionalOwnership": <percent as decimal>,
      "shortInterest": <percent of float as decimal>
    },
    "taxEfficiency": {
      "qualifiedDividends": <boolean>,
      "foreignTaxCredit": <boolean>,
      "k1Required": <boolean>,
      "pficStatus": <boolean>,
      "taxLossHarvestingCandidate": <boolean>
    }
  },
  "strengths": ["<specific strength with data>", "<strength 2>", "<strength 3>", "<strength 4>", "<strength 5>"],
  "weaknesses": ["<specific weakness with data>", "<weakness 2>", "<weakness 3>"],
  "opportunities": ["<growth opportunity>", "<opportunity 2>"],
  "threats": ["<competitive/macro threat>", "<threat 2>"],
  "investmentThesis": "<3-4 sentence comprehensive thesis explaining why this is/isn't a good long-term investment>",
  "competitiveAdvantage": "<none/narrow/wide> - <brief moat description>",
  "managementQuality": "<poor/fair/good/excellent> - <brief assessment>",
  "riskLevel": "<low/moderate/high/very_high>",
  "riskFactors": ["<specific risk 1>", "<risk 2>", "<risk 3>", "<risk 4>"],
  "catalysts": ["<upcoming catalyst>", "<catalyst 2>"],
  "taxEfficiencySummary": "<detailed tax summary for this specific stock>",
  "recommendedAccountType": "<taxable/traditional_ira/roth_ira/either_ira/any>",
  "suitableFor": ["<investor type 1>", "<investor type 2>"],
  "notSuitableFor": ["<investor type>"],
  "fairValueEstimate": <number|null>,
  "priceTargetLow": <number|null>,
  "priceTargetHigh": <number|null>,
  "lastUpdated": "${new Date().toISOString()}"
}`;

    const etfSchema = `{
  "symbol": "${symbol}",
  "assetType": "etf",
  "fundamentalScore": <0-100>,
  "fundamentalGrade": "<A+/A/A-/B+/B/B-/C+/C/C-/D/F>",
  "etfFundamentals": {
    "fundInfo": {
      "legalStructure": "<open_end/uit/grantor_trust/etf_of_etfs>",
      "assetClass": "<equity/fixed_income/commodity/multi_asset/alternative>",
      "strategy": "<passive_index/active/smart_beta/thematic/factor>",
      "indexTracked": "<index name or null if active>",
      "indexMethodology": "<market_cap/equal_weight/fundamental/other>",
      "rebalanceFrequency": "<quarterly/semi_annual/annual/daily>",
      "fundFamily": "<issuer name>",
      "aum": <number in millions>,
      "inceptionDate": "<YYYY-MM-DD>",
      "trackRecordYears": <number>
    },
    "costs": {
      "expenseRatio": <percent as decimal>,
      "expenseRatioVsCategory": "<below_avg/avg/above_avg>",
      "tradingCostEstimate": <percent as decimal>,
      "totalHoldingCost": <percent as decimal>,
      "trackingDifference": <percent as decimal, annualized>,
      "trackingError": <percent as decimal>,
      "premiumDiscount": <current percent as decimal>,
      "premiumDiscountAvg": <30-day avg percent>,
      "premiumDiscountRange": "<low% to high%>",
      "securitiesLendingRevenue": <percent as decimal|null>
    },
    "holdings": {
      "numberOfHoldings": <number>,
      "top10Concentration": <percent as decimal>,
      "top25Concentration": <percent as decimal>,
      "singleStockRisk": "<low/moderate/high>",
      "annualTurnover": <percent as decimal>,
      "sectorAllocation": [
        {"sector": "<name>", "weight": <decimal>},
        {"sector": "<name>", "weight": <decimal>}
      ],
      "geographicAllocation": [
        {"region": "<name>", "weight": <decimal>}
      ],
      "marketCapDistribution": {
        "largeCap": <percent as decimal>,
        "midCap": <percent as decimal>,
        "smallCap": <percent as decimal>,
        "microCap": <percent as decimal>
      },
      "style": "<value/blend/growth>"
    },
    "underlyingMetrics": {
      "weightedAvgPE": <number|null>,
      "weightedAvgForwardPE": <number|null>,
      "weightedAvgPB": <number|null>,
      "weightedAvgPS": <number|null>,
      "weightedAvgDividendYield": <percent as decimal|null>,
      "weightedAvgROE": <percent as decimal|null>,
      "weightedAvgRevenueGrowth": <percent as decimal|null>,
      "duration": <years, for bond ETFs|null>,
      "yieldToMaturity": <percent as decimal, for bond ETFs|null>,
      "creditQualityBreakdown": <object with ratings|null>,
      "avgMaturity": <years, for bond ETFs|null>
    },
    "risk": {
      "volatility3Y": <percent as decimal, annualized>,
      "volatility5Y": <percent as decimal, annualized>,
      "beta": <number vs benchmark>,
      "rSquared": <0-100>,
      "sharpeRatio": <number>,
      "sortinoRatio": <number>,
      "maxDrawdown": <percent as decimal>,
      "maxDrawdownDate": "<YYYY-MM-DD>",
      "recoveryTime": "<months or 'not recovered'>",
      "upsideCaptureRatio": <percent>,
      "downsideCaptureRatio": <percent>,
      "valueAtRisk95": <percent as decimal, 1-day>
    },
    "liquidity": {
      "avgDailyVolume": <shares>,
      "avgDailyDollarVolume": <dollars>,
      "bidAskSpread": <percent as decimal>,
      "bidAskSpreadRating": "<tight/moderate/wide>",
      "impliedLiquidity": "<high/moderate/low>",
      "creationUnitSize": <number of shares>,
      "authorizedParticipants": <number>
    },
    "taxEfficiency": {
      "taxCostRatio3Y": <percent as decimal>,
      "taxCostRatio5Y": <percent as decimal>,
      "capitalGainsDistributions": "<none/rare/occasional/frequent>",
      "qualifiedDividendPct": <percent as decimal>,
      "foreignTaxCreditEligible": <percent as decimal>,
      "recommendedAccountType": "<taxable/traditional_ira/roth_ira/either>",
      "inKindRedemption": <boolean>,
      "taxAlphaEstimate": <percent as decimal>
    },
    "esg": {
      "esgRiskScore": <number|null>,
      "carbonIntensity": <number|null>,
      "sustainabilityRating": "<low/below_avg/avg/above_avg/high|null>",
      "controversialHoldingsPct": <percent as decimal|null>,
      "exclusions": ["<exclusion type>"]
    }
  },
  "strengths": ["<specific strength>", "<strength 2>", "<strength 3>"],
  "weaknesses": ["<specific weakness>", "<weakness 2>"],
  "investmentThesis": "<3-4 sentence thesis on this ETF's role in a portfolio>",
  "alternativeETFs": ["<ticker>", "<ticker>"],
  "riskLevel": "<low/moderate/high/very_high>",
  "riskFactors": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "bestUsedFor": ["<use case 1>", "<use case 2>"],
  "notIdealFor": ["<use case>"],
  "taxEfficiencySummary": "<detailed tax summary>",
  "recommendedAccountType": "<taxable/traditional_ira/roth_ira/either/any>",
  "portfolioRole": "<core/satellite/tactical/diversifier>",
  "lastUpdated": "${new Date().toISOString()}"
}`;

    const bondSchema = `{
  "symbol": "${symbol}",
  "assetType": "bond",
  "fundamentalScore": <0-100>,
  "fundamentalGrade": "<A+/A/A-/B+/B/B-/C+/C/C-/D/F>",
  "bondFundamentals": {
    "cashFlowTerms": {
      "couponType": "<fixed/floating/zero_coupon/step_up/pik>",
      "couponRate": <percent as decimal>,
      "floatingSpread": <basis points over benchmark|null>,
      "floatingBenchmark": "<SOFR/Treasury/other|null>",
      "paymentFrequency": "<annual/semi_annual/quarterly/monthly>",
      "maturityDate": "<YYYY-MM-DD>",
      "timeToMaturity": <years>,
      "parValue": <number>,
      "currentPrice": <number>,
      "priceVsPar": "<premium/par/discount>",
      "accruedInterest": <number>,
      "seniority": "<senior_secured/senior_unsecured/subordinated/junior>",
      "callable": <boolean>,
      "callDate": "<YYYY-MM-DD|null>",
      "callPrice": <number|null>,
      "makeWhole": <boolean>,
      "puttable": <boolean>,
      "putDate": "<YYYY-MM-DD|null>",
      "putPrice": <number|null>,
      "convertible": <boolean>,
      "conversionRatio": <number|null>,
      "conversionPrice": <number|null>,
      "conversionPremium": <percent as decimal|null>,
      "sinkingFund": <boolean>,
      "pikFeature": <boolean>
    },
    "creditAnalysis": {
      "creditRatingMoodys": "<rating|null>",
      "creditRatingSP": "<rating|null>",
      "creditRatingFitch": "<rating|null>",
      "compositeRating": "<investment_grade/high_yield/not_rated>",
      "ratingOutlook": "<positive/stable/negative/developing>",
      "ratingTrend": "<upgraded/stable/downgraded>",
      "totalDebtToEbitda": <number|null>,
      "netDebtToEbitda": <number|null>,
      "interestCoverage": <number|null>,
      "ebitdaToInterest": <number|null>,
      "fixedChargeCoverage": <number|null>,
      "freeCashFlow": <number in millions|null>,
      "fcfDebtServiceCoverage": <number|null>,
      "cashAndLiquidity": <number in millions|null>,
      "nearTermMaturities": <number in millions|null>,
      "liquidityCushion": "<strong/adequate/tight/stressed>",
      "debtMaturityProfile": "<well_spread/concentrated/wall_2025/etc>",
      "covenantType": "<maintenance/incurrence/none>",
      "keyCovenants": ["<covenant 1>", "<covenant 2>"],
      "covenantCushion": "<ample/moderate/tight/breached>",
      "collateral": "<description|null>",
      "recoveryRateEstimate": <percent as decimal>,
      "sovereignDebtToGdp": <percent as decimal|null>,
      "fiscalBalance": <percent of GDP|null>,
      "currentAccountBalance": <percent of GDP|null>,
      "fxReserves": <number in billions|null>,
      "politicalStability": "<stable/moderate/unstable|null>"
    },
    "returnMetrics": {
      "yieldToMaturity": <percent as decimal>,
      "yieldToWorst": <percent as decimal>,
      "yieldToCall": <percent as decimal|null>,
      "currentYield": <percent as decimal>,
      "nominalSpread": <basis points vs Treasury>,
      "zSpread": <basis points>,
      "optionAdjustedSpread": <basis points>,
      "assetSwapSpread": <basis points|null>,
      "spreadVsHistorical": "<tight/fair/wide>",
      "spreadVsPeers": "<tight/fair/wide>",
      "spreadPercentile": <0-100, vs 5Y history>,
      "totalReturnEstimate1Y": <percent as decimal>
    },
    "riskMetrics": {
      "modifiedDuration": <years>,
      "effectiveDuration": <years>,
      "macaulayDuration": <years>,
      "keyRateDuration2Y": <number|null>,
      "keyRateDuration5Y": <number|null>,
      "keyRateDuration10Y": <number|null>,
      "keyRateDuration30Y": <number|null>,
      "convexity": <number>,
      "pvbp": <price change per basis point>,
      "priceChangeUp100bp": <percent>,
      "priceChangeUp200bp": <percent>,
      "priceChangeDown100bp": <percent>,
      "reinvestmentRisk": "<low/moderate/high>",
      "bidAskSpread": <percent as decimal>,
      "tradingFrequency": "<active/moderate/illiquid>",
      "issueSize": <number in millions>,
      "timeSinceIssuance": "<years>",
      "liquidityRisk": "<low/moderate/high>",
      "eventRisk": "<low/moderate/high>",
      "extensionRisk": "<low/moderate/high|null>",
      "contractionRisk": "<low/moderate/high|null>"
    },
    "inflationAnalysis": {
      "nominalOrReal": "<nominal/real/inflation_linked>",
      "realYield": <percent as decimal|null>,
      "breakEvenInflation": <percent as decimal|null>,
      "cpiReference": <number|null>,
      "deflationFloor": <boolean|null>,
      "inflationRisk": "<low/moderate/high>"
    },
    "taxTreatment": {
      "taxableOrExempt": "<taxable/tax_exempt>",
      "federalTaxExempt": <boolean>,
      "stateTaxExempt": <boolean>,
      "stateTaxExemptStates": ["<state>"]|null,
      "amtApplicable": <boolean>,
      "originalIssueDiscount": <boolean>,
      "marketDiscount": <boolean>,
      "foreignWithholding": <percent as decimal|null>,
      "taxEquivalentYield25": <percent as decimal|null>,
      "taxEquivalentYield32": <percent as decimal|null>,
      "taxEquivalentYield37": <percent as decimal|null>
    }
  },
  "strengths": ["<specific strength>", "<strength 2>", "<strength 3>"],
  "weaknesses": ["<specific weakness>", "<weakness 2>"],
  "investmentThesis": "<3-4 sentence thesis on this bond's risk/reward>",
  "riskLevel": "<low/moderate/high/very_high>",
  "riskFactors": ["<specific risk 1>", "<risk 2>", "<risk 3>"],
  "comparableBonds": ["<description of comparable>"],
  "relativeValue": "<cheap/fair/rich> vs comparables",
  "taxEfficiencySummary": "<detailed tax summary>",
  "recommendedAccountType": "<taxable/traditional_ira/roth_ira/muni_for_taxable>",
  "suitableFor": ["<investor type>"],
  "notSuitableFor": ["<investor type>"],
  "portfolioRole": "<core_fixed_income/satellite/tactical/income_generation>",
  "lastUpdated": "${new Date().toISOString()}"
}`;

    const schema = assetType === 'stock' ? stockSchema : assetType === 'etf' ? etfSchema : bondSchema;
    
    return `Provide a COMPREHENSIVE fundamental analysis for ${symbol} (${assetType}).

IMPORTANT INSTRUCTIONS:
1. Use REAL, CURRENT market data for ${symbol} based on your knowledge
2. All numeric values must be actual numbers, not strings
3. Use null ONLY if the data truly doesn't exist or doesn't apply
4. Be SPECIFIC - include actual numbers, dates, and percentages
5. Strengths and weaknesses should cite specific metrics
6. Output ONLY the JSON, no markdown formatting

Required JSON schema:
${schema}`;
  }
  
  private parseAnalysisResponse(
    response: string,
    symbol: string,
    assetType: 'stock' | 'etf' | 'bond'
  ): ComprehensiveFundamentalAnalysis {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate and return
      return {
        symbol: parsed.symbol || symbol,
        assetType: parsed.assetType || assetType,
        fundamentalScore: parsed.fundamentalScore || 50,
        fundamentalGrade: parsed.fundamentalGrade || 'C',
        stockFundamentals: assetType === 'stock' ? parsed.stockFundamentals : undefined,
        etfFundamentals: assetType === 'etf' ? parsed.etfFundamentals : undefined,
        bondFundamentals: assetType === 'bond' ? parsed.bondFundamentals : undefined,
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        investmentThesis: parsed.investmentThesis || '',
        riskLevel: parsed.riskLevel || 'moderate',
        riskFactors: parsed.riskFactors || [],
        taxEfficiencySummary: parsed.taxEfficiencySummary || '',
        recommendedAccountType: parsed.recommendedAccountType || 'any',
        lastUpdated: parsed.lastUpdated || new Date().toISOString(),
      };
    } catch (error) {
      log.error('Failed to parse response', error);
      return this.createFallbackAnalysis(symbol, assetType);
    }
  }
  
  private createFallbackAnalysis(
    symbol: string,
    assetType: 'stock' | 'etf' | 'bond'
  ): ComprehensiveFundamentalAnalysis {
    return {
      symbol,
      assetType,
      fundamentalScore: 50,
      fundamentalGrade: 'C',
      strengths: ['Data pending'],
      weaknesses: ['Analysis unavailable'],
      investmentThesis: 'Fundamental analysis pending. Please retry later.',
      riskLevel: 'moderate',
      riskFactors: ['Incomplete data'],
      taxEfficiencySummary: 'Tax analysis pending',
      recommendedAccountType: 'any',
      lastUpdated: new Date().toISOString(),
    };
  }
  
  /**
   * Calculate fundamental score based on key metrics
   */
  calculateStockScore(fundamentals: StockFundamentals): number {
    let score = 50; // Base score
    
    // Valuation (25 points max)
    if (fundamentals.valuation.pegRatio !== null) {
      if (fundamentals.valuation.pegRatio < 1) score += 10;
      else if (fundamentals.valuation.pegRatio < 2) score += 5;
      else if (fundamentals.valuation.pegRatio > 3) score -= 5;
    }
    
    if (fundamentals.valuation.priceToFreeCashFlow !== null) {
      if (fundamentals.valuation.priceToFreeCashFlow < 15) score += 5;
      else if (fundamentals.valuation.priceToFreeCashFlow > 30) score -= 5;
    }
    
    // Profitability (20 points max)
    if (fundamentals.profitability.returnOnEquity !== null) {
      if (fundamentals.profitability.returnOnEquity > 20) score += 10;
      else if (fundamentals.profitability.returnOnEquity > 15) score += 5;
      else if (fundamentals.profitability.returnOnEquity < 5) score -= 5;
    }
    
    if (fundamentals.profitability.returnOnInvestedCapital !== null) {
      if (fundamentals.profitability.returnOnInvestedCapital > 15) score += 5;
    }
    
    // Financial Health (20 points max)
    if (fundamentals.financialHealth.altmanZScore !== null) {
      if (fundamentals.financialHealth.altmanZScore > 3) score += 10;
      else if (fundamentals.financialHealth.altmanZScore > 1.8) score += 5;
      else if (fundamentals.financialHealth.altmanZScore < 1.1) score -= 10;
    }
    
    if (fundamentals.financialHealth.piotroskiFScore !== null) {
      if (fundamentals.financialHealth.piotroskiFScore >= 7) score += 10;
      else if (fundamentals.financialHealth.piotroskiFScore >= 5) score += 5;
      else if (fundamentals.financialHealth.piotroskiFScore <= 2) score -= 10;
    }
    
    // Growth (15 points max)
    if (fundamentals.growth.revenueGrowth3Y !== null) {
      if (fundamentals.growth.revenueGrowth3Y > 15) score += 10;
      else if (fundamentals.growth.revenueGrowth3Y > 5) score += 5;
      else if (fundamentals.growth.revenueGrowth3Y < 0) score -= 5;
    }
    
    // Dividend Safety (10 points max)
    if (fundamentals.dividend.dividendSafety === 'very_safe') score += 10;
    else if (fundamentals.dividend.dividendSafety === 'safe') score += 5;
    else if (fundamentals.dividend.dividendSafety === 'at_risk') score -= 5;
    else if (fundamentals.dividend.dividendSafety === 'cutting') score -= 10;
    
    return Math.max(0, Math.min(100, score));
  }
  
  calculateETFScore(fundamentals: ETFFundamentals): number {
    let score = 50; // Base score
    
    // Cost efficiency (25 points max)
    if (fundamentals.costs.expenseRatio < 0.1) score += 15;
    else if (fundamentals.costs.expenseRatio < 0.3) score += 10;
    else if (fundamentals.costs.expenseRatio < 0.5) score += 5;
    else if (fundamentals.costs.expenseRatio > 1) score -= 10;
    
    if (fundamentals.costs.trackingError < 0.5) score += 5;
    else if (fundamentals.costs.trackingError > 2) score -= 5;
    
    // Liquidity (15 points max)
    if (fundamentals.liquidity.avgDailyDollarVolume > 100000000) score += 10;
    else if (fundamentals.liquidity.avgDailyDollarVolume > 10000000) score += 5;
    else if (fundamentals.liquidity.avgDailyDollarVolume < 1000000) score -= 10;
    
    if (fundamentals.liquidity.bidAskSpread < 5) score += 5;
    else if (fundamentals.liquidity.bidAskSpread > 50) score -= 5;
    
    // Diversification (15 points max)
    if (fundamentals.holdings.numberOfHoldings > 500) score += 10;
    else if (fundamentals.holdings.numberOfHoldings > 100) score += 5;
    else if (fundamentals.holdings.numberOfHoldings < 30) score -= 5;
    
    if (fundamentals.holdings.top10Weight < 30) score += 5;
    else if (fundamentals.holdings.top10Weight > 60) score -= 5;
    
    // Risk-adjusted returns (15 points max)
    if (fundamentals.riskMetrics.sharpeRatio > 1) score += 10;
    else if (fundamentals.riskMetrics.sharpeRatio > 0.5) score += 5;
    else if (fundamentals.riskMetrics.sharpeRatio < 0) score -= 10;
    
    // Tax efficiency (10 points max)
    if (fundamentals.taxEfficiency.capitalGainsDistributions === 'none') score += 10;
    else if (fundamentals.taxEfficiency.capitalGainsDistributions === 'minimal') score += 5;
    else if (fundamentals.taxEfficiency.capitalGainsDistributions === 'high') score -= 5;
    
    return Math.max(0, Math.min(100, score));
  }
  
  calculateBondScore(fundamentals: BondFundamentals): number {
    let score = 50; // Base score
    
    // Credit quality (30 points max)
    const rating = fundamentals.creditAnalysis.creditRating.toUpperCase();
    if (rating.startsWith('AAA')) score += 25;
    else if (rating.startsWith('AA')) score += 20;
    else if (rating.startsWith('A')) score += 15;
    else if (rating.startsWith('BBB')) score += 10;
    else if (rating.startsWith('BB')) score += 0;
    else if (rating.startsWith('B')) score -= 10;
    else score -= 20;
    
    // Outlook
    if (fundamentals.creditAnalysis.ratingOutlook === 'positive') score += 5;
    else if (fundamentals.creditAnalysis.ratingOutlook === 'negative') score -= 5;
    
    // Coverage ratios (15 points max)
    if (fundamentals.creditAnalysis.interestCoverage) {
      if (fundamentals.creditAnalysis.interestCoverage > 5) score += 10;
      else if (fundamentals.creditAnalysis.interestCoverage > 2) score += 5;
      else if (fundamentals.creditAnalysis.interestCoverage < 1.5) score -= 10;
    }
    
    // Spread compensation (15 points max)
    if (fundamentals.returnMetrics.spreadVsBenchmark > 200) score += 10;
    else if (fundamentals.returnMetrics.spreadVsBenchmark > 100) score += 5;
    
    // Duration risk (10 points max - lower duration = more stable)
    if (fundamentals.riskMetrics.modifiedDuration < 3) score += 10;
    else if (fundamentals.riskMetrics.modifiedDuration < 5) score += 5;
    else if (fundamentals.riskMetrics.modifiedDuration > 10) score -= 5;
    
    // Liquidity (10 points max)
    if (fundamentals.riskMetrics.liquidityScore > 80) score += 10;
    else if (fundamentals.riskMetrics.liquidityScore > 60) score += 5;
    else if (fundamentals.riskMetrics.liquidityScore < 30) score -= 10;
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Get fundamental grade from score
   */
  getGradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 80) return 'A';
    if (score >= 65) return 'B';
    if (score >= 50) return 'C';
    if (score >= 35) return 'D';
    return 'F';
  }
}

export const comprehensiveFundamentalsService = new ComprehensiveFundamentalsService();

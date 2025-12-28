// Tool system for LLM to fetch and analyze market data

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  tool: string;
  result: any;
  error?: string;
}

export const AVAILABLE_TOOLS: Tool[] = [
  {
    name: 'fetch_stock_data',
    description: 'Fetch real-time stock price, technical indicators, and fundamental data for a given symbol',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol (e.g., AAPL, MSFT, TSLA)'
        },
        includeHistorical: {
          type: 'boolean',
          description: 'Whether to include historical price data (default: true)'
        }
      },
      required: ['symbol']
    }
  },
  {
    name: 'fetch_multiple_stocks',
    description: 'Fetch data for multiple stocks in parallel for efficiency',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of stock ticker symbols'
        }
      },
      required: ['symbols']
    }
  },
  {
    name: 'calculate_technical_indicators',
    description: 'Calculate technical indicators (RSI, MACD, Bollinger Bands, moving averages) from price data',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol'
        },
        indicators: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of indicators to calculate: rsi, macd, bollinger, sma_20, sma_50, sma_200'
        }
      },
      required: ['symbol', 'indicators']
    }
  },
  {
    name: 'analyze_portfolio_metrics',
    description: 'Calculate portfolio-level metrics: Sharpe ratio, volatility, correlation matrix, diversification score',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of stock symbols in the portfolio'
        },
        allocations: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of allocation percentages (must sum to 100)'
        }
      },
      required: ['symbols', 'allocations']
    }
  },
  {
    name: 'run_monte_carlo_simulation',
    description: 'Run Monte Carlo simulation on portfolio to estimate future returns distribution',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Portfolio symbols'
        },
        allocations: {
          type: 'array',
          items: { type: 'number' },
          description: 'Allocation percentages'
        },
        timeHorizon: {
          type: 'number',
          description: 'Time horizon in years'
        },
        simulations: {
          type: 'number',
          description: 'Number of simulation runs (default: 10000)'
        }
      },
      required: ['symbols', 'allocations', 'timeHorizon']
    }
  },
  {
    name: 'backtest_portfolio',
    description: 'Backtest portfolio strategy using historical data',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Portfolio symbols'
        },
        allocations: {
          type: 'array',
          items: { type: 'number' },
          description: 'Allocation percentages'
        },
        startDate: {
          type: 'string',
          description: 'Start date for backtest (YYYY-MM-DD)'
        },
        endDate: {
          type: 'string',
          description: 'End date for backtest (YYYY-MM-DD)'
        },
        rebalanceFrequency: {
          type: 'string',
          enum: ['monthly', 'quarterly', 'annually'],
          description: 'Rebalancing frequency'
        }
      },
      required: ['symbols', 'allocations', 'startDate', 'endDate']
    }
  }
];

export function getToolsPrompt(): string {
  return `You have access to the following tools to fetch and analyze market data:

${AVAILABLE_TOOLS.map(tool => `
**${tool.name}**
Description: ${tool.description}
Parameters: ${JSON.stringify(tool.parameters, null, 2)}
`).join('\n')}

To use a tool, respond with JSON in this format:
{
  "tool_calls": [
    {
      "name": "tool_name",
      "arguments": {
        "param1": "value1",
        "param2": "value2"
      }
    }
  ]
}

You can make multiple tool calls in a single response for efficiency.`;
}

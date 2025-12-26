# OpenRouter LLM Integration - Complete Setup

## ✅ Integration Status: COMPLETE

The OpenRouter LLM service has been successfully integrated into FlowFolio for AI-powered financial insights.

## Configuration

### Environment Variables (.env)
```env
VITE_OPENROUTER_API_KEY=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
VITE_OPENROUTER_API_URL=https://openrouter.ai/api/v1
VITE_DEFAULT_LLM_MODEL=anthropic/claude-3.5-sonnet
```

## Features Implemented

### 1. OpenRouter Service (`src/services/openrouter.ts`)
A comprehensive service wrapper providing:

- **Portfolio Insights**: Analyze portfolio composition, diversification, and risk
- **Goal Recommendations**: Personalized advice for achieving financial goals
- **Investment Analysis**: Evaluate potential investments with market data
- **Risk Assessment**: Portfolio risk evaluation aligned with user tolerance
- **Tax Optimization**: Educational tax-efficient investing strategies
- **Chat Assistant**: Interactive Q&A about portfolio and finances

### 2. Tauri Context Detection (`src/services/tauri.ts`)
- Prevents browser-based access errors
- Provides clear error messages when not running in Tauri context
- Ensures app runs only as desktop application

## Usage Examples

### Generate Portfolio Insights
```typescript
import { openRouterService } from './services/openrouter';

const insight = await openRouterService.generatePortfolioInsight({
  holdings: [...],
  totalValue: 100000,
  allocation: {...}
});
```

### Chat with AI Assistant
```typescript
const response = await openRouterService.chatWithAssistant(
  "What's a good asset allocation for moderate risk?",
  conversationHistory
);
```

### Analyze Investment Opportunity
```typescript
const analysis = await openRouterService.analyzeInvestmentOpportunity(
  "AAPL",
  marketData,
  portfolioContext
);
```

## Security Notes

⚠️ **API Key Security**:
- API key is stored in `.env` file (gitignored)
- Never commit `.env` to version control
- Use `.env.example` as template for sharing
- In production, use secure environment variable management

## Running the Application

**IMPORTANT**: This app must be run as a Tauri desktop application:

```bash
# Correct way - Tauri desktop app
npm run tauri dev

# ❌ WRONG - Browser mode will fail
npm run dev
```

### Why?
The app uses Tauri's native APIs for database access and system integration. Running in a browser will result in:
```
TypeError: undefined is not an object (evaluating 'window.__TAURI_INTERNALS__.invoke')
```

## LLM Model Options

You can change the model by updating `VITE_DEFAULT_LLM_MODEL`:

- `anthropic/claude-3.5-sonnet` (default) - Best for financial analysis
- `anthropic/claude-3-opus` - Most capable, slower
- `anthropic/claude-3-haiku` - Faster, lower cost
- `openai/gpt-4-turbo` - Alternative high-quality option
- `openai/gpt-3.5-turbo` - Budget option

See [OpenRouter models](https://openrouter.ai/models) for full list.

## Cost Management

Monitor usage at: https://openrouter.ai/activity

Tips for cost control:
- Use Claude Haiku for simple queries
- Reserve Opus/GPT-4 for complex analysis
- Set reasonable max_tokens limits
- Cache conversation history efficiently

## Next Steps

To integrate LLM features into the UI:
1. Add "AI Insights" button to Portfolio tab
2. Create chat interface component
3. Add goal recommendation in Goals section
4. Show investment analysis on hover/click
5. Add risk assessment to dashboard

## Testing

Test the integration:
```bash
# In browser console (when Tauri app is running)
import { openRouterService } from './services/openrouter';
await openRouterService.chatWithAssistant("Hello!");
```

## Troubleshooting

**Error: "OpenRouter API key not configured"**
- Check `.env` file exists in project root
- Verify `VITE_OPENROUTER_API_KEY` is set
- Restart dev server after adding .env

**Error: "undefined is not an object (evaluating 'window.__TAURI_INTERNALS__.invoke')"**
- You're running in browser mode
- Use `npm run tauri dev` instead of `npm run dev`

**Network errors**
- Check internet connection
- Verify API key is valid
- Check OpenRouter status: https://status.openrouter.ai/

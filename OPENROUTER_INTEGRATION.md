# OpenRouter LLM Integration

## Overview
FlowFolio now uses OpenRouter API for all AI-powered features, providing intelligent portfolio analysis, goal recommendations, risk assessments, and conversational assistance.

## Configuration

### Environment Variables (.env)
```bash
VITE_OPENROUTER_API_KEY=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
VITE_OPENROUTER_API_URL=https://openrouter.ai/api/v1
VITE_DEFAULT_LLM_MODEL=anthropic/claude-3.5-sonnet
```

**Note:** The `.env` file is gitignored for security. Never commit API keys to version control.

## Service Architecture

### OpenRouter Service (`src/services/openrouter.ts`)
Centralized service handling all LLM interactions with the following capabilities:

#### Core Methods

1. **`chat(messages, model?)`**
   - Base method for all LLM interactions
   - Supports custom model selection
   - Handles authentication and error management

2. **`generatePortfolioInsight(portfolioData)`**
   - Analyzes portfolio composition
   - Provides diversification insights
   - Identifies optimization opportunities

3. **`generateGoalRecommendation(goal, currentPortfolio)`**
   - Creates personalized goal achievement strategies
   - Considers current portfolio status
   - Suggests specific action items

4. **`analyzeInvestmentOpportunity(ticker, marketData, portfolioContext)`**
   - Evaluates potential investments
   - Assesses fit within existing portfolio
   - Provides risk analysis

5. **`generateRiskAssessment(portfolio, riskProfile)`**
   - Evaluates portfolio risk levels
   - Compares against risk tolerance
   - Recommends adjustments

6. **`generateTaxOptimizationAdvice(portfolio, taxSituation)`**
   - Suggests tax-efficient strategies
   - Educational information only
   - Considers portfolio context

7. **`chatWithAssistant(userMessage, conversationHistory)`**
   - Interactive AI assistant
   - Maintains conversation context
   - Answers financial planning questions

## Integration Points

### Dashboard View
```typescript
import { openRouterService } from '@/services/openrouter';

// Generate portfolio insight
const insight = await openRouterService.generatePortfolioInsight({
  totalValue: portfolio.totalValue,
  assets: portfolio.assets,
  performance: portfolio.performance
});
```

### Goals Component
```typescript
// Get goal recommendation
const recommendation = await openRouterService.generateGoalRecommendation(
  goal,
  currentPortfolio
);
```

### Risk Analysis
```typescript
// Assess portfolio risk
const riskAnalysis = await openRouterService.generateRiskAssessment(
  portfolio,
  userRiskProfile
);
```

### AI Chat Assistant
```typescript
// Interactive chat
const response = await openRouterService.chatWithAssistant(
  userMessage,
  conversationHistory
);
```

## Error Handling

The service includes comprehensive error handling:
- API key validation
- Network error management
- Rate limit handling
- Fallback responses

```typescript
try {
  const insight = await openRouterService.generatePortfolioInsight(data);
  // Handle success
} catch (error) {
  console.error('LLM service error:', error);
  // Handle error gracefully
}
```

## Model Selection

### Default Model
- **anthropic/claude-3.5-sonnet** - Best balance of speed and quality
- Used for most analysis tasks

### Alternative Models
Configure via environment variables:
- `anthropic/claude-3-haiku` - Faster, lower cost
- `openai/gpt-4-turbo` - Maximum reasoning capability
- `meta-llama/llama-3-70b` - Open source alternative

## Usage Examples

### Portfolio Analysis
```typescript
const portfolioData = {
  totalValue: 150000,
  assets: [
    { name: 'VOO', value: 75000, allocation: 50 },
    { name: 'BND', value: 45000, allocation: 30 },
    { name: 'VTI', value: 30000, allocation: 20 }
  ],
  performance: { ytd: 12.5, oneYear: 15.3 }
};

const insight = await openRouterService.generatePortfolioInsight(portfolioData);
console.log(insight);
// "Your portfolio shows good diversification across equity and bonds..."
```

### Goal Recommendation
```typescript
const goal = {
  name: 'Retirement',
  target: 1000000,
  current: 150000,
  deadline: '2045-01-01'
};

const recommendation = await openRouterService.generateGoalRecommendation(
  goal,
  currentPortfolio
);
```

### Chat Assistant
```typescript
const conversationHistory = [
  { role: 'user', content: 'What is dollar cost averaging?' },
  { role: 'assistant', content: 'Dollar cost averaging is...' }
];

const response = await openRouterService.chatWithAssistant(
  'How can I apply this to my portfolio?',
  conversationHistory
);
```

## Security Considerations

1. **API Key Storage**
   - Never commit `.env` file
   - Use environment variables in production
   - Rotate keys regularly

2. **Data Privacy**
   - No PII sent to OpenRouter without consent
   - Financial data anonymized when possible
   - User controls data sharing

3. **Rate Limiting**
   - Implement client-side throttling
   - Cache responses when appropriate
   - Handle quota errors gracefully

## Testing

### Development Testing
```bash
# With .env configured
npm run dev
```

### Manual Testing
1. Open dashboard
2. View AI-generated insights
3. Navigate to Goals - see recommendations
4. Use chat assistant
5. Check risk analysis

### API Key Validation
```typescript
// Service validates key on initialization
if (!this.apiKey) {
  console.warn('OpenRouter API key not configured');
}
```

## Cost Management

Monitor OpenRouter usage:
- Track API calls per session
- Implement caching for repeated queries
- Use appropriate models for task complexity
- Set usage alerts in OpenRouter dashboard

## Future Enhancements

1. **Streaming Responses**
   - Real-time token streaming
   - Improved UX for long responses

2. **Multi-Model Strategy**
   - Fast model for simple queries
   - Advanced model for complex analysis
   - Cost optimization

3. **Conversation Memory**
   - Persistent chat history
   - Context-aware recommendations
   - User preference learning

4. **Advanced Features**
   - Document analysis (10-K, earnings reports)
   - Market sentiment analysis
   - Automated portfolio rebalancing suggestions

## Troubleshooting

### API Key Issues
- Verify key in `.env` file
- Check key format: `sk-or-v1-...`
- Validate key in OpenRouter dashboard

### Network Errors
- Check internet connection
- Verify OpenRouter API status
- Review CORS configuration

### Response Quality
- Adjust temperature parameter
- Refine system prompts
- Switch to more capable model

## Support

- OpenRouter Docs: https://openrouter.ai/docs
- FlowFolio Issues: [GitHub Issues]
- API Status: https://status.openrouter.ai

---

**Integration Complete** ✅
All LLM features now powered by OpenRouter API with your configured API key.

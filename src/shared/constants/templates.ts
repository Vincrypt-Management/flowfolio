export interface TemplateMetadata {
  description: string;
  category: 'growth' | 'value' | 'balanced' | 'momentum' | 'defensive';
  factors: Array<{ name: string; weight: number; color: string }>;
}

export const CATEGORY_COLORS: Record<TemplateMetadata['category'], string> = {
  growth:    '#22c55e',
  value:     '#3b82f6',
  balanced:  '#8b5cf6',
  momentum:  '#f59e0b',
  defensive: '#64748b',
};

export const TEMPLATE_METADATA: Record<string, TemplateMetadata> = {
  'Growth': {
    description: 'High-growth companies with strong revenue momentum. Higher risk, higher reward.',
    category: 'growth',
    factors: [
      { name: 'Momentum', weight: 35, color: '#22c55e' },
      { name: 'Growth',   weight: 35, color: '#86efac' },
      { name: 'Quality',  weight: 20, color: '#4ade80' },
      { name: 'Value',    weight: 10, color: '#d1fae5' },
    ],
  },
  'Value': {
    description: 'Undervalued companies trading below intrinsic value. Focus on fundamentals.',
    category: 'value',
    factors: [
      { name: 'Value',    weight: 40, color: '#3b82f6' },
      { name: 'Quality',  weight: 30, color: '#93c5fd' },
      { name: 'Momentum', weight: 15, color: '#dbeafe' },
      { name: 'Growth',   weight: 15, color: '#eff6ff' },
    ],
  },
  'Balanced': {
    description: 'Equal-weighted blend of all factors. Good starting point for most investors.',
    category: 'balanced',
    factors: [
      { name: 'Momentum', weight: 25, color: '#8b5cf6' },
      { name: 'Value',    weight: 25, color: '#a78bfa' },
      { name: 'Quality',  weight: 25, color: '#c4b5fd' },
      { name: 'Growth',   weight: 25, color: '#ede9fe' },
    ],
  },
  'Momentum': {
    description: 'Stocks with strong recent price trends. Follow the market winners.',
    category: 'momentum',
    factors: [
      { name: 'Momentum', weight: 60, color: '#f59e0b' },
      { name: 'Quality',  weight: 20, color: '#fcd34d' },
      { name: 'Growth',   weight: 15, color: '#fef3c7' },
      { name: 'Value',    weight: 5,  color: '#fffbeb' },
    ],
  },
  'Defensive': {
    description: 'Low-volatility, high-quality companies. Prioritizes capital preservation.',
    category: 'defensive',
    factors: [
      { name: 'Quality',    weight: 40, color: '#64748b' },
      { name: 'Value',      weight: 30, color: '#94a3b8' },
      { name: 'Volatility', weight: 20, color: '#cbd5e1' },
      { name: 'Momentum',   weight: 10, color: '#f1f5f9' },
    ],
  },
};

import { describe, it, expect } from 'vitest';
import { TEMPLATE_METADATA, CATEGORY_COLORS } from '../../shared/constants/templates';

describe('TEMPLATE_METADATA', () => {
  it('each template has factors that sum to 100', () => {
    for (const [name, meta] of Object.entries(TEMPLATE_METADATA)) {
      const sum = meta.factors.reduce((s, f) => s + f.weight, 0);
      expect(sum, `${name} factors should sum to 100`).toBe(100);
    }
  });

  it('each template has a valid category', () => {
    const validCategories = ['growth', 'value', 'balanced', 'momentum', 'defensive'];
    for (const meta of Object.values(TEMPLATE_METADATA)) {
      expect(validCategories).toContain(meta.category);
    }
  });

  it('CATEGORY_COLORS has an entry for every category', () => {
    const categories = [...new Set(Object.values(TEMPLATE_METADATA).map(m => m.category))];
    for (const cat of categories) {
      expect(CATEGORY_COLORS[cat]).toBeDefined();
    }
  });
});

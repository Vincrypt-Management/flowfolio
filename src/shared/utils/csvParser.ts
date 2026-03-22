export interface ParsedHolding {
  symbol: string;
  shares: number;
  costBasis: number | null;
}

export interface ParseResult {
  holdings: ParsedHolding[];
  broker: string;
  errors: string[];
}

function stripCurrency(s: string): string {
  return s.replace(/[$,"%]/g, '').trim();
}

function parseNumber(s: string): number | null {
  const n = parseFloat(stripCurrency(s));
  return isNaN(n) ? null : n;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectBroker(headers: string[]): string {
  const h = headers.map(x => x.toLowerCase());
  // IBKR Flex Query format: first column is a row-type literal ("Header" or "Data")
  if (h[0] === 'header' || h[0] === 'data') return 'IBKR';
  if (h.includes('last price') && h.includes('average cost basis')) return 'Fidelity';
  if (h.includes('price') && h.includes('cost basis') && h.includes('quantity')) return 'Schwab';
  if (h.includes('share price') && h.includes('shares')) return 'Vanguard';
  if (h.includes('symbol') && (h.includes('quantity') || h.includes('shares'))) return 'Generic';
  return 'Unknown';
}

export function parseBrokerCSV(text: string): ParseResult {
  const errors: string[] = [];
  const holdings: ParsedHolding[] = [];

  if (!text.trim()) return { holdings, broker: 'Unknown', errors };

  const rawLines = text.split(/\r?\n/).filter(l => l.trim());

  const headerIdx = rawLines.findIndex(l => l.toLowerCase().includes('symbol'));
  if (headerIdx === -1) return { holdings, broker: 'Unknown', errors: ['No header row found'] };

  const headers = parseCSVLine(rawLines[headerIdx]).map(h => h.replace(/^"|"$/g, '').trim());
  const broker = detectBroker(headers);

  const idx = (name: string): number =>
    headers.findIndex(h => h.toLowerCase() === name.toLowerCase());

  // IBKR Flex Query: find the "Header" row that contains Symbol + Quantity columns
  if (broker === 'IBKR') {
    const ibkrHeaderIdx = rawLines.findIndex((l: string) =>
      l.startsWith('Header') &&
      l.toLowerCase().includes('symbol') &&
      l.toLowerCase().includes('quantity')
    );
    if (ibkrHeaderIdx === -1) {
      return { holdings, broker: 'IBKR', errors: ['No IBKR Header row found'] };
    }

    const ibkrHeaders = parseCSVLine(rawLines[ibkrHeaderIdx]).map((h: string) => h.trim().toLowerCase());
    const ibkrSymbolCol = ibkrHeaders.indexOf('symbol');
    const ibkrQtyCol    = ibkrHeaders.indexOf('quantity');

    for (let i = ibkrHeaderIdx + 1; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!line.startsWith('Data')) continue;
      const cells = parseCSVLine(line).map((c: string) => c.replace(/^"|"$/g, '').trim());
      const symbol = (cells[ibkrSymbolCol] ?? '').toUpperCase();
      if (!symbol || symbol === 'TOTAL' || symbol === '--') continue;
      const sharesRaw = cells[ibkrQtyCol] ?? '';
      const shares = parseNumber(sharesRaw);
      if (shares === null || shares <= 0) {
        errors.push(`Row ${i + 1}: invalid quantity for ${symbol}`);
        continue;
      }
      holdings.push({ symbol, shares, costBasis: null });
    }

    return { holdings, broker: 'IBKR', errors };
  }

  let symbolCol: number, sharesCol: number, costBasisCol: number;

  if (broker === 'Fidelity') {
    symbolCol   = idx('Symbol');
    sharesCol   = idx('Quantity');
    costBasisCol = idx('Average Cost Basis');
  } else if (broker === 'Schwab') {
    symbolCol   = idx('Symbol');
    sharesCol   = idx('Quantity');
    costBasisCol = idx('Cost Basis');
  } else if (broker === 'Vanguard') {
    symbolCol   = idx('Symbol');
    sharesCol   = idx('Shares');
    costBasisCol = idx('Average Cost');
  } else {
    // Generic — do NOT include 'Price' or 'Last Price' as cost basis
    symbolCol   = idx('Symbol');
    sharesCol   = Math.max(idx('Quantity'), idx('Shares'));
    costBasisCol = Math.max(idx('Cost Basis'), idx('Average Cost'));
  }

  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    const cells = parseCSVLine(line).map(c => c.replace(/^"|"$/g, '').trim());

    const symbol = (cells[symbolCol] ?? '').toUpperCase().trim();
    if (!symbol || symbol === 'TOTAL' || symbol === '--') continue;

    const sharesRaw = cells[sharesCol] ?? '';
    const shares = parseNumber(sharesRaw);
    if (shares === null || shares <= 0) {
      errors.push(`Row ${i + 1}: invalid shares "${sharesRaw}" for ${symbol}`);
      continue;
    }

    const costBasis = costBasisCol >= 0 ? parseNumber(cells[costBasisCol] ?? '') : null;

    holdings.push({ symbol, shares, costBasis });
  }

  return { holdings, broker, errors };
}

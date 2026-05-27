/**
 * ExposureChart Component
 * Visualizes sector and geographic exposure of a portfolio using a Recharts PieChart.
 * Fetches fundamentals via the `get_fundamentals_batch` Tauri command and groups
 * holdings by sector.
 */

import { useState, useEffect, useCallback } from 'react';
import { invokeWithResilience } from '../services/apiClient';
import { createLogger } from '../core/logger';
import { AlertTriangle, Globe } from 'lucide-react';
import { Spinner, DonutChart, type DonutSlice } from '@flowfolio/ui';
import './ExposureChart.css';

const log = createLogger('ExposureChart');

// --- Types ---

interface Holding {
  symbol: string;
  value: number;
  weight: number;
}

export interface ExposureChartProps {
  holdings: Holding[];
}

interface BackendFundamentals {
  sector?: string;
  industry?: string;
  [key: string]: unknown;
}

interface SectorSlice {
  name: string;
  symbols: string[];
  totalValue: number;
  percentage: number;
}

// --- Constants ---

const SECTOR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#a855f7', '#64748b',
];

const UNKNOWN_SECTOR = 'Unknown';

// --- Main Component ---

export function ExposureChart({ holdings }: ExposureChartProps) {
  const [sectors, setSectors] = useState<SectorSlice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAndGroup = useCallback(async () => {
    if (holdings.length === 0) {
      setSectors([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const symbols = holdings.map((h) => h.symbol);

      log.info(`Fetching fundamentals for ${symbols.length} symbols`);

      const raw = await invokeWithResilience<Record<string, BackendFundamentals>>(
        'get_fundamentals_batch',
        { symbols }
      );

      // Build sector map: sector name -> accumulated value and symbols
      const sectorMap = new Map<string, { symbols: string[]; totalValue: number }>();
      const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.value, 0);

      for (const holding of holdings) {
        const fundamentals = raw[holding.symbol];
        const sectorName =
          fundamentals?.sector && typeof fundamentals.sector === 'string' && fundamentals.sector.trim() !== ''
            ? fundamentals.sector.trim()
            : UNKNOWN_SECTOR;

        const existing = sectorMap.get(sectorName);
        if (existing) {
          existing.symbols.push(holding.symbol);
          existing.totalValue += holding.value;
        } else {
          sectorMap.set(sectorName, {
            symbols: [holding.symbol],
            totalValue: holding.value,
          });
        }
      }

      // Convert map to sorted slices (largest allocation first)
      const slices: SectorSlice[] = Array.from(sectorMap.entries())
        .map(([name, data]) => ({
          name,
          symbols: data.symbols,
          totalValue: data.totalValue,
          percentage: totalPortfolioValue > 0
            ? (data.totalValue / totalPortfolioValue) * 100
            : 0,
        }))
        .sort((a, b) => b.percentage - a.percentage);

      log.info(`Grouped ${holdings.length} holdings into ${slices.length} sectors`);
      setSectors(slices);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to fetch fundamentals for exposure chart:', err);
      setError(`Failed to load sector data: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [holdings]);

  useEffect(() => {
    fetchAndGroup();
  }, [fetchAndGroup]);

  // --- Render states ---

  if (loading) {
    return (
      <div className="exposure-chart-loading">
        <Spinner size="sm" color="muted" />
        <span>Loading sector exposure...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="exposure-chart-error">
        <AlertTriangle size={14} />
        <span>{error}</span>
      </div>
    );
  }

  if (sectors.length === 0) {
    return (
      <div className="exposure-chart-empty">
        <Globe size={24} />
        <span>No sector data available</span>
      </div>
    );
  }

  const donutSlices: DonutSlice[] = sectors.map((slice, idx) => ({
    name: slice.name,
    value: slice.percentage,
    color: SECTOR_COLORS[idx % SECTOR_COLORS.length],
  }));

  return (
    <div className="exposure-chart">
      {/* Pie chart */}
      <div className="exposure-chart-pie">
        <DonutChart
          data={donutSlices}
          height={260}
          innerRadius={60}
          outerRadius={100}
          showLegend={false}
        />
      </div>

      {/* Breakdown table */}
      <div className="exposure-chart-table">
        <table className="exposure-table">
          <thead>
            <tr>
              <th>Sector</th>
              <th>Symbols</th>
              <th className="text-right">% Allocation</th>
              <th className="text-right">$ Value</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((slice, idx) => (
              <tr key={slice.name}>
                <td>
                  <span
                    className="exposure-table-dot"
                    style={{ background: SECTOR_COLORS[idx % SECTOR_COLORS.length] }}
                  />
                  {slice.name}
                </td>
                <td className="font-mono exposure-table-symbols">
                  {slice.symbols.join(', ')}
                </td>
                <td className="font-mono text-right">
                  {slice.percentage.toFixed(1)}%
                </td>
                <td className="font-mono text-right">
                  ${slice.totalValue.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * ExposureChart Component
 * Visualizes sector and geographic exposure of a portfolio using a Recharts PieChart.
 * Fetches fundamentals via the `get_fundamentals_batch` Tauri command and groups
 * holdings by sector.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { invokeWithResilience } from '../services/apiClient';
import { createLogger } from '../core/logger';
import { Loader2, AlertTriangle, Globe } from 'lucide-react';
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

// --- Custom Tooltip ---

interface TooltipPayloadEntry {
  name: string;
  value: number;
  payload: SectorSlice;
}

interface SectorTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function SectorTooltip({ active, payload }: SectorTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload[0];
  const slice = entry.payload;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 12px',
        fontSize: '0.8rem',
        color: 'var(--text-main)',
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{slice.name}</div>
      <div style={{ color: 'var(--text-muted)' }}>
        {slice.percentage.toFixed(1)}% allocation
      </div>
      <div style={{ color: 'var(--text-muted)' }}>
        ${slice.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div style={{ color: 'var(--text-dim)', marginTop: 4, fontSize: '0.75rem' }}>
        {slice.symbols.join(', ')}
      </div>
    </div>
  );
}

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
        <Loader2 size={18} className="spin" />
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

  return (
    <div className="exposure-chart">
      {/* Pie chart */}
      <div className="exposure-chart-pie">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={sectors as unknown as Array<Record<string, unknown>>}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="percentage"
              nameKey="name"
              stroke="none"
            >
              {sectors.map((_, idx) => (
                <Cell
                  key={idx}
                  fill={SECTOR_COLORS[idx % SECTOR_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<SectorTooltip />} />
            <Legend
              iconType="circle"
              iconSize={10}
              wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
            />
          </PieChart>
        </ResponsiveContainer>
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

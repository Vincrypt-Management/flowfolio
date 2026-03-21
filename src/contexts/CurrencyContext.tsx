/**
 * CurrencyContext
 * Provides multi-currency support with exchange rate fetching, formatting,
 * and persistence via Tauri settings commands.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { invokeWithResilience } from '../services/apiClient';
import { createLogger } from '../core/logger';

const log = createLogger('CurrencyContext');

// ── Types ──────────────────────────────────────────────────────────────────

export interface CurrencyContextType {
  currency: string;
  setCurrency: (c: string) => void;
  formatAmount: (amount: number) => string;
  convertFromUSD: (amount: number) => number;
  exchangeRate: number;
  loading: boolean;
}

// ── Supported currencies ───────────────────────────────────────────────────

export const SUPPORTED_CURRENCIES: { code: string; label: string; locale: string }[] = [
  { code: 'USD', label: 'US Dollar',        locale: 'en-US' },
  { code: 'EUR', label: 'Euro',             locale: 'de-DE' },
  { code: 'GBP', label: 'British Pound',    locale: 'en-GB' },
  { code: 'JPY', label: 'Japanese Yen',     locale: 'ja-JP' },
  { code: 'CAD', label: 'Canadian Dollar',  locale: 'en-CA' },
  { code: 'AUD', label: 'Australian Dollar',locale: 'en-AU' },
  { code: 'CHF', label: 'Swiss Franc',      locale: 'de-CH' },
  { code: 'CNY', label: 'Chinese Yuan',     locale: 'zh-CN' },
  { code: 'INR', label: 'Indian Rupee',     locale: 'en-IN' },
  { code: 'KRW', label: 'South Korean Won', locale: 'ko-KR' },
];

const SUPPORTED_CODES = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));

const SETTING_KEY = 'preferred_currency';

// ── Context ───────────────────────────────────────────────────────────────

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<string>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);

  // ── Load saved currency on mount ──

  useEffect(() => {
    invokeWithResilience<string | null>('load_setting', { key: SETTING_KEY })
      .then((saved) => {
        if (saved && SUPPORTED_CODES.has(saved)) {
          setCurrencyState(saved);
          log.info(`Restored preferred currency: ${saved}`);
        }
      })
      .catch((err: unknown) => {
        log.error('Failed to load preferred currency', err);
      });
  }, []);

  // ── Fetch exchange rate whenever currency changes ──

  useEffect(() => {
    if (currency === 'USD') {
      setExchangeRate(1);
      return;
    }

    let cancelled = false;
    setLoading(true);

    invokeWithResilience<number>('get_exchange_rate', {
      fromCurrency: 'USD',
      toCurrency: currency,
    })
      .then((rate) => {
        if (!cancelled) {
          setExchangeRate(rate);
          log.info(`Exchange rate USD → ${currency}: ${rate}`);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          log.error(`Failed to fetch exchange rate for ${currency}`, err);
          // Keep previous rate on error — do not reset to 1 to avoid silent data corruption
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currency]);

  // ── setCurrency ──

  const setCurrency = useCallback((newCurrency: string) => {
    if (!SUPPORTED_CODES.has(newCurrency)) {
      log.warn(`Unsupported currency: ${newCurrency}`);
      return;
    }
    setCurrencyState(newCurrency);
    invokeWithResilience('save_setting', { key: SETTING_KEY, value: newCurrency })
      .catch((err: unknown) => log.error('Failed to save preferred currency', err));
  }, []);

  // ── convertFromUSD ──

  const convertFromUSD = useCallback(
    (amount: number): number => {
      return amount * exchangeRate;
    },
    [exchangeRate]
  );

  // ── formatAmount ──

  const formatAmount = useCallback(
    (amount: number): string => {
      const converted = amount * exchangeRate;
      const entry = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
      const locale = entry?.locale ?? 'en-US';

      try {
        return converted.toLocaleString(locale, {
          style: 'currency',
          currency,
          maximumFractionDigits: currency === 'JPY' || currency === 'KRW' ? 0 : 2,
        });
      } catch {
        // Fallback for locales/currencies not supported by the runtime
        return `${currency} ${converted.toFixed(2)}`;
      }
    },
    [currency, exchangeRate]
  );

  // ── Context value (memoized to prevent unnecessary re-renders) ──

  const value = useMemo<CurrencyContextType>(
    () => ({
      currency,
      setCurrency,
      formatAmount,
      convertFromUSD,
      exchangeRate,
      loading,
    }),
    [currency, setCurrency, formatAmount, convertFromUSD, exchangeRate, loading]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useCurrency(): CurrencyContextType {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

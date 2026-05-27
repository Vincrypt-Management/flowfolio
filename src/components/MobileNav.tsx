import { useState } from 'react';
import {
  LayoutDashboard, Sparkles, PieChart, FlaskConical, Settings, Grid2X2,
  Save, FileText, TrendingUp, BookOpen, Eye, Bell, GitCompare,
  Shield, Clock, Newspaper, ClipboardCheck, Globe, Database,
} from 'lucide-react';
import { Drawer } from '@flowfolio/ui';
import './MobileNav.css';

interface MobileNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
}

const PRIMARY_TABS = [
  { key: 'dashboard',   label: 'Home',     Icon: LayoutDashboard },
  { key: 'vibe-studio', label: 'Vibe',     Icon: Sparkles },
  { key: 'portfolio',   label: 'Portfolio', Icon: PieChart },
  { key: 'backtest',    label: 'Backtest',  Icon: FlaskConical },
  { key: 'settings',    label: 'Settings',  Icon: Settings },
] as const;

const DRAWER_TABS = [
  { key: 'saved-portfolios', label: 'Saved',     Icon: Save },
  { key: 'templates',        label: 'Templates', Icon: FileText },
  { key: 'rankings',         label: 'Rankings',  Icon: TrendingUp },
  { key: 'journal',          label: 'Journal',   Icon: BookOpen },
  { key: 'watchlist',        label: 'Watchlist', Icon: Eye },
  { key: 'analysis',         label: 'Analysis',  Icon: TrendingUp },
  { key: 'alerts',           label: 'Alerts',    Icon: Bell },
  { key: 'comparison',       label: 'Compare',   Icon: GitCompare },
  { key: 'risk',             label: 'Risk',      Icon: Shield },
  { key: 'scheduler',        label: 'Scheduler', Icon: Clock },
  { key: 'news',             label: 'News',      Icon: Newspaper },
  { key: 'yearly-review',    label: 'Review',    Icon: ClipboardCheck },
  { key: 'universe',         label: 'Universe',  Icon: Globe },
  { key: 'data',             label: 'Data',      Icon: Database },
] as const;

export function MobileNav({ activeTab, onNavigate }: MobileNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handlePrimaryNav = (key: string) => {
    onNavigate(key);
    setDrawerOpen(false);
  };

  const handleDrawerNav = (key: string) => {
    onNavigate(key);
    setDrawerOpen(false);
  };

  return (
    <>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        side="bottom"
        size="auto"
        title="More"
      >
        <div className="mobile-nav-grid">
          {DRAWER_TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              className="mobile-nav-grid-item"
              onClick={() => handleDrawerNav(key)}
              aria-label={label}
              aria-current={activeTab === key ? 'page' : undefined}
            >
              <Icon size={24} aria-hidden="true" />
              <span className="mobile-nav-grid-label">{label}</span>
            </button>
          ))}
        </div>
      </Drawer>

      {/* Bottom bar */}
      <nav className="mobile-nav" aria-label="Primary navigation">
        {PRIMARY_TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`mobile-nav-item ${activeTab === key ? 'active' : ''}`}
            onClick={() => handlePrimaryNav(key)}
            aria-label={label}
            aria-current={activeTab === key ? 'page' : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="mobile-nav-label">{label}</span>
          </button>
        ))}

        <button
          className={`mobile-nav-item ${drawerOpen ? 'drawer-open' : ''}`}
          onClick={() => setDrawerOpen((v) => !v)}
          aria-label="More navigation options"
          aria-expanded={drawerOpen}
        >
          <Grid2X2 size={20} aria-hidden="true" />
          <span className="mobile-nav-label">More</span>
        </button>
      </nav>
    </>
  );
}

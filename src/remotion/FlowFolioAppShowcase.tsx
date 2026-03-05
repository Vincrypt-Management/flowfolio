import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { colors, fonts } from './styles';
import { TitleCard } from './scenes/app/TitleCard';
import { DashboardScreen } from './scenes/app/DashboardScreen';
import { VibeStudioResultScreen } from './scenes/app/VibeStudioResultScreen';
import { PortfolioScreen } from './scenes/app/PortfolioScreen';
import { BacktestResultScreen } from './scenes/app/BacktestResultScreen';
import { QuantScreen } from './scenes/app/QuantScreen';
import { RankingsScreen } from './scenes/app/RankingsScreen';
import { JournalScreen } from './scenes/app/JournalScreen';
import { YearlyReviewScreen } from './scenes/app/YearlyReviewScreen';
import { ClosingCard } from './scenes/app/ClosingCard';

/**
 * Full app showcase — renders realistic mockups of the actual FlowFolio UI
 * showing real results for every feature.
 *
 * ~55s at 60fps = 3300 frames
 *
 * Scene timeline:
 *   0–180     Title Card (3s)
 *   160–460   Dashboard (5s)
 *   440–920   Vibe Studio Results (8s)
 *   900–1260  Portfolio + Buy List (6s)
 *   1240–1660 Backtest Results (7s)
 *   1640–1940 Quant Dashboard (5s)
 *   1920–2220 Stock Rankings (5s)
 *   2200–2500 Journal (5s)
 *   2480–2780 Yearly Review (5s)
 *   2760–3060 Closing (5s)
 */
export const FlowFolioAppShowcase: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        fontFamily: fonts.sans,
        overflow: 'hidden',
      }}
    >
      {/* Title Card */}
      <Sequence from={0} durationInFrames={180}>
        <TitleCard />
      </Sequence>

      {/* Dashboard */}
      <Sequence from={160} durationInFrames={300}>
        <DashboardScreen />
      </Sequence>

      {/* Vibe Studio — Generated Portfolio Results */}
      <Sequence from={440} durationInFrames={480}>
        <VibeStudioResultScreen />
      </Sequence>

      {/* Portfolio — Holdings, Drift & Buy List */}
      <Sequence from={900} durationInFrames={360}>
        <PortfolioScreen />
      </Sequence>

      {/* Backtest Results — Chart, Metrics, Positions */}
      <Sequence from={1240} durationInFrames={420}>
        <BacktestResultScreen />
      </Sequence>

      {/* Quant Dashboard — Radar, Metrics, Rolling Chart */}
      <Sequence from={1640} durationInFrames={300}>
        <QuantScreen />
      </Sequence>

      {/* Stock Rankings — Multi-factor Scoring Table */}
      <Sequence from={1920} durationInFrames={300}>
        <RankingsScreen />
      </Sequence>

      {/* Journal — Timeline + Stats */}
      <Sequence from={2200} durationInFrames={300}>
        <JournalScreen />
      </Sequence>

      {/* Yearly Review — Health Score + Checklist */}
      <Sequence from={2480} durationInFrames={300}>
        <YearlyReviewScreen />
      </Sequence>

      {/* Closing — CTA */}
      <Sequence from={2760} durationInFrames={300}>
        <ClosingCard />
      </Sequence>
    </AbsoluteFill>
  );
};

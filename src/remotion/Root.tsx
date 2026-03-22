import React from 'react';
import { Composition } from 'remotion';
import { FlowFolioIntro } from './FlowFolioIntro';
import { FlowFolioIntroIG } from './FlowFolioIntroIG';
import { FlowFolioShowcase } from './FlowFolioShowcase';
import { FlowFolioShowcaseIG } from './FlowFolioShowcaseIG';
import { FlowFolioAppShowcase } from './FlowFolioAppShowcase';
import { FeedTipCard, FeedMetricsCard, FeedBacktestCard, FeedFeatureCard, FeedQuoteCard } from './FlowFolioFeedPosts';
import { FeedCarousel } from './FlowFolioCarousel';
import { FlowFolioRelease022 } from './FlowFolioRelease022';
import { FlowFolioRelease031 } from './FlowFolioRelease031';
import { SecurityCarousel031, SECURITY_CAROUSEL_SLIDES } from './FlowFolioSecurityCarousel031';
import { SecurityEducational031 } from './FlowFolioSecurityEducational031';

export const Root: React.FC = () => {
  const defaultSeed = Date.now();

  return (
    <>
      <Composition
        id="FlowFolioIntro"
        component={FlowFolioIntro}
        durationInFrames={1460}
        fps={60}
        width={1920}
        height={1080}
        defaultProps={{ seed: defaultSeed }}
      />
      <Composition
        id="FlowFolioIntroIG"
        component={FlowFolioIntroIG}
        durationInFrames={1320}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ seed: defaultSeed }}
      />
      <Composition
        id="FlowFolioShowcase"
        component={FlowFolioShowcase}
        durationInFrames={6320}
        fps={60}
        width={1920}
        height={1080}
        defaultProps={{ seed: defaultSeed }}
      />
      <Composition
        id="FlowFolioShowcaseIG"
        component={FlowFolioShowcaseIG}
        durationInFrames={3000}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ seed: defaultSeed }}
      />
      <Composition
        id="FlowFolioAppShowcase"
        component={FlowFolioAppShowcase}
        durationInFrames={3060}
        fps={60}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="FeedTipCard"
        component={FeedTipCard}
        durationInFrames={90}
        fps={60}
        width={1080}
        height={1080}
        defaultProps={{ seed: defaultSeed }}
      />
      <Composition
        id="FeedMetricsCard"
        component={FeedMetricsCard}
        durationInFrames={90}
        fps={60}
        width={1080}
        height={1080}
        defaultProps={{ seed: defaultSeed }}
      />
      <Composition
        id="FeedBacktestCard"
        component={FeedBacktestCard}
        durationInFrames={90}
        fps={60}
        width={1080}
        height={1080}
        defaultProps={{ seed: defaultSeed }}
      />
      <Composition
        id="FeedFeatureCard"
        component={FeedFeatureCard}
        durationInFrames={90}
        fps={60}
        width={1080}
        height={1080}
        defaultProps={{ seed: defaultSeed }}
      />
      <Composition
        id="FeedQuoteCard"
        component={FeedQuoteCard}
        durationInFrames={90}
        fps={60}
        width={1080}
        height={1080}
        defaultProps={{ seed: defaultSeed }}
      />
      <Composition
        id="FeedCarousel"
        component={FeedCarousel}
        durationInFrames={90}
        fps={60}
        width={1080}
        height={1080}
        defaultProps={{ seed: defaultSeed, slide: 0 }}
      />
      <Composition
        id="FlowFolioRelease022"
        component={FlowFolioRelease022}
        durationInFrames={1960}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ seed: defaultSeed }}
      />
      <Composition
        id="FlowFolioRelease031"
        component={FlowFolioRelease031}
        durationInFrames={1960}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ seed: defaultSeed }}
      />
      {Array.from({ length: SECURITY_CAROUSEL_SLIDES }, (_, i) => (
        <Composition
          key={`sec031-${i}`}
          id={`SecurityCarousel031-Slide${i}`}
          component={SecurityCarousel031}
          durationInFrames={90}
          fps={60}
          width={1080}
          height={1080}
          defaultProps={{ slide: i }}
        />
      ))}
      <Composition
        id="SecurityEducational031"
        component={SecurityEducational031}
        durationInFrames={2560}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ seed: defaultSeed }}
      />
    </>
  );
};

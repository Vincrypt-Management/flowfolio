import React from 'react';
import { Composition } from 'remotion';
import { FlowFolioIntro } from './FlowFolioIntro';
import { FlowFolioIntroIG } from './FlowFolioIntroIG';
import { FlowFolioShowcase } from './FlowFolioShowcase';
import { FlowFolioShowcaseIG } from './FlowFolioShowcaseIG';
import { FlowFolioAppShowcase } from './FlowFolioAppShowcase';

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
    </>
  );
};

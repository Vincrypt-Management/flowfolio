import React from 'react';
import { Composition } from 'remotion';
import { FlowFolioIntro } from './FlowFolioIntro';
import { FlowFolioIntroIG } from './FlowFolioIntroIG';
import { FlowFolioShowcase } from './FlowFolioShowcase';

export const Root: React.FC = () => {
  const defaultSeed = Date.now();

  return (
    <>
      <Composition
        id="FlowFolioIntro"
        component={FlowFolioIntro}
        durationInFrames={530}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ seed: defaultSeed }}
      />
      <Composition
        id="FlowFolioIntroIG"
        component={FlowFolioIntroIG}
        durationInFrames={540}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ seed: defaultSeed }}
      />
      <Composition
        id="FlowFolioShowcase"
        component={FlowFolioShowcase}
        durationInFrames={2640}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ seed: defaultSeed }}
      />
    </>
  );
};

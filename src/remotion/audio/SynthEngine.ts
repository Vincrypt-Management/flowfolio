/**
 * Programmatic audio synthesizer for Remotion.
 * Generates AudioBuffers using OfflineAudioContext — no external files needed.
 * Each composition gets its own sonic palette.
 * Now supports seed-driven variation for unique audio per render.
 *
 * Mixing architecture:
 *   Oscillators → Category Bus (pad/chime/fx) → Master Gain → Compressor → Destination
 */

const SAMPLE_RATE = 44100;

// ─── Musical Constants ──────────────────────────────────────────

export const NOTES = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0,
} as const;

// Chord progression variants for unique audio
type ChordKey = 'Am' | 'Dm' | 'Em' | 'Cm' | 'Fm';
const chordProgressions: Record<ChordKey, number[][]> = {
  Am: [[NOTES.A2, NOTES.C3, NOTES.E3], [NOTES.C3, NOTES.E3, NOTES.G3], [NOTES.F2, NOTES.A2, NOTES.C3]],
  Dm: [[NOTES.D2, NOTES.F2, NOTES.A2], [NOTES.C3, NOTES.E3, NOTES.G3], [NOTES.G2, NOTES.B2, NOTES.D3]],
  Em: [[NOTES.E2, NOTES.G2, NOTES.B2], [NOTES.A2, NOTES.C3, NOTES.E3], [NOTES.D3, NOTES.G3, NOTES.B3]],
  Cm: [[NOTES.C3, NOTES.E3, NOTES.G3], [NOTES.F2, NOTES.A2, NOTES.C3], [NOTES.G2, NOTES.B2, NOTES.D3]],
  Fm: [[NOTES.F2, NOTES.A2, NOTES.C3], [NOTES.D3, NOTES.F3, NOTES.A3], [NOTES.C3, NOTES.E3, NOTES.G3]],
};

const chimeNotePool = [NOTES.C4, NOTES.D4, NOTES.E4, NOTES.G4, NOTES.A4, NOTES.C5, NOTES.D5, NOTES.E5, NOTES.G5];

/** Simple seed-based selection for audio (no React context needed) */
function audioSelect<T>(pool: readonly T[], seed: number, index: number): T {
  const hash = ((seed * 2654435761 + index * 40503) >>> 0) % pool.length;
  return pool[hash];
}

// ─── Mixer Setup ────────────────────────────────────────────────

interface MixBus {
  pad: GainNode;
  chime: GainNode;
  fx: GainNode;
  master: GainNode;
}

/** Create a proper mix bus with compressor on the master output */
function createMixBus(
  ctx: OfflineAudioContext,
  opts: { master?: number; pad?: number; chime?: number; fx?: number } = {},
): MixBus {
  const { master: masterVol = 0.7, pad: padVol = 1, chime: chimeVol = 1, fx: fxVol = 1 } = opts;

  // Master gain
  const master = ctx.createGain();
  master.gain.value = masterVol;

  // Compressor — prevents clipping when many oscillators stack
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;

  // Limiter — hard ceiling
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  master.connect(compressor);
  compressor.connect(limiter);
  limiter.connect(ctx.destination);

  // Category buses
  const pad = ctx.createGain();
  pad.gain.value = padVol;
  pad.connect(master);

  const chime = ctx.createGain();
  chime.gain.value = chimeVol;
  chime.connect(master);

  const fx = ctx.createGain();
  fx.gain.value = fxVol;
  fx.connect(master);

  return { pad, chime, fx, master };
}

// ─── Envelope Helpers ───────────────────────────────────────────

interface ADSR {
  attack: number;
  decay: number;
  sustain: number; // level 0-1
  release: number;
}

function applyEnvelope(
  gain: GainNode,
  startTime: number,
  duration: number,
  adsr: ADSR,
  volume: number = 1,
) {
  const { attack, decay, sustain, release } = adsr;
  const g = gain.gain;

  // Clamp envelope segments so they don't overlap or go negative
  const totalEnv = attack + decay + release;
  let a = attack, d = decay, r = release;
  if (totalEnv > duration) {
    const scale = duration / totalEnv;
    a = attack * scale;
    d = decay * scale;
    r = release * scale;
  }

  const t0 = startTime;
  const t1 = t0 + a;                        // end of attack
  const t2 = t1 + d;                        // end of decay
  const t3 = startTime + duration - r;       // start of release
  const t4 = startTime + duration;           // end

  g.setValueAtTime(0, t0);
  g.linearRampToValueAtTime(volume, t1);
  g.linearRampToValueAtTime(volume * sustain, t2);

  // Only add sustain hold if there's room between decay end and release start
  if (t3 > t2 + 0.001) {
    g.setValueAtTime(volume * sustain, t3);
  }
  g.linearRampToValueAtTime(0, t4);
}

// ─── Sound Primitives ───────────────────────────────────────────

interface ToneOptions {
  frequency: number;
  type?: OscillatorType;
  startTime: number;
  duration: number;
  volume?: number;
  adsr?: ADSR;
  detune?: number;
}

function addTone(ctx: OfflineAudioContext, dest: AudioNode, opts: ToneOptions) {
  const {
    frequency, type = 'sine', startTime, duration,
    volume = 0.3, detune = 0,
    adsr = { attack: 0.05, decay: 0.1, sustain: 0.6, release: 0.15 },
  } = opts;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  osc.detune.value = detune;
  osc.connect(gain);
  gain.connect(dest);
  applyEnvelope(gain, startTime, duration, adsr, volume);
  osc.start(startTime);
  // Extra safety margin to ensure envelope fully releases before oscillator stops
  osc.stop(startTime + duration + 0.1);
}

interface PadOptions {
  frequencies: number[];
  startTime: number;
  duration: number;
  volume?: number;
  type?: OscillatorType;
}

/** Layered pad — multiple detuned oscillators for warmth */
function addPad(ctx: OfflineAudioContext, dest: AudioNode, opts: PadOptions) {
  const { frequencies, startTime, duration, volume = 0.06, type = 'sine' } = opts;
  const padADSR: ADSR = { attack: 1.5, decay: 0.5, sustain: 0.7, release: 2.0 };

  for (const freq of frequencies) {
    addTone(ctx, dest, { frequency: freq, type, startTime, duration, volume, adsr: padADSR });
    addTone(ctx, dest, { frequency: freq, type, startTime, duration, volume: volume * 0.4, adsr: padADSR, detune: 7 });
    addTone(ctx, dest, { frequency: freq, type, startTime, duration, volume: volume * 0.4, adsr: padADSR, detune: -7 });
  }
}

/** Clean bell/chime — sine with fast attack, long release */
function addChime(ctx: OfflineAudioContext, dest: AudioNode, frequency: number, startTime: number, volume: number = 0.12) {
  const adsr: ADSR = { attack: 0.005, decay: 0.3, sustain: 0.15, release: 1.2 };
  addTone(ctx, dest, { frequency, type: 'sine', startTime, duration: 1.5, volume, adsr });
  addTone(ctx, dest, { frequency: frequency * 2, type: 'sine', startTime, duration: 0.8, volume: volume * 0.25, adsr });
  addTone(ctx, dest, { frequency: frequency * 3, type: 'sine', startTime, duration: 0.5, volume: volume * 0.08, adsr });
}

/** Soft impact — low thud for transitions */
function addImpact(ctx: OfflineAudioContext, dest: AudioNode, startTime: number, volume: number = 0.18) {
  const adsr: ADSR = { attack: 0.005, decay: 0.2, sustain: 0.1, release: 0.4 };
  addTone(ctx, dest, { frequency: 60, type: 'sine', startTime, duration: 0.6, volume, adsr });
  addTone(ctx, dest, { frequency: 45, type: 'sine', startTime, duration: 0.8, volume: volume * 0.5, adsr });
}

/** Sub pulse — rhythmic bass hit */
function addPulse(ctx: OfflineAudioContext, dest: AudioNode, startTime: number, volume: number = 0.12) {
  const adsr: ADSR = { attack: 0.003, decay: 0.08, sustain: 0.05, release: 0.15 };
  addTone(ctx, dest, { frequency: 55, type: 'sine', startTime, duration: 0.25, volume, adsr });
}

/** Rising sweep — tension builder */
function addSweep(ctx: OfflineAudioContext, dest: AudioNode, startTime: number, duration: number, volume: number = 0.05) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80, startTime);
  osc.frequency.exponentialRampToValueAtTime(800, startTime + duration);
  osc.connect(gain);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1000;
  filter.Q.value = 0.8;
  gain.connect(filter);
  filter.connect(dest);

  const adsr: ADSR = { attack: duration * 0.3, decay: 0.1, sustain: 0.8, release: duration * 0.2 };
  applyEnvelope(gain, startTime, duration, adsr, volume);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.1);
}

/** Soft tick/click for UI reveals */
function addTick(ctx: OfflineAudioContext, dest: AudioNode, startTime: number, volume: number = 0.07) {
  const adsr: ADSR = { attack: 0.003, decay: 0.04, sustain: 0.0, release: 0.08 };
  addTone(ctx, dest, { frequency: 800, type: 'sine', startTime, duration: 0.12, volume, adsr });
  addTone(ctx, dest, { frequency: 1600, type: 'sine', startTime, duration: 0.06, volume: volume * 0.2, adsr });
}

/** Gentle arpeggio note — for continuous melodic interest */
function addArpNote(ctx: OfflineAudioContext, dest: AudioNode, frequency: number, startTime: number, volume: number = 0.04) {
  const adsr: ADSR = { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.4 };
  addTone(ctx, dest, { frequency, type: 'sine', startTime, duration: 0.6, volume, adsr });
  // Soft octave harmonic
  addTone(ctx, dest, { frequency: frequency * 2, type: 'sine', startTime: startTime + 0.02, duration: 0.35, volume: volume * 0.15, adsr });
}

/** Shimmer tail — adds spatial depth after a chime */
function addShimmer(ctx: OfflineAudioContext, dest: AudioNode, startTime: number, volume: number = 0.03) {
  const adsr: ADSR = { attack: 0.2, decay: 0.8, sustain: 0.2, release: 1.5 };
  addTone(ctx, dest, { frequency: NOTES.E5, type: 'sine', startTime, duration: 2.5, volume, adsr, detune: 3 });
  addTone(ctx, dest, { frequency: NOTES.G5, type: 'sine', startTime: startTime + 0.1, duration: 2.0, volume: volume * 0.6, adsr, detune: -5 });
}

// ─── Composition Audio Builders ─────────────────────────────────

/**
 * INTRO — Formal, Professional, Refined
 * Warm pad, clean chimes, subtle presence. Boardroom elegance.
 */
export async function buildIntroAudio(durationSec: number, seed: number = 42): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * durationSec, SAMPLE_RATE);
  const bus = createMixBus(ctx, { master: 0.75, pad: 1.0, chime: 1.0, fx: 0.8 });

  const chordKeys: ChordKey[] = ['Am', 'Dm', 'Em', 'Cm', 'Fm'];
  const selectedKey = audioSelect(chordKeys, seed, 0);
  const chords = chordProgressions[selectedKey];

  // ─── Full warm pad bed ───
  addPad(ctx, bus.pad, {
    frequencies: chords[0],
    startTime: 0, duration: durationSec * 0.55, volume: 0.07,
  });
  addPad(ctx, bus.pad, {
    frequencies: chords[1],
    startTime: durationSec * 0.35, duration: durationSec * 0.65, volume: 0.075,
  });
  // High shimmer layer for warmth
  addPad(ctx, bus.pad, {
    frequencies: [chords[0][2] * 2],
    startTime: 1.5, duration: durationSec - 3, volume: 0.02, type: 'triangle',
  });

  // ─── Gentle arpeggio pattern throughout for continuous musical interest ───
  const arpNotes = [chords[0][0] * 2, chords[0][1] * 2, chords[0][2] * 2, chords[1][1] * 2];
  for (let t = 1.5; t < durationSec - 2; t += 0.8) {
    const noteIdx = Math.floor(t / 0.8) % arpNotes.length;
    addArpNote(ctx, bus.chime, arpNotes[noteIdx], t, 0.03);
  }

  // Scene timings (frames / 30fps)
  const logoStart = 80 / 30;
  const privacyStart = 195 / 30;
  const platformStart = 315 / 30;
  const closingStart = 435 / 30;

  // Hook — opening impact
  addImpact(ctx, bus.fx, 0.3, 0.10);

  // Logo reveal — refined chime chord with shimmer
  addImpact(ctx, bus.fx, logoStart + 0.1, 0.08);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 1), logoStart + 0.3, 0.12);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 2), logoStart + 0.5, 0.08);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 3), logoStart + 0.7, 0.06);
  addShimmer(ctx, bus.chime, logoStart + 0.8, 0.03);

  // Privacy — accent
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 4), privacyStart + 0.3, 0.08);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 5), privacyStart + 0.6, 0.05);

  // Platforms — soft accent
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 6), platformStart + 0.3, 0.07);
  addTick(ctx, bus.fx, platformStart + 0.1, 0.04);

  // Closing — resolve chord bloom
  addImpact(ctx, bus.fx, closingStart + 0.05, 0.08);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 7), closingStart + 0.2, 0.10);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 8), closingStart + 0.4, 0.07);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 9), closingStart + 0.6, 0.05);
  addShimmer(ctx, bus.chime, closingStart + 0.7, 0.03);

  return ctx.startRendering();
}

/**
 * IG REEL — Storytelling, Trendy, Engaging
 * Rhythmic pulse, tension builds, punchy reveals. Social media energy.
 */
export async function buildIGReelAudio(durationSec: number, seed: number = 42): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * durationSec, SAMPLE_RATE);
  const bus = createMixBus(ctx, { master: 0.8, pad: 0.85, chime: 0.95, fx: 0.9 });

  const chordKeys: ChordKey[] = ['Am', 'Dm', 'Em', 'Cm', 'Fm'];
  const selectedKey = audioSelect(chordKeys, seed, 0);
  const chords = chordProgressions[selectedKey];

  // Scene timings
  const hookEnd = 125 / 30;
  const logoStart = 115 / 30;
  const featuresStart = 230 / 30;
  const ctaStart = 385 / 30;

  // ─── Full ambient bed — evolving chords (louder for proper backtrack) ───
  addPad(ctx, bus.pad, {
    frequencies: chords[0],
    startTime: 0, duration: durationSec * 0.55, volume: 0.065,
  });
  addPad(ctx, bus.pad, {
    frequencies: chords[1],
    startTime: durationSec * 0.35, duration: durationSec * 0.65, volume: 0.07,
  });
  // Triangle shimmer layer
  addPad(ctx, bus.pad, {
    frequencies: [chords[0][2] * 2],
    startTime: 1, duration: durationSec - 2, volume: 0.018, type: 'triangle',
  });

  // ─── Single unified rhythmic pulse (no duplicates!) ───
  for (let t = 1.5; t < durationSec - 1; t += 0.5) {
    // Gradual volume build through sections
    let vol: number;
    if (t < hookEnd) vol = 0.05;
    else if (t < featuresStart) vol = 0.06;
    else vol = 0.08;
    addPulse(ctx, bus.fx, t, vol);
  }

  // Offbeat ticks for groove (every other beat to avoid clutter)
  for (let t = 2.25; t < durationSec - 1; t += 1.0) {
    addTick(ctx, bus.fx, t, 0.025);
  }

  // ─── Gentle arpeggio for continuous melodic content ───
  const arpNotes = [chords[0][0] * 2, chords[0][2] * 2, chords[1][1] * 2, chords[1][2] * 2];
  for (let t = 2; t < durationSec - 2; t += 0.65) {
    const noteIdx = Math.floor(t / 0.65) % arpNotes.length;
    addArpNote(ctx, bus.chime, arpNotes[noteIdx], t, 0.025);
  }

  // Hook — rising tension
  addSweep(ctx, bus.fx, 0.5, hookEnd - 1, 0.035);
  addImpact(ctx, bus.fx, 0.3, 0.10);

  // Second hook line — tension hit
  addImpact(ctx, bus.fx, 28 / 30, 0.07);

  // Logo drop — punchy impact
  addImpact(ctx, bus.fx, logoStart + 0.3, 0.14);
  addChime(ctx, bus.chime, NOTES.C4, logoStart + 0.4, 0.09);
  addShimmer(ctx, bus.chime, logoStart + 0.6, 0.02);

  // Tagline accent
  addTick(ctx, bus.fx, logoStart + 1.7, 0.04);

  // Feature card reveals — ticks with chime accent
  const featureStarts = [
    (230 + 18) / 30,
    (230 + 38) / 30,
    (230 + 58) / 30,
  ];
  for (let i = 0; i < featureStarts.length; i++) {
    const ft = featureStarts[i];
    addTick(ctx, bus.fx, ft, 0.06);
    addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 10 + i), ft, 0.05);
  }

  // CTA build — sweep into final
  addSweep(ctx, bus.fx, ctaStart - 0.5, 1.5, 0.03);
  addImpact(ctx, bus.fx, ctaStart + 0.3, 0.12);
  addChime(ctx, bus.chime, NOTES.C5, ctaStart + 0.5, 0.07);
  addShimmer(ctx, bus.chime, ctaStart + 0.7, 0.025);

  return ctx.startRendering();
}

/**
 * DEMO SHOWCASE — Product Capability, Cinematic, Impressive
 * Full background music with evolving pads, rhythmic pulse,
 * melodic motifs at scene transitions, and cinematic arc.
 */
export async function buildShowcaseAudio(durationSec: number, seed: number = 42): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * durationSec, SAMPLE_RATE);
  const bus = createMixBus(ctx, { master: 0.75, pad: 0.9, chime: 0.9, fx: 0.8 });

  const chordKeys: ChordKey[] = ['Am', 'Dm', 'Em', 'Cm', 'Fm'];
  const selectedKey = audioSelect(chordKeys, seed, 0);
  const chords = chordProgressions[selectedKey];

  // ─── Evolving Pad Layers (louder, proper backtrack bed) ───

  // Act 1: dark, tension (0-10s)
  addPad(ctx, bus.pad, {
    frequencies: chords[0],
    startTime: 0, duration: 12, volume: 0.06,
  });

  // Act 2: discovery (8-20s)
  addPad(ctx, bus.pad, {
    frequencies: chords[1],
    startTime: 8, duration: 14, volume: 0.065,
  });
  addPad(ctx, bus.pad, {
    frequencies: [chords[1][0] * 2, chords[1][2] * 2],
    startTime: 10, duration: 10, volume: 0.02, type: 'triangle',
  });

  // Act 3a: hopeful, building (18-44s)
  addPad(ctx, bus.pad, {
    frequencies: chords[2],
    startTime: 18, duration: 28, volume: 0.065,
  });
  addPad(ctx, bus.pad, {
    frequencies: [chords[0][0], chords[2][1]],
    startTime: 22, duration: 20, volume: 0.022, type: 'triangle',
  });

  // Act 3b: energy plateau (44-67s)
  addPad(ctx, bus.pad, {
    frequencies: chords[0],
    startTime: 44, duration: 23, volume: 0.065,
  });
  addPad(ctx, bus.pad, {
    frequencies: [chords[1][1], chords[1][2]],
    startTime: 46, duration: 18, volume: 0.025, type: 'triangle',
  });

  // Act 4: resolution (65s to end)
  addPad(ctx, bus.pad, {
    frequencies: [NOTES.C3, NOTES.E3, NOTES.G3, NOTES.C4],
    startTime: 65, duration: durationSec - 65, volume: 0.07,
  });

  // ─── Continuous arpeggio for melodic interest (8s onwards) ───
  const arpNotes = [
    chords[0][0] * 2, chords[0][2] * 2, chords[1][1] * 2,
    chords[1][2] * 2, chords[2][0] * 2, chords[2][2] * 2,
  ];
  for (let t = 8; t < durationSec - 3; t += 0.9) {
    const noteIdx = Math.floor(t / 0.9) % arpNotes.length;
    // Volume follows the cinematic arc
    let vol: number;
    if (t < 18) vol = 0.02;        // quiet discovery
    else if (t < 44) vol = 0.03;   // building
    else if (t < 65) vol = 0.035;  // energy plateau
    else vol = 0.025;              // resolution wind-down
    addArpNote(ctx, bus.chime, arpNotes[noteIdx], t, vol);
  }

  // ─── Rhythmic Pulse (tighter interval for proper groove) ───

  // Pulse during feature demos (12s - 78s), every 1s for musical feel
  for (let t = 12; t < 78; t += 1.0) {
    const vol = t < 25 ? 0.04 : t < 55 ? 0.06 : 0.045;
    addPulse(ctx, bus.fx, t, vol);
  }

  // Offbeat ticks for rhythm (16s - 72s), every other beat
  for (let t = 16.5; t < 72; t += 2.0) {
    addTick(ctx, bus.fx, t, 0.02);
  }

  // ─── Act 1: The Problem (0-5s) ───
  addImpact(ctx, bus.fx, 0.3, 0.10);
  addSweep(ctx, bus.fx, 1.0, 3.5, 0.03);

  // ─── Act 2: The Discovery (4.7-12.8s) ───
  const logoTime = 140 / 30;
  const privacyTime = 255 / 30;

  // Logo reveal — cinematic chord bloom
  addImpact(ctx, bus.fx, logoTime + 0.1, 0.12);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 1), logoTime + 0.3, 0.11);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 2), logoTime + 0.5, 0.08);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 3), logoTime + 0.7, 0.06);
  addChime(ctx, bus.chime, NOTES.C5, logoTime + 0.85, 0.04);
  addShimmer(ctx, bus.chime, logoTime + 0.9, 0.03);

  // Privacy — warm resolve
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 4), privacyTime + 0.3, 0.07);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 5), privacyTime + 0.6, 0.05);

  // ─── Act 3: Story Beats + Feature Demos ───

  const storyBeats = [
    { frame: 375, seedIdx: 10 },   // Vibe Studio
    { frame: 655, seedIdx: 11 },   // Portfolio
    { frame: 935, seedIdx: 12 },   // Backtest
    { frame: 1215, seedIdx: 13 },  // Quant
    { frame: 1455, seedIdx: 14 },  // Fundamentals
    { frame: 1645, seedIdx: 15 },  // Optimizer
    { frame: 1915, seedIdx: 16 },  // Journal
    { frame: 2165, seedIdx: 17 },  // AI Chat
  ];

  for (const beat of storyBeats) {
    const t = beat.frame / 30;
    // Impact + chime motif at each story beat
    addImpact(ctx, bus.fx, t + 0.05, 0.07);
    addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, beat.seedIdx), t + 0.2, 0.09);
    addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, beat.seedIdx + 20), t + 0.45, 0.06);
    addTick(ctx, bus.fx, t + 0.1, 0.03);
  }

  // Mid-demo accent chimes (inside feature demos)
  for (let i = 0; i < storyBeats.length; i++) {
    const demoStart = storyBeats[i].frame / 30 + 3;
    const demoEnd = i < storyBeats.length - 1 ? storyBeats[i + 1].frame / 30 - 1 : 80;
    const midChime = (demoStart + demoEnd) / 2;
    if (midChime < durationSec - 5) {
      addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 30 + i), midChime, 0.04);
    }
  }

  // ─── Act 4: Resolution ───
  const platformTime = 2415 / 30;
  const closingTime = 2535 / 30;

  // Rising sweep into resolution
  addSweep(ctx, bus.fx, platformTime - 1, 2.5, 0.025);
  addChime(ctx, bus.chime, NOTES.G4, platformTime + 0.3, 0.08);
  addChime(ctx, bus.chime, NOTES.C5, platformTime + 0.6, 0.06);

  // Final resolve — full chord bloom
  addImpact(ctx, bus.fx, closingTime + 0.05, 0.10);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 20), closingTime + 0.2, 0.10);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 21), closingTime + 0.4, 0.07);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 22), closingTime + 0.6, 0.06);
  addChime(ctx, bus.chime, NOTES.C5, closingTime + 0.75, 0.05);
  addShimmer(ctx, bus.chime, closingTime + 0.85, 0.035);

  return ctx.startRendering();
}

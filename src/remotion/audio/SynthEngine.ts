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
  osc.stop(startTime + duration + 0.01);
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
  osc.stop(startTime + duration + 0.01);
}

/** Soft tick/click for UI reveals */
function addTick(ctx: OfflineAudioContext, dest: AudioNode, startTime: number, volume: number = 0.07) {
  const adsr: ADSR = { attack: 0.001, decay: 0.03, sustain: 0.0, release: 0.05 };
  addTone(ctx, dest, { frequency: 1200, type: 'sine', startTime, duration: 0.08, volume, adsr });
  addTone(ctx, dest, { frequency: 2400, type: 'sine', startTime, duration: 0.04, volume: volume * 0.3, adsr });
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
  const bus = createMixBus(ctx, { master: 0.65, pad: 0.8, chime: 1.0, fx: 0.7 });

  const chordKeys: ChordKey[] = ['Am', 'Dm', 'Em', 'Cm', 'Fm'];
  const selectedKey = audioSelect(chordKeys, seed, 0);
  const chords = chordProgressions[selectedKey];

  // Warm ambient pad throughout (seed-varied chord)
  addPad(ctx, bus.pad, {
    frequencies: chords[0],
    startTime: 0, duration: durationSec, volume: 0.04,
  });

  // Scene timings (frames / 30fps)
  const hookStart = 0;
  const logoStart = 80 / 30;
  const privacyStart = 195 / 30;
  const platformStart = 315 / 30;
  const closingStart = 435 / 30;

  // Hook — subtle low presence
  addImpact(ctx, bus.fx, hookStart + 0.3, 0.07);

  // Logo reveal — refined chime chord with shimmer (seed-varied notes)
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 1), logoStart + 0.5, 0.10);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 2), logoStart + 0.7, 0.07);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 3), logoStart + 0.9, 0.05);
  addShimmer(ctx, bus.chime, logoStart + 1.0, 0.02);

  // Privacy — single warm tone
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 4), privacyStart + 0.3, 0.06);

  // Platforms — soft accent
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 5), platformStart + 0.3, 0.05);

  // Closing — gentle resolve chord
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 6), closingStart + 0.3, 0.08);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 7), closingStart + 0.5, 0.06);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 8), closingStart + 0.7, 0.05);
  addShimmer(ctx, bus.chime, closingStart + 0.8, 0.02);

  return ctx.startRendering();
}

/**
 * IG REEL — Storytelling, Trendy, Engaging
 * Rhythmic pulse, tension builds, punchy reveals. Social media energy.
 */
export async function buildIGReelAudio(durationSec: number, seed: number = 42): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * durationSec, SAMPLE_RATE);
  const bus = createMixBus(ctx, { master: 0.7, pad: 0.6, chime: 0.9, fx: 1.0 });

  const chordKeys: ChordKey[] = ['Am', 'Dm', 'Em', 'Cm', 'Fm'];
  const selectedKey = audioSelect(chordKeys, seed, 0);
  const chords = chordProgressions[selectedKey];

  // Scene timings
  const hookEnd = 125 / 30;
  const logoStart = 115 / 30;
  const featuresStart = 230 / 30;
  const ctaStart = 385 / 30;

  // Low ambient bed — seed-varied chord
  addPad(ctx, bus.pad, {
    frequencies: chords[0].slice(0, 2),
    startTime: 0, duration: durationSec, volume: 0.025,
  });

  // Rhythmic sub-bass pulse during features + CTA (every ~0.6s)
  for (let t = featuresStart; t < durationSec - 1; t += 0.55) {
    addPulse(ctx, bus.fx, t, 0.08);
  }

  // Hook — rising tension
  addSweep(ctx, bus.fx, 0.5, hookEnd - 1, 0.04);
  addImpact(ctx, bus.fx, 0.3, 0.10);

  // Second hook line — tension hit
  addImpact(ctx, bus.fx, 28 / 30, 0.07);

  // Logo drop — punchy impact
  addImpact(ctx, bus.fx, logoStart + 0.3, 0.16);
  addChime(ctx, bus.chime, NOTES.C4, logoStart + 0.4, 0.08);

  // Tagline accent
  addTick(ctx, bus.fx, logoStart + 1.7, 0.05);

  // Feature card reveals — staccato ticks with chime accent
  const featureStarts = [
    (230 + 18) / 30,
    (230 + 38) / 30,
    (230 + 58) / 30,
  ];
  for (const ft of featureStarts) {
    addTick(ctx, bus.fx, ft, 0.08);
    addChime(ctx, bus.chime, NOTES.E5, ft, 0.04);
  }

  // CTA build — sweep into final
  addSweep(ctx, bus.fx, ctaStart - 0.5, 1.5, 0.03);
  addImpact(ctx, bus.fx, ctaStart + 0.3, 0.12);
  addChime(ctx, bus.chime, NOTES.C5, ctaStart + 0.5, 0.06);

  return ctx.startRendering();
}

/**
 * DEMO SHOWCASE — Product Capability, Cinematic, Impressive
 * Evolving ambient layers, musical story beat motifs, building arc.
 * Now accepts optional seed for unique chord progressions and chime patterns.
 */
export async function buildShowcaseAudio(durationSec: number, seed: number = 42): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * durationSec, SAMPLE_RATE);
  const bus = createMixBus(ctx, { master: 0.6, pad: 0.7, chime: 0.9, fx: 0.8 });

  const chordKeys: ChordKey[] = ['Am', 'Dm', 'Em', 'Cm', 'Fm'];
  const selectedKey = audioSelect(chordKeys, seed, 0);
  const chords = chordProgressions[selectedKey];

  // ─── Act 1: The Problem (0-5s) ───
  addImpact(ctx, bus.fx, 0.3, 0.08);
  addSweep(ctx, bus.fx, 1.0, 3.5, 0.025);

  // ─── Act 2: The Discovery (4.7-12.8s) ───
  const logoTime = 140 / 30;
  const privacyTime = 255 / 30;

  // Logo reveal — cinematic chord bloom with seed-varied notes
  addImpact(ctx, bus.fx, logoTime + 0.2, 0.12);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 1), logoTime + 0.4, 0.10);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 2), logoTime + 0.55, 0.07);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 3), logoTime + 0.7, 0.05);
  addChime(ctx, bus.chime, NOTES.C5, logoTime + 0.85, 0.04);
  addShimmer(ctx, bus.chime, logoTime + 0.9, 0.02);

  // Privacy — warm resolve
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 4), privacyTime + 0.3, 0.06);

  // ─── Act 3: Story Beats + Feature Demos ───

  const storyBeats = [
    { frame: 375, note: NOTES.C5 },
    { frame: 655, note: NOTES.D5 },
    { frame: 935, note: NOTES.E5 },
    { frame: 1215, note: NOTES.G4 },
    { frame: 1645, note: NOTES.A4 },
    { frame: 1915, note: NOTES.C5 },
    { frame: 2165, note: NOTES.E5 },
  ];

  for (const [idx, beat] of storyBeats.entries()) {
    const t = beat.frame / 30;
    addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 10 + idx), t + 0.3, 0.07);
    addTick(ctx, bus.fx, t + 0.15, 0.04);
    addImpact(ctx, bus.fx, t + 0.1, 0.05);
  }

  // ─── Ambient Pad Layers (crossfade, don't stack) — seed-varied chords ───

  // Act 1-2: dark, tension (0s to 14s)
  addPad(ctx, bus.pad, {
    frequencies: chords[0].slice(0, 2),
    startTime: 0, duration: 14, volume: 0.03,
  });

  // Act 3 first half: hopeful (14s to 40s)
  addPad(ctx, bus.pad, {
    frequencies: chords[1],
    startTime: 14, duration: 26, volume: 0.025,
  });

  // Act 3 second half: building (40s to 65s)
  addPad(ctx, bus.pad, {
    frequencies: chords[2],
    startTime: 40, duration: 25, volume: 0.025,
  });

  // Act 4: Resolution — resolve (65s to end)
  addPad(ctx, bus.pad, {
    frequencies: [NOTES.C3, NOTES.G3, NOTES.C4],
    startTime: 65, duration: durationSec - 65, volume: 0.03,
  });

  // ─── Act 4: Resolution ───
  const platformTime = 2415 / 30;
  const closingTime = 2535 / 30;

  addChime(ctx, bus.chime, NOTES.G4, platformTime + 0.3, 0.06);

  // Final resolve — full chord bloom with seed variation
  addImpact(ctx, bus.fx, closingTime + 0.1, 0.08);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 20), closingTime + 0.3, 0.08);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 21), closingTime + 0.5, 0.06);
  addChime(ctx, bus.chime, audioSelect(chimeNotePool, seed, 22), closingTime + 0.65, 0.05);
  addChime(ctx, bus.chime, NOTES.C5, closingTime + 0.8, 0.04);
  addShimmer(ctx, bus.chime, closingTime + 0.9, 0.02);

  return ctx.startRendering();
}

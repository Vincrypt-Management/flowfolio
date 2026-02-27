import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from 'remotion';
import { colors, fonts, radius } from '../styles';
import { MockSidebar } from '../components/MockSidebar';
import { GlassCard } from '../components/GlassCard';
import { SceneTransition } from '../components/SceneTransition';
import { useSceneRNG } from '../lib/uniqueness';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const conversationPool: ChatMessage[][] = [
  [
    { role: 'user', text: 'Should I increase tech allocation given strong fundamentals?' },
    { role: 'assistant', text: 'Your tech allocation is 42%, already above the 35% benchmark. Top holdings show strong Sharpe ratios (1.8, 1.6). I recommend:\n\n1. Increase by 5-8% max from utilities\n2. Focus on defensive tech (semiconductors)\n3. Set trailing stop at 10% below current\n\nThis maintains bullish exposure while managing downside.' },
    { role: 'user', text: 'What about NVDA — is it overvalued at current levels?' },
    { role: 'assistant', text: 'NVDA trades at a premium but justified by strong revenue growth. Key considerations:\n\n• Forward P/E drops significantly on consensus estimates\n• AI infrastructure spend shows no slowdown\n• Free cash flow margin is exceptional\n\nVerdict: Fair value at current growth rate. Consider trimming only if position exceeds 15% of portfolio.' },
  ],
  [
    { role: 'user', text: 'How should I prepare my portfolio for rising rates?' },
    { role: 'assistant', text: 'Rate-sensitive sectors to review:\n\n1. Reduce long-duration bonds (TLT down 8%)\n2. Increase financials exposure (JPM, BAC benefit)\n3. Trim REITs with high leverage ratios\n\nYour current allocation is 15% bonds — consider shifting 5% to short-duration or TIPS.' },
    { role: 'user', text: 'Show me my best performing sectors this quarter.' },
    { role: 'assistant', text: 'Q1 sector performance in your portfolio:\n\n• Technology: +14.2% (led by NVDA +28%)\n• Healthcare: +8.1% (strong pharma results)\n• Energy: +6.3% (oil price recovery)\n• Consumer: +3.1% (stable but lagging)\n\nTech is driving 62% of total returns. Consider rebalancing if concentration risk concerns you.' },
  ],
  [
    { role: 'user', text: 'Analyze my portfolio risk exposure right now.' },
    { role: 'assistant', text: 'Current risk metrics:\n\n• Portfolio Beta: 1.12 (slightly aggressive)\n• Max Drawdown (1Y): -14.3%\n• VaR (95%): -2.8% daily\n• Concentration: Top 5 = 48% of portfolio\n\nRecommendation: Your Sharpe of 1.4 is solid but correlation risk is elevated in tech names.' },
    { role: 'user', text: 'What would happen if I removed my bottom 3 holdings?' },
    { role: 'assistant', text: 'Simulating removal of your 3 weakest positions:\n\n• Projected Sharpe: 1.4 → 1.6 (+14%)\n• Portfolio Beta: 1.12 → 1.05\n• Volatility: 18.2% → 15.8%\n\nReallocating that capital to your top-scoring vibe picks would improve risk-adjusted returns by ~12%.' },
  ],
];

const historyTitles = [
  'Tech allocation review', 'Q4 rebalancing plan', 'Dividend strategy deep dive',
  'Risk assessment update', 'Sector rotation analysis', 'Portfolio optimization review',
  'AI sector deep dive', 'Value screening results', 'Momentum strategy check',
];

export const AIChatDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const rng = useSceneRNG('ai-chat');

  const conversation = rng.pick(conversationPool);
  const selectedTitles = rng.pickN(historyTitles, 3);
  const historyItems = selectedTitles.map((title) => ({
    title,
    msgs: rng.int(4, 15),
    daysLeft: rng.int(3, 30),
  }));

  // Typing indicator dots
  const dotCycle = frame % 30;
  const dot1 = dotCycle < 10 ? 1 : 0.3;
  const dot2 = dotCycle >= 10 && dotCycle < 20 ? 1 : 0.3;
  const dot3 = dotCycle >= 20 ? 1 : 0.3;

  return (
    <SceneTransition durationInFrames={200}>
      <AbsoluteFill>
        <div style={{ display: 'flex', height: '100%' }}>
          <MockSidebar activeIndex={0} />

          <div
            style={{
              flex: 1,
              padding: '44px 48px',
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
            }}
          >
            {/* Header */}
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: fonts.mono,
                  color: colors.accent,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  marginBottom: 8,
                  opacity: interpolate(frame, [10, 25], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                AI Portfolio Agent
              </div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: colors.text,
                  fontFamily: fonts.sans,
                  letterSpacing: '-0.02em',
                  opacity: interpolate(frame, [15, 30], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                Chat with Your Portfolio
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: colors.textMuted,
                  fontFamily: fonts.sans,
                  marginTop: 4,
                  opacity: interpolate(frame, [20, 35], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                Ask natural language questions about your holdings, risk, and strategy
              </div>
            </div>

            <div style={{ display: 'flex', gap: 22, flex: 1 }}>
              {/* Chat messages */}
              <GlassCard delay={15} style={{ flex: 2, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }} glowColor={colors.accentDim20}>
                {/* Chat area */}
                <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
                  {conversation.map((msg, i) => {
                    const msgDelay = 25 + i * 30;
                    const msgOp = interpolate(frame - msgDelay, [0, 18], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    });
                    const msgY = interpolate(frame - msgDelay, [0, 18], [15, 0], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    });

                    const isUser = msg.role === 'user';

                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isUser ? 'flex-end' : 'flex-start',
                          opacity: msgOp,
                          transform: `translateY(${msgY}px)`,
                        }}
                      >
                        {/* Role label */}
                        <div style={{
                          fontSize: 10,
                          fontFamily: fonts.mono,
                          color: isUser ? colors.textDim : colors.accent,
                          marginBottom: 4,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                        }}>
                          {isUser ? 'You' : 'AI Agent'}
                        </div>
                        {/* Bubble */}
                        <div
                          style={{
                            maxWidth: '85%',
                            padding: '12px 16px',
                            borderRadius: isUser
                              ? `${radius.xl}px ${radius.xl}px ${radius.sm}px ${radius.xl}px`
                              : `${radius.xl}px ${radius.xl}px ${radius.xl}px ${radius.sm}px`,
                            background: isUser
                              ? `linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)`
                              : `linear-gradient(135deg, ${colors.accentDim} 0%, rgba(99,102,241,0.05) 100%)`,
                            border: `1px solid ${isUser ? colors.glassBorder : colors.accentDim20}`,
                            fontSize: 12.5,
                            fontFamily: fonts.sans,
                            color: colors.textSoft,
                            lineHeight: 1.6,
                            whiteSpace: 'pre-line',
                            wordBreak: 'break-word' as const,
                          }}
                        >
                          {msg.text}
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing indicator (appears after last message) */}
                  {frame > 140 && (
                    <div
                      style={{
                        opacity: interpolate(frame, [140, 150], [0, 1], {
                          extrapolateLeft: 'clamp',
                          extrapolateRight: 'clamp',
                        }),
                        display: 'flex',
                        alignItems: 'flex-start',
                        flexDirection: 'column',
                      }}
                    >
                      <div style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.accent, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        AI Agent
                      </div>
                      <div
                        style={{
                          padding: '12px 18px',
                          borderRadius: `${radius.xl}px ${radius.xl}px ${radius.xl}px ${radius.sm}px`,
                          background: `linear-gradient(135deg, ${colors.accentDim} 0%, rgba(99,102,241,0.05) 100%)`,
                          border: `1px solid ${colors.accentDim20}`,
                          display: 'flex',
                          gap: 4,
                        }}
                      >
                        {[dot1, dot2, dot3].map((op, di) => (
                          <div
                            key={di}
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: colors.accent,
                              opacity: op,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Input bar */}
                <div
                  style={{
                    padding: '14px 24px',
                    borderTop: `1px solid ${colors.glassBorder}`,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: radius.lg,
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid ${colors.glassBorder}`,
                      fontSize: 13,
                      fontFamily: fonts.sans,
                      color: colors.textDim,
                    }}
                  >
                    Ask anything about this portfolio...
                  </div>
                  {/* Send button */}
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: radius.lg,
                      background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentHover})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 0 16px ${colors.accentDim20}`,
                    }}
                  >
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                      <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </GlassCard>

              {/* Chat history sidebar */}
              <div style={{ flex: 0.65, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <GlassCard delay={30} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                    Saved Conversations
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {historyItems.map((item, i) => {
                      const hDelay = 50 + i * 14;
                      const hOp = interpolate(frame - hDelay, [0, 14], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                      });

                      return (
                        <div
                          key={i}
                          style={{
                            padding: '10px 14px',
                            borderRadius: radius.xl,
                            background: i === 0 ? `${colors.accent}08` : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${i === 0 ? colors.accentDim20 : colors.glassBorder}`,
                            opacity: hOp,
                          }}
                        >
                          <div style={{ fontSize: 12, fontFamily: fonts.sans, color: colors.text, fontWeight: 500, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.title}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.textDim }}>{item.msgs} msgs</span>
                            <span style={{ fontSize: 10, fontFamily: fonts.mono, color: item.daysLeft <= 7 ? colors.amber : colors.textDim }}>
                              {item.daysLeft}d left
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 9, fontFamily: fonts.mono, color: colors.textDim, marginTop: 12, opacity: 0.6 }}>
                    Auto-deleted after 30 days
                  </div>
                </GlassCard>

                {/* AI capabilities badges */}
                <GlassCard delay={80} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                    AI Capabilities
                  </div>
                  {['Portfolio analysis', 'Risk assessment', 'Rebalancing advice', 'Market research'].map((cap, i) => {
                    const cDelay = 95 + i * 8;
                    const cOp = interpolate(frame - cDelay, [0, 10], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    });
                    return (
                      <div
                        key={cap}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          opacity: cOp,
                        }}
                      >
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: colors.accent, boxShadow: `0 0 6px ${colors.accent}40` }} />
                        <span style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textMuted }}>{cap}</span>
                      </div>
                    );
                  })}
                </GlassCard>
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};

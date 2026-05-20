import { useAiStream } from '../hooks/useAiStream';

interface AiInlinePanelProps {
  prompt: string;
  triggerLabel?: string;
  disabled?: boolean;
  emptyHint?: string;
}

export function AiInlinePanel({
  prompt,
  triggerLabel = 'Ask AI',
  disabled = false,
  emptyHint,
}: AiInlinePanelProps) {
  const { state, start, stop } = useAiStream();
  const isStreaming = state.phase === 'streaming';
  const hasOutput = state.phase === 'streaming' || state.phase === 'done';
  const isError = state.phase === 'error';
  const triggerDisabled = disabled || prompt.length === 0;

  const buttonLabel =
    state.phase === 'done' || state.phase === 'error' ? 'Ask Again' : triggerLabel;

  return (
    <section className="ai-inline-panel" aria-live="polite">
      <header className="ai-inline-panel__header">
        {isStreaming ? (
          <button
            type="button"
            onClick={stop}
            className="ai-inline-panel__stop"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => start(prompt)}
            disabled={triggerDisabled}
            className="ai-inline-panel__trigger"
          >
            {buttonLabel}
          </button>
        )}
      </header>

      {state.phase === 'idle' && emptyHint && (
        <p className="ai-inline-panel__hint muted">{emptyHint}</p>
      )}

      {hasOutput && (
        <pre className="ai-inline-panel__output">{state.tokens}</pre>
      )}

      {isError && (
        <div className="ai-inline-panel__error">
          <p>AI request failed: {state.error}</p>
          {state.tokens && (
            <pre className="ai-inline-panel__partial muted">{state.tokens}</pre>
          )}
        </div>
      )}
    </section>
  );
}

import { useAiStream } from '../hooks/useAiStream';
import { Button, Alert } from '@flowfolio/ui';

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
          <Button type="button" variant="danger" size="sm" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => start(prompt)}
            disabled={triggerDisabled}
          >
            {buttonLabel}
          </Button>
        )}
      </header>

      {state.phase === 'idle' && emptyHint && (
        <p className="ai-inline-panel__hint muted">{emptyHint}</p>
      )}

      {hasOutput && (
        <pre className="ai-inline-panel__output">{state.tokens}</pre>
      )}

      {isError && (
        <>
          <Alert variant="error" title="AI request failed" description={state.error ?? undefined} />
          {state.tokens && (
            <pre className="ai-inline-panel__partial muted">{state.tokens}</pre>
          )}
        </>
      )}
    </section>
  );
}

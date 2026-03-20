import { VibePlan } from "../../shared/types";

interface SymbolScore {
  symbol: string;
  total_score: number;
  factors: Array<{
    name: string;
    raw_value: number | null;
    normalized_value: number;
    weight: number;
    contribution: number;
  }>;
  explanation: string;
}

interface RankingsTabProps {
  plan: VibePlan | null;
  rankingsSymbols: string;
  onSymbolsChange: (value: string) => void;
  scores: SymbolScore[];
  isScoring: boolean;
  selectedScore: SymbolScore | null;
  onSelectScore: (score: SymbolScore | null) => void;
  onScoreSymbols: () => void;
}

export function RankingsTab({
  plan,
  rankingsSymbols,
  onSymbolsChange,
  scores,
  isScoring,
  selectedScore,
  onSelectScore,
  onScoreSymbols,
}: RankingsTabProps) {
  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <h1 className="page-title">Stock Rankings</h1>
        <p className="page-subtitle">Score and rank symbols based on your plan's factors</p>
      </header>

      <div className="card">
        <h3>Score Symbols</h3>
        <p className="text-muted mb-md">
          Current Plan: <strong>{plan?.name || "None"}</strong>
        </p>

        <div className="form-group">
          <label>Enter symbol tickers (comma-separated):</label>
          <input
            type="text"
            value={rankingsSymbols}
            onChange={(e) => onSymbolsChange(e.target.value)}
            placeholder="e.g., AAPL,MSFT,GOOGL"
            className="symbol-input"
          />
        </div>

        <button
          className="btn-primary"
          onClick={onScoreSymbols}
          disabled={isScoring || !plan}
        >
          {isScoring ? "Scoring..." : "Score Symbols"}
        </button>

        {!plan && <p className="note">Please select a plan from Templates first</p>}
      </div>

      {scores.length > 0 && (
        <div className="card mt-lg">
          <h3>Results ({scores.length} symbols ranked)</h3>
          <div className="overflow-x-auto">
            <table className="data-table">
              <caption className="sr-only">Symbol Rankings</caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Symbol</th>
                  <th scope="col">Total Score</th>
                  {scores[0]?.factors.map((f, i) => (
                    <th scope="col" key={i}>{f.name.toUpperCase()}</th>
                  ))}
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((score, idx) => (
                  <tr key={score.symbol} className={idx < 3 ? 'highlight-row' : ''}>
                    <td>{idx + 1}</td>
                    <td className="font-bold">{score.symbol}</td>
                    <td>
                      <div className="score-display">
                        <div className="score-bar">
                          <div className="score-bar-fill" style={{ width: `${score.total_score}%` }}></div>
                        </div>
                        <span className="score-value">{score.total_score.toFixed(1)}</span>
                      </div>
                    </td>
                    {score.factors.map((f, i) => (
                      <td key={i} className="font-mono">{f.normalized_value.toFixed(0)}</td>
                    ))}
                    <td>
                      <button
                        className="btn-small"
                        onClick={() => onSelectScore(score)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedScore && (
        <div className="card mt-lg relative">
          <h3>Detailed Analysis: {selectedScore.symbol}</h3>
          <button
            className="btn-close"
            onClick={() => onSelectScore(null)}
            aria-label="Close"
          >
            ✕
          </button>

          <div className="explanation-box">
            <pre>{selectedScore.explanation}</pre>
          </div>

          <h4>Factor Contributions</h4>
          <div className="factor-breakdown">
            {selectedScore.factors.map((factor, i) => (
              <div key={i} className="factor-item">
                <div className="factor-header">
                  <span className="factor-name">{factor.name.toUpperCase()}</span>
                  <span className="font-mono">{factor.normalized_value.toFixed(1)}/100</span>
                </div>
                <div className="factor-bar">
                  <div className="factor-bar-fill" style={{ width: `${factor.normalized_value}%` }}></div>
                </div>
                <div className="factor-details">
                  Weight: {(factor.weight * 100).toFixed(0)}% • Contributes {factor.contribution.toFixed(1)} points
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

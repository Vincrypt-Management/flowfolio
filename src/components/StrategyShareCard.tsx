import { useRef, useCallback } from "react";
import { X, Download, Copy, TrendingUp } from "lucide-react";
import { useToast } from "./Toast";
import { Button, IconButton, Tooltip } from "@flowfolio/ui";
import "./StrategyShareCard.css";

interface Factor {
  name: string;
  weight: number;
}

interface BacktestMetrics {
  cagr?: number;
  sharpe?: number;
  maxDrawdown?: number;
}

interface StrategyShareCardProps {
  planName: string;
  factors: Factor[];
  backtestMetrics?: BacktestMetrics;
  onClose: () => void;
}

// Brand colors for canvas drawing (must be hardcoded, CSS vars unavailable on canvas)
const CANVAS_COLORS = {
  bg: "#050505",
  bgCard: "#0a0a0a",
  bgBar: "#1a1a1a",
  accent: "#6366f1",
  primary: "#00e599",
  textMain: "#ffffff",
  textMuted: "#a1a1aa",
  border: "#27272a",
};

const BAR_PALETTE = [
  "#6366f1",
  "#00e599",
  "#f59e0b",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#10b981",
  "#f97316",
  "#ec4899",
  "#14b8a6",
];

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function buildCanvas(
  planName: string,
  factors: Factor[],
  backtestMetrics?: BacktestMetrics
): HTMLCanvasElement {
  const W = 640;
  const PADDING = 32;
  const HEADER_H = 80;
  const FACTOR_ROW_H = 36;
  const METRICS_SECTION_H = backtestMetrics ? 80 : 0;
  const FOOTER_H = 44;
  const factorsToShow = factors.slice(0, 10);
  const FACTORS_H = factorsToShow.length * FACTOR_ROW_H + 24; // +24 for section label
  const H = HEADER_H + FACTORS_H + METRICS_SECTION_H + FOOTER_H + PADDING * 2;

  const canvas = document.createElement("canvas");
  canvas.width = W * 2; // retina
  canvas.height = H * 2;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = CANVAS_COLORS.bg;
  drawRoundRect(ctx, 0, 0, W, H, 12);
  ctx.fill();

  // Left accent bar
  ctx.fillStyle = CANVAS_COLORS.accent;
  ctx.fillRect(0, 0, 4, H);

  // Header gradient strip
  const grad = ctx.createLinearGradient(0, 0, W, HEADER_H);
  grad.addColorStop(0, "rgba(99,102,241,0.15)");
  grad.addColorStop(1, "rgba(0,229,153,0.06)");
  ctx.fillStyle = grad;
  ctx.fillRect(4, 0, W - 4, HEADER_H);

  // Brand label
  ctx.font = "600 12px Inter, system-ui, sans-serif";
  ctx.fillStyle = CANVAS_COLORS.primary;
  ctx.fillText("FlowFolio", PADDING, PADDING + 4);

  // Strategy name
  ctx.font = "700 20px Inter, system-ui, sans-serif";
  ctx.fillStyle = CANVAS_COLORS.textMain;
  const maxTitleWidth = W - PADDING * 2 - 8;
  let title = planName;
  while (ctx.measureText(title).width > maxTitleWidth && title.length > 4) {
    title = title.slice(0, -1);
  }
  if (title !== planName) title += "…";
  ctx.fillText(title, PADDING, PADDING + 30);

  // Subtitle
  ctx.font = "400 12px Inter, system-ui, sans-serif";
  ctx.fillStyle = CANVAS_COLORS.textMuted;
  ctx.fillText("Investment Strategy", PADDING, PADDING + 50);

  // Section label for factors
  const sectionY = HEADER_H + 8;
  ctx.font = "500 11px Inter, system-ui, sans-serif";
  ctx.fillStyle = CANVAS_COLORS.textMuted;
  ctx.fillText("ALLOCATION BREAKDOWN", PADDING, sectionY + 14);

  // Factor bars
  const maxWeight = Math.max(...factorsToShow.map((f) => f.weight), 1);
  const barAreaX = PADDING;
  const barAreaW = W - PADDING * 2;
  const labelW = 120;
  const pctW = 42;
  const barW = barAreaW - labelW - pctW - 16;

  factorsToShow.forEach((factor, i) => {
    const rowY = sectionY + 22 + i * FACTOR_ROW_H;
    const color = BAR_PALETTE[i % BAR_PALETTE.length];

    // Label
    ctx.font = "400 12px Inter, system-ui, sans-serif";
    ctx.fillStyle = CANVAS_COLORS.textMain;
    let label = factor.name;
    while (
      ctx.measureText(label).width > labelW - 8 &&
      label.length > 2
    ) {
      label = label.slice(0, -1);
    }
    if (label !== factor.name) label += "…";
    ctx.fillText(label, barAreaX, rowY + 18);

    // Bar background
    ctx.fillStyle = CANVAS_COLORS.bgBar;
    drawRoundRect(ctx, barAreaX + labelW, rowY + 6, barW, 14, 3);
    ctx.fill();

    // Bar fill
    const fillW = Math.max(4, (factor.weight / maxWeight) * barW);
    ctx.fillStyle = color;
    drawRoundRect(ctx, barAreaX + labelW, rowY + 6, fillW, 14, 3);
    ctx.fill();

    // Percentage
    ctx.font = "500 11px Inter, system-ui, sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "right";
    ctx.fillText(
      `${factor.weight.toFixed(1)}%`,
      barAreaX + labelW + barW + pctW,
      rowY + 18
    );
    ctx.textAlign = "left";
  });

  // Metrics section
  if (backtestMetrics) {
    const metricsY = HEADER_H + FACTORS_H + 8;

    // Divider
    ctx.strokeStyle = CANVAS_COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, metricsY);
    ctx.lineTo(W - PADDING, metricsY);
    ctx.stroke();

    const metricItems: Array<{ label: string; value: string; color: string }> =
      [];

    if (backtestMetrics.cagr !== undefined) {
      metricItems.push({
        label: "CAGR",
        value: `${backtestMetrics.cagr >= 0 ? "+" : ""}${backtestMetrics.cagr.toFixed(1)}%`,
        color:
          backtestMetrics.cagr >= 0
            ? CANVAS_COLORS.primary
            : "#ef4444",
      });
    }
    if (backtestMetrics.sharpe !== undefined) {
      metricItems.push({
        label: "Sharpe",
        value: backtestMetrics.sharpe.toFixed(2),
        color:
          backtestMetrics.sharpe >= 1
            ? CANVAS_COLORS.primary
            : backtestMetrics.sharpe >= 0.5
            ? "#f59e0b"
            : "#ef4444",
      });
    }
    if (backtestMetrics.maxDrawdown !== undefined) {
      metricItems.push({
        label: "Max DD",
        value: `${backtestMetrics.maxDrawdown.toFixed(1)}%`,
        color: "#ef4444",
      });
    }

    const colW = (W - PADDING * 2) / Math.max(metricItems.length, 1);
    metricItems.forEach((m, i) => {
      const mx = PADDING + i * colW + colW / 2;
      ctx.textAlign = "center";

      ctx.font = "600 16px Inter, system-ui, sans-serif";
      ctx.fillStyle = m.color;
      ctx.fillText(m.value, mx, metricsY + 34);

      ctx.font = "400 10px Inter, system-ui, sans-serif";
      ctx.fillStyle = CANVAS_COLORS.textMuted;
      ctx.fillText(m.label, mx, metricsY + 52);

      ctx.textAlign = "left";
    });
  }

  // Footer
  const footerY = H - FOOTER_H;

  ctx.fillStyle = CANVAS_COLORS.bgCard;
  ctx.fillRect(0, footerY, W, FOOTER_H);

  ctx.font = "400 11px Inter, system-ui, sans-serif";
  ctx.fillStyle = CANVAS_COLORS.textMuted;
  ctx.textAlign = "center";
  ctx.fillText("Built with FlowFolio · Privacy-first portfolio planning", W / 2, footerY + 26);
  ctx.textAlign = "left";

  return canvas;
}

export function StrategyShareCard({
  planName,
  factors,
  backtestMetrics,
  onClose,
}: StrategyShareCardProps) {
  const { addToast } = useToast();
  const previewRef = useRef<HTMLDivElement>(null);

  const handleDownloadPNG = useCallback(() => {
    const canvas = buildCanvas(planName, factors, backtestMetrics);
    canvas.toBlob((blob) => {
      if (!blob) {
        addToast("Failed to generate image", "error");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${planName.replace(/\s+/g, "-").toLowerCase()}-strategy.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast("Strategy card downloaded!", "success");
    }, "image/png");
  }, [planName, factors, backtestMetrics, addToast]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!navigator.clipboard || !("write" in navigator.clipboard)) {
      addToast("Clipboard API not supported in this environment", "error");
      return;
    }
    const canvas = buildCanvas(planName, factors, backtestMetrics);
    canvas.toBlob(async (blob) => {
      if (!blob) {
        addToast("Failed to generate image", "error");
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        addToast("Strategy card copied to clipboard!", "success");
      } catch (err) {
        addToast(
          "Copy failed: " + (err instanceof Error ? err.message : "Unknown error"),
          "error"
        );
      }
    }, "image/png");
  }, [planName, factors, backtestMetrics, addToast]);

  const hasMetrics =
    backtestMetrics &&
    (backtestMetrics.cagr !== undefined ||
      backtestMetrics.sharpe !== undefined ||
      backtestMetrics.maxDrawdown !== undefined);

  const maxWeight = Math.max(...factors.map((f) => f.weight), 1);
  const displayFactors = factors.slice(0, 10);

  return (
    <div className="share-card-overlay" onClick={onClose}>
      <div
        className="share-card-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Share Strategy Card"
      >
        <div className="share-card-modal-header">
          <h3>
            <TrendingUp size={18} />
            Share Strategy
          </h3>
          <Tooltip content="Close" side="bottom">
            <IconButton variant="ghost" size="md" onClick={onClose} aria-label="Close">
              <X size={16} />
            </IconButton>
          </Tooltip>
        </div>

        {/* Preview card */}
        <div className="share-card-preview" ref={previewRef}>
          <div className="share-card">
            <div className="share-card-header">
              <span className="share-card-brand">FlowFolio</span>
              <h2 className="share-card-title">{planName}</h2>
              <p className="share-card-subtitle">Investment Strategy</p>
            </div>

            <div className="share-card-body">
              <p className="share-card-section-label">ALLOCATION BREAKDOWN</p>
              <div className="share-card-factors">
                {displayFactors.map((factor, i) => (
                  <div className="share-factor-row" key={factor.name + i}>
                    <span className="share-factor-name">{factor.name}</span>
                    <div className="share-factor-bar-track">
                      <div
                        className="share-factor-bar-fill"
                        style={{
                          width: `${(factor.weight / maxWeight) * 100}%`,
                          backgroundColor:
                            BAR_PALETTE[i % BAR_PALETTE.length],
                        }}
                      />
                    </div>
                    <span
                      className="share-factor-pct"
                      style={{
                        color: BAR_PALETTE[i % BAR_PALETTE.length],
                      }}
                    >
                      {factor.weight.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>

              {hasMetrics && (
                <div className="share-card-metrics">
                  {backtestMetrics!.cagr !== undefined && (
                    <div className="share-metric">
                      <span
                        className="share-metric-value"
                        style={{
                          color:
                            backtestMetrics!.cagr >= 0
                              ? "var(--primary)"
                              : "var(--error)",
                        }}
                      >
                        {backtestMetrics!.cagr >= 0 ? "+" : ""}
                        {backtestMetrics!.cagr.toFixed(1)}%
                      </span>
                      <span className="share-metric-label">CAGR</span>
                    </div>
                  )}
                  {backtestMetrics!.sharpe !== undefined && (
                    <div className="share-metric">
                      <span
                        className="share-metric-value"
                        style={{
                          color:
                            backtestMetrics!.sharpe >= 1
                              ? "var(--primary)"
                              : backtestMetrics!.sharpe >= 0.5
                              ? "var(--warning)"
                              : "var(--error)",
                        }}
                      >
                        {backtestMetrics!.sharpe.toFixed(2)}
                      </span>
                      <span className="share-metric-label">Sharpe</span>
                    </div>
                  )}
                  {backtestMetrics!.maxDrawdown !== undefined && (
                    <div className="share-metric">
                      <span
                        className="share-metric-value"
                        style={{ color: "var(--error)" }}
                      >
                        {backtestMetrics!.maxDrawdown.toFixed(1)}%
                      </span>
                      <span className="share-metric-label">Max DD</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="share-card-footer">
              Built with FlowFolio · Privacy-first portfolio planning
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="share-card-actions">
          <Button
            variant="secondary"
            onClick={handleDownloadPNG}
            leftIcon={<Download size={14} />}
          >
            Download PNG
          </Button>
          <Button
            variant="primary"
            onClick={handleCopyToClipboard}
            leftIcon={<Copy size={14} />}
          >
            Copy to Clipboard
          </Button>
        </div>

        <p className="share-card-note">
          No personal data, holdings, or portfolio values are included.
        </p>
      </div>
    </div>
  );
}

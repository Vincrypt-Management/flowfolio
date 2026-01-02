import {
  Sparkles,
  TrendingUp,
  PieChart,
  FlaskConical,
  BookOpen,
  BarChart3,
} from "lucide-react";
import FeatureCard from "./FeatureCard";

const features = [
  {
    icon: <Sparkles />,
    title: "Vibe Studio",
    description:
      "Design investment strategies with natural language and factor-based allocation.",
  },
  {
    icon: <TrendingUp />,
    title: "Explainable Rankings",
    description:
      "Understand exactly why each stock made the cut with detailed factor breakdowns.",
  },
  {
    icon: <PieChart />,
    title: "Portfolio Management",
    description:
      "Track holdings, monitor drift, and generate monthly buy lists automatically.",
  },
  {
    icon: <FlaskConical />,
    title: "Backtest Lab",
    description:
      "Simulate strategies across years of historical data, entirely offline.",
  },
  {
    icon: <BookOpen />,
    title: "Investment Journal",
    description:
      "Document decisions, track thesis updates, and maintain version history.",
  },
  {
    icon: <BarChart3 />,
    title: "Quantitative Analysis",
    description:
      "Deep analytics with RSI, MACD, Bollinger Bands, and statistical tools.",
  },
];

function FeatureGrid() {
  return (
    <section className="landing-features" id="features">
      <div className="landing-features-container">
        <div className="landing-features-header">
          <h2 className="landing-features-title">
            Built for serious investors.
          </h2>
          <p className="landing-features-subtitle">
            Professional-grade tools for building and managing rule-based
            investment strategies, all running locally on your machine.
          </p>
        </div>
        <div className="landing-features-grid">
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeatureGrid;

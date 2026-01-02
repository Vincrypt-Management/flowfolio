import { Shield, Eye, WifiOff, Monitor } from "lucide-react";

const valueProps = [
  {
    icon: <Shield />,
    title: "100% Private",
    description: "All data stored locally. Zero telemetry.",
  },
  {
    icon: <Eye />,
    title: "Fully Explainable",
    description: "Every ranking shows its reasoning.",
  },
  {
    icon: <WifiOff />,
    title: "Works Offline",
    description: "No internet required after sync.",
  },
  {
    icon: <Monitor />,
    title: "Multi-Platform",
    description: "Windows, macOS, and Linux.",
  },
];

function ValueProps() {
  return (
    <section className="landing-value-props">
      <div className="landing-value-props-grid">
        {valueProps.map((prop, index) => (
          <div key={index} className="landing-value-item">
            <div className="landing-value-icon">{prop.icon}</div>
            <h3 className="landing-value-title">{prop.title}</h3>
            <p className="landing-value-description">{prop.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default ValueProps;

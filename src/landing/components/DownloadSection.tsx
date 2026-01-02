import { Monitor, Apple, Terminal } from "lucide-react";

const platforms = [
  {
    name: "Windows",
    icon: <Monitor />,
    version: "v0.1.0",
    href: "https://github.com/your-username/flowfolio/releases/latest",
  },
  {
    name: "macOS",
    icon: <Apple />,
    version: "v0.1.0",
    href: "https://github.com/your-username/flowfolio/releases/latest",
  },
  {
    name: "Linux",
    icon: <Terminal />,
    version: "v0.1.0",
    href: "https://github.com/your-username/flowfolio/releases/latest",
  },
];

function DownloadSection() {
  return (
    <section className="landing-download-section" id="download">
      <div className="landing-download-section-content">
        <h2 className="landing-download-title">Download Flowfolio</h2>
        <p className="landing-download-subtitle">
          Free and open source. No account required.
        </p>
        <div className="landing-platform-buttons">
          {platforms.map((platform, index) => (
            <a
              key={index}
              href={platform.href}
              className="landing-platform-btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              {platform.icon}
              <span className="landing-platform-name">{platform.name}</span>
              <span className="landing-platform-version">{platform.version}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export default DownloadSection;

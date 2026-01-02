import { Github, FileText } from "lucide-react";

function Footer() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-content">
        <div className="landing-footer-brand">
          <span className="landing-footer-logo">Flowfolio</span>
          <span className="landing-footer-tagline">
            Made for privacy-conscious investors
          </span>
        </div>
        <div className="landing-footer-links">
          <a
            href="https://github.com/your-username/flowfolio"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github size={18} />
            GitHub
          </a>
          <a
            href="https://github.com/your-username/flowfolio#readme"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText size={18} />
            Documentation
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Footer;

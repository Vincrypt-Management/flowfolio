import { Github } from "lucide-react";

function Navbar() {
  return (
    <nav className="landing-navbar">
      <div className="landing-navbar-content">
        <a href="#" className="landing-logo">
          Flowfolio
        </a>
        <ul className="landing-nav-links">
          <li>
            <a href="#features">Features</a>
          </li>
          <li>
            <a href="#download">Download</a>
          </li>
          <li>
            <a
              href="https://github.com/your-username/flowfolio"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-nav-btn landing-nav-btn-outline"
            >
              <Github size={16} style={{ marginRight: "6px" }} />
              GitHub
            </a>
          </li>
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;

import { LayoutDashboard } from "lucide-react";

function ProductShowcase() {
  return (
    <section className="landing-showcase">
      <div className="landing-showcase-container">
        {/* Glowing Border Frame */}
        <div className="landing-showcase-frame">
          <div className="landing-showcase-inner">
            <div className="landing-showcase-placeholder">
              <LayoutDashboard />
              <span>App Screenshot</span>
              <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
                Replace with actual product screenshot
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProductShowcase;

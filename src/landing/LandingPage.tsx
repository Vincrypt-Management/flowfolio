import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import ProductShowcase from "./components/ProductShowcase";
import FeatureGrid from "./components/FeatureGrid";
import ValueProps from "./components/ValueProps";
import DownloadSection from "./components/DownloadSection";
import Footer from "./components/Footer";

function LandingPage() {
  return (
    <div className="landing-page">
      <Navbar />
      <main>
        <Hero />
        <ProductShowcase />
        <FeatureGrid />
        <ValueProps />
        <DownloadSection />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;

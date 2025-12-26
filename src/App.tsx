import { useState, useEffect } from "react";
import { invoke } from "./services/tauri";
import VibeStudio from "./components/VibeStudio";
import { 
  LayoutDashboard, 
  Sparkles, 
  FileText, 
  Database, 
  Activity, 
  CheckCircle2, 
  XCircle,
  BarChart3,
  PieChart,
  Calendar,
  ArrowRight,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import "./App.css";

interface VibePlan {
  name: string;
  universe: {
    exchanges: string[];
    regions: string[];
    sectors: string[];
    exclude_list: string[];
  };
  filters: any[];
  ranking: {
    factors: Array<{ name: string; weight: number }>;
  };
  portfolio: any;
  cadence: any;
  risk: any;
}

function App() {
  const [status, setStatus] = useState("Initializing...");
  const [plan, setPlan] = useState<VibePlan | null>(null);
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [connectionStatus, setConnectionStatus] = useState<string>("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    checkHealth();
    loadTemplates();
    loadDefaultPlan();
  }, []);

  async function checkHealth() {
    try {
      const health = await invoke<string>("health_check");
      setStatus(health);
    } catch (error) {
      setStatus("Error: " + error);
    }
  }

  async function loadTemplates() {
    try {
      const templateList = await invoke<string[]>("list_templates");
      setTemplates(templateList);
    } catch (error) {
      console.error("Failed to load templates:", error);
    }
  }

  async function loadDefaultPlan() {
    try {
      const defaultPlan = await invoke<VibePlan>("get_default_plan");
      setPlan(defaultPlan);
    } catch (error) {
      console.error("Failed to load default plan:", error);
    }
  }

  async function loadTemplate(templateName: string) {
    try {
      const template = await invoke<VibePlan>("get_template", { name: templateName });
      setPlan(template);
      setSelectedTemplate(templateName);
    } catch (error) {
      alert("Error loading template: " + error);
    }
  }

  async function testConnection() {
    setIsTestingConnection(true);
    setConnectionStatus("Testing connection...");
    
    try {
      const result = await invoke<string>("test_data_connection");
      setConnectionStatus("✅ " + result);
    } catch (error) {
      setConnectionStatus("❌ " + error);
    } finally {
      setIsTestingConnection(false);
    }
  }

  const renderSidebar = () => (
    <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="logo-area">
          <div className="logo-icon-wrapper">
            <BarChart3 className="logo-icon" size={24} />
          </div>
          {!isSidebarCollapsed && <span className="logo-text">FlowFolio</span>}
        </div>
        <button 
          className="sidebar-toggle" 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      
      <nav className="nav-menu">
        <button 
          className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
          title={isSidebarCollapsed ? "Dashboard" : ""}
        >
          <LayoutDashboard className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Dashboard</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "vibe-studio" ? "active" : ""}`}
          onClick={() => setActiveTab("vibe-studio")}
          title={isSidebarCollapsed ? "Vibe Studio" : ""}
        >
          <Sparkles className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Vibe Studio</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "templates" ? "active" : ""}`}
          onClick={() => setActiveTab("templates")}
          title={isSidebarCollapsed ? "Templates" : ""}
        >
          <FileText className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Templates</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "data" ? "active" : ""}`}
          onClick={() => setActiveTab("data")}
          title={isSidebarCollapsed ? "Data Sources" : ""}
        >
          <Database className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Data Sources</span>}
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className={`status-badge ${isSidebarCollapsed ? "collapsed" : ""}`}>
          <div className={`status-dot ${status === "Healthy" ? "online" : "offline"}`}></div>
          {!isSidebarCollapsed && <span>{status === "Healthy" ? "System Online" : status}</span>}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app-container">
      {renderSidebar()}

      <main className="main-content">
        {activeTab === "dashboard" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">Dashboard</h1>
              <p className="page-subtitle">Overview of your investment strategy</p>
            </header>

            <div className="dashboard-grid">
              <div className="card">
                <h3><PieChart size={20} /> Current Plan</h3>
                {plan ? (
                  <div className="plan-summary">
                    <div className="stat-row">
                      <span className="stat-label">Name</span>
                      <span className="stat-value">{plan.name}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Regions</span>
                      <span className="stat-value">{plan.universe.regions.join(", ")}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Sectors</span>
                      <span className="stat-value">{plan.universe.sectors.length > 0 ? plan.universe.sectors.join(", ") : "All"}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Rebalance</span>
                      <span className="stat-value">{plan.cadence.quarterly_rebalance ? "Quarterly" : "Manual"}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted">No plan loaded</p>
                )}
              </div>

              <div className="card">
                <h3><Activity size={20} /> Ranking Factors</h3>
                {plan && (
                  <div className="plan-summary">
                    {plan.ranking.factors.map((factor, i) => (
                      <div key={i} className="stat-row">
                        <span className="stat-label">{factor.name}</span>
                        <span className="stat-value">{(factor.weight * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <h3><Calendar size={20} /> Next Actions</h3>
                <div className="plan-summary">
                  <div className="stat-row">
                    <span className="stat-label">Monthly Buy List</span>
                    <span className="stat-value">Coming soon</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Quarterly Rebalance</span>
                    <span className="stat-value">Coming soon</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "vibe-studio" && (
          <div className="animate-fade-in">
            <VibeStudio />
          </div>
        )}

        {activeTab === "templates" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">Templates</h1>
              <p className="page-subtitle">Start with a pre-configured strategy</p>
            </header>

            <div className="template-grid">
              {templates.map((template) => (
                <div
                  key={template}
                  className={`template-card ${selectedTemplate === template ? "selected" : ""}`}
                  onClick={() => loadTemplate(template)}
                >
                  <h3>{template}</h3>
                  <p>Click to load this template configuration</p>
                </div>
              ))}
            </div>

            {plan && selectedTemplate && (
              <div className="card" style={{ marginTop: '2rem' }}>
                <h3>Selected: {plan.name}</h3>
                <div className="plan-summary">
                  <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}><strong>Strategy Focus:</strong></p>
                  <ul style={{ paddingLeft: '1.5rem', marginBottom: '1.5rem', color: 'var(--text-main)' }}>
                    {plan.ranking.factors.map((factor, i) => (
                      <li key={i} style={{ marginBottom: '0.5rem' }}>
                        {factor.name.charAt(0).toUpperCase() + factor.name.slice(1)}: {(factor.weight * 100).toFixed(0)}% weight
                      </li>
                    ))}
                  </ul>
                  <button className="btn-primary" onClick={() => setActiveTab("dashboard")}>
                    Use This Plan <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "data" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">Data Sources</h1>
              <p className="page-subtitle">Manage your market data connections</p>
            </header>

            <div className="dashboard-grid">
              <div className="card">
                <h3>Alpha Vantage</h3>
                <div className="stat-row">
                  <span className="stat-label">Provider</span>
                  <span className="stat-value">Alpha Vantage (Free Tier)</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Quota</span>
                  <span className="stat-value">25 requests/day</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Status</span>
                  <span className="stat-value">Ready</span>
                </div>
                
                <div style={{ marginTop: '1.5rem' }}>
                  <button 
                    className="btn-primary" 
                    onClick={testConnection}
                    disabled={isTestingConnection}
                  >
                    {isTestingConnection ? "Testing..." : "Test Connection"}
                  </button>
                </div>
                
                {connectionStatus && (
                  <div className={`connection-status ${connectionStatus.startsWith("✅") ? "success" : "error"}`}>
                    {connectionStatus.startsWith("✅") ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                    {connectionStatus.replace(/^[✅❌]\s*/, "")}
                  </div>
                )}
              </div>

              <div className="card">
                <h3>Data Sync Status</h3>
                <div className="stat-row">
                  <span className="stat-label">Last sync</span>
                  <span className="stat-value">Never</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Cached symbols</span>
                  <span className="stat-value">0</span>
                </div>
                <div style={{ marginTop: '1.5rem' }}>
                  <button className="btn-primary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                    Sync Now (Coming Soon)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

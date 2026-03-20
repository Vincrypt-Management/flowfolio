import { ArrowRight } from "lucide-react";
import { TEMPLATE_METADATA, CATEGORY_COLORS } from "../../shared/constants/templates";
import { VibePlan } from "../../shared/types";

interface TemplatesTabProps {
  templates: string[];
  selectedTemplate: string;
  plan: VibePlan | null;
  onLoadTemplate: (templateName: string) => void;
  onNavigateToDashboard: () => void;
}

export function TemplatesTab({
  templates,
  selectedTemplate,
  plan,
  onLoadTemplate,
  onNavigateToDashboard,
}: TemplatesTabProps) {
  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <h1 className="page-title">Templates</h1>
        <p className="page-subtitle">Start with a pre-configured strategy</p>
      </header>

      <div className="template-grid">
        {templates.length === 0 && (
          <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem' }}>
            <p className="text-muted">Loading templates…</p>
          </div>
        )}
        {templates.map((template) => {
          const meta = TEMPLATE_METADATA[template];
          return (
            <div
              key={template}
              className={`template-card ${selectedTemplate === template ? 'selected' : ''}`}
            >
              {meta ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{
                      background: CATEGORY_COLORS[meta.category] + '22',
                      color: CATEGORY_COLORS[meta.category],
                      border: `1px solid ${CATEGORY_COLORS[meta.category]}55`,
                      borderRadius: '999px', padding: '2px 10px', fontSize: '11px', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {meta.category}
                    </span>
                  </div>
                  <h3 style={{ margin: '0 0 6px' }}>{template}</h3>
                  <p className="text-muted" style={{ fontSize: '13px', margin: '0 0 12px' }}>{meta.description}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                    {meta.factors.map(f => (
                      <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '70px', fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>{f.name}</span>
                        <div style={{ flex: 1, height: '6px', background: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${f.weight}%`, height: '100%', background: f.color, borderRadius: '3px' }} />
                        </div>
                        <span style={{ width: '32px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>{f.weight}%</span>
                      </div>
                    ))}
                  </div>
                  <button className="btn-primary" style={{ width: '100%' }} onClick={() => onLoadTemplate(template)}>
                    Load Template →
                  </button>
                </>
              ) : (
                <>
                  <h3>{template}</h3>
                  <p>Click to load this template configuration</p>
                  <button className="btn-primary" style={{ width: '100%' }} onClick={() => onLoadTemplate(template)}>
                    Load Template →
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {plan && selectedTemplate && (
        <div className="card mt-xl">
          <h3>Selected: {plan.name}</h3>
          <div className="plan-summary">
            <p className="text-muted mb-md"><strong>Strategy Focus:</strong></p>
            <ul className="text-main mb-lg" style={{ paddingLeft: '1.5rem' }}>
              {plan.ranking.factors.map((factor, i) => (
                <li key={i} className="mb-sm">
                  {factor.name.charAt(0).toUpperCase() + factor.name.slice(1)}: {(factor.weight * 100).toFixed(0)}% weight
                </li>
              ))}
            </ul>
            <button className="btn-primary" onClick={onNavigateToDashboard}>
              Use This Plan <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

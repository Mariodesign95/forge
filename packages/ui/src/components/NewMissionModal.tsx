import React, { useState } from 'react';
import './NewMissionModal.css';

interface Props {
  onConfirm: (title: string, statement: string) => void;
  onCancel: () => void;
}

const EXAMPLES = [
  'Create a SaaS for online quotes',
  'Build a CRM for a small agency',
  'Build a landing page for a dental clinic',
  'Automate invoice processing with PDF export',
  'Research competitors in the AI editor space',
];

export function NewMissionModal({ onConfirm, onCancel }: Props): React.ReactElement {
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const canSubmit = title.trim().length > 0 && statement.trim().length > 0;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (canSubmit) onConfirm(title.trim(), statement.trim());
  };

  return (
    <div className="overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <div className="modal-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect width="20" height="20" rx="5" fill="var(--c-accent)" opacity="0.15"/>
              <path d="M10 5L15 10L10 15L5 10L10 5Z" stroke="var(--c-accent)" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
              <circle cx="10" cy="10" r="2" fill="var(--c-accent)"/>
            </svg>
          </div>
          <div>
            <h2 className="modal-title">New Mission</h2>
            <p className="modal-sub">Define your objective. Forge deploys an agent team to execute it.</p>
          </div>
          <button className="modal-close btn btn-ghost btn-sm" onClick={onCancel} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="field">
            <label className="label" htmlFor="m-title">Title</label>
            <input
              id="m-title" className="input" type="text"
              placeholder="e.g. Create a SaaS for online quotes"
              value={title} onChange={(e) => setTitle(e.target.value)}
              autoFocus autoComplete="off"
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="m-statement">Mission Statement</label>
            <textarea
              id="m-statement" className="input textarea"
              placeholder="Describe the objective in detail. The more context you provide, the better the blueprint."
              value={statement} onChange={(e) => setStatement(e.target.value)}
              rows={4}
            />
          </div>

          <div className="examples">
            <div className="label" style={{ marginBottom: 8 }}>Examples</div>
            <div className="example-list">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="example-chip"
                  onClick={() => {
                    setTitle(ex);
                    setStatement(ex + '. Start with requirements and architecture blueprint, then execute.');
                  }}>
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel} id="cancel-mission">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit} id="launch-mission">Launch Mission</button>
          </div>
        </form>
      </div>
    </div>
  );
}

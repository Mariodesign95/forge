import React, { useState, useEffect } from 'react';
import { useIpc } from '../hooks/useIpc.js';
import './SettingsModal.css';

interface Props {
  onCancel: () => void;
}

export function SettingsModal({ onCancel }: Props): React.ReactElement {
  const { send } = useIpc();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // API Keys state
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openrouterKey, setOpenrouterKey] = useState('');

  // Model selection state
  const [ollamaModel, setOllamaModel] = useState('qwen3.5:9b');
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini');
  const [anthropicModel, setAnthropicModel] = useState('claude-3-5-sonnet-20241022');
  const [openrouterModel, setOpenrouterModel] = useState('anthropic/claude-3-haiku');

  // Agent models state
  const [architectModel, setArchitectModel] = useState('ollama:qwen3.5:9b');
  const [plannerModel, setPlannerModel] = useState('ollama:qwen3.5:9b');
  const [coderModel, setCoderModel] = useState('openai:gpt-4o-mini');
  const [qaModel, setQaModel] = useState('openai:gpt-4o-mini');

  // Custom model fields
  const [customArchitect, setCustomArchitect] = useState('');
  const [customPlanner, setCustomPlanner] = useState('');
  const [customCoder, setCustomCoder] = useState('');
  const [customQa, setCustomQa] = useState('');

  // Local Ollama models detected
  const [localModels, setLocalModels] = useState<string[]>([]);

  // Tab selection state: 'keys' | 'models'
  const [activeTab, setActiveTab] = useState<'keys' | 'models'>('keys');

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        // Query local models
        const localRes = await send('GET_LOCAL_MODELS', {});
        let detectedLocal: string[] = [];
        if (localRes.success && Array.isArray(localRes.data)) {
          detectedLocal = localRes.data as string[];
          if (active) setLocalModels(detectedLocal);
        }

        // Query settings
        const res = await send('GET_SETTINGS', {});
        if (!active) return;

        if (res.success && res.data) {
          const settings = res.data as Record<string, any>;
          const keys = settings.api_keys ?? {};
          const models = settings.models ?? {};
          const agentModels = settings.agent_models ?? {};

          setOpenaiKey(keys.openai ?? '');
          setAnthropicKey(keys.anthropic ?? '');
          setOpenrouterKey(keys.openrouter ?? '');

          setOllamaModel(models.ollama ?? 'qwen3.5:9b');
          setOpenaiModel(models.openai ?? 'gpt-4o-mini');
          setAnthropicModel(models.anthropic ?? 'claude-3-5-sonnet-20241022');
          setOpenrouterModel(models.openrouter ?? 'anthropic/claude-3-haiku');

          const arch = agentModels.architect ?? 'ollama:qwen3.5:9b';
          const plan = agentModels.planner ?? 'ollama:qwen3.5:9b';
          const coder = agentModels.coder ?? 'openai:gpt-4o-mini';
          const qa = agentModels.qa ?? 'openai:gpt-4o-mini';

          const knownPresets = [
            'openai:gpt-4o',
            'openai:gpt-4o-mini',
            'anthropic:claude-3-5-sonnet-20241022',
            'openrouter:anthropic/claude-3-haiku'
          ];
          const isKnownOption = (val: string) => {
            return detectedLocal.map(m => `ollama:${m}`).includes(val) || knownPresets.includes(val);
          };

          if (isKnownOption(arch)) {
            setArchitectModel(arch);
          } else {
            setArchitectModel('custom');
            setCustomArchitect(arch);
          }

          if (isKnownOption(plan)) {
            setPlannerModel(plan);
          } else {
            setPlannerModel('custom');
            setCustomPlanner(plan);
          }

          if (isKnownOption(coder)) {
            setCoderModel(coder);
          } else {
            setCoderModel('custom');
            setCustomCoder(coder);
          }

          if (isKnownOption(qa)) {
            setQaModel(qa);
          } else {
            setQaModel('custom');
            setCustomQa(qa);
          }
        }
        setLoading(false);
      } catch (err) {
        console.error('Failed to load data:', err);
        if (active) setLoading(false);
      }
    }

    void loadData();

    return () => {
      active = false;
    };
  }, [send]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const arch = architectModel === 'custom' ? customArchitect.trim() : architectModel;
      const plan = plannerModel === 'custom' ? customPlanner.trim() : plannerModel;
      const coder = coderModel === 'custom' ? customCoder.trim() : coderModel;
      const qa = qaModel === 'custom' ? customQa.trim() : qaModel;

      await send('SAVE_SETTINGS', {
        settings: {
          api_keys: {
            openai: openaiKey.trim(),
            anthropic: anthropicKey.trim(),
            openrouter: openrouterKey.trim(),
          },
          models: {
            ollama: ollamaModel.trim(),
            openai: openaiModel.trim(),
            anthropic: anthropicModel.trim(),
            openrouter: openrouterModel.trim(),
          },
          agent_models: {
            architect: arch,
            planner: plan,
            coder: coder,
            qa: qa,
          },
        },
      });
      onCancel();
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="modal settings-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </div>
          <div>
            <h2 className="modal-title">System Settings</h2>
            <p className="modal-sub">Configure local models, API credentials, and default agent parameters.</p>
          </div>
          <button className="modal-close btn btn-ghost btn-sm" onClick={onCancel} aria-label="Close">✕</button>
        </div>

        <div className="settings-tabs">
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'keys' ? 'active' : ''}`}
            onClick={() => setActiveTab('keys')}
          >
            API Credentials
          </button>
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'models' ? 'active' : ''}`}
            onClick={() => setActiveTab('models')}
            id="model-config-tab"
          >
            Model Configuration
          </button>
        </div>

        {loading ? (
          <div className="settings-loading">Loading configuration...</div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form settings-form-body">
            {activeTab === 'keys' && (
              <div className="tab-pane">
                <div className="field">
                  <label className="label" htmlFor="s-openai-key">OpenAI API Key</label>
                  <input
                    id="s-openai-key"
                    className="input"
                    type="password"
                    placeholder="sk-..."
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    autoComplete="off"
                  />
                  <span className="input-desc">Used for Coder and general reasoning tasks when configured.</span>
                </div>

                <div className="field">
                  <label className="label" htmlFor="s-anthropic-key">Anthropic API Key</label>
                  <input
                    id="s-anthropic-key"
                    className="input"
                    type="password"
                    placeholder="sk-ant-..."
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    autoComplete="off"
                  />
                  <span className="input-desc">Used for premium Architect and QA feedback actions.</span>
                </div>

                <div className="field">
                  <label className="label" htmlFor="s-openrouter-key">OpenRouter API Key</label>
                  <input
                    id="s-openrouter-key"
                    className="input"
                    type="password"
                    placeholder="sk-or-..."
                    value={openrouterKey}
                    onChange={(e) => setOpenrouterKey(e.target.value)}
                    autoComplete="off"
                  />
                  <span className="input-desc">Used as a unified API gateway for fallback execution models.</span>
                </div>
              </div>
            )}

            {activeTab === 'models' && (
              <div className="tab-pane">
                <div className="settings-section-title">Global Fallback Models</div>
                <div className="settings-row-grid">
                  <div className="field">
                    <label className="label" htmlFor="s-ollama-model">Ollama (Local)</label>
                    <input
                      id="s-ollama-model"
                      className="input"
                      type="text"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="s-openai-model">OpenAI</label>
                    <input
                      id="s-openai-model"
                      className="input"
                      type="text"
                      value={openaiModel}
                      onChange={(e) => setOpenaiModel(e.target.value)}
                    />
                  </div>
                </div>

                <div className="settings-section-title" style={{ marginTop: '16px' }}>Agent Model Mapping</div>
                <p className="settings-section-desc">Assign specific local or API models to each agent worker role.</p>

                {/* Architect */}
                <div className="field-group">
                  <div className="field">
                    <label className="label" htmlFor="s-agent-architect">Architect Agent</label>
                    <select
                      id="s-agent-architect"
                      className="input"
                      value={architectModel}
                      onChange={(e) => setArchitectModel(e.target.value)}
                    >
                      {localModels.map((m) => (
                        <option key={m} value={`ollama:${m}`}>Local (Ollama) - {m}</option>
                      ))}
                      <option value="openai:gpt-4o">OpenAI - GPT-4o</option>
                      <option value="openai:gpt-4o-mini">OpenAI - GPT-4o Mini</option>
                      <option value="anthropic:claude-3-5-sonnet-20241022">Anthropic - Claude 3.5 Sonnet</option>
                      <option value="openrouter:anthropic/claude-3-haiku">OpenRouter - Claude 3 Haiku</option>
                      <option value="custom">Custom model...</option>
                    </select>
                  </div>
                  {architectModel === 'custom' && (
                    <div className="field custom-field-input anim-fade-in">
                      <input
                        className="input"
                        type="text"
                        placeholder="Format: provider:model (e.g. ollama:llama3)"
                        value={customArchitect}
                        onChange={(e) => setCustomArchitect(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Planner */}
                <div className="field-group">
                  <div className="field">
                    <label className="label" htmlFor="s-agent-planner">Planner Agent</label>
                    <select
                      id="s-agent-planner"
                      className="input"
                      value={plannerModel}
                      onChange={(e) => setPlannerModel(e.target.value)}
                    >
                      {localModels.map((m) => (
                        <option key={m} value={`ollama:${m}`}>Local (Ollama) - {m}</option>
                      ))}
                      <option value="openai:gpt-4o">OpenAI - GPT-4o</option>
                      <option value="openai:gpt-4o-mini">OpenAI - GPT-4o Mini</option>
                      <option value="anthropic:claude-3-5-sonnet-20241022">Anthropic - Claude 3.5 Sonnet</option>
                      <option value="openrouter:anthropic/claude-3-haiku">OpenRouter - Claude 3 Haiku</option>
                      <option value="custom">Custom model...</option>
                    </select>
                  </div>
                  {plannerModel === 'custom' && (
                    <div className="field custom-field-input anim-fade-in">
                      <input
                        className="input"
                        type="text"
                        placeholder="Format: provider:model (e.g. ollama:llama3)"
                        value={customPlanner}
                        onChange={(e) => setCustomPlanner(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Coder */}
                <div className="field-group">
                  <div className="field">
                    <label className="label" htmlFor="s-agent-coder">Coder Agent</label>
                    <select
                      id="s-agent-coder"
                      className="input"
                      value={coderModel}
                      onChange={(e) => setCoderModel(e.target.value)}
                    >
                      {localModels.map((m) => (
                        <option key={m} value={`ollama:${m}`}>Local (Ollama) - {m}</option>
                      ))}
                      <option value="openai:gpt-4o">OpenAI - GPT-4o</option>
                      <option value="openai:gpt-4o-mini">OpenAI - GPT-4o Mini</option>
                      <option value="anthropic:claude-3-5-sonnet-20241022">Anthropic - Claude 3.5 Sonnet</option>
                      <option value="openrouter:anthropic/claude-3-haiku">OpenRouter - Claude 3 Haiku</option>
                      <option value="custom">Custom model...</option>
                    </select>
                  </div>
                  {coderModel === 'custom' && (
                    <div className="field custom-field-input anim-fade-in">
                      <input
                        className="input"
                        type="text"
                        placeholder="Format: provider:model (e.g. ollama:llama3)"
                        value={customCoder}
                        onChange={(e) => setCustomCoder(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* QA */}
                <div className="field-group">
                  <div className="field">
                    <label className="label" htmlFor="s-agent-qa">QA Agent</label>
                    <select
                      id="s-agent-qa"
                      className="input"
                      value={qaModel}
                      onChange={(e) => setQaModel(e.target.value)}
                    >
                      {localModels.map((m) => (
                        <option key={m} value={`ollama:${m}`}>Local (Ollama) - {m}</option>
                      ))}
                      <option value="openai:gpt-4o">OpenAI - GPT-4o</option>
                      <option value="openai:gpt-4o-mini">OpenAI - GPT-4o Mini</option>
                      <option value="anthropic:claude-3-5-sonnet-20241022">Anthropic - Claude 3.5 Sonnet</option>
                      <option value="openrouter:anthropic/claude-3-haiku">OpenRouter - Claude 3 Haiku</option>
                      <option value="custom">Custom model...</option>
                    </select>
                  </div>
                  {qaModel === 'custom' && (
                    <div className="field custom-field-input anim-fade-in">
                      <input
                        className="input"
                        type="text"
                        placeholder="Format: provider:model (e.g. ollama:llama3)"
                        value={customQa}
                        onChange={(e) => setCustomQa(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" id="save-settings-btn" disabled={saving}>
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

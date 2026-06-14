import React, { useState, useRef, useEffect } from 'react';
import type { Mission, MissionState } from '@forge/types';
import './MissionBar.css';

interface Props {
  mission: Mission | null;
  allMissions: Mission[];
  onSelectMission: (id: string) => void;
  onNewMission: () => void;
  onTransition: (id: string, action: 'APPROVE_MISSION' | 'PAUSE_MISSION' | 'CANCEL_MISSION') => void;
  onOpenSettings: () => void;
}

export function MissionBar({ mission, allMissions, onSelectMission, onNewMission, onTransition, onOpenSettings }: Props): React.ReactElement {
  const pct = mission ? Math.min((mission.budget.spent_eur / mission.budget.cap_eur) * 100, 120) : 0;
  const budgetColor = pct >= 100 ? 'var(--c-danger)' : pct >= 70 ? 'var(--c-warning)' : 'var(--c-accent)';

  return (
    <header className="bar">
      <div className="bar-left">
        {/* Logo */}
        <div className="bar-logo">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect width="18" height="18" rx="4" fill="var(--c-accent)" opacity="0.15"/>
            <path d="M9 3L14 9L9 15L4 9L9 3Z" stroke="var(--c-accent)" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
            <circle cx="9" cy="9" r="2" fill="var(--c-accent)"/>
          </svg>
          <span className="bar-logo-text">Forge</span>
        </div>

        <div className="bar-sep" />

        {/* Mission picker — custom dropdown */}
        {allMissions.length > 0 ? (
          <MissionPicker
            missions={allMissions}
            selectedId={mission?.id ?? null}
            onSelect={onSelectMission}
          />
        ) : (
          <span className="bar-no-mission">No active missions</span>
        )}

        {mission && <StateBadge state={mission.state} />}
      </div>

      {/* Budget meter — center */}
      {mission && (
        <div className="bar-budget">
          <div className="budget-track">
            <div className="budget-fill" style={{ width: `${Math.min(pct, 100)}%`, background: budgetColor }} />
          </div>
          <span className="budget-text mono" style={{ color: budgetColor }}>
            €{mission.budget.spent_eur.toFixed(2)}<span className="budget-cap"> / €{mission.budget.cap_eur.toFixed(2)}</span>
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="bar-right">
        {mission?.state === 'AWAITING_APPROVAL' && (
          <button className="btn btn-primary btn-sm" onClick={() => onTransition(mission.id, 'APPROVE_MISSION')} id="approve-blueprint">
            Approve Blueprint
          </button>
        )}
        {mission?.state === 'EXECUTING' && (
          <button className="btn btn-ghost btn-sm" onClick={() => onTransition(mission.id, 'PAUSE_MISSION')} id="pause-mission">
            Pause
          </button>
        )}
        {mission?.state === 'PAUSED' && (
          <button className="btn btn-primary btn-sm" onClick={() => onTransition(mission.id, 'APPROVE_MISSION')} id="resume-mission">
            Resume
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={onNewMission} id="new-mission-btn">
          New Mission
        </button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onOpenSettings} id="settings-btn" title="Settings" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>
    </header>
  );
}

// ── Mission picker dropdown ────────────────────────────────────

function MissionPicker({ missions, selectedId, onSelect }: {
  missions: Mission[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = missions.find((m) => m.id === selectedId) ?? missions[0];

  useEffect(() => {
    function onClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="mpicker" ref={ref}>
      <button className="mpicker-btn" onClick={() => setOpen((v) => !v)}>
        <span className="mpicker-label">{selected?.title ?? 'Select mission'}</span>
        <svg className={`mpicker-chevron ${open ? 'open' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="mpicker-menu">
          {missions.map((m) => (
            <button
              key={m.id}
              className={`mpicker-item ${m.id === selectedId ? 'mpicker-item--active' : ''}`}
              onClick={() => { onSelect(m.id); setOpen(false); }}
            >
              <span className="mpicker-item-title">{m.title}</span>
              <span className="mpicker-item-state">{m.state}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── State badge ───────────────────────────────────────────────

const STATE_MAP: Record<MissionState, { label: string; color: string }> = {
  DRAFT:             { label: 'Draft',           color: 'var(--s-draft)' },
  PLANNING:          { label: 'Planning',         color: 'var(--s-planning)' },
  AWAITING_APPROVAL: { label: 'Review Required',  color: 'var(--s-awaiting)' },
  APPROVED:          { label: 'Approved',         color: 'var(--s-approved)' },
  EXECUTING:         { label: 'Running',          color: 'var(--s-executing)' },
  PAUSED:            { label: 'Paused',           color: 'var(--s-paused)' },
  COMPLETED:         { label: 'Completed',        color: 'var(--s-completed)' },
  FAILED:            { label: 'Failed',           color: 'var(--s-failed)' },
  CANCELLED:         { label: 'Cancelled',        color: 'var(--s-cancelled)' },
};

function StateBadge({ state }: { state: MissionState }): React.ReactElement {
  const s = STATE_MAP[state];
  const live = state === 'EXECUTING' || state === 'PLANNING';
  return (
    <span className={`badge state-badge ${live ? 'anim-pulse' : ''}`}
      style={{ background: `${s.color}18`, color: s.color, borderColor: `${s.color}30` }}>
      {live && <span className="state-pip" style={{ background: s.color }} />}
      {s.label}
    </span>
  );
}

import React, { useState, useCallback } from 'react';
import type { Mission, LiveFeedEntry, ForgeEvent } from '@forge/types';
import { MissionBar } from './components/MissionBar.js';
import { KanbanBoard } from './components/KanbanBoard.js';
import { LiveFeed } from './components/LiveFeed.js';
import { NewMissionModal } from './components/NewMissionModal.js';
import { SettingsModal } from './components/SettingsModal.js';
import { useForgeEvents } from './hooks/useForgeEvents.js';
import { useIpc } from './hooks/useIpc.js';
import './styles/globals.css';
import './styles/app.css';

export function App(): React.ReactElement {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [feedEntries, setFeedEntries] = useState<LiveFeedEntry[]>([]);
  const [showNewMission, setShowNewMission] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const seenEvents = React.useRef(new Set<string>());

  const { send } = useIpc();
  const activeMission = missions.find((m) => m.id === activeMissionId) ?? null;

  const handleEvent = useCallback((event: ForgeEvent) => {
    // Deduplicate — dual WebSocket connections can replay the same event
    if (seenEvents.current.has(event.event_id)) return;
    seenEvents.current.add(event.event_id);
    if (seenEvents.current.size > 1000) {
      const oldest = Array.from(seenEvents.current).slice(0, 200);
      oldest.forEach((id) => seenEvents.current.delete(id));
    }
    if (event.type === 'MISSION_CREATED') {
      const m = event.payload['mission'] as Mission;
      setMissions((prev) => prev.find((x) => x.id === m.id) ? prev : [...prev, m]);
      setActiveMissionId(m.id);
    }
    if (event.type === 'MISSION_STATE_CHANGED') {
      setMissions((prev) => prev.map((m) =>
        m.id === event.mission_id ? { ...m, state: event.payload['next_state'] as any } : m
      ));
    }
    if (['TASK_COMPLETED','TASK_FAILED','TASK_STARTED','TASK_DISPATCHED'].includes(event.type)) {
      const task = event.payload['task'] as any;
      setMissions((prev) => prev.map((m) => m.id !== event.mission_id ? m : {
        ...m, task_graph: m.task_graph.map((t) => t.id === task.id ? task : t)
      }));
    }
    if (event.type === 'BUDGET_UPDATE') {
      const { spent_eur } = event.payload as { spent_eur: number };
      setMissions((prev) => prev.map((m) =>
        m.id === event.mission_id ? { ...m, budget: { ...m.budget, spent_eur } } : m
      ));
    }

    setFeedEntries((prev) => [{
      id: event.event_id,
      timestamp: event.timestamp,
      mission_id: event.mission_id,
      task_id: event.task_id,
      message: formatEventMessage(event),
      type: getEntryType(event.type),
    }, ...prev].slice(0, 200));
  }, []);

  useForgeEvents(handleEvent);

  React.useEffect(() => {
    send('LIST_MISSIONS', {}).then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setMissions(res.data as Mission[]);
        if ((res.data as Mission[]).length > 0) {
          setActiveMissionId((res.data as Mission[])[0]!.id);
        }
      }
    }).catch(() => {});
  }, [send]);

  const handleCreateMission = useCallback(async (title: string, statement: string) => {
    const id = `msn_${Date.now()}`;
    await send('CREATE_MISSION', { id, title, statement });
    setShowNewMission(false);
  }, [send]);

  const handleTransition = useCallback(async (
    missionId: string,
    action: 'APPROVE_MISSION' | 'PAUSE_MISSION' | 'CANCEL_MISSION'
  ) => {
    await send(action, { mission_id: missionId });
  }, [send]);

  return (
    <div className="forge-app">
      <MissionBar
        mission={activeMission}
        allMissions={missions}
        onSelectMission={setActiveMissionId}
        onNewMission={() => setShowNewMission(true)}
        onTransition={handleTransition}
        onOpenSettings={() => setShowSettings(true)}
      />
      <div className="forge-workspace">
        <KanbanBoard mission={activeMission} />
        <div className="forge-center">
          {!activeMission
            ? <EmptyState onNewMission={() => setShowNewMission(true)} />
            : <MissionDetail mission={activeMission} />
          }
        </div>
        <LiveFeed entries={feedEntries.filter(
          (e) => !activeMissionId || e.mission_id === activeMissionId
        )} />
      </div>
      {showNewMission && (
        <NewMissionModal
          onConfirm={handleCreateMission}
          onCancel={() => setShowNewMission(false)}
        />
      )}
      {showSettings && (
        <SettingsModal
          onCancel={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function EmptyState({ onNewMission }: { onNewMission: () => void }): React.ReactElement {
  return (
    <div className="empty-state">
      <svg className="empty-mark" viewBox="0 0 48 48" fill="none">
        <rect x="4" y="4" width="40" height="40" rx="10" stroke="currentColor" strokeWidth="2" opacity="0.3"/>
        <path d="M24 14v10M24 24l6 6M24 24l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="24" cy="24" r="3" fill="currentColor"/>
      </svg>
      <h1 className="empty-title">Forge Agent OS</h1>
      <p className="empty-sub">Define a mission. Your agent team handles execution.</p>
      <button className="btn btn-primary empty-cta" onClick={onNewMission} id="empty-new-mission">
        New Mission
      </button>
    </div>
  );
}

function MissionDetail({ mission }: { mission: Mission }): React.ReactElement {
  return (
    <div className="mission-detail">
      <div className="mission-statement">
        <div className="label">Mission Statement</div>
        <p>{mission.statement}</p>
      </div>
      {mission.blueprint.requirements && (
        <div className="blueprint-preview">
          <div className="label">Requirements</div>
          <pre className="mono">{mission.blueprint.requirements}</pre>
        </div>
      )}
    </div>
  );
}

function formatEventMessage(event: ForgeEvent): string {
  switch (event.type) {
    case 'MISSION_CREATED': return `Mission created: ${(event.payload['mission'] as any)?.title}`;
    case 'MISSION_STATE_CHANGED': return `State changed to ${event.payload['next_state']}`;
    case 'TASK_STARTED': return `Task started: ${(event.payload['task'] as any)?.title}`;
    case 'TASK_COMPLETED': return `Task completed: ${(event.payload['task'] as any)?.title}`;
    case 'TASK_FAILED': return `Task failed: ${(event.payload['task'] as any)?.error ?? 'unknown'}`;
    case 'BUDGET_UPDATE': return `Budget ${(event.payload as any).pct}% — €${(event.payload as any).spent_eur?.toFixed(2)}`;
    case 'BUDGET_WARNING': return `Budget warning: ${(event.payload as any).pct}% used`;
    case 'BUDGET_SOFT_STOP': return `Budget cap reached — mission paused`;
    case 'AGENT_LOG': return `[${event.payload['agent']}] ${event.payload['message']}`;
    case 'TOOL_INVOKED': return `Tool invoked: ${event.payload['tool']}`;
    case 'TOOL_RESULT': return `Tool completed: ${event.payload['tool']}`;
    case 'TOOL_ERROR': return `Tool error: ${event.payload['error']}`;
    default: return event.type.replace(/_/g, ' ').toLowerCase();
  }
}

function getEntryType(t: string): LiveFeedEntry['type'] {
  if (t.includes('ERROR') || t.includes('FAILED')) return 'error';
  if (t.includes('COMPLETED')) return 'success';
  if (t.includes('TOOL')) return 'tool';
  if (t.includes('AGENT')) return 'model_call';
  return 'info';
}

import React from 'react';
import type { Mission, Task, TaskState, AgentRole } from '@forge/types';
import './KanbanBoard.css';

interface Props { mission: Mission | null; }

const COLUMNS: Array<{ id: string; label: string; states: TaskState[] }> = [
  { id: 'queue',    label: 'Queue',    states: ['PENDING', 'DISPATCHED'] },
  { id: 'working',  label: 'Working',  states: ['RUNNING'] },
  { id: 'review',   label: 'Review',   states: ['BLOCKED', 'ESCALATED'] },
  { id: 'done',     label: 'Done',     states: ['COMPLETED', 'FAILED', 'SKIPPED'] },
];

export function KanbanBoard({ mission }: Props): React.ReactElement {
  if (!mission) {
    return (
      <aside className="kanban">
        <div className="kanban-header"><span className="label">Agents</span></div>
        <div className="kanban-empty"><span className="kanban-empty-text">No active mission</span></div>
      </aside>
    );
  }

  return (
    <aside className="kanban">
      <div className="kanban-header">
        <span className="label">Agents</span>
        <span className="kanban-count">{mission.task_graph.length}</span>
      </div>
      <div className="kanban-body">
        {COLUMNS.map((col) => {
          const tasks = mission.task_graph.filter((t) => col.states.includes(t.state));
          return <Column key={col.id} label={col.label} tasks={tasks} />;
        })}
      </div>
    </aside>
  );
}

function Column({ label, tasks }: { label: string; tasks: Task[] }): React.ReactElement {
  return (
    <div className="kanban-col">
      <div className="kanban-col-head">
        <span className="kanban-col-label">{label}</span>
        {tasks.length > 0 && <span className="kanban-col-count">{tasks.length}</span>}
      </div>
      <div className="kanban-col-body">
        {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }): React.ReactElement {
  const color = AGENT_COLORS[task.agent] ?? 'var(--c-text-lo)';
  const running = task.state === 'RUNNING';
  const failed  = task.state === 'FAILED';

  return (
    <div className={`task-card ${running ? 'task-card--live' : ''} ${failed ? 'task-card--failed' : ''}`}
      style={{ '--ac': color } as React.CSSProperties}>
      <div className="task-head">
        <AgentTag role={task.agent} color={color} />
        {running && <span className="task-live-dot anim-pulse" />}
        {failed   && <span className="task-fail-mark">!</span>}
      </div>
      <div className="task-title">{task.title}</div>
      <div className="task-meta">
        <span className="task-model mono">{shortenModel(task.model)}</span>
        {task.cost_eur > 0 && <span className="task-cost mono">€{task.cost_eur.toFixed(3)}</span>}
        {task.duration_ms > 0 && <span className="task-dur">{fmtMs(task.duration_ms)}</span>}
      </div>
      {failed && task.error && <div className="task-error">{task.error}</div>}
    </div>
  );
}

function AgentTag({ role, color }: { role: AgentRole; color: string }): React.ReactElement {
  return (
    <span className="agent-tag" style={{ color, borderColor: `${color}30`, background: `${color}10` }}>
      <span className="agent-initial">{role[0]}</span>
      {role}
    </span>
  );
}

function shortenModel(m: string): string {
  return m.split('/').pop()?.slice(0, 18) ?? m;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

const AGENT_COLORS: Partial<Record<AgentRole, string>> = {
  Architect:   'var(--a-architect)',
  Planner:     'var(--a-planner)',
  Researcher:  'var(--a-researcher)',
  Coder:       'var(--a-coder)',
  QA:          'var(--a-qa)',
  Reviewer:    'var(--a-reviewer)',
  Designer:    'var(--a-designer)',
  Marketing:   'var(--a-marketing)',
  Automation:  'var(--a-automation)',
  Operations:  'var(--a-operations)',
};

import React, { useRef, useEffect } from 'react';
import type { LiveFeedEntry } from '@forge/types';
import './LiveFeed.css';

interface Props { entries: LiveFeedEntry[]; }

export function LiveFeed({ entries }: Props): React.ReactElement {
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <aside className="feed">
      <div className="feed-header">
        <span className="label">Live Feed</span>
        {entries.length > 0 && (
          <span className="feed-live anim-pulse">
            <span className="feed-live-dot" />
            Live
          </span>
        )}
      </div>
      <div className="feed-scroll">
        <div ref={topRef} />
        {entries.length === 0
          ? <div className="feed-empty">Waiting for activity</div>
          : entries.map((e) => <FeedRow key={e.id} entry={e} />)
        }
      </div>
    </aside>
  );
}

function FeedRow({ entry }: { entry: LiveFeedEntry }): React.ReactElement {
  const t = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  return (
    <div className={`feed-row feed-row--${entry.type} anim-slide`}>
      <span className="feed-time mono">{t}</span>
      <div className="feed-content">
        {entry.agent && <span className="feed-agent">{entry.agent}</span>}
        <span className="feed-msg">{entry.message}</span>
        {entry.cost_eur != null && entry.cost_eur > 0 && (
          <span className="feed-cost mono">€{entry.cost_eur.toFixed(4)}</span>
        )}
      </div>
    </div>
  );
}

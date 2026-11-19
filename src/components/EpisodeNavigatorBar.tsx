import React, { useMemo, useState } from 'react';
import type { ProductionHierarchy } from '../types/productionHierarchy';
import {
  getActiveEpisode,
  getActiveSeason,
  listEpisodes,
  summarizeHierarchy,
} from '../services/productionHierarchy';

type EpisodeNavigatorBarProps = {
  hierarchy: ProductionHierarchy | null;
  onSwitchEpisode: (episodeId: string) => void;
  onAddEpisode: (title?: string) => void;
  compact?: boolean;
};

const EpisodeNavigatorBar: React.FC<EpisodeNavigatorBarProps> = ({
  hierarchy,
  onSwitchEpisode,
  onAddEpisode,
  compact = false,
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const summary = useMemo(
    () => (hierarchy ? summarizeHierarchy(hierarchy) : null),
    [hierarchy],
  );
  const episodes = useMemo(
    () => (hierarchy ? listEpisodes(hierarchy) : []),
    [hierarchy],
  );
  const activeSeason = hierarchy ? getActiveSeason(hierarchy) : null;
  const activeEpisode = hierarchy ? getActiveEpisode(hierarchy) : null;

  if (!hierarchy || !summary) {
    return (
      <div className="episode-nav episode-nav--empty" role="status">
        Open or save a project to enable Series → Season → Episode navigation.
      </div>
    );
  }

  const handleAddEpisode = () => {
    onAddEpisode(newTitle.trim() || undefined);
    setNewTitle('');
    setShowAdd(false);
  };

  return (
    <div className={`episode-nav${compact ? ' episode-nav--compact' : ''}`}>
      <div className="episode-nav__context" aria-label="Production context">
        <span className="episode-nav__series" title="Series">{summary.seriesTitle}</span>
        <span className="episode-nav__sep" aria-hidden="true">/</span>
        <span className="episode-nav__season" title="Season">
          S{activeSeason?.number ?? 1}
          {activeSeason?.title ? ` · ${activeSeason.title}` : ''}
        </span>
        <span className="episode-nav__sep" aria-hidden="true">/</span>
        <span className="episode-nav__episode" title="Active episode">
          E{String(activeEpisode?.number ?? 1).padStart(2, '0')}
          {activeEpisode?.title ? ` · ${activeEpisode.title}` : ''}
        </span>
        <span className="episode-nav__meta">
          {summary.activeSceneCount} scenes · {summary.activeShotCount} shots · {summary.activeTakeCount} takes
        </span>
      </div>

      <div className="episode-nav__controls">
        <label className="episode-nav__label" htmlFor="episode-nav-select">
          Episode
        </label>
        <select
          id="episode-nav-select"
          className="episode-nav__select"
          value={hierarchy.activeEpisodeId}
          onChange={(event) => onSwitchEpisode(event.target.value)}
        >
          {episodes.map((episode) => (
            <option key={episode.episodeId} value={episode.episodeId}>
              {`S${episode.seasonNumber}E${String(episode.episodeNumber).padStart(2, '0')} — ${episode.title}`}
              {episode.shotCount ? ` (${episode.shotCount} shots)` : ''}
            </option>
          ))}
        </select>

        {!showAdd ? (
          <button
            type="button"
            className="episode-nav__btn"
            onClick={() => setShowAdd(true)}
          >
            New episode
          </button>
        ) : (
          <div className="episode-nav__add">
            <input
              type="text"
              className="episode-nav__input"
              placeholder="Episode title"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleAddEpisode();
                if (event.key === 'Escape') setShowAdd(false);
              }}
              autoFocus
            />
            <button type="button" className="episode-nav__btn episode-nav__btn--primary" onClick={handleAddEpisode}>
              Add
            </button>
            <button type="button" className="episode-nav__btn" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EpisodeNavigatorBar;

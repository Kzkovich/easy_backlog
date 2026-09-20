import type { ScenarioDiff } from '../lib/scenarioDiff';

interface Props {
  diff: ScenarioDiff;
  teamFilter: string;
  selected: Set<string>;
  onToggle: (epicId: string) => void;
}

function segmentLabel(kind: string, delta?: number): string {
  if (kind === 'added') return 'добавлена';
  if (kind === 'removed') return 'удалена';
  if (kind === 'resized') return 'изменена длительность';
  if (kind === 'moved') return `перенесена на ${Math.abs(delta ?? 0)} спринта ${delta && delta < 0 ? 'раньше' : 'позже'}`;
  return 'без изменений';
}

export default function ScenarioChangesList({ diff, teamFilter, selected, onToggle }: Props) {
  const changed = diff.features.filter((feature) => feature.kind !== 'unchanged');
  return (
    <aside className="scenario-changes" aria-label="Изменения сценария">
      <div className="section-title">Изменения{teamFilter === 'ALL' ? '' : ' команды'}</div>
      <p className="scenario-summary">
        {diff.summary.changedFeatures} фич · ← {diff.summary.movedLeft} · → {diff.summary.movedRight}
      </p>
      {changed.length === 0 && <p className="scenario-empty">Сдвигов пока нет.</p>}
      {changed.map((feature) => (
        <label key={feature.id} className="scenario-change">
          <input type="checkbox" checked={selected.has(feature.id)} onChange={() => onToggle(feature.id)} />
          <span className="scenario-change-main">
            <strong>{feature.title}</strong>
            {feature.segments.filter((segment) => segment.kind !== 'unchanged').map((segment) => (
              <span className="scenario-change-detail" key={segment.id}>
                <span className="scenario-base-bar" aria-hidden="true" />
                <span className="scenario-proposal-bar" aria-hidden="true" />
                {segmentLabel(segment.kind, segment.deltaFrom)}
              </span>
            ))}
            {feature.teamChanged && <span className="scenario-change-detail">Изменена команда</span>}
          </span>
        </label>
      ))}
    </aside>
  );
}

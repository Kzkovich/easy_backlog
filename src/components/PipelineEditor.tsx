import type { Pipeline, PipelineStage, RoleDef } from '../types';

interface Props {
  pipeline: Pipeline;
  roles: RoleDef[];
  onChange: (p: Pipeline) => void;
}

function uid() {
  return `stage-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export default function PipelineEditor({ pipeline, roles, onChange }: Props) {
  const update = (stages: PipelineStage[]) => onChange({ stages });

  const patchStage = (idx: number, patch: Partial<PipelineStage>) =>
    update(pipeline.stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const toggleRole = (idx: number, roleId: string) => {
    const s = pipeline.stages[idx];
    const roles = s.roles.includes(roleId) ? s.roles.filter((r) => r !== roleId) : [...s.roles, roleId];
    patchStage(idx, { roles });
  };

  return (
    <div className="pipeline-editor">
      {pipeline.stages.map((s, i) => (
        <div className="pipeline-stage" key={s.id}>
          <div className="pipeline-stage-head">
            <button type="button" className="icon-btn" aria-label="Вверх" disabled={i === 0}
              onClick={() => { const arr = [...pipeline.stages]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; update(arr); }}>↑</button>
            <button type="button" className="icon-btn" aria-label="Вниз" disabled={i === pipeline.stages.length - 1}
              onClick={() => { const arr = [...pipeline.stages]; [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; update(arr); }}>↓</button>
            <span>Этап {i + 1}</span>
            <label className="pipeline-link-toggle">
              <input type="checkbox" checked={s.linkType === 'earliest'}
                onChange={(e) => patchStage(i, { linkType: e.target.checked ? 'earliest' : 'sequential' })} />
              начинать по первому завершённому (earliest)
            </label>
            <button type="button" className="icon-btn" aria-label="Удалить этап" onClick={() => update(pipeline.stages.filter((_, x) => x !== i))}>✕</button>
          </div>
          <div className="pipeline-roles">
            {roles.map((r) => (
              <label key={r.id} className={`pipeline-role-chip${s.roles.includes(r.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={s.roles.includes(r.id)} onChange={() => toggleRole(i, r.id)} />
                {r.label}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="role-add-btn" onClick={() => update([...pipeline.stages, { id: uid(), roles: [], linkType: 'sequential' }])}>
        + этап
      </button>
    </div>
  );
}

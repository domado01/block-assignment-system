import {
  CAP_REF_LABELS,
  TERM_LABELS,
  ROTATION_LABELS,
} from '../lib/assignment'
import { fmtInt } from '../util'

const PROPS = ['대', '중', '소']
const HT_OPTIONS = ['H', 'T']
const AREAS = Array.from({ length: 15 }, (_, i) => `area${i + 1}`)

// ---------- 다이어그램 ----------
function FlowArrow({ label }) {
  return (
    <div className="flow-arrow">
      <div className="flow-arrow-line" />
      <div className="flow-arrow-head">▼</div>
      {label && <div className="flow-arrow-label">{label}</div>}
    </div>
  )
}

function LogicDiagram({ config }) {
  const { step1: s1, step2: s2, step3: s3 } = config
  return (
    <div className="logic-diagram">
      <div className="flow-box flow-box-gray">
        <div className="flow-title">시작</div>
      </div>
      <FlowArrow />
      <div className="flow-box flow-box-gray">
        <div className="flow-step">단계 0</div>
        <div className="flow-title">최종작업장 초기화</div>
        <div className="flow-line">모든 행의 값을 비웁니다</div>
      </div>
      <FlowArrow />
      <div className="flow-box flow-box-blue">
        <div className="flow-step">단계 1 · 기준 배정</div>
        <div className="flow-title">물성 ∈ {`{${s1.props.join(', ') || '—'}}`}</div>
        <div className="flow-line">→ 기준계획작업장으로 지정</div>
      </div>
      <FlowArrow label="미해당" />
      <div className="flow-box flow-box-green">
        <div className="flow-step">단계 2 · '동일' 처리</div>
        <div className="flow-title">
          물성 = {s2.prop} AND 선호작업장1 = '{s2.pref1Match}'
        </div>
        <div className="flow-line">→ 부모블록으로 지정</div>
      </div>
      <FlowArrow label="미해당" />
      <div className="flow-box flow-box-amber">
        <div className="flow-step">단계 3 · 영역 배정</div>
        <div className="flow-title">
          물성 = {s3.prop} AND H/T = '{s3.ht}'
        </div>
        <div className="flow-line">착수일 오름차순 정렬 후 처리</div>
        <div className="flow-line">
          → {s3.areas.join(' · ') || '—'} {ROTATION_LABELS[s3.rotation]}
        </div>
        <div className="flow-line">한도 기준: {CAP_REF_LABELS[s3.capacityRef]}</div>
        <div className="flow-line">종료: {TERM_LABELS[s3.termination]}</div>
      </div>
      <FlowArrow label="미해당 / 한도 초과" />
      <div className="flow-box flow-box-red">
        <div className="flow-title">미배정 (최종작업장 공란)</div>
      </div>
    </div>
  )
}

// ---------- 편집 UI ----------
function ChipMulti({ options, values, onChange }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <label key={o} className={`chip ${values.includes(o) ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={values.includes(o)}
            onChange={(e) => {
              const next = e.target.checked ? [...values, o] : values.filter((x) => x !== o)
              onChange(next)
            }}
          />
          {o}
        </label>
      ))}
    </div>
  )
}

function ChipSingle({ options, value, onChange, labels }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <label key={o} className={`chip ${value === o ? 'on' : ''}`}>
          <input type="radio" checked={value === o} onChange={() => onChange(o)} />
          {labels ? labels[o] : o}
        </label>
      ))}
    </div>
  )
}

function AreaChips({ values, onChange }) {
  return (
    <div className="chips-grid">
      {AREAS.map((a) => (
        <label key={a} className={`chip ${values.includes(a) ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={values.includes(a)}
            onChange={(e) => {
              const next = e.target.checked ? [...values, a] : values.filter((x) => x !== a)
              onChange(next)
            }}
          />
          {a}
        </label>
      ))}
    </div>
  )
}

function LogicEditor({ config, onChange }) {
  const setStep1 = (s) => onChange({ ...config, step1: { ...config.step1, ...s } })
  const setStep2 = (s) => onChange({ ...config, step2: { ...config.step2, ...s } })
  const setStep3 = (s) => onChange({ ...config, step3: { ...config.step3, ...s } })

  return (
    <div className="logic-editor">
      <div className="editor-step">
        <div className="editor-step-head">
          <span className="step-badge blue">단계 1</span> 기준 배정
        </div>
        <label>대상 물성 (다중 선택)</label>
        <ChipMulti
          options={PROPS}
          values={config.step1.props}
          onChange={(v) => setStep1({ props: v })}
        />
        <div className="field-readonly">
          <b>적용:</b> 기준계획작업장 → 최종작업장
        </div>
      </div>

      <div className="editor-step">
        <div className="editor-step-head">
          <span className="step-badge green">단계 2</span> '동일' 처리
        </div>
        <label>대상 물성</label>
        <ChipSingle
          options={PROPS}
          value={config.step2.prop}
          onChange={(v) => setStep2({ prop: v })}
        />
        <label>선호작업장1 트리거 텍스트</label>
        <input
          type="text"
          className="text-input"
          value={config.step2.pref1Match}
          onChange={(e) => setStep2({ pref1Match: e.target.value })}
        />
        <div className="field-readonly">
          <b>적용:</b> 부모블록 → 최종작업장
        </div>
      </div>

      <div className="editor-step">
        <div className="editor-step-head">
          <span className="step-badge amber">단계 3</span> 영역 배정
        </div>
        <label>대상 물성</label>
        <ChipSingle
          options={PROPS}
          value={config.step3.prop}
          onChange={(v) => setStep3({ prop: v })}
        />
        <label>H/T</label>
        <ChipSingle
          options={HT_OPTIONS}
          value={config.step3.ht}
          onChange={(v) => setStep3({ ht: v })}
        />
        <label>배정 영역 (다중 선택)</label>
        <AreaChips values={config.step3.areas} onChange={(v) => setStep3({ areas: v })} />
        <label>순환 방식</label>
        <ChipSingle
          options={['roundRobin', 'sequential']}
          value={config.step3.rotation}
          onChange={(v) => setStep3({ rotation: v })}
          labels={ROTATION_LABELS}
        />
        <label>능력 기준</label>
        <ChipSingle
          options={['1월', '연간', '착수월']}
          value={config.step3.capacityRef}
          onChange={(v) => setStep3({ capacityRef: v })}
          labels={CAP_REF_LABELS}
        />
        <label>종료 조건</label>
        <ChipSingle
          options={['all', 'perArea']}
          value={config.step3.termination}
          onChange={(v) => setStep3({ termination: v })}
          labels={TERM_LABELS}
        />
      </div>
    </div>
  )
}

// ---------- 메인 LogicView ----------
export default function LogicView({
  config,
  onConfigChange,
  onRecompute,
  onSave,
  onReset,
  savedAt,
  result,
  dirty,
}) {
  return (
    <div className="logic-view">
      <p className="hint">
        배정 로직을 다이어그램으로 시각화하고, 우측에서 파라미터를 수정할 수 있습니다.
        <b> 재배정 실행</b>으로 새 로직을 적용하고 <b>저장</b>으로 브라우저에 보관합니다.
        엑셀 파일은 영향받지 않습니다 (엑셀까지 갱신하려면 <code>generate_excel.py</code> 수정 필요).
      </p>

      <div className="logic-cols">
        <div className="panel logic-panel">
          <h3 className="logic-section-title">배정 로직 다이어그램</h3>
          <LogicDiagram config={config} />
        </div>
        <div className="panel logic-panel">
          <h3 className="logic-section-title">파라미터 편집</h3>
          <LogicEditor config={config} onChange={onConfigChange} />
        </div>
      </div>

      <div className="logic-actions">
        <button onClick={onRecompute}>▶ 재배정 실행</button>
        <button className="secondary" onClick={onSave}>
          💾 저장
        </button>
        <button className="tertiary" onClick={onReset}>
          ↺ 기본값 복원
        </button>
        {dirty && <span className="logic-status warn">⚠ 수정됨 — 저장하지 않으면 새로고침 시 사라집니다</span>}
        {savedAt && !dirty && <span className="logic-status">최근 저장: {savedAt}</span>}
      </div>

      {result && (
        <div className="panel logic-result">
          <h3 className="logic-section-title">최근 재배정 결과</h3>
          <div className="cards">
            <div className="card">
              <div className="card-label">단계 1 (기준)</div>
              <div className="card-value">{fmtInt(result.stepCounts.step1)}</div>
            </div>
            <div className="card">
              <div className="card-label">단계 2 ('동일')</div>
              <div className="card-value">{fmtInt(result.stepCounts.step2)}</div>
            </div>
            <div className="card">
              <div className="card-label">단계 3 (영역)</div>
              <div className="card-value">{fmtInt(result.stepCounts.step3)}</div>
              <div className="card-sub">대상 {fmtInt(result.poolSize)}건 중</div>
            </div>
            <div className="card">
              <div className="card-label">미배정</div>
              <div className="card-value">{fmtInt(result.unassignedCount)}</div>
            </div>
          </div>
          <div className="step3-detail">
            <b>3단계 영역별 누적공수:</b>{' '}
            {result.step3AreasUsed.map((a) => (
              <span key={a} className="cum-chip">
                {a}: {fmtInt(result.step3Cum[a] || 0)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

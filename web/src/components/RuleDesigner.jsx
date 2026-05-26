import { useState, useMemo, useRef, Fragment } from 'react'
import blocksData from '../data/blocks.json'
import {
  DEFAULT_RULES, FIELDS, OPS, AREAS, COLUMN_REFS,
  TARGET_TYPES, STRATEGIES, CAPACITY_OPTIONS, EXCEED_OPTIONS, SORT_OPTIONS,
  fmtCondition, fmtTarget, fmtValue, fmtRule,
} from '../lib/rule-schema'

const STORAGE_KEY = 'rule-designer-v1'
const FIELD_MAP = Object.fromEntries(FIELDS.map((f) => [f.key, f]))

// ─────────────────────────────────────────────
// 저장/로드
// ─────────────────────────────────────────────
function loadRules() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.every((r) => r.id && r.conditions)) return parsed
    }
  } catch (e) {
    /* ignore */
  }
  return JSON.parse(JSON.stringify(DEFAULT_RULES))
}

// ─────────────────────────────────────────────
// 블록 매칭 (필터 사전 추정용)
// ─────────────────────────────────────────────
function getBlockFieldValue(block, field) {
  switch (field) {
    case 'H/T': return block.ht
    case '물성': return block.prop
    case 'JG': return block.jg
    case 'PC': return block.pc
    case 'PRJ': return block.prj
    case 'PRJ_N': return block.prjN
    case '우선순위': return block.propPriority
    case '물성코드': return block.propCode
    case '선호작업장1': return block.pref1
    case '선호작업장2': return block.pref2
    case '선호작업장3': return block.pref3
    case '선호작업장4': return block.pref4
    case '선호작업장5': return block.pref5
    case '부모블록': return block.parent
    case '기준계획작업장': return block.ref
    case '블록명': return block.name
    case '블록명[:1]': return block.name?.[0]
    case '블록명[:3]': return block.name?.slice(0, 3)
    case '블록명[:4]': return block.name?.slice(0, 4)
    case '블록명[-1]': return block.name?.[block.name.length - 1]
    case '최종작업장': return block.finalWs
    default: return undefined
  }
}

function matchCondition(block, c) {
  const v = getBlockFieldValue(block, c.field)
  switch (c.op) {
    case '==': return String(v) === String(c.value)
    case '!=': return String(v) !== String(c.value)
    case 'IN': return Array.isArray(c.value) && c.value.map(String).includes(String(v))
    case 'NOT IN': return Array.isArray(c.value) && !c.value.map(String).includes(String(v))
    case 'IS_EMPTY': return v === null || v === undefined
    default: return false
  }
}

function estimateFilterMatch(rule) {
  // '최종작업장' IS_EMPTY 조건은 cascade 의존이라 제외하고 카운트
  const nonStateConds = rule.conditions.filter(
    (c) => !(c.field === '최종작업장' && c.op === 'IS_EMPTY')
  )
  if (nonStateConds.length === 0) return blocksData.length
  return blocksData.filter((b) => nonStateConds.every((c) => matchCondition(b, c))).length
}

function actualPoolSize(rule) {
  // 기존 14개 규칙은 blocks.json 의 b.pools 에서 실제 pool size 얻을 수 있음
  return blocksData.filter((b) => (b.pools || []).includes(rule.id)).length
}

// ─────────────────────────────────────────────
// 미니 흐름도 (1번 뷰)
// ─────────────────────────────────────────────
function MiniFlow({ rules, selectedId, onSelect }) {
  return (
    <div className="rd-flow">
      {rules.map((r, i) => (
        <Fragment key={r.id}>
          <button
            className={`rd-flow-item rd-flow-${r.color || 'gray'} ${r.id === selectedId ? 'sel' : ''}`}
            onClick={() => onSelect(r.id)}
            title={r.label}
          >
            <div className="rd-flow-id">{r.id}</div>
            <div className="rd-flow-label">{(r.label || r.id).split('—')[0].trim()}</div>
          </button>
          {i < rules.length - 1 && <span className="rd-flow-arrow">▶</span>}
        </Fragment>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// 의사결정 테이블 (2번 뷰)
// ─────────────────────────────────────────────
function RuleTable({ rules, selectedId, onSelect, onMoveUp, onMoveDown, onDelete }) {
  return (
    <div className="table-wrap">
      <table className="rd-table">
        <thead>
          <tr>
            <th>#</th>
            <th>ID</th>
            <th>이름</th>
            <th>조건</th>
            <th>대상</th>
            <th>전략</th>
            <th>그룹</th>
            <th>한도</th>
            <th>액션</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => {
            const condStr = r.conditions.map(fmtCondition).join(' · ')
            const isSel = r.id === selectedId
            return (
              <tr
                key={r.id}
                className={`rd-row rd-row-${r.color || 'gray'} ${isSel ? 'sel' : ''}`}
                onClick={() => onSelect(r.id)}
              >
                <td className="num">{i + 1}</td>
                <td className="rd-id"><b>{r.id}</b></td>
                <td className="rd-name">{r.label}</td>
                <td className="rd-cond">{condStr || '—'}</td>
                <td className="rd-target">{fmtTarget(r.target)}</td>
                <td>{r.strategy || '—'}</td>
                <td className="rd-group">{r.grouping ? r.grouping.join(', ') : '—'}</td>
                <td>{r.capacityCheck === 'multi-month' ? '다중월' : (r.capacityCheck === 'none' ? '없음' : r.capacityCheck)}</td>
                <td className="rd-actions-cell">
                  <button title="위로" onClick={(e) => { e.stopPropagation(); onMoveUp(r.id) }}>↑</button>
                  <button title="아래로" onClick={(e) => { e.stopPropagation(); onMoveDown(r.id) }}>↓</button>
                  <button title="삭제" onClick={(e) => { e.stopPropagation(); if (confirm(`'${r.id}' 규칙을 삭제할까요?`)) onDelete(r.id) }}>🗑</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────
// 조건 한 줄 편집기
// ─────────────────────────────────────────────
function ConditionRow({ condition, onChange, onDelete }) {
  const { field, op, value } = condition
  const fieldMeta = FIELD_MAP[field]
  const isArrayOp = op === 'IN' || op === 'NOT IN'
  const isEmptyOp = op === 'IS_EMPTY'

  const handleFieldChange = (newField) => {
    onChange({ field: newField, op, value: isArrayOp ? [] : '' })
  }
  const handleOpChange = (newOp) => {
    let newVal = value
    if (newOp === 'IN' || newOp === 'NOT IN') newVal = Array.isArray(value) ? value : (value ? [value] : [])
    else if (newOp === 'IS_EMPTY') newVal = null
    else if (Array.isArray(value)) newVal = value[0] || ''
    onChange({ field, op: newOp, value: newVal })
  }
  const handleValueChange = (newVal) => {
    onChange({ field, op, value: newVal })
  }

  const renderValueInput = () => {
    if (isEmptyOp) return <span className="rd-empty-val">(값 없음)</span>
    if (isArrayOp) {
      const arr = Array.isArray(value) ? value : []
      return (
        <input
          type="text"
          className="rd-value rd-value-array"
          value={arr.join(', ')}
          onChange={(e) => handleValueChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder="쉼표로 구분 (예: D114, D174, D204)"
        />
      )
    }
    // 단일값
    if (fieldMeta?.options) {
      return (
        <select className="rd-value" value={value || ''} onChange={(e) => handleValueChange(e.target.value)}>
          <option value="">선택...</option>
          {fieldMeta.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }
    return (
      <input
        type="text"
        className="rd-value"
        value={value ?? ''}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder={fieldMeta?.kind === 'number' ? '숫자' : '값'}
      />
    )
  }

  return (
    <div className="rd-cond-row">
      <select className="rd-cond-field" value={field} onChange={(e) => handleFieldChange(e.target.value)}>
        {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <select className="rd-cond-op" value={op} onChange={(e) => handleOpChange(e.target.value)}>
        {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {renderValueInput()}
      <button className="rd-cond-del" onClick={onDelete} title="조건 삭제">✕</button>
    </div>
  )
}

// ─────────────────────────────────────────────
// 대상(target) 편집기
// ─────────────────────────────────────────────
function TargetEditor({ target, onChange }) {
  const t = target || { type: 'single', area: 'area1' }
  const handleType = (newType) => {
    const defaults = {
      single: { type: 'single', area: 'area1' },
      'column-ref': { type: 'column-ref', column: '기준계획작업장' },
      text: { type: 'text', value: '미지정' },
      sequential: { type: 'sequential', areas: ['area1'] },
      'round-robin': { type: 'round-robin', areas: ['area3', 'area4', 'area5'] },
      alternating: { type: 'alternating', areas: ['area1', 'area6'] },
      'priority-iterate': { type: 'priority-iterate', prefRange: [1, 2, 3, 4, 5] },
    }
    onChange(defaults[newType])
  }

  return (
    <div className="rd-target">
      <select value={t.type} onChange={(e) => handleType(e.target.value)}>
        {TARGET_TYPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
      </select>

      {t.type === 'single' && (
        <select value={t.area} onChange={(e) => onChange({ ...t, area: e.target.value })}>
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}

      {t.type === 'column-ref' && (
        <select value={t.column} onChange={(e) => onChange({ ...t, column: e.target.value })}>
          {COLUMN_REFS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}

      {t.type === 'text' && (
        <input type="text" value={t.value || ''} onChange={(e) => onChange({ ...t, value: e.target.value })} />
      )}

      {(t.type === 'sequential' || t.type === 'round-robin' || t.type === 'alternating') && (
        <div className="rd-multi-area">
          <p className="hint">선택된 area (위→아래 = 시도 순서):</p>
          {(t.areas || []).map((a, i) => (
            <div key={i} className="rd-area-item">
              <span className="rd-area-num">{i + 1}.</span>
              <select value={a} onChange={(e) => {
                const newAreas = [...t.areas]
                newAreas[i] = e.target.value
                onChange({ ...t, areas: newAreas })
              }}>
                {AREAS.map((aa) => <option key={aa} value={aa}>{aa}</option>)}
              </select>
              <button onClick={() => onChange({ ...t, areas: t.areas.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="rd-btn-sm" onClick={() => onChange({ ...t, areas: [...(t.areas || []), AREAS[0]] })}>
            + area 추가
          </button>
        </div>
      )}

      {t.type === 'priority-iterate' && (
        <div className="rd-pref-range">
          <p className="hint">사용할 선호작업장 번호:</p>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="rd-checkbox-label">
              <input
                type="checkbox"
                checked={(t.prefRange || []).includes(n)}
                onChange={(e) => {
                  const arr = (t.prefRange || []).filter((x) => x !== n)
                  if (e.target.checked) arr.push(n)
                  arr.sort()
                  onChange({ ...t, prefRange: arr })
                }}
              />
              선호{n}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 그룹화 편집기
// ─────────────────────────────────────────────
const GROUP_FIELD_CHOICES = [
  'PRJ_N', '블록명', '블록명[:3]', '블록명[:4]', '물성코드', '물성', 'PRJ', 'JG', 'PC',
]

function GroupEditor({ grouping, onChange }) {
  return (
    <div className="rd-group-editor">
      {GROUP_FIELD_CHOICES.map((f) => (
        <label key={f} className="rd-checkbox-label">
          <input
            type="checkbox"
            checked={(grouping || []).includes(f)}
            onChange={(e) => {
              const arr = (grouping || []).filter((x) => x !== f)
              if (e.target.checked) arr.push(f)
              onChange(arr.length ? arr : null)
            }}
          />
          {f}
        </label>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// 카드 에디터 (3번 뷰)
// ─────────────────────────────────────────────
function RuleEditor({ rule, onChange }) {
  const update = (changes) => onChange(changes)

  const filterMatch = useMemo(() => estimateFilterMatch(rule), [rule])
  const actualPool = useMemo(() => actualPoolSize(rule), [rule])
  const isOriginalRule = DEFAULT_RULES.some((r) => r.id === rule.id)

  return (
    <div className="rd-editor">
      {/* 이름/ID */}
      <div className="rd-row-2">
        <div className="rd-field">
          <label>ID</label>
          <input
            type="text"
            value={rule.id}
            onChange={(e) => update({ id: e.target.value })}
            disabled={isOriginalRule}
          />
        </div>
        <div className="rd-field">
          <label>이름</label>
          <input
            type="text"
            value={rule.label || ''}
            onChange={(e) => update({ label: e.target.value })}
          />
        </div>
        <div className="rd-field">
          <label>색상 분류</label>
          <select value={rule.color || 'gray'} onChange={(e) => update({ color: e.target.value })}>
            <option value="gray">gray</option>
            <option value="blue">blue</option>
            <option value="green">green</option>
            <option value="amber">amber</option>
            <option value="red">red</option>
          </select>
        </div>
      </div>

      {/* 조건 */}
      <div className="rd-section">
        <div className="rd-section-head">
          <h4>조건 ({rule.conditions.length}개, AND 조합)</h4>
          <button className="rd-btn-sm" onClick={() => {
            update({ conditions: [...rule.conditions, { field: 'H/T', op: '==', value: 'H' }] })
          }}>+ 조건 추가</button>
        </div>
        {rule.conditions.length === 0 && <p className="hint">조건 없음 — 모든 미배정 블록에 적용됨</p>}
        {rule.conditions.map((c, i) => (
          <ConditionRow
            key={i}
            condition={c}
            onChange={(newCond) => {
              const next = [...rule.conditions]
              next[i] = newCond
              update({ conditions: next })
            }}
            onDelete={() => {
              update({ conditions: rule.conditions.filter((_, j) => j !== i) })
            }}
          />
        ))}
      </div>

      {/* 대상 */}
      <div className="rd-section">
        <h4>대상 작업장</h4>
        <TargetEditor target={rule.target} onChange={(t) => update({ target: t })} />
      </div>

      {/* 전략 */}
      <div className="rd-row-2">
        <div className="rd-field">
          <label>배정 전략</label>
          <select value={rule.strategy || 'direct'} onChange={(e) => update({ strategy: e.target.value })}>
            {STRATEGIES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div className="rd-field">
          <label>한도 검사</label>
          <select value={rule.capacityCheck || 'none'} onChange={(e) => update({ capacityCheck: e.target.value })}>
            {CAPACITY_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div className="rd-field">
          <label>초과 시 동작</label>
          <select
            value={rule.onExceed || ''}
            onChange={(e) => update({ onExceed: e.target.value || null })}
            disabled={rule.capacityCheck === 'none'}
          >
            <option value="">(해당 없음)</option>
            {EXCEED_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* 그룹화 */}
      {rule.strategy === 'grouped' && (
        <div className="rd-section">
          <h4>그룹화 키 (다중 선택)</h4>
          <GroupEditor grouping={rule.grouping} onChange={(g) => update({ grouping: g })} />
        </div>
      )}

      {/* 정렬 */}
      <div className="rd-field">
        <label>정렬 기준</label>
        <select value={rule.sorting || ''} onChange={(e) => update({ sorting: e.target.value || null })}>
          {SORT_OPTIONS.map((s) => <option key={s.key || 'none'} value={s.key || ''}>{s.label}</option>)}
        </select>
      </div>

      {/* 메모 */}
      <div className="rd-section">
        <h4>메모</h4>
        <textarea
          className="rd-note"
          value={rule.note || ''}
          onChange={(e) => update({ note: e.target.value })}
          placeholder="이 규칙에 대한 설명·주의사항·예시 등을 자유롭게 적습니다."
          rows={3}
        />
      </div>

      {/* 자동 자연어 설명 + 매치 추정 */}
      <div className="rd-section rd-preview">
        <h4>📝 자동 생성 설명 (실시간)</h4>
        <pre className="rd-desc-box">{fmtRule(rule)}</pre>
      </div>
      <div className="rd-section rd-preview">
        <h4>📊 예상 매치 블록 수</h4>
        <div className="rd-stats">
          {isOriginalRule && (
            <div className="rd-stat">
              <div className="rd-stat-label">실제 pool 크기 (마지막 Python 실행 기준)</div>
              <div className="rd-stat-value">{actualPool.toLocaleString('ko-KR')}건</div>
            </div>
          )}
          <div className="rd-stat">
            <div className="rd-stat-label">필터 일치 블록 (최종작업장 조건 제외, cascade 미반영)</div>
            <div className="rd-stat-value">{filterMatch.toLocaleString('ko-KR')}건</div>
          </div>
        </div>
        <p className="hint">
          ※ 실제 pool 크기 = 이 규칙이 cascade에서 처리한 블록 수. 필터 일치 = 다른 규칙 영향 없이 조건만 비교한 추정치.
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 메인 RuleDesigner
// ─────────────────────────────────────────────
export default function RuleDesigner() {
  const [rules, setRules] = useState(loadRules)
  const [selectedId, setSelectedId] = useState(rules[0]?.id || null)
  const [savedAt, setSavedAt] = useState(null)
  const savedRef = useRef(JSON.stringify(rules))
  const dirty = JSON.stringify(rules) !== savedRef.current

  const selected = useMemo(() => rules.find((r) => r.id === selectedId), [rules, selectedId])

  const updateRule = (id, changes) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)))
  }
  const addRule = () => {
    const n = rules.length + 1
    let newId = `사용자${n}`
    while (rules.some((r) => r.id === newId)) newId = `사용자${n + 1}`
    const newRule = {
      id: newId,
      label: '신규 규칙',
      color: 'gray',
      conditions: [{ field: '최종작업장', op: 'IS_EMPTY', value: null }],
      target: { type: 'single', area: 'area1' },
      strategy: 'individual',
      grouping: null,
      sorting: '착수일 ASC',
      capacityCheck: 'multi-month',
      onExceed: 'skip',
      note: '',
    }
    setRules((prev) => [...prev, newRule])
    setSelectedId(newId)
  }
  const deleteRule = (id) => {
    setRules((prev) => {
      const next = prev.filter((r) => r.id !== id)
      if (selectedId === id) setSelectedId(next[0]?.id || null)
      return next
    })
  }
  const moveUp = (id) => {
    setRules((prev) => {
      const i = prev.findIndex((r) => r.id === id)
      if (i <= 0) return prev
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }
  const moveDown = (id) => {
    setRules((prev) => {
      const i = prev.findIndex((r) => r.id === id)
      if (i < 0 || i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next
    })
  }
  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
      savedRef.current = JSON.stringify(rules)
      setSavedAt(new Date().toLocaleTimeString('ko-KR'))
    } catch (e) {
      alert('저장 실패: ' + e.message)
    }
  }
  const handleReset = () => {
    if (!confirm('모든 변경을 버리고 기본값(현재 Python 로직과 일치하는 14개 규칙)으로 초기화하시겠습니까?')) return
    const def = JSON.parse(JSON.stringify(DEFAULT_RULES))
    setRules(def)
    setSelectedId(def[0]?.id || null)
    try { localStorage.removeItem(STORAGE_KEY) } catch (e) {}
    savedRef.current = JSON.stringify(def)
    setSavedAt(null)
  }
  const handleExport = () => {
    const json = JSON.stringify(rules, null, 2)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ts = new Date().toISOString().slice(0, 10)
    a.download = `rules-${ts}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="rule-designer">
      <p className="hint">
        도메인 담당자가 자연어 대신 <b>구조화된 폼</b>으로 규칙을 정의·수정·검토하는 도구입니다.
        세 가지 뷰(흐름도·의사결정 테이블·카드 에디터)가 같은 데이터를 다른 시각으로 보여줍니다.
        변경 사항은 브라우저(localStorage)에 저장되며, <b>JSON 내보내기</b>로 다운로드해 Python에 적용할 수 있습니다.
        <br />
        ⚠ 현재는 <b>설계·문서화 도구</b>이며, 실제 배정 결과는 <code>generate_excel.py</code>가 결정합니다.
        시뮬레이션 엔진은 2차 작업으로 분리되어 있습니다.
      </p>

      {/* 1번 뷰: 미니 흐름도 */}
      <div className="panel">
        <h3 className="logic-section-title">① 규칙 흐름 (cascade 순서)</h3>
        <p className="hint">위→아래로 적용. 박스 클릭 시 아래 테이블·에디터에서 해당 규칙을 선택합니다.</p>
        <MiniFlow rules={rules} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {/* 2번 뷰: 의사결정 테이블 */}
      <div className="panel">
        <div className="panel-head">
          <h3 className="logic-section-title" style={{ margin: 0, border: 'none' }}>② 의사결정 테이블 (전체 요약)</h3>
          <button className="btn-secondary" onClick={addRule}>+ 새 규칙 추가</button>
        </div>
        <RuleTable
          rules={rules}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMoveUp={moveUp}
          onMoveDown={moveDown}
          onDelete={deleteRule}
        />
      </div>

      {/* 3번 뷰: 카드 에디터 */}
      {selected && (
        <div className="panel">
          <h3 className="logic-section-title">③ 카드 에디터 — {selected.id} 편집</h3>
          <RuleEditor
            rule={selected}
            onChange={(changes) => updateRule(selected.id, changes)}
          />
        </div>
      )}

      {/* 액션 */}
      <div className="rd-bottom-bar">
        <button onClick={handleSave}>💾 저장 (localStorage)</button>
        <button className="btn-secondary" onClick={handleExport}>⇩ JSON 내보내기</button>
        <button className="btn-tertiary" onClick={handleReset}>↺ 기본값(Python 로직)으로 복원</button>
        {dirty && <span className="rd-status warn">⚠ 저장하지 않은 변경 있음</span>}
        {savedAt && !dirty && <span className="rd-status">최근 저장: {savedAt}</span>}
      </div>
    </div>
  )
}

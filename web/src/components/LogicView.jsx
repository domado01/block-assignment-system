import React, { useState, useMemo } from 'react'
import blocksData from '../data/blocks.json'
import { fmtInt, fmtPct } from '../util'

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

function FlowBox({ color, step, title, lines }) {
  return (
    <div className={`flow-box flow-box-${color}`}>
      {step && <div className="flow-step">{step}</div>}
      <div className="flow-title">{title}</div>
      {lines && lines.map((l, i) => <div key={i} className="flow-line">{l}</div>)}
    </div>
  )
}

function LogicDiagram() {
  return (
    <div className="logic-diagram">
      <FlowBox color="gray" title="시작" />
      <FlowArrow />
      <FlowBox color="blue" step="단계 1" title="목표 조업도·공수 산출" lines={['Σ부하 / Σ능력 × 능력']} />
      <FlowArrow />
      <FlowBox color="green" step="단계 2·3" title="T 기반 배정" lines={['대/중 → 기준계획작업장', '소+동일 → 부모블록']} />
      <FlowArrow label="미해당" />
      <FlowBox color="amber" step="단계 4~7" title="H+소 배정" lines={['월별 합산·잔여능력·초과검사', 'area3~5 라운드로빈']} />
      <FlowArrow />
      <FlowBox color="red" step="단계 8" title="H+소 잔여 → '미지정'" />
      <FlowArrow label="이후 H+대/중 처리" />
      <FlowBox color="blue" step="R1·R2" title="H+물성중 특수 분류" lines={['R1: PRJ=A+D114/174/204 → area2', 'R2: JG=F → area2 (asc)']} />
      <FlowArrow />
      <FlowBox color="blue" step="R3" title="H+물성중 그룹 → area1/6 교대" />
      <FlowArrow />
      <FlowBox color="green" step="R4·R5" title="H+대중+첫H 그룹" lines={['끝P → area7  /  끝S → area8']} />
      <FlowArrow />
      <FlowBox color="green" step="R6·R7·R8" title="H+대중+E11/F51" lines={['끝P → area9 / 끝S → area10', '나머지 → area11']} />
      <FlowArrow />
      <FlowBox color="amber" step="R9" title="H+대+PC=P 그룹 → area12" />
      <FlowArrow />
      <FlowBox color="amber" step="R10" title="H+잔여 → area1·2·13 순차" />
      <FlowArrow />
      <FlowBox color="gray" title="종료 (잔여는 공란)" />
    </div>
  )
}

// ---------- 단계 7 월별 매트릭스 ----------
function Step7MonthlyMatrix({ step7Monthly, months }) {
  if (!step7Monthly || step7Monthly.length === 0) return null
  return (
    <div className="panel">
      <h3 className="logic-section-title">단계 7 — 월별 area별 목표공수 vs 누적 배정 (saturate 시점)</h3>
      <p className="hint" style={{ marginBottom: 12 }}>
        각 셀: <b>util%</b> · 누적 / 목표공수 · <b>그 (area, 월)의 마지막 배정 블록</b>.
        util%가 100%에 가까울수록 그 월의 area가 saturate된 상태이고, 마지막 블록의 착수일이 사실상의 종료 시점입니다.
      </p>
      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table className="step7-matrix">
          <thead>
            <tr>
              <th>area</th>
              {months.map((m) => <th key={m}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {step7Monthly.map((row) => (
              <tr key={row.area}>
                <td className="area-cell">{row.area}</td>
                {row.months.map((cell, i) => {
                  let cls = 'mtx-low'
                  if (cell.util >= 95) cls = 'mtx-sat'
                  else if (cell.util >= 70) cls = 'mtx-high'
                  else if (cell.util >= 30) cls = 'mtx-mid'
                  return (
                    <td key={i} className={`mtx-cell ${cls}`}>
                      <div className="mtx-util">{cell.util}%</div>
                      <div className="mtx-cum">{fmtInt(cell.cum)} / {fmtInt(cell.target)}</div>
                      {cell.lastBlock ? (
                        <div className="mtx-last">
                          <b>{cell.lastBlock.name}</b>
                          <div>{cell.lastBlock.date.slice(5)}</div>
                        </div>
                      ) : (
                        <div className="mtx-last muted">—</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- 블록 상세 테이블 ----------
function formatMonthlyMh(mm) {
  if (!mm) return '—'
  const entries = Object.entries(mm).sort(([a], [b]) => Number(a) - Number(b))
  return entries.map(([m, v]) => `${m}월:${v}`).join(' · ')
}

const DETAIL_COLUMNS = [
  { key: 'name', label: '블록명', cls: 'mono' },
  { key: 'prop', label: '물성' },
  { key: 'ref', label: '기준계획작업장' },
  { key: 'ht', label: 'H/T' },
  { key: 'jg', label: 'JG' },
  { key: 'pc', label: 'PC' },
  { key: 'prj', label: 'PRJ' },
  { key: 'prjN', label: 'PRJ_N', cls: 'num' },
  { key: 'propCode', label: '물성코드', cls: 'mono' },
  { key: 'propPriority', label: '우선순위', cls: 'num' },
  { key: 'mh', label: '공수', cls: 'num' },
  { key: 'date', label: '착수일' },
  { key: 'endDate', label: '종료일' },
  { key: 'monthlyMh', label: '월별 공수', cls: 'mono-sm',
    render: (v) => formatMonthlyMh(v) },
  { key: 'parent', label: '부모블록' },
  { key: 'pref1', label: '선호1' },
  { key: 'pref2', label: '선호2' },
  { key: 'pref3', label: '선호3' },
  { key: 'pref4', label: '선호4' },
  { key: 'pref5', label: '선호5' },
  { key: 'finalWs', label: '최종작업장', cls: 'ws' },
]

const MAX_DISPLAY = 500

function BlockDetailTable({ blocks, selectedCode, selectedArea, onClose }) {
  // 대상 블록 = 그 단계의 pool에 속했던 블록 (배정 + 건너뜀 모두)
  const filtered = useMemo(() => {
    let result = blocks.filter((b) => (b.pools || []).includes(selectedCode))
    if (selectedArea != null) {
      result = result.filter((b) => b.finalWs === selectedArea)
    }
    return result
  }, [blocks, selectedCode, selectedArea])

  const assignedHere = filtered.filter((b) => b.assignedBy === selectedCode).length
  const skipped = filtered.length - assignedHere

  const [showAll, setShowAll] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')   // 'all' | 'assigned' | 'skipped'

  const visible = useMemo(() => {
    let arr = filtered
    if (statusFilter === 'assigned') arr = arr.filter((b) => b.assignedBy === selectedCode)
    else if (statusFilter === 'skipped') arr = arr.filter((b) => b.assignedBy !== selectedCode)
    return showAll ? arr : arr.slice(0, MAX_DISPLAY)
  }, [filtered, statusFilter, showAll, selectedCode])

  const baseTitle = selectedArea
    ? `‘${selectedCode} → ${selectedArea}’ 대상 블록`
    : `‘${selectedCode}’ 대상 블록`

  return (
    <div className="panel detail-panel">
      <div className="panel-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3 className="logic-section-title" style={{ margin: 0, border: 'none' }}>
            {baseTitle} — 전체 {fmtInt(filtered.length)}개
          </h3>
          <div className="detail-summary">
            ✓ <b>{fmtInt(assignedHere)}</b>건 이 단계로 배정 · → <b>{fmtInt(skipped)}</b>건 다른 단계/공란
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="seg seg-sm">
            <button className={statusFilter === 'all' ? 'on' : ''} onClick={() => setStatusFilter('all')}>전체</button>
            <button className={statusFilter === 'assigned' ? 'on' : ''} onClick={() => setStatusFilter('assigned')}>✓ 배정</button>
            <button className={statusFilter === 'skipped' ? 'on' : ''} onClick={() => setStatusFilter('skipped')}>→ 다른 단계</button>
          </div>
          {!showAll && visible.length < (statusFilter === 'all' ? filtered.length : (statusFilter === 'assigned' ? assignedHere : skipped)) && (
            <button className="btn-secondary" onClick={() => setShowAll(true)}>전체 보기</button>
          )}
          <button className="btn-close" onClick={onClose}>닫기 ✕</button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="hint">대상 블록이 없습니다.</p>
      ) : (
        <div className="block-detail-wrap">
          <table className="block-detail-table">
            <thead>
              <tr>
                <th>이 단계 결과</th>
                {DETAIL_COLUMNS.map((c) => (
                  <th key={c.key} className={c.cls || ''}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((b) => {
                const isHere = b.assignedBy === selectedCode
                return (
                  <tr key={b.name} className={isHere ? 'row-here' : 'row-skip'}>
                    <td>
                      {isHere ? (
                        <span className="badge badge-ok">✓ {b.finalWs}</span>
                      ) : (
                        <span className="badge badge-skip">→ {b.assignedBy || '공란'}</span>
                      )}
                    </td>
                    {DETAIL_COLUMNS.map((c) => {
                      const v = b[c.key]
                      const display = c.render
                        ? c.render(v)
                        : v === null || v === undefined ? '—' : String(v)
                      return <td key={c.key} className={c.cls || ''}>{display}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------- 메인 LogicView ----------
export default function LogicView({ stepDetails, overloadTable, targetRate, months, step7Monthly }) {
  const details = stepDetails || []
  const totalPool = details.reduce((a, x) => a + (x.pool || 0), 0)
  const totalAssigned = details.reduce((a, x) => a + (x.assigned || 0), 0)
  const totalSkipped = details.reduce((a, x) => a + (x.skipped || 0), 0)

  const [selected, setSelected] = useState(null)

  const isSel = (code, area = null) =>
    selected && selected.code === code && (selected.area || null) === area

  const toggle = (code, area = null) => {
    setSelected((prev) =>
      prev && prev.code === code && (prev.area || null) === area ? null : { code, area }
    )
  }

  return (
    <div className="logic-view">
      <p className="hint">
        최종작업장은 기존 단계 1~8 + 신규 R1~R10 순서로 결정됩니다. 자세한 명세는{' '}
        <code>generate_excel.py</code>와 <code>CLAUDE.md §5</code> 참고. 단계 1 이후 모든 area별 누적공수는 월별
        목표공수와 비교해 한도가 적용됩니다 (단계 2·3 제외, 과부하 무시).
      </p>

      <div className="logic-cols">
        <div className="panel logic-panel">
          <h3 className="logic-section-title">배정 로직 다이어그램</h3>
          <LogicDiagram />
        </div>

        <div>
          <div className="panel logic-panel">
            <h3 className="logic-section-title">단계 1 — 월별 목표 조업도</h3>
            <table className="mini-table">
              <thead><tr><th>월</th><th className="num">목표 조업도</th></tr></thead>
              <tbody>
                {months.map((m, i) => (
                  <tr key={m}>
                    <td>{m}</td>
                    <td className="num">{fmtPct(targetRate?.[i] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Step7MonthlyMatrix step7Monthly={step7Monthly} months={months} />

      <div className="panel">
        <h3 className="logic-section-title">단계·규칙별 검증 테이블</h3>
        <p className="hint" style={{ marginBottom: 12 }}>
          행을 클릭하면 그 단계의 <b>대상 블록 전체</b>(배정 + 건너뜀)가 상세 테이블로 펼쳐집니다.
          sub-row 클릭 시 그 area로 배정된 블록 + 같은 area로 갈 수 있었지만 못 간 블록까지 확인 가능.
        </p>
        <div className="table-wrap">
          <table className="verify-table">
            <thead>
              <tr>
                <th>단계/규칙</th>
                <th>조건</th>
                <th>대상</th>
                <th className="num">후보</th>
                <th className="num">배정</th>
                <th className="num">미배정</th>
                <th className="num">배정률 / 활용률</th>
                <th>마지막 배정</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {details.map((d, idx) => {
                const rate = d.pool > 0 ? (d.assigned / d.pool) * 100 : null
                const cls = d.pool === 0 ? 'no-pool' : d.assigned === 0 ? 'no-assign' : d.skipped > 0 ? 'partial' : 'full'
                const sel = isSel(d.code, null)
                const clickable = d.pool > 0
                return (
                  <React.Fragment key={idx}>
                    <tr
                      className={`${cls} ${clickable ? 'clickable' : ''} ${sel ? 'selected' : ''}`}
                      onClick={() => clickable && toggle(d.code, null)}
                    >
                      <td><b>{d.code}</b></td>
                      <td className="cond">{d.cond}</td>
                      <td>{d.target}</td>
                      <td className="num">{fmtInt(d.pool)}</td>
                      <td className="num">{fmtInt(d.assigned)}</td>
                      <td className="num">{fmtInt(d.skipped)}</td>
                      <td className="num">{rate === null ? '—' : `${rate.toFixed(1)}%`}</td>
                      <td className="date-col">{d.lastAssigned ?? '—'}</td>
                      <td className="note">{d.note}</td>
                    </tr>
                    {d.subRows && d.subRows.map((sub, sidx) => {
                      const subSel = isSel(d.code, sub.target)
                      return (
                        <tr
                          key={`${idx}-${sidx}`}
                          className={`sub-row clickable ${subSel ? 'selected' : ''}`}
                          onClick={() => toggle(d.code, sub.target)}
                        >
                          <td className="sub-code">↳ {sub.target}</td>
                          <td className="cond muted">⤴ {d.code}</td>
                          <td><b>{sub.target}</b></td>
                          <td className="num muted">—</td>
                          <td className="num"><b>{fmtInt(sub.assigned)}</b></td>
                          <td className="num muted">—</td>
                          <td className="num">{sub.util}% <span className="muted">(목표대비)</span></td>
                          <td className="date-col">{sub.last ?? '—'}</td>
                          <td className="note">
                            공수 <b>{fmtInt(sub.mh)}</b> / 연간목표 {fmtInt(sub.annualTarget)}
                            {sub.first && <span className="muted"> · 첫 배정 {sub.first}</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
              <tr className="sum-row">
                <td colSpan={3}><b>합계</b></td>
                <td className="num"><b>{fmtInt(totalPool)}</b></td>
                <td className="num"><b>{fmtInt(totalAssigned)}</b></td>
                <td className="num"><b>{fmtInt(totalSkipped)}</b></td>
                <td className="num"><b>{totalPool > 0 ? `${((totalAssigned / totalPool) * 100).toFixed(1)}%` : '—'}</b></td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="verify-legend">
          <span className="legend-item"><i style={{ background: '#dcfce7', borderColor: '#16a34a' }} /> 전체 배정</span>
          <span className="legend-item"><i style={{ background: '#fef9c3', borderColor: '#ca8a04' }} /> 부분 배정</span>
          <span className="legend-item"><i style={{ background: '#fee2e2', borderColor: '#dc2626' }} /> 후보=0 또는 전부 건너뜀</span>
          <span className="legend-item"><i style={{ background: '#f1f5f9', borderColor: '#94a3b8' }} /> ↳ sub-row (area별)</span>
        </div>
      </div>

      {selected && (
        <BlockDetailTable
          blocks={blocksData}
          selectedCode={selected.code}
          selectedArea={selected.area}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="panel">
        <h3 className="logic-section-title">단계 6 — H+소 월공수 vs area3~5 잔여능력 120% 한도</h3>
        <div className="table-wrap">
          <table className="overload-table">
            <thead>
              <tr>
                <th>월</th>
                <th className="num">H+소 월공수</th>
                <th className="num">area3~5 잔여능력</th>
                <th className="num">120% 한도</th>
                <th className="num">초과액</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {overloadTable.map((row) => (
                <tr key={row.month} className={row.is_over ? 'over' : ''}>
                  <td>{row.month}월</td>
                  <td className="num">{fmtInt(row.h_so_manhours)}</td>
                  <td className="num">{fmtInt(row.remaining_capacity)}</td>
                  <td className="num">{fmtInt(row.threshold_120pct)}</td>
                  <td className="num">{row.is_over ? fmtInt(row.excess) : '—'}</td>
                  <td>{row.is_over ? <span className="badge badge-over">★ 초과</span> : <span className="badge badge-ok">정상</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

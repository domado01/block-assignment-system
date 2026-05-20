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
      <FlowBox color="blue" step="R3" title="H+물성중 그룹 → area1/6 교대" lines={['(PRJ_N, 블록명[:3]) 그룹']} />
      <FlowArrow />
      <FlowBox color="green" step="R4·R5" title="H+대중+첫H 그룹" lines={['끝P → area7  /  끝S → area8']} />
      <FlowArrow />
      <FlowBox color="green" step="R6·R7·R8" title="H+대중+E11/F51" lines={['끝P → area9  /  끝S → area10', '나머지 → area11']} />
      <FlowArrow />
      <FlowBox color="amber" step="R9" title="H+대+PC=P 그룹 → area12" />
      <FlowArrow />
      <FlowBox color="amber" step="R10" title="H+잔여 → area1·2·13 순차" />
      <FlowArrow />
      <FlowBox color="gray" title="종료 (잔여는 공란)" />
    </div>
  )
}

// ---------- 메인 ----------
export default function LogicView({ stepCounts, overloadTable, targetRate, months }) {
  const sc = stepCounts || {}
  const ruleRows = [
    { code: '단계 2', cond: 'H/T=T  AND  물성∈{대,중}', area: '기준계획작업장', n: sc.step2 },
    { code: '단계 3', cond: 'H/T=T  AND  물성=소  AND  선호1=동일', area: '부모블록', n: sc.step3 },
    { code: '단계 7', cond: 'H/T=H  AND  물성=소  (미배정)', area: 'area3~5 RR', n: sc.step7 },
    { code: '단계 8', cond: 'H/T=H  AND  물성=소  잔여', area: '미지정', n: sc.step8 },
    { code: 'R1', cond: 'H+PRJ=A+물성=중+블록명[:4]∈{D114,D174,D204}', area: 'area2', n: sc.r1 },
    { code: 'R2', cond: 'H+물성=중+JG=F (asc, 한도)', area: 'area2', n: sc.r2 },
    { code: 'R3', cond: 'H+물성=중+첫≠H+첫3∉{E11,E51} (그룹)', area: 'area1↔6', n: sc.r3 },
    { code: 'R4', cond: 'H+대중+첫=H+끝=P (그룹)', area: 'area7', n: sc.r4 },
    { code: 'R5', cond: 'H+대중+첫=H+끝=S (그룹)', area: 'area8', n: sc.r5 },
    { code: 'R6', cond: 'H+대중+첫3∈{E11,F51}+끝=P (그룹)', area: 'area9', n: sc.r6 },
    { code: 'R7', cond: 'H+대중+첫3∈{E11,F51}+끝=S (그룹)', area: 'area10', n: sc.r7 },
    { code: 'R8', cond: 'H+대중+첫3∈{E11,F51} 잔여 (asc)', area: 'area11', n: sc.r8 },
    { code: 'R9', cond: 'H+물성=대+PC=P (그룹)', area: 'area12', n: sc.r9 },
    { code: 'R10', cond: 'H+잔여 (asc)', area: 'area1·2·13 순차', n: sc.r10 },
  ]

  return (
    <div className="logic-view">
      <p className="hint">
        최종작업장은 기존 단계 1~8 + 신규 R1~R10 순서로 결정됩니다. 자세한 명세는{' '}
        <code>generate_excel.py</code>와 <code>CLAUDE.md §5</code> 참고. 단계 1 이후 모든 area별 누적공수는 월별
        목표공수와 비교해 한도가 적용됩니다 (단계 2 제외, 과부하 무시).
      </p>

      <div className="logic-cols">
        <div className="panel logic-panel">
          <h3 className="logic-section-title">배정 로직 다이어그램</h3>
          <LogicDiagram />
        </div>

        <div>
          <div className="panel logic-panel">
            <h3 className="logic-section-title">단계·규칙별 처리 건수</h3>
            <div className="table-wrap">
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>단계/규칙</th>
                    <th>조건</th>
                    <th>대상</th>
                    <th className="num">건수</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleRows.map((r) => (
                    <tr key={r.code} className={r.n === 0 ? 'zero' : ''}>
                      <td><b>{r.code}</b></td>
                      <td className="cond">{r.cond}</td>
                      <td>{r.area}</td>
                      <td className="num">{fmtInt(r.n ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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

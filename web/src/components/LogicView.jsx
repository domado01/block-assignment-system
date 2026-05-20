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
      {lines &&
        lines.map((l, i) => (
          <div key={i} className="flow-line">
            {l}
          </div>
        ))}
    </div>
  )
}

function LogicDiagram() {
  return (
    <div className="logic-diagram">
      <FlowBox color="gray" title="시작" />
      <FlowArrow />
      <FlowBox
        color="blue"
        step="단계 1"
        title="목표 조업도 · 목표 공수 산출"
        lines={[
          '목표조업도[월] = Σ 부하 ÷ Σ 능력 (전 작업장)',
          '목표공수[작업장,월] = 목표조업도[월] × 능력[작업장,월]',
        ]}
      />
      <FlowArrow />
      <FlowBox
        color="green"
        step="단계 2"
        title="H/T = T AND 물성 ∈ {대, 중}"
        lines={['→ 기준계획작업장']}
      />
      <FlowArrow label="미해당" />
      <FlowBox
        color="green"
        step="단계 3"
        title="H/T = T AND 물성 = 소 AND 선호1 = '동일'"
        lines={['→ 부모블록']}
      />
      <FlowArrow label="미해당" />
      <FlowBox
        color="amber"
        step="단계 4"
        title="H+소 공수의 착수일 월별 합산"
      />
      <FlowArrow />
      <FlowBox
        color="amber"
        step="단계 5"
        title="잔여능력 = area3~5 능력합 − 기지정 공수"
      />
      <FlowArrow />
      <FlowBox
        color="amber"
        step="단계 6"
        title="초과 검사"
        lines={['H+소 월공수 > 잔여능력 × 120% → 월별 초과 테이블']}
      />
      <FlowArrow />
      <FlowBox
        color="amber"
        step="단계 7"
        title="H+소 미배정 → area3·4·5 라운드로빈"
        lines={[
          '착수일 오름차순 처리',
          '월별 목표공수 초과 시 → 다음 area (3→4→5)',
          'area5도 초과 시 해당 블록 미배정',
          '다음 블록 시작 위치는 1칸 회전',
        ]}
      />
      <FlowArrow label="목표공수 초과 / 미배정" />
      <FlowBox
        color="red"
        step="단계 8"
        title="H+소 잔여 → '미지정'"
      />
    </div>
  )
}

// ---------- 메인 LogicView ----------
export default function LogicView({ stepCounts, overloadTable, targetRate, months }) {
  return (
    <div className="logic-view">
      <p className="hint">
        최종작업장은 다음 8단계로 결정됩니다. 1번 엑셀 파일은 이 로직을 적용한 결과이며, 로직 자체를
        바꾸려면 <code>generate_excel.py</code>를 수정해 다시 실행하세요.
      </p>

      <div className="logic-cols">
        <div className="panel logic-panel">
          <h3 className="logic-section-title">배정 로직 다이어그램</h3>
          <LogicDiagram />
        </div>

        <div>
          <div className="panel logic-panel">
            <h3 className="logic-section-title">단계별 처리 결과</h3>
            <div className="cards">
              <div className="card">
                <div className="card-label">단계 2 (T+대중)</div>
                <div className="card-value">{fmtInt(stepCounts?.step2 ?? 0)}</div>
                <div className="card-sub">기준계획작업장</div>
              </div>
              <div className="card">
                <div className="card-label">단계 3 (T+소+동일)</div>
                <div className="card-value">{fmtInt(stepCounts?.step3 ?? 0)}</div>
                <div className="card-sub">부모블록</div>
              </div>
              <div className="card">
                <div className="card-label">단계 7 (H+소 라운드로빈)</div>
                <div className="card-value">{fmtInt(stepCounts?.step7 ?? 0)}</div>
                <div className="card-sub">area3~5</div>
              </div>
              <div className="card">
                <div className="card-label">단계 8 (미지정)</div>
                <div className="card-value">{fmtInt(stepCounts?.step8 ?? 0)}</div>
                <div className="card-sub">H+소 잔여</div>
              </div>
            </div>
          </div>

          <div className="panel logic-panel">
            <h3 className="logic-section-title">단계 1 — 월별 목표 조업도</h3>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>월</th>
                  <th className="num">목표 조업도</th>
                </tr>
              </thead>
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
        <h3 className="logic-section-title">
          단계 6 — H+소 월공수 vs area3~5 잔여능력 120% 한도
        </h3>
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
                  <td>
                    {row.is_over ? (
                      <span className="badge badge-over">★ 초과</span>
                    ) : (
                      <span className="badge badge-ok">정상</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          잔여능력이 음수이면 area3~5에 이미 들어간 (단계 2~3) 공수가 능력을 넘어선 상태입니다 — 데이터
          스케일 특성이며 의도된 동작입니다.
        </p>
      </div>
    </div>
  )
}

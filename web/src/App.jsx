import { useState } from 'react'
import data from './data/data.json'
import OperationHeatmap from './components/OperationHeatmap'
import MonthlyChart from './components/MonthlyChart'
import AssignmentView from './components/AssignmentView'
import LogicView from './components/LogicView'
import RuleDesigner from './components/RuleDesigner'
import { fmtInt, fmtPct, RATE_BANDS } from './util'

const METRICS = [
  { key: 'rate_actual', label: '조업도 (실적)' },
  { key: 'rate_plan', label: '조업도 (평균)' },
  { key: 'capacity', label: '능력' },
  { key: 'load_actual', label: '공수 (실적)' },
  { key: 'load_plan', label: '부하 (랜덤)' },
]

export default function App() {
  const [tab, setTab] = useState('operation')
  const [metric, setMetric] = useState('rate_actual')
  const [selected, setSelected] = useState(data.workshops[0].name)

  const { workshops, months } = data

  // 월별 실적 조업도 (작업장별 평균)
  const monthlyActualAvg = months.map((_, i) => {
    const sum = workshops.reduce((a, w) => a + (w.actualOperationRate?.[i] ?? 0), 0)
    return sum / workshops.length
  })
  const yearAvg = monthlyActualAvg.reduce((a, b) => a + b, 0) / monthlyActualAvg.length
  const maxIdx = monthlyActualAvg.indexOf(Math.max(...monthlyActualAvg))
  const minIdx = monthlyActualAvg.indexOf(Math.min(...monthlyActualAvg))

  const sel = workshops.find((w) => w.name === selected)
  const metricLabel = METRICS.find((m) => m.key === metric).label

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>작업장별 월간 조업도 현황</h1>
          <p className="sub">월별 능력 · 부하 · 평균조업도 모니터링 시스템</p>
        </div>
        <div className="gen">데이터 생성: {data.generatedAt}</div>
      </header>

      <nav className="tabs">
        <button
          className={tab === 'operation' ? 'active' : ''}
          onClick={() => setTab('operation')}
        >
          월간 조업도
        </button>
        <button
          className={tab === 'assignment' ? 'active' : ''}
          onClick={() => setTab('assignment')}
        >
          작업장별 배정 현황
        </button>
        <button className={tab === 'logic' ? 'active' : ''} onClick={() => setTab('logic')}>
          로직 관리
        </button>
        <button className={tab === 'designer' ? 'active' : ''} onClick={() => setTab('designer')}>
          로직 디자이너
        </button>
      </nav>

      {tab === 'operation' && (
        <main>
          <div className="cards">
            <div className="card">
              <div className="card-label">작업장 수</div>
              <div className="card-value">{workshops.length}</div>
            </div>
            <div className="card">
              <div className="card-label">연평균 실적 조업도</div>
              <div className="card-value">{fmtPct(yearAvg)}</div>
              <div className="card-sub">배정 결과 기준</div>
            </div>
            <div className="card">
              <div className="card-label">최고 실적 조업도 월</div>
              <div className="card-value">
                {months[maxIdx]} <span className="card-sub">{fmtPct(monthlyActualAvg[maxIdx])}</span>
              </div>
            </div>
            <div className="card">
              <div className="card-label">최저 실적 조업도 월</div>
              <div className="card-value">
                {months[minIdx]} <span className="card-sub">{fmtPct(monthlyActualAvg[minIdx])}</span>
              </div>
            </div>
            <div className="card">
              <div className="card-label">총 블록 수</div>
              <div className="card-value">{fmtInt(data.blockCount)}</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>월별 {metricLabel} 현황</h2>
              <div className="seg">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    className={metric === m.key ? 'on' : ''}
                    onClick={() => setMetric(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {(metric === 'rate_actual' || metric === 'rate_plan') && (
              <div className="legend">
                {RATE_BANDS.map((b) => (
                  <span key={b.label} className="legend-item">
                    <i style={{ background: b.bg, borderColor: b.fg }} /> {b.label}
                  </span>
                ))}
              </div>
            )}

            <OperationHeatmap
              workshops={workshops}
              months={months}
              metric={metric}
              selected={selected}
              onSelect={setSelected}
            />
            <p className="hint">행을 클릭하면 해당 작업장의 월별 추이를 볼 수 있습니다.</p>
          </div>

          {sel && (
            <div className="panel">
              <div className="panel-head">
                <h2>
                  {sel.name} 상세 <span className="muted-tag">우선순위 {sel.priority}</span>
                </h2>
              </div>
              <div className="charts">
                <MonthlyChart
                  months={months}
                  values={sel.actualOperationRate || sel.operationRate}
                  color="#2563eb"
                  valueFormat={fmtPct}
                  title="월별 실적 조업도 (배정기반)"
                />
                <MonthlyChart
                  months={months}
                  values={sel.capacity}
                  color="#0891b2"
                  valueFormat={fmtInt}
                  title="월별 능력"
                />
                <MonthlyChart
                  months={months}
                  values={sel.actualLoad || sel.load}
                  color="#e11d48"
                  valueFormat={fmtInt}
                  title="월별 실적 공수 (배정기반)"
                />
              </div>
            </div>
          )}
        </main>
      )}

      {tab === 'assignment' && (
        <main>
          <div className="panel">
            <div className="panel-head">
              <h2>최종작업장 배정 현황</h2>
            </div>
            <p className="hint">
              1번 블록 테이블의 <b>최종작업장</b> 컬럼 기준 집계. 8단계 로직 적용 결과입니다 (단계별
              상세는 <b>로직 관리</b> 탭 참고).
            </p>
            <AssignmentView
              assignment={data.assignment}
              workshops={workshops}
              unassignedCount={data.unassignedCount}
            />
          </div>
        </main>
      )}

      {tab === 'designer' && (
        <main>
          <RuleDesigner />
        </main>
      )}

      {tab === 'logic' && (
        <main>
          <LogicView
            stepCounts={data.stepCounts}
            stepDetails={data.stepDetails}
            overloadTable={data.overloadTable}
            targetRate={data.targetRate}
            step7Monthly={data.step7Monthly}
            months={months}
          />
        </main>
      )}

      <footer className="footer">해양생산 조업도 모니터링 · 데모 시스템</footer>
    </div>
  )
}

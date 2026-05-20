import { useState } from 'react'
import data from './data/data.json'
import OperationHeatmap from './components/OperationHeatmap'
import MonthlyChart from './components/MonthlyChart'
import AssignmentView from './components/AssignmentView'
import LogicView from './components/LogicView'
import { fmtInt, fmtPct, RATE_BANDS } from './util'

const METRICS = [
  { key: 'rate', label: '조업도' },
  { key: 'capacity', label: '능력' },
  { key: 'load', label: '부하' },
]

export default function App() {
  const [tab, setTab] = useState('operation')
  const [metric, setMetric] = useState('rate')
  const [selected, setSelected] = useState(data.workshops[0].name)

  const { workshops, months } = data

  // 월별 평균조업도 (작업장 동일 → 첫 작업장 기준)
  const monthlyRate = workshops[0].operationRate
  const yearAvg = monthlyRate.reduce((a, b) => a + b, 0) / monthlyRate.length
  const maxIdx = monthlyRate.indexOf(Math.max(...monthlyRate))
  const minIdx = monthlyRate.indexOf(Math.min(...monthlyRate))

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
      </nav>

      {tab === 'operation' && (
        <main>
          <div className="cards">
            <div className="card">
              <div className="card-label">작업장 수</div>
              <div className="card-value">{workshops.length}</div>
            </div>
            <div className="card">
              <div className="card-label">연평균 조업도</div>
              <div className="card-value">{fmtPct(yearAvg)}</div>
            </div>
            <div className="card">
              <div className="card-label">최고 조업도 월</div>
              <div className="card-value">
                {months[maxIdx]} <span className="card-sub">{fmtPct(monthlyRate[maxIdx])}</span>
              </div>
            </div>
            <div className="card">
              <div className="card-label">최저 조업도 월</div>
              <div className="card-value">
                {months[minIdx]} <span className="card-sub">{fmtPct(monthlyRate[minIdx])}</span>
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

            {metric === 'rate' && (
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
                  values={sel.operationRate}
                  color="#2563eb"
                  valueFormat={fmtPct}
                  title="월별 평균조업도"
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
                  values={sel.load}
                  color="#e11d48"
                  valueFormat={fmtInt}
                  title="월별 부하"
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

      {tab === 'logic' && (
        <main>
          <LogicView
            stepCounts={data.stepCounts}
            overloadTable={data.overloadTable}
            targetRate={data.targetRate}
            months={months}
          />
        </main>
      )}

      <footer className="footer">해양생산 조업도 모니터링 · 데모 시스템</footer>
    </div>
  )
}

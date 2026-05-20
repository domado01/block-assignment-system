import { fmtInt } from '../util'

// 최종작업장 배정 현황 (1번 블록 테이블 기준)
export default function AssignmentView({ assignment, workshops, unassignedCount = 0 }) {
  const prioMap = Object.fromEntries(workshops.map((w) => [w.name, w.priority]))
  const assignedBlocks = assignment.reduce((a, x) => a + x.blockCount, 0)
  const totalMh = assignment.reduce((a, x) => a + x.totalManhours, 0)
  const maxMh = Math.max(...assignment.map((x) => x.totalManhours))
  const sorted = [...assignment].sort((a, b) => b.totalManhours - a.totalManhours)
  const totalBlocks = assignedBlocks + unassignedCount
  const assignRate = totalBlocks ? (assignedBlocks / totalBlocks) * 100 : 0

  return (
    <div>
      <div className="cards">
        <div className="card">
          <div className="card-label">배정 블록</div>
          <div className="card-value">{fmtInt(assignedBlocks)}</div>
        </div>
        <div className="card">
          <div className="card-label">미배정 블록</div>
          <div className="card-value">{fmtInt(unassignedCount)}</div>
        </div>
        <div className="card">
          <div className="card-label">배정률</div>
          <div className="card-value">{assignRate.toFixed(1)}%</div>
        </div>
        <div className="card">
          <div className="card-label">배정 공수 합계</div>
          <div className="card-value">{fmtInt(totalMh)}</div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="assign-table">
          <thead>
            <tr>
              <th>작업장</th>
              <th>우선순위</th>
              <th className="num">배정 블록 수</th>
              <th className="num">공수 합계</th>
              <th className="bar-head">공수 비중</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((x) => {
              const pct = totalMh ? (x.totalManhours / totalMh) * 100 : 0
              return (
                <tr key={x.workshop}>
                  <td className="ws-name">{x.workshop}</td>
                  <td className="prio">{prioMap[x.workshop]}</td>
                  <td className="num">{fmtInt(x.blockCount)}</td>
                  <td className="num">{fmtInt(x.totalManhours)}</td>
                  <td>
                    <div className="bar-cell">
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${(x.totalManhours / maxMh) * 100}%` }}
                        />
                      </div>
                      <span className="bar-label">{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

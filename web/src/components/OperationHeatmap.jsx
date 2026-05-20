import { fmtInt, fmtPct, rateBand, magnitudeColor, magnitudeText } from '../util'

// 작업장(행) x 월(열) 히트맵 테이블
export default function OperationHeatmap({ workshops, months, metric, selected, onSelect }) {
  const isRate = metric === 'rate_actual' || metric === 'rate_plan'
  const getValues = (w) => {
    switch (metric) {
      case 'rate_actual': return w.actualOperationRate || w.operationRate
      case 'rate_plan': return w.operationRate
      case 'capacity': return w.capacity
      case 'load_actual': return w.actualLoad || w.load
      case 'load_plan': return w.load
      default: return w.operationRate
    }
  }

  // 능력/부하: 전체 셀 기준 min/max (색상 보간용)
  let gMin = Infinity
  let gMax = -Infinity
  if (!isRate) {
    for (const w of workshops) {
      for (const v of getValues(w)) {
        if (v < gMin) gMin = v
        if (v > gMax) gMax = v
      }
    }
  }

  const cellStyle = (v) =>
    isRate
      ? { background: rateBand(v).bg, color: rateBand(v).fg }
      : { background: magnitudeColor(v, gMin, gMax), color: magnitudeText(v, gMin, gMax) }

  const fmt = (v) => (isRate ? fmtPct(v) : fmtInt(v))
  const rowAgg = (vals) =>
    isRate
      ? fmtPct(vals.reduce((a, b) => a + b, 0) / vals.length)
      : fmtInt(vals.reduce((a, b) => a + b, 0))

  return (
    <div className="table-wrap">
      <table className="heatmap">
        <thead>
          <tr>
            <th className="sticky-col">작업장</th>
            <th>우선순위</th>
            {months.map((m) => (
              <th key={m}>{m}</th>
            ))}
            <th>{isRate ? '연평균' : '연합계'}</th>
          </tr>
        </thead>
        <tbody>
          {workshops.map((w) => {
            const vals = getValues(w)
            return (
              <tr
                key={w.name}
                className={selected === w.name ? 'sel' : ''}
                onClick={() => onSelect(w.name)}
              >
                <td className="sticky-col ws-name">{w.name}</td>
                <td className="prio">{w.priority}</td>
                {vals.map((v, i) => (
                  <td key={i} className="cell" style={cellStyle(v)}>
                    {fmt(v)}
                  </td>
                ))}
                <td className="agg">{rowAgg(vals)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// 12개월 막대 차트 (의존성 없는 순수 SVG)

export default function MonthlyChart({ months, values, color, valueFormat, title }) {
  const W = 640
  const H = 210
  const padX = 8
  const padT = 30
  const padB = 30
  const max = Math.max(...values, 0.0001)
  const n = values.length
  const bw = (W - padX * 2) / n

  return (
    <div className="chart">
      <div className="chart-title">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
        {values.map((v, i) => {
          const bh = (v / max) * (H - padT - padB)
          const x = padX + i * bw
          const y = H - padB - bh
          return (
            <g key={i}>
              <rect
                x={x + bw * 0.16}
                y={y}
                width={bw * 0.68}
                height={Math.max(bh, 1)}
                rx="3"
                fill={color}
              />
              <text x={x + bw / 2} y={y - 7} textAnchor="middle" className="chart-val">
                {valueFormat(v)}
              </text>
              <text x={x + bw / 2} y={H - 10} textAnchor="middle" className="chart-lbl">
                {months[i]}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

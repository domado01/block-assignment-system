// 공용 포맷 / 색상 헬퍼

export const fmtInt = (n) => Math.round(n).toLocaleString('ko-KR')
export const fmtPct = (r) => `${(r * 100).toFixed(0)}%`

// 조업도(가동률) 구간 → 색상 / 라벨
export function rateBand(rate) {
  if (rate < 0.9) return { label: '여유', bg: '#e0f2fe', fg: '#0369a1' }
  if (rate < 1.0) return { label: '적정', bg: '#dcfce7', fg: '#15803d' }
  if (rate <= 1.1) return { label: '높음', bg: '#fef9c3', fg: '#a16207' }
  return { label: '과부하', bg: '#fee2e2', fg: '#b91c1c' }
}

export const RATE_BANDS = [
  { label: '여유 (<90%)', bg: '#e0f2fe', fg: '#0369a1' },
  { label: '적정 (90~99%)', bg: '#dcfce7', fg: '#15803d' },
  { label: '높음 (100~110%)', bg: '#fef9c3', fg: '#a16207' },
  { label: '과부하 (>110%)', bg: '#fee2e2', fg: '#b91c1c' },
]

// 값 크기 → 흰색~파랑 보간 (능력/부하 히트맵)
export function magnitudeColor(value, min, max) {
  if (max === min) return '#eef2ff'
  const t = (value - min) / (max - min)
  const r = Math.round(255 + t * (37 - 255))
  const g = Math.round(255 + t * (99 - 255))
  const b = Math.round(255 + t * (235 - 255))
  return `rgb(${r}, ${g}, ${b})`
}

export function magnitudeText(value, min, max) {
  if (max === min) return '#1e293b'
  return (value - min) / (max - min) > 0.6 ? '#ffffff' : '#1e293b'
}

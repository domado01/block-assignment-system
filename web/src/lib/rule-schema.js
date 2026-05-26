// 로직 디자이너용 규칙 스키마 + 기본 14개 규칙 정의
// 도메인 담당자가 구조화된 폼으로 로직을 정의·수정할 수 있도록 함

// ─────────────────────────────────────────────
// 메타 (드롭다운·체크박스 옵션 소스)
// ─────────────────────────────────────────────
export const FIELDS = [
  { key: 'H/T', label: 'H/T', options: ['H', 'T'] },
  { key: '물성', label: '물성', options: ['대', '중', '소'] },
  { key: 'JG', label: 'JG', options: ['L', 'D', 'F'] },
  { key: 'PC', label: 'PC', options: ['P', 'C'] },
  { key: 'PRJ', label: 'PRJ', options: ['A', 'B', 'C', 'D'] },
  { key: 'PRJ_N', label: 'PRJ_N', kind: 'number' },
  { key: '우선순위', label: '우선순위(테이블1, 1~20)', kind: 'number' },
  { key: '물성코드', label: '물성코드(2자)', kind: 'text' },
  { key: '선호작업장1', label: '선호작업장1' },
  { key: '선호작업장2', label: '선호작업장2' },
  { key: '선호작업장3', label: '선호작업장3' },
  { key: '선호작업장4', label: '선호작업장4' },
  { key: '선호작업장5', label: '선호작업장5' },
  { key: '부모블록', label: '부모블록' },
  { key: '기준계획작업장', label: '기준계획작업장' },
  { key: '블록명', label: '블록명 (전체)' },
  { key: '블록명[:1]', label: '블록명 첫글자' },
  { key: '블록명[:3]', label: '블록명 앞3자' },
  { key: '블록명[:4]', label: '블록명 앞4자' },
  { key: '블록명[-1]', label: '블록명 끝글자' },
  { key: '최종작업장', label: '최종작업장(현재값)' },
]
export const OPS = ['==', '!=', 'IN', 'NOT IN', 'IS_EMPTY']
export const AREAS = Array.from({ length: 15 }, (_, i) => `area${i + 1}`)
export const COLUMN_REFS = ['기준계획작업장', '부모블록', '선호작업장1', '선호작업장2',
                            '선호작업장3', '선호작업장4', '선호작업장5']
export const TARGET_TYPES = [
  { key: 'single', label: '단일 작업장' },
  { key: 'column-ref', label: '컬럼값 참조 (블록의 다른 컬럼 값으로)' },
  { key: 'text', label: '텍스트 값 (예: "미지정")' },
  { key: 'sequential', label: '순차 시도 (area1 → area2 → ...)' },
  { key: 'round-robin', label: '라운드로빈 (블록마다 순환)' },
  { key: 'alternating', label: '교대 (그룹마다 토글)' },
  { key: 'priority-iterate', label: '우선순위순 작업장 순회 (R11 패턴)' },
]
export const STRATEGIES = [
  { key: 'direct', label: '직접 배정 (한도 무시)' },
  { key: 'individual', label: '개별 배정 (한도 검사)' },
  { key: 'grouped', label: '그룹 배정 (그룹키 + 한도 검사)' },
]
export const CAPACITY_OPTIONS = [
  { key: 'none', label: '한도 검사 없음' },
  { key: 'multi-month', label: '다중월 한도 (블록이 걸친 모든 월 검사)' },
]
export const EXCEED_OPTIONS = [
  { key: 'skip', label: '건너뜀 (다음 블록·그룹 계속 시도)' },
  { key: 'stop', label: '정지 (그 area·rule 전체 멈춤)' },
  { key: 'next-area', label: '다음 area 시도 (단일 블록 내 fallback)' },
]
export const SORT_OPTIONS = [
  { key: null, label: '(없음)' },
  { key: '착수일 ASC', label: '착수일 오름차순' },
  { key: '우선순위 ASC', label: '테이블1 우선순위 ASC (1=최우선)' },
  { key: '그룹 내 최소 착수일 ASC', label: '그룹 내 최소 착수일 ASC' },
]

// ─────────────────────────────────────────────
// 기본 14개 규칙 (현재 generate_excel.py 와 일치)
// ─────────────────────────────────────────────
export const DEFAULT_RULES = [
  {
    id: 'step2', label: '단계 2 — T+대/중 → 기준계획작업장', color: 'green',
    conditions: [
      { field: 'H/T', op: '==', value: 'T' },
      { field: '물성', op: 'IN', value: ['대', '중'] },
    ],
    target: { type: 'column-ref', column: '기준계획작업장' },
    strategy: 'direct', grouping: null, sorting: null,
    capacityCheck: 'none', onExceed: null,
    note: '능력 초과 무시 (과부하라도 그대로 배정)',
  },
  {
    id: 'step3', label: '단계 3 — T+소+동일 → 부모블록', color: 'green',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'T' },
      { field: '물성', op: '==', value: '소' },
      { field: '선호작업장1', op: '==', value: '동일' },
    ],
    target: { type: 'column-ref', column: '부모블록' },
    strategy: 'direct', grouping: null, sorting: null,
    capacityCheck: 'none', onExceed: null,
  },
  {
    id: 'step7', label: '단계 7 — H+소 → area3·4·5 라운드로빈', color: 'amber',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'H' },
      { field: '물성', op: '==', value: '소' },
    ],
    target: { type: 'round-robin', areas: ['area3', 'area4', 'area5'] },
    strategy: 'individual', grouping: null, sorting: '착수일 ASC',
    capacityCheck: 'multi-month', onExceed: 'next-area',
  },
  {
    id: 'step8', label: '단계 8 — H+소 잔여 → "미지정"', color: 'red',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'H' },
      { field: '물성', op: '==', value: '소' },
    ],
    target: { type: 'text', value: '미지정' },
    strategy: 'direct', grouping: null, sorting: null,
    capacityCheck: 'none', onExceed: null,
  },
  {
    id: 'R1', label: 'R1 — H+PRJ=A+물성중+D114/174/204 → area2', color: 'blue',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'H' },
      { field: 'PRJ', op: '==', value: 'A' },
      { field: '물성', op: '==', value: '중' },
      { field: '블록명[:4]', op: 'IN', value: ['D114', 'D174', 'D204'] },
    ],
    target: { type: 'single', area: 'area2' },
    strategy: 'direct', grouping: null, sorting: null,
    capacityCheck: 'none', onExceed: null,
  },
  {
    id: 'R2', label: 'R2 — H+물성중+JG=F → area2', color: 'blue',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'H' },
      { field: '물성', op: '==', value: '중' },
      { field: 'JG', op: '==', value: 'F' },
    ],
    target: { type: 'single', area: 'area2' },
    strategy: 'individual', grouping: null, sorting: '착수일 ASC',
    capacityCheck: 'multi-month', onExceed: 'skip',
  },
  {
    id: 'R3', label: 'R3 — H+물성중 그룹 → area1 ↔ area6 교대', color: 'blue',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'H' },
      { field: '물성', op: '==', value: '중' },
      { field: '블록명[:1]', op: '!=', value: 'H' },
      { field: '블록명[:3]', op: 'NOT IN', value: ['E11', 'E51'] },
    ],
    target: { type: 'alternating', areas: ['area1', 'area6'] },
    strategy: 'grouped', grouping: ['PRJ_N', '블록명[:3]'],
    sorting: '그룹 내 최소 착수일 ASC',
    capacityCheck: 'multi-month', onExceed: 'skip',
  },
  {
    id: 'R4', label: 'R4 — H+대중+첫H+끝P 그룹 → area7', color: 'green',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'H' },
      { field: '물성', op: 'IN', value: ['대', '중'] },
      { field: '블록명[:1]', op: '==', value: 'H' },
      { field: '블록명[-1]', op: '==', value: 'P' },
    ],
    target: { type: 'single', area: 'area7' },
    strategy: 'grouped', grouping: ['PRJ_N', '블록명[:3]'],
    sorting: '그룹 내 최소 착수일 ASC',
    capacityCheck: 'multi-month', onExceed: 'skip',
  },
  {
    id: 'R5', label: 'R5 — H+대중+첫H+끝S 그룹 → area8', color: 'green',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'H' },
      { field: '물성', op: 'IN', value: ['대', '중'] },
      { field: '블록명[:1]', op: '==', value: 'H' },
      { field: '블록명[-1]', op: '==', value: 'S' },
    ],
    target: { type: 'single', area: 'area8' },
    strategy: 'grouped', grouping: ['PRJ_N', '블록명[:3]'],
    sorting: '그룹 내 최소 착수일 ASC',
    capacityCheck: 'multi-month', onExceed: 'skip',
  },
  {
    id: 'R6', label: 'R6 — H+대중+E11/F51+끝P 그룹 → area9', color: 'green',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'H' },
      { field: '물성', op: 'IN', value: ['대', '중'] },
      { field: '블록명[:3]', op: 'IN', value: ['E11', 'F51'] },
      { field: '블록명[-1]', op: '==', value: 'P' },
    ],
    target: { type: 'single', area: 'area9' },
    strategy: 'grouped', grouping: ['PRJ_N', '블록명[:3]'],
    sorting: '그룹 내 최소 착수일 ASC',
    capacityCheck: 'multi-month', onExceed: 'skip',
  },
  {
    id: 'R7', label: 'R7 — H+대중+E11/F51+끝S 그룹 → area10', color: 'green',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'H' },
      { field: '물성', op: 'IN', value: ['대', '중'] },
      { field: '블록명[:3]', op: 'IN', value: ['E11', 'F51'] },
      { field: '블록명[-1]', op: '==', value: 'S' },
    ],
    target: { type: 'single', area: 'area10' },
    strategy: 'grouped', grouping: ['PRJ_N', '블록명[:3]'],
    sorting: '그룹 내 최소 착수일 ASC',
    capacityCheck: 'multi-month', onExceed: 'skip',
  },
  {
    id: 'R8', label: 'R8 — H+대중+E11/F51 잔여 → area11', color: 'green',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'H' },
      { field: '물성', op: 'IN', value: ['대', '중'] },
      { field: '블록명[:3]', op: 'IN', value: ['E11', 'F51'] },
    ],
    target: { type: 'single', area: 'area11' },
    strategy: 'individual', grouping: null, sorting: '착수일 ASC',
    capacityCheck: 'multi-month', onExceed: 'skip',
  },
  {
    id: 'R9', label: 'R9 — H+대+PC=P 그룹 → area12', color: 'amber',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'H' },
      { field: '물성', op: '==', value: '대' },
      { field: 'PC', op: '==', value: 'P' },
    ],
    target: { type: 'single', area: 'area12' },
    strategy: 'grouped', grouping: ['PRJ_N', '블록명[:3]'],
    sorting: '그룹 내 최소 착수일 ASC',
    capacityCheck: 'multi-month', onExceed: 'skip',
  },
  {
    id: 'R10', label: 'R10 — H+잔여 catch-all → area1·2·13 순차', color: 'amber',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'H' },
    ],
    target: { type: 'sequential', areas: ['area1', 'area2', 'area13'] },
    strategy: 'individual', grouping: null, sorting: '착수일 ASC',
    capacityCheck: 'multi-month', onExceed: 'next-area',
  },
  {
    id: 'R11', label: 'R11 — T+소+공란 → 우선순위순 작업장 × 선호1~5', color: 'blue',
    conditions: [
      { field: '최종작업장', op: 'IS_EMPTY', value: null },
      { field: 'H/T', op: '==', value: 'T' },
      { field: '물성', op: '==', value: '소' },
    ],
    target: { type: 'priority-iterate', prefRange: [1, 2, 3, 4, 5] },
    strategy: 'grouped', grouping: ['PRJ_N', '블록명', '물성코드'],
    sorting: '우선순위 ASC',
    capacityCheck: 'multi-month', onExceed: 'skip',
    note: '테이블2 우선순위 1→15 작업장 순회, 각 작업장에서 선호1→5 후보 매칭',
  },
]

// ─────────────────────────────────────────────
// 포맷 헬퍼 (자연어 설명 자동 생성)
// ─────────────────────────────────────────────
const OP_DISPLAY = { '==': '=', '!=': '≠', 'IN': '∈', 'NOT IN': '∉', 'IS_EMPTY': '= 공란' }

export function fmtValue(v) {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return `{${v.join(', ')}}`
  if (typeof v === 'string') return `'${v}'`
  return String(v)
}

export function fmtCondition(c) {
  if (c.op === 'IS_EMPTY') return `${c.field} = 공란`
  const op = OP_DISPLAY[c.op] || c.op
  return `${c.field} ${op} ${fmtValue(c.value)}`
}

export function fmtTarget(t) {
  if (!t) return '—'
  switch (t.type) {
    case 'single': return `→ ${t.area}`
    case 'column-ref': return `→ [${t.column}] 컬럼값`
    case 'text': return `→ "${t.value}"`
    case 'sequential': return `→ ${(t.areas || []).join(' → ')} 순차`
    case 'round-robin': return `→ ${(t.areas || []).join(' · ')} 라운드로빈`
    case 'alternating': return `→ ${(t.areas || []).join(' ↔ ')} 교대`
    case 'priority-iterate':
      return `→ 우선순위순 작업장 (선호${(t.prefRange || []).join('~')})`
    default: return '→ ?'
  }
}

export function fmtRule(rule) {
  const conds = rule.conditions.map(fmtCondition).join(' AND ')
  const tgt = fmtTarget(rule.target)
  const extras = []
  if (rule.grouping) extras.push(`그룹: (${rule.grouping.join(', ')})`)
  if (rule.sorting) extras.push(`정렬: ${rule.sorting}`)
  if (rule.capacityCheck === 'multi-month') extras.push('다중월 한도')
  else if (rule.capacityCheck === 'none') extras.push('한도 무시')
  if (rule.onExceed) {
    const labels = { skip: '초과 시 건너뜀', stop: '초과 시 정지', 'next-area': '초과 시 다음 area' }
    extras.push(labels[rule.onExceed] || rule.onExceed)
  }
  return `${conds}\n${tgt}\n${extras.join(' · ')}`
}

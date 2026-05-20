// 브라우저에서 최종작업장 배정을 재계산하는 로직.
// generate_excel.py 의 파이썬 로직과 동일한 결과를 내도록 작성했다.

export const DEFAULT_CONFIG = {
  step1: { props: ['대', '중'], target: 'ref' },           // ref = 기준계획작업장
  step2: { prop: '소', pref1Match: '동일', target: 'parent' }, // parent = 부모블록
  step3: {
    prop: '소',
    ht: 'H',
    areas: ['area3', 'area4', 'area5'],
    capacityRef: '1월',     // '1월' | '연간' | '착수월'
    termination: 'all',     // 'all' | 'perArea'
    rotation: 'roundRobin', // 'roundRobin' | 'sequential'
  },
}

export const CAP_REF_LABELS = {
  '1월': '1월 능력',
  '연간': '연간 능력 합계',
  '착수월': '착수일이 속한 월의 능력',
}

export const TERM_LABELS = {
  all: '한 area라도 초과 시 전체 종료',
  perArea: '초과 area만 마감, 다음 area로 계속',
}

export const ROTATION_LABELS = {
  roundRobin: '라운드로빈 (순환 배정)',
  sequential: '순차 채우기 (한 영역씩)',
}

export function recomputeAssignment(blocks, workshops, config) {
  const N = blocks.length
  const final = new Array(N).fill(null)
  const stepCounts = { step1: 0, step2: 0, step3: 0 }

  // ----- 단계 1: 지정된 물성 → 지정된 컬럼 값으로 최종작업장 설정
  const s1Props = new Set(config.step1.props)
  const s1Target = config.step1.target
  for (let i = 0; i < N; i++) {
    const b = blocks[i]
    if (s1Props.has(b.prop)) {
      const v = b[s1Target]
      if (v) {
        final[i] = v
        stepCounts.step1++
      }
    }
  }

  // ----- 단계 2: 물성+선호1='동일' → 지정 컬럼 값으로
  const s2 = config.step2
  for (let i = 0; i < N; i++) {
    if (final[i] !== null) continue
    const b = blocks[i]
    if (b.prop === s2.prop && b.pref1 === s2.pref1Match) {
      const v = b[s2.target]
      if (v) {
        final[i] = v
        stepCounts.step2++
      }
    }
  }

  // ----- 단계 3: 물성+H/T 조건 → 착수일 오름차순으로 영역 배정
  const s3 = config.step3
  const pool = []
  for (let i = 0; i < N; i++) {
    if (final[i] !== null) continue
    const b = blocks[i]
    if (b.prop === s3.prop && b.ht === s3.ht) pool.push(i)
  }
  pool.sort((a, b) => blocks[a].date.localeCompare(blocks[b].date))

  const wsByName = Object.fromEntries(workshops.map((w) => [w.name, w]))
  const getCap = (areaName, monthIdx) => {
    const w = wsByName[areaName]
    if (!w) return 0
    if (s3.capacityRef === '1월') return w.capacity[0]
    if (s3.capacityRef === '연간') return w.capacity.reduce((a, b) => a + b, 0)
    if (s3.capacityRef === '착수월') return w.capacity[monthIdx] ?? 0
    return w.capacity[0]
  }

  let openAreas = [...s3.areas]
  const cum = Object.fromEntries(s3.areas.map((a) => [a, 0]))
  let cycleIdx = 0

  for (let k = 0; k < pool.length; k++) {
    if (openAreas.length === 0) break
    const i = pool[k]
    const b = blocks[i]
    const monthIdx = parseInt(b.date.split('-')[1], 10) - 1

    let area
    if (s3.rotation === 'roundRobin') {
      area = openAreas[cycleIdx % openAreas.length]
      cycleIdx++
    } else {
      area = openAreas[0]
    }

    final[i] = area
    cum[area] += b.mh
    stepCounts.step3++

    if (cum[area] > getCap(area, monthIdx)) {
      if (s3.termination === 'all') break
      openAreas = openAreas.filter((a) => a !== area)
    }
  }

  // ----- 집계
  const unassignedCount = final.filter((v) => v === null).length

  const perAreaMap = {}
  for (let i = 0; i < N; i++) {
    const a = final[i]
    if (!a) continue
    if (!perAreaMap[a]) perAreaMap[a] = { workshop: a, blockCount: 0, totalManhours: 0 }
    perAreaMap[a].blockCount++
    perAreaMap[a].totalManhours += blocks[i].mh
  }
  const perArea = workshops.map(
    (w) => perAreaMap[w.name] || { workshop: w.name, blockCount: 0, totalManhours: 0 }
  )

  return {
    perArea,
    unassignedCount,
    stepCounts,
    poolSize: pool.length,
    step3Cum: cum,
    step3AreasUsed: s3.areas,
  }
}

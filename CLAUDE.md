# CLAUDE.md — 프로젝트 가이드

> 이 문서는 다른 AI 에이전트 또는 개발자가 본 프로젝트를 이해하고 유지보수할 수 있도록 작성된 안내서입니다. **작업 시작 전 반드시 이 문서를 먼저 읽으세요.**

---

## 1. 프로젝트 개요

블록 단위 생산 계획을 다루는 데모용 **작업장 조업도 / 블록 배정 시스템**입니다.

- Python으로 합성 데이터(블록 1만 행, 작업장 15행)를 생성
- 다단계 로직으로 각 블록의 `최종작업장`을 결정
- React + Vite 대시보드에서 월별 조업도와 배정 결과를 시각화하고, 로직 자체를 편집/저장 가능

핵심 가치:
- **결정론적 데이터** — `random.seed(42)`로 고정. 동일 코드 → 동일 결과
- **이중 구현된 배정 로직** — Python(엑셀 생성용) + JS(브라우저 재배정용). 두 곳을 항상 함께 갱신
- **상호작용 가능한 대시보드** — 로직을 다이어그램으로 보고, 파라미터를 바꾸고, 즉시 재배정

---

## 2. 빠른 시작

```bash
# 1) 데이터 생성 (엑셀 2개 + JSON 2개)
python -X utf8 generate_excel.py

# 2) 웹앱 의존성 설치 (최초 1회)
cd web
npm install

# 3) 개발 서버
npm run dev          # → http://localhost:5173/

# 4) 프로덕션 빌드 (검증)
npm run build
```

**요구사항**: Python 3.10+, Node 18+, `pandas`, `openpyxl`

---

## 3. 저장소 구조

```
.
├── CLAUDE.md                   ← 이 문서 (AI 인수인계용)
├── README.md                   ← 사람용 짧은 안내
├── .gitignore
├── generate_excel.py           ← 데이터 + 배정 (Python, source of truth)
├── calc_op_rate.py             ← area3~5 조업도 산출 유틸
├── 1번_블록테이블.xlsx          ← 생성된 블록 데이터 (10,000행 × 13열)
├── 2번_작업장테이블.xlsx        ← 생성된 작업장 데이터 (15행 × 38열)
└── web/                        ← React + Vite 대시보드
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── README.md
    └── src/
        ├── main.jsx
        ├── App.jsx              ← 탭 라우팅 + 전역 상태
        ├── styles.css           ← 전체 스타일
        ├── util.js              ← 포맷·색상 헬퍼
        ├── data/
        │   ├── data.json        ← 집계 + 작업장 데이터 (12 KB)
        │   └── blocks.json      ← 블록 레벨 데이터 (~1 MB, 재배정용)
        ├── lib/
        │   └── assignment.js    ← 브라우저용 배정 로직 (Python 미러)
        └── components/
            ├── OperationHeatmap.jsx
            ├── MonthlyChart.jsx
            ├── AssignmentView.jsx
            └── LogicView.jsx
```

---

## 4. 데이터 모델

### 4.1 1번 블록 테이블 — `1번_블록테이블.xlsx` (10,000행 × 13열)

| 컬럼 | 설명 |
|---|---|
| `블록명` | `m000a`~`m999z` 형식 고유 ID. 중복 없음 |
| `물성` | `대` / `중` / `소` (대략 1/3씩) |
| `기준계획작업장` | `area1`~`area15` 랜덤 |
| `H/T` | `H` 또는 `T` |
| `공수` | 정수 10~2500 |
| `착수일` | 2026-01-01 ~ 2026-02-28 사이 랜덤 |
| `부모블록` | 물성이 `소`인 행만 `area1`~`area15` 랜덤, 그 외 공란 |
| `선호작업장1` | `area1`~`area15` 또는 `동일` (약 20% 확률) |
| `선호작업장2~5` | `area1`~`area15` (한 행 내 5개 모두 서로 다름) |
| `최종작업장` | 배정 로직 결과. 일부 행은 공란 |

### 4.2 2번 작업장 테이블 — `2번_작업장테이블.xlsx` (15행 × 38열)

| 컬럼 | 설명 |
|---|---|
| `작업장` | `area1`~`area15` |
| `우선순위` | 1~15 중복 없는 순열 |
| `1월능력`~`12월능력` | 정수 500~6000 |
| `1월부하`~`12월부하` | 정수 500~6000 |
| `1월평균조업도`~`12월평균조업도` | 월별 고정값(작업장 동일). 1월 90%, 2월 110%, ..., 12월 85% |

엑셀 셀 서식: 평균조업도 컬럼은 `0%` 퍼센트 표시(내부값 0.90 = 90%).

### 4.3 `web/src/data/data.json`

```jsonc
{
  "generatedAt": "YYYY-MM-DD HH:MM",
  "months": ["1월", ..., "12월"],
  "blockCount": 10000,
  "unassignedCount": 2624,
  "workshops": [
    {
      "name": "area1",
      "priority": 15,
      "capacity": [/* 12개 정수 */],
      "load":     [/* 12개 정수 */],
      "operationRate": [/* 12개 fraction, 예: 0.90 */]
    }
  ],
  "assignment": [
    {"workshop": "area1", "blockCount": 685, "totalManhours": 875234}
  ]
}
```

### 4.4 `web/src/data/blocks.json`

배정 재계산용 블록 레벨 데이터. 1만 개 배열.

```jsonc
[
  {
    "prop":   "소",           // 물성
    "ht":     "H",            // H/T
    "pref1":  "동일",         // 선호작업장1 (혹은 area명)
    "ref":    "area3",        // 기준계획작업장
    "parent": "area7",        // 부모블록 (소 행만, 그 외 null)
    "mh":     1234,           // 공수
    "date":   "2026-01-15"    // 착수일 (YYYY-MM-DD)
  }
  // × 10,000
]
```

---

## 5. 최종작업장 배정 로직

단계 0 → 1 → 2 → 3 순서로 적용. **앞 단계에서 이미 배정된 블록은 뒤 단계에서 건드리지 않습니다.**

### 단계 0 — 초기화
모든 행의 `최종작업장`을 `None`으로.

### 단계 1 — 기준 배정
- **조건**: `물성 ∈ {대, 중}`
- **액션**: `최종작업장 ← 기준계획작업장`
- **특징**: 능력 초과 무시 (과부하라도 적용)
- **결과**: 약 6,730건 (물성 대+중 전부)

### 단계 2 — '동일' 처리
- **조건**: `물성 = '소'` AND `선호작업장1 = '동일'`
- **액션**: `최종작업장 ← 부모블록`
- **결과**: 약 640건

### 단계 3 — 영역 배정 (소+H, 라운드로빈)
- **조건**: `물성 = '소'` AND `H/T = 'H'` (앞 단계에서 미배정분)
- **처리**:
  1. 대상 블록을 `착수일` 오름차순으로 정렬
  2. `area3, area4, area5` 라운드로빈으로 순환 배정
  3. 한 area의 누적 공수가 **1월 능력**을 초과하면 **전체 배정 종료**
- **결과**: 대상 1,307건 중 7건만 배정 (1월 능력이 작아서 빠르게 종료)

### 미배정 (공란) 케이스
- 물성이 `소`이고 `선호작업장1 ≠ '동일'`이며 `H/T = 'T'` 인 블록 (~1,300건)
- 단계 3에서 한도 초과 이후 잔여 블록 (~1,300건)
- 총 약 2,624건

### Python ↔ JS 동기화 (중요)

**동일한 로직이 두 곳에 존재합니다:**

| 위치 | 역할 |
|---|---|
| `generate_excel.py` | 엑셀 + JSON 생성 (source of truth) |
| `web/src/lib/assignment.js` | 브라우저에서 사용자 파라미터로 재배정할 때 |

⚠ **로직 변경 시 반드시 두 파일을 함께 갱신**하세요. 동일한 입력(seed 42)에 대해 동일한 결과가 나와야 합니다.

웹 UI에서 사용자가 파라미터를 바꿔 재배정한 결과는 **브라우저 메모리 + localStorage**에만 반영되며, 엑셀 파일과는 무관합니다.

---

## 6. 웹앱 아키텍처

### 6.1 상태 관리 (App.jsx 단일 보유)

| 상태 | 의미 |
|---|---|
| `tab` | 활성 탭: `'operation'` / `'assignment'` / `'logic'` |
| `metric` | 히트맵 metric: `'rate'` / `'capacity'` / `'load'` |
| `selected` | 상세 차트 작업장명 |
| `config` | 사용자 편집 중인 배정 로직 설정 |
| `result` | 마지막 재배정 결과 (null이면 파이썬 원본 데이터 사용) |
| `savedAt` | localStorage 저장 시각 |

`config` 영속화 키: `localStorage['assignment-config-v1']`

### 6.2 데이터 흐름

```
data.json   ─┐
             ├─→ App.jsx (단방향)
blocks.json ─┘     │
                   ├─→ OperationHeatmap   (월간 조업도 탭)
                   ├─→ MonthlyChart       (작업장 상세 차트)
                   ├─→ AssignmentView     (배정 현황 탭, result 우선)
                   └─→ LogicView          (로직 관리 탭)
                          │
                          │ onRecompute()
                          ▼
                   recomputeAssignment(blocks, workshops, config)
                          │
                          └─→ setResult() → 배정 현황 탭에 즉시 반영
```

### 6.3 주요 컴포넌트

- **`OperationHeatmap.jsx`** — 작업장 × 12개월 히트맵. 조업도/능력/부하 토글. 클릭으로 상세 표시.
- **`MonthlyChart.jsx`** — 의존성 없는 순수 SVG 막대 차트. props: `months`, `values`, `color`, `valueFormat`, `title`.
- **`AssignmentView.jsx`** — 작업장별 배정 카드 + 표. props: `assignment`, `workshops`, `unassignedCount`.
- **`LogicView.jsx`** — 다이어그램 + 편집 UI + 액션 버튼 + 결과 카드. 내부에 `LogicDiagram`, `LogicEditor`, `ChipMulti`, `ChipSingle`, `AreaChips` sub-component 포함.

### 6.4 스타일

- 단일 파일 `src/styles.css`
- CSS 변수: `--accent` (#2563eb), `--bg` (#f1f5f9), `--panel` (#fff), `--border`, `--text`, `--muted`
- 외부 UI 라이브러리 없음 (의존성 최소)

---

## 7. 자주 하는 변경 (Cookbook)

### 7.1 1번 테이블에 새 컬럼 추가
1. `generate_excel.py`의 `rows1` 딕셔너리에 키 추가
2. 웹앱에서 사용한다면 `blocks_data` 항목에도 추가
3. `web/src/lib/assignment.js`가 새 필드를 참조하면 시그너처 검토
4. `python -X utf8 generate_excel.py` 재실행

### 7.2 배정 로직 변경
1. `generate_excel.py`의 `최종작업장 배정` 섹션 (`final_ws` 변수) 수정
2. `web/src/lib/assignment.js`의 `recomputeAssignment`에 동일 로직 반영
3. UI 노출이 필요하면 `LogicView.jsx`의 편집 컴포넌트 + `DEFAULT_CONFIG` 갱신
4. `python -X utf8 generate_excel.py` 실행 + `npm run build` 검증

### 7.3 새 탭 추가
1. `App.jsx`의 `<nav className="tabs">`에 버튼 추가
2. `{tab === '새탭이름' && ...}` 조건부 렌더링 추가
3. 컴포넌트는 `src/components/`에 신규 파일

### 7.4 데이터 갱신
`python -X utf8 generate_excel.py`만 실행. Vite HMR가 JSON 변경을 자동 감지해 화면을 갱신합니다.

---

## 8. 알려진 제약 / 주의사항

### 8.1 엑셀 파일 잠금
`1번_블록테이블.xlsx`를 Excel에서 열어둔 채 스크립트 실행 시 `PermissionError`. 스크립트는 `try/except`로 잡아 JSON은 정상 생성하지만, 엑셀은 갱신되지 않습니다. 엑셀 갱신이 필요하면 사용자가 파일을 먼저 닫아야 합니다.

### 8.2 PowerShell 한글 인코딩
`python generate_excel.py`를 그대로 실행하면 PowerShell 콘솔에서 stdout이 cp949로 깨질 수 있음. **반드시 `python -X utf8` 옵션을 붙여 실행**하세요.

### 8.3 평균조업도의 작업장 동일성
2번 테이블의 월별 평균조업도는 15개 작업장이 동일한 값을 사용 (설계 상). 따라서 조업도 히트맵의 모든 작업장 행이 같은 값으로 보입니다 — 의도된 동작. 능력/부하로 토글하면 작업장별 차이가 보입니다.

### 8.4 브라우저 재배정 ↛ 엑셀
로직 관리 탭에서 재배정한 결과는 **브라우저(localStorage)에만 반영**됩니다. 엑셀 파일은 `generate_excel.py` 출력 기준 그대로. 엑셀까지 갱신하려면 파이썬 스크립트를 직접 수정해야 합니다.

### 8.5 blocks.json 크기
약 1 MB. Vite 빌드에서 메인 청크가 500 KB 경고를 띄우지만 gzip 후 ~144 KB로 양호. 향후 더 커지면 `public/` 폴더로 옮겨 동적 fetch 권장.

### 8.6 결정론
모든 랜덤은 `random.seed(42)` 고정. 코드/시드가 같으면 동일 데이터가 생성됩니다. 데이터 분포가 달라졌다면 시드나 분기 로직을 점검하세요.

### 8.7 라운드로빈 종료 조건
단계 3은 "한 area라도 1월 능력 초과 시 전체 종료" 정책. 1월 능력이 ~2,000~4,000 수준인데 블록 평균 공수가 ~1,255라 매우 빠르게 종료(보통 7~10건 수준). 더 많은 배정을 원하면 능력 기준을 연간 합계로 바꾸거나 종료 조건을 변경.

---

## 9. 빌드 / 배포

- **개발**: `npm run dev` (Vite HMR)
- **빌드**: `npm run build` → `web/dist/` (정적 파일)
- **미리보기**: `npm run preview`

백엔드 없음. 정적 파일 서버 어디든 배포 가능 (Netlify / GitHub Pages / Vercel 등).

---

## 10. 작업 이력

- v1 — 초기 데이터 합성 + Excel 출력
- v2 — React + Vite 대시보드 (월간 조업도 + 배정 현황 2탭)
- v3 — 최종작업장 배정 로직 (단계 0~3)
- v4 — 착수일 컬럼 + 라운드로빈 단계 3 + 1월 능력 한도
- v5 — 로직 관리 탭 (다이어그램 + 편집 + 저장 + 재배정)

### 향후 가능 작업
- 저장된 config를 파이썬 스크립트가 읽어 엑셀까지 갱신
- 라운드로빈 + area별 마감을 활용한 더 정교한 분배
- 착수일 기반 월별 부하 분배
- 배정 결과 검증 리포트 자동 출력
- 다이어그램에 분기(Yes/No) 표현 추가

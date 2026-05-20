# -*- coding: utf-8 -*-
"""두 개의 데이터셋을 엑셀로 생성하고, 웹앱용 JSON을 내보낸다.

- 1번 테이블: 블록 1만 행 (착수일 + 최종작업장 배정 포함)
- 2번 테이블: 작업장 15 행 (월별 능력/부하/평균조업도)

[최종작업장 배정 로직 — 8단계]
 1. 목표 조업도 = Σ 부하 / Σ 능력 (월별 전체작업장)
    목표 공수[작업장,월] = 목표 조업도[월] × 능력[작업장,월]
 2. H/T=T  AND 물성∈{대,중}          → 기준계획작업장
 3. H/T=T  AND 물성=소 AND 선호1='동일' → 부모블록
 4. H/T=H  AND 물성=소  공수의 착수일 월별 합산
 5. 잔여능력[월] = (area3~5 월별 능력 합) − (현재 area3~5에 지정된 공수의 월별 합)
 6. 4번 값이 잔여능력의 120%를 초과한 월에 대한 초과 테이블 산출
 7. H/T=H AND 물성=소 AND 미배정 → 착수일 오름차순으로 area3·4·5에
    라운드로빈 배정. 단, 해당 area의 월별 누적공수가 목표공수를 초과하면
    다음 area로(area3→4→5 순). area5도 초과하면 그 블록은 미배정으로 둠.
    다음 블록의 시작 area는 이전 블록이 area3에 들어갔으면 area4,
    area4면 area5, area5면 다시 area3로 순환.
 8. 위 단계로도 H/T=H AND 물성=소 가 미배정이면 '미지정' 입력.

남는 카테고리(공란):
 · H/T=T + 물성=소 + 선호1≠'동일'
 · H/T=H + 물성∈{대,중}
"""
import os
import json
import random
import string
import datetime
import pandas as pd
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

random.seed(42)

areas = [f"area{i}" for i in range(1, 16)]
months = list(range(1, 13))

# ===================================================================
# 2번 테이블 데이터
# ===================================================================
priorities = random.sample(range(1, 16), 15)

oper_rates = {1: 0.90, 2: 1.10, 3: 0.95, 4: 1.05, 5: 1.00, 6: 1.15,
              7: 0.88, 8: 0.92, 9: 1.08, 10: 0.98, 11: 1.02, 12: 0.85}

ws_data = []
for idx, area in enumerate(areas):
    ws_data.append({
        "작업장": area,
        "우선순위": priorities[idx],
        "능력": {m: random.randint(500, 6000) for m in months},
        "부하": {m: random.randint(500, 6000) for m in months},
    })
cap_by_area = {w["작업장"]: w["능력"] for w in ws_data}
load_by_area = {w["작업장"]: w["부하"] for w in ws_data}

# ===================================================================
# 1번 테이블 (블록, 1만 행)
# ===================================================================
N = 10000

all_names = [f"m{n:03d}{c}" for n in range(1000) for c in string.ascii_lowercase]
block_names = random.sample(all_names, N)

props = [random.choice(["중", "대", "소"]) for _ in range(N)]

DONGIL_RATE = 0.20
START_BASE = datetime.date(2026, 1, 1)

rows1 = []
for i in range(N):
    prop = props[i]
    parent = random.choice(areas) if prop == "소" else None
    pref = random.sample(areas, 5)
    pref1 = "동일" if random.random() < DONGIL_RATE else pref[0]
    start_date = START_BASE + datetime.timedelta(days=random.randint(0, 58))
    rows1.append({
        "블록명": block_names[i],
        "물성": prop,
        "기준계획작업장": random.choice(areas),
        "H/T": random.choice(["H", "T"]),
        "JG": random.choice(["L", "D", "F"]),
        "PC": random.choice(["P", "C"]),
        "PRJ": random.choice(["A", "B", "C", "D"]),
        "공수": round(random.randint(10, 2500) / 23, 2),
        "착수일": start_date,
        "부모블록": parent,
        "선호작업장1": pref1,
        "선호작업장2": pref[1],
        "선호작업장3": pref[2],
        "선호작업장4": pref[3],
        "선호작업장5": pref[4],
    })

month_of = [r["착수일"].month for r in rows1]   # 블록별 착수일 월

# ===================================================================
# 최종작업장 배정 — 8단계 로직
# ===================================================================
final_ws = [None] * N

# --- 1. 목표 조업도 + 목표 공수 ---
total_load_pm = {m: sum(load_by_area[a][m] for a in areas) for m in months}
total_cap_pm = {m: sum(cap_by_area[a][m] for a in areas) for m in months}
target_rate = {m: total_load_pm[m] / total_cap_pm[m] for m in months}
target_mh = {a: {m: target_rate[m] * cap_by_area[a][m] for m in months} for a in areas}

# --- 2. T + 대/중 → 기준계획작업장 ---
n_step2 = 0
for i, r in enumerate(rows1):
    if r["H/T"] == "T" and r["물성"] in ("대", "중"):
        final_ws[i] = r["기준계획작업장"]
        n_step2 += 1

# --- 3. T + 소 + 동일 → 부모블록 ---
n_step3 = 0
for i, r in enumerate(rows1):
    if final_ws[i] is None and r["H/T"] == "T" and r["물성"] == "소" and r["선호작업장1"] == "동일":
        final_ws[i] = r["부모블록"]
        n_step3 += 1

# --- 4. H+소 공수의 월별 합산 (착수일 월 기준) ---
hso_mh_pm = {m: 0 for m in months}
for i, r in enumerate(rows1):
    if r["H/T"] == "H" and r["물성"] == "소":
        hso_mh_pm[month_of[i]] += r["공수"]

# --- 5. 월별 잔여 능력 (area3~5) ---
target_areas = ["area3", "area4", "area5"]
cap345_pm = {m: sum(cap_by_area[a][m] for a in target_areas) for m in months}
assigned_345_pm = {m: 0 for m in months}
for i in range(N):
    if final_ws[i] in target_areas:
        assigned_345_pm[month_of[i]] += rows1[i]["공수"]
remaining_cap_pm = {m: cap345_pm[m] - assigned_345_pm[m] for m in months}

# --- 6. 초과 월 (H+소 월별 공수 > 잔여능력 × 120%) ---
overload_rows = []
for m in months:
    threshold = remaining_cap_pm[m] * 1.2
    is_over = hso_mh_pm[m] > threshold
    overload_rows.append({
        "month": m,
        "h_so_manhours": int(hso_mh_pm[m]),
        "remaining_capacity": int(remaining_cap_pm[m]),
        "threshold_120pct": int(threshold),
        "excess": int(hso_mh_pm[m] - threshold) if is_over else 0,
        "is_over": is_over,
    })

# --- 7. H+소 미배정 → area3·4·5 라운드로빈 배정 ---
pool = sorted(
    [i for i in range(N) if final_ws[i] is None and rows1[i]["H/T"] == "H" and rows1[i]["물성"] == "소"],
    key=lambda i: rows1[i]["착수일"]
)
# 월별·area별 누적공수 (스텝2·3 결과 선반영)
month_cum = {a: {m: 0 for m in months} for a in target_areas}
for i in range(N):
    if final_ws[i] in target_areas:
        month_cum[final_ws[i]][month_of[i]] += rows1[i]["공수"]

n_step7 = 0
next_idx = 0   # 0=area3, 1=area4, 2=area5

for i in pool:
    m = month_of[i]
    mh = rows1[i]["공수"]
    assigned_area = None
    # next_idx에서 시작해 끝(area5)까지 전진 탐색 (no wrap)
    for offset in range(3 - next_idx):
        a = target_areas[next_idx + offset]
        if month_cum[a][m] + mh > target_mh[a][m]:
            continue   # 초과 → 다음 area
        assigned_area = a
        month_cum[a][m] += mh
        final_ws[i] = a
        n_step7 += 1
        break
    # 다음 블록 시작 위치 갱신
    if assigned_area is not None:
        next_idx = (target_areas.index(assigned_area) + 1) % 3
    else:
        next_idx = 0   # 실패 시 area3로 리셋

# --- 8. H+소 잔여 → '미지정' ---
n_step8 = 0
for i, r in enumerate(rows1):
    if final_ws[i] is None and r["H/T"] == "H" and r["물성"] == "소":
        final_ws[i] = "미지정"
        n_step8 += 1

# 최종작업장 컬럼에 반영
for i, r in enumerate(rows1):
    r["최종작업장"] = final_ws[i]

# ===================================================================
# 1번 테이블 엑셀 출력
# ===================================================================
df1 = pd.DataFrame(rows1)
df1["착수일"] = pd.to_datetime(df1["착수일"])
try:
    df1.to_excel("1번_블록테이블.xlsx", index=False)
except PermissionError:
    print("[경고] 1번_블록테이블.xlsx 가 열려 있어 엑셀 쓰기를 건너뜁니다. (JSON은 계속 생성)")

# ===================================================================
# 2번 테이블 엑셀 출력
# ===================================================================
rows2 = []
for w in ws_data:
    row = {"작업장": w["작업장"], "우선순위": w["우선순위"]}
    for m in months:
        row[f"{m}월능력"] = w["능력"][m]
    for m in months:
        row[f"{m}월부하"] = w["부하"][m]
    for m in months:
        row[f"{m}월평균조업도"] = oper_rates[m]
    rows2.append(row)

df2 = pd.DataFrame(rows2)
try:
    df2.to_excel("2번_작업장테이블.xlsx", index=False)
    wb = load_workbook("2번_작업장테이블.xlsx")
    ws = wb.active
    for col_name in df2.columns:
        if col_name.endswith("평균조업도"):
            letter = get_column_letter(df2.columns.get_loc(col_name) + 1)
            for r in range(2, ws.max_row + 1):
                ws[f"{letter}{r}"].number_format = "0%"
    wb.save("2번_작업장테이블.xlsx")
except PermissionError:
    print("[경고] 2번_작업장테이블.xlsx 가 열려 있어 엑셀 쓰기를 건너뜁니다.")

# ===================================================================
# 웹앱용 JSON 내보내기
# ===================================================================
assignment_summary = []
for a in areas:
    cnt = sum(1 for v in final_ws if v == a)
    mh = sum(rows1[i]["공수"] for i in range(N) if final_ws[i] == a)
    assignment_summary.append({"workshop": a, "blockCount": cnt, "totalManhours": mh})
# '미지정'을 가상 작업장처럼 추가
mizijong_cnt = sum(1 for v in final_ws if v == "미지정")
mizijong_mh = sum(rows1[i]["공수"] for i in range(N) if final_ws[i] == "미지정")
assignment_summary.append({"workshop": "미지정", "blockCount": mizijong_cnt, "totalManhours": mizijong_mh})

unassigned_count = sum(1 for v in final_ws if v is None)

web_data = {
    "generatedAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
    "months": [f"{m}월" for m in months],
    "blockCount": N,
    "unassignedCount": unassigned_count,
    "workshops": [
        {
            "name": w["작업장"],
            "priority": w["우선순위"],
            "capacity": [w["능력"][m] for m in months],
            "load": [w["부하"][m] for m in months],
            "operationRate": [oper_rates[m] for m in months],
        }
        for w in ws_data
    ],
    "assignment": assignment_summary,
    # 새 로직 산출물
    "targetRate": [target_rate[m] for m in months],
    "targetManhours": {a: [target_mh[a][m] for m in months] for a in areas},
    "overloadTable": overload_rows,
    "stepCounts": {"step2": n_step2, "step3": n_step3, "step7": n_step7, "step8": n_step8},
}

os.makedirs(os.path.join("web", "src", "data"), exist_ok=True)
json_path = os.path.join("web", "src", "data", "data.json")
with open(json_path, "w", encoding="utf-8") as f:
    json.dump(web_data, f, ensure_ascii=False, indent=2)

# 블록 레벨 데이터 (웹앱 재배정용)
blocks_data = [
    {
        "prop": r["물성"],
        "ht": r["H/T"],
        "jg": r["JG"],
        "pc": r["PC"],
        "prj": r["PRJ"],
        "pref1": r["선호작업장1"],
        "ref": r["기준계획작업장"],
        "parent": r["부모블록"],
        "mh": r["공수"],
        "date": r["착수일"].strftime("%Y-%m-%d"),
    }
    for r in rows1
]
blocks_path = os.path.join("web", "src", "data", "blocks.json")
with open(blocks_path, "w", encoding="utf-8") as f:
    json.dump(blocks_data, f, ensure_ascii=False, separators=(",", ":"))

# ===================================================================
# 검증 출력
# ===================================================================
print(f"1번 테이블: {df1.shape[0]}행 x {df1.shape[1]}열")
print(f"  물성 분포: {df1['물성'].value_counts().to_dict()}")
print(f"  착수일 범위: {df1['착수일'].min().date()} ~ {df1['착수일'].max().date()}")
print()
print("[1단계] 목표 조업도 (월별 전체 부하/능력)")
for m in months:
    print(f"  {m:2d}월: {target_rate[m]*100:6.1f}%   "
          f"(부하합 {total_load_pm[m]:>6,} / 능력합 {total_cap_pm[m]:>6,})")
print()
print(f"[2단계] T + 대/중 → 기준계획작업장 : {n_step2:,}건")
print(f"[3단계] T + 소 + 동일 → 부모블록   : {n_step3:,}건")
print()
print("[4단계] H+소 공수 월별 합산")
for m in months:
    if hso_mh_pm[m] > 0:
        print(f"  {m:2d}월: {hso_mh_pm[m]:>10,}")
print()
print("[5단계] area3~5 월별 잔여능력")
for m in months:
    if cap345_pm[m] != 0:
        print(f"  {m:2d}월: {remaining_cap_pm[m]:>8,}  (능력합 {cap345_pm[m]:>6,} - 이미지정 {assigned_345_pm[m]:>6,})")
print()
print("[6단계] 초과 월 (H+소 월공수 > 잔여능력 × 120%)")
header = f"  {'월':>3} {'H+소공수':>10} {'잔여능력':>10} {'120%한도':>10} {'초과액':>10} 상태"
print(header)
print("  " + "-" * (len(header)-2))
for row in overload_rows:
    state = "★ 초과" if row["is_over"] else "정상"
    print(f"  {row['month']:>3} {row['h_so_manhours']:>10,} {row['remaining_capacity']:>10,} "
          f"{row['threshold_120pct']:>10,} {row['excess']:>10,} {state}")
print()
print(f"[7단계] H+소 area3~5 라운드로빈 : 대상 {len(pool):,}건 중 {n_step7:,}건 배정")
print(f"[8단계] H+소 잔여 → '미지정'   : {n_step8:,}건")
print()
# 합계 검증
n_blank = sum(1 for v in final_ws if v is None)
n_area = sum(1 for v in final_ws if v in areas)
n_mz = sum(1 for v in final_ws if v == "미지정")
print(f"[합계 검증] area지정 {n_area:,} + 미지정 {n_mz:,} + 공란 {n_blank:,} = {n_area + n_mz + n_blank:,} (=10000)")
print()
print(f"2번 테이블: {df2.shape[0]}행 x {df2.shape[1]}열")
print(f"JSON 저장: {json_path}, blocks.json")

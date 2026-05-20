# -*- coding: utf-8 -*-
"""두 개의 데이터셋을 엑셀로 생성하고, 웹앱용 JSON을 내보낸다.

- 1번 테이블: 블록 1만 행 (착수일 + 최종작업장 배정 포함)
- 2번 테이블: 작업장 15 행 (월별 능력/부하/평균조업도)

[최종작업장 배정 로직]
 0. 최종작업장을 모두 비움
 1. 물성이 '대'/'중' → 기준계획작업장 (과부하 무시)
 2. 물성이 '소' + 선호작업장1=='동일' → 부모블록
 3. 물성이 '소' + H/T=='H' (위에서 미배정분) → 착수일 오름차순으로
    area3·4·5 라운드로빈 배정, 한 area라도 누적 공수가 1월 능력을
    초과하면 배정 종료
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
priorities = random.sample(range(1, 16), 15)  # 우선순위: 1~15 중복 없는 순열

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

# ===================================================================
# 1번 테이블 (블록, 1만 행)
# ===================================================================
N = 10000

# 블록명: m + 3자리 숫자 + 소문자 (중복 불가)
all_names = [f"m{n:03d}{c}" for n in range(1000) for c in string.ascii_lowercase]
block_names = random.sample(all_names, N)

props = [random.choice(["중", "대", "소"]) for _ in range(N)]

DONGIL_RATE = 0.20                       # 선호작업장1에 '동일'이 들어갈 비율
START_BASE = datetime.date(2026, 1, 1)   # 착수일 기준일 (~2026-02-28, +58일)

rows1 = []
for i in range(N):
    prop = props[i]
    # 부모블록: 물성이 '소'인 행에만 area1~15 랜덤, 그 외 행은 공란
    parent = random.choice(areas) if prop == "소" else None
    # 선호작업장 1~5: 한 행 안에서 서로 다른 작업장
    pref = random.sample(areas, 5)
    # 선호작업장1: 일부 행은 '동일' 텍스트로 대체
    pref1 = "동일" if random.random() < DONGIL_RATE else pref[0]
    # 착수일: 2026-01-01 ~ 2026-02-28 랜덤
    start_date = START_BASE + datetime.timedelta(days=random.randint(0, 58))
    rows1.append({
        "블록명": block_names[i],
        "물성": prop,
        "기준계획작업장": random.choice(areas),
        "H/T": random.choice(["H", "T"]),
        "공수": random.randint(10, 2500),
        "착수일": start_date,
        "부모블록": parent,
        "선호작업장1": pref1,
        "선호작업장2": pref[1],
        "선호작업장3": pref[2],
        "선호작업장4": pref[3],
        "선호작업장5": pref[4],
    })

# ===================================================================
# 최종작업장 배정
# ===================================================================
final_ws = [None] * N   # 0. 모두 비운 상태에서 시작

# 1. 물성 '대'/'중' → 기준계획작업장 (과부하 무시)
for i, r in enumerate(rows1):
    if r["물성"] in ("대", "중"):
        final_ws[i] = r["기준계획작업장"]

# 2. 물성 '소' + 선호작업장1=='동일' → 부모블록
for i, r in enumerate(rows1):
    if final_ws[i] is None and r["물성"] == "소" and r["선호작업장1"] == "동일":
        final_ws[i] = r["부모블록"]

# 3. 물성 '소' + H/T=='H' (미배정분) → 착수일 오름차순, area3·4·5 라운드로빈
step3_pool = sorted(
    (i for i in range(N)
     if final_ws[i] is None and rows1[i]["물성"] == "소" and rows1[i]["H/T"] == "H"),
    key=lambda i: rows1[i]["착수일"],
)
cycle = ["area3", "area4", "area5"]
jan_cap = {a: cap_by_area[a][1] for a in cycle}   # 각 area의 1월 능력
cum = {a: 0 for a in cycle}
step3_assigned = 0
for k, i in enumerate(step3_pool):
    area = cycle[k % 3]
    final_ws[i] = area
    cum[area] += rows1[i]["공수"]
    step3_assigned += 1
    if cum[area] > jan_cap[area]:   # 누적 공수가 1월 능력 초과 → 물량 배정 종료
        break

for i, r in enumerate(rows1):
    r["최종작업장"] = final_ws[i]

df1 = pd.DataFrame(rows1)
df1["착수일"] = pd.to_datetime(df1["착수일"])   # 엑셀 날짜 형식으로 출력
try:
    df1.to_excel("1번_블록테이블.xlsx", index=False)
    df1_excel_ok = True
except PermissionError:
    print("[경고] 1번_블록테이블.xlsx 가 열려 있어 엑셀 쓰기를 건너뜁니다. (JSON은 계속 생성)")
    df1_excel_ok = False

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
    # 평균조업도 컬럼에 백분율 표시 형식 적용 (0.90 -> 90%)
    wb = load_workbook("2번_작업장테이블.xlsx")
    ws = wb.active
    for col_name in df2.columns:
        if col_name.endswith("평균조업도"):
            letter = get_column_letter(df2.columns.get_loc(col_name) + 1)
            for r in range(2, ws.max_row + 1):
                ws[f"{letter}{r}"].number_format = "0%"
    wb.save("2번_작업장테이블.xlsx")
except PermissionError:
    print("[경고] 2번_작업장테이블.xlsx 가 열려 있어 엑셀 쓰기를 건너뜁니다. (JSON은 계속 생성)")

# ===================================================================
# 웹앱용 JSON 내보내기
# ===================================================================
assignment_summary = []
for a in areas:
    cnt = sum(1 for v in final_ws if v == a)
    mh = sum(rows1[i]["공수"] for i in range(N) if final_ws[i] == a)
    assignment_summary.append({"workshop": a, "blockCount": cnt, "totalManhours": mh})
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
}

os.makedirs(os.path.join("web", "src", "data"), exist_ok=True)
json_path = os.path.join("web", "src", "data", "data.json")
with open(json_path, "w", encoding="utf-8") as f:
    json.dump(web_data, f, ensure_ascii=False, indent=2)

# 블록 레벨 데이터 (웹앱에서 로직 재배정 시 사용)
blocks_data = [
    {
        "prop": r["물성"],
        "ht": r["H/T"],
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
n_big = sum(1 for r in rows1 if r["물성"] in ("대", "중"))
n_dongil = sum(1 for r in rows1 if r["물성"] == "소" and r["선호작업장1"] == "동일")
print(f"1번 테이블: {df1.shape[0]}행 x {df1.shape[1]}열")
print(f"  블록명 중복: {df1['블록명'].duplicated().sum()}  /  물성: {df1['물성'].value_counts().to_dict()}")
print(f"  착수일 범위: {df1['착수일'].min().date()} ~ {df1['착수일'].max().date()}")
print("  [최종작업장 배정]")
print(f"   1) 대/중 → 기준계획작업장 : {n_big}건")
print(f"   2) 소+동일 → 부모블록      : {n_dongil}건")
print(f"   3) 소+H 라운드로빈(area3~5): 대상 {len(step3_pool)}건 중 {step3_assigned}건 배정")
for a in cycle:
    print(f"        - {a}: 누적공수 {cum[a]:,} / 1월능력 {jan_cap[a]:,}")
print(f"   미배정(공란)               : {unassigned_count}건")
print(f"   합계 검증: {n_big + n_dongil + step3_assigned + unassigned_count} (=10000)")
print()
print(f"2번 테이블: {df2.shape[0]}행 x {df2.shape[1]}열")
print(f"JSON 저장: {json_path}")

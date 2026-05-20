# -*- coding: utf-8 -*-
"""두 개의 데이터셋을 엑셀로 생성하고, 웹앱용 JSON을 내보낸다.

[최종작업장 배정 로직]
 기존 1~8단계 + 신규 R1~R10 (자세히는 CLAUDE.md §5 참조)
"""
import os
import json
import random
import string
import datetime
from collections import defaultdict
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
# 1번 테이블 (블록, 1만 행)  —  블록명 형식 변경: 대문자+3자리+대문자
# ===================================================================
N = 10000

# 블록명 가중치 (규칙 매칭이 의미 있게 발생하도록)
FIRST_WEIGHTS = [('H', 0.30), ('D', 0.20), ('E', 0.15), ('F', 0.15)]
_others_first = [c for c in string.ascii_uppercase if c not in 'HDEF']
for c in _others_first:
    FIRST_WEIGHTS.append((c, 0.20 / len(_others_first)))
LAST_WEIGHTS = [('P', 0.30), ('S', 0.30)]
_others_last = [c for c in string.ascii_uppercase if c not in 'PS']
for c in _others_last:
    LAST_WEIGHTS.append((c, 0.40 / len(_others_last)))

_first_letters = [c for c, _ in FIRST_WEIGHTS]
_first_probs = [w for _, w in FIRST_WEIGHTS]
_last_letters = [c for c, _ in LAST_WEIGHTS]
_last_probs = [w for _, w in LAST_WEIGHTS]

seen = set()
block_names = []
while len(block_names) < N:
    c1 = random.choices(_first_letters, weights=_first_probs)[0]
    n = random.randint(0, 999)
    c2 = random.choices(_last_letters, weights=_last_probs)[0]
    name = f"{c1}{n:03d}{c2}"
    if name not in seen:
        seen.add(name)
        block_names.append(name)

props = [random.choice(["중", "대", "소"]) for _ in range(N)]

DONGIL_RATE = 0.20
START_BASE = datetime.date(2026, 1, 1)
START_RANGE_DAYS = 364   # 2026-01-01 ~ 2026-12-31 (비윤년 365일)

rows1 = []
for i in range(N):
    prop = props[i]
    parent = random.choice(areas) if prop == "소" else None
    pref = random.sample(areas, 5)
    pref1 = "동일" if random.random() < DONGIL_RATE else pref[0]
    start_date = START_BASE + datetime.timedelta(days=random.randint(0, START_RANGE_DAYS))
    rows1.append({
        "블록명": block_names[i],
        "물성": prop,
        "기준계획작업장": random.choice(areas),
        "H/T": random.choice(["H", "T"]),
        "JG": random.choice(["L", "D", "F"]),
        "PC": random.choice(["P", "C"]),
        "PRJ": random.choice(["A", "B", "C", "D"]),
        "PRJ_N": random.randint(1111, 1130),
        "공수": round(random.randint(10, 2500) / 23, 2),
        "착수일": start_date,
        "부모블록": parent,
        "선호작업장1": pref1,
        "선호작업장2": pref[1],
        "선호작업장3": pref[2],
        "선호작업장4": pref[3],
        "선호작업장5": pref[4],
    })

month_of = [r["착수일"].month for r in rows1]

# ===================================================================
# 최종작업장 배정 — 기존 1~8단계 + 신규 R1~R10
# ===================================================================
final_ws = [None] * N

# --- 단계 1: 목표 조업도 + 목표 공수 ---
total_load_pm = {m: sum(load_by_area[a][m] for a in areas) for m in months}
total_cap_pm = {m: sum(cap_by_area[a][m] for a in areas) for m in months}
target_rate = {m: total_load_pm[m] / total_cap_pm[m] for m in months}
target_mh = {a: {m: target_rate[m] * cap_by_area[a][m] for m in months} for a in areas}

# --- 단계 2: T + 대/중 → 기준계획작업장 ---
n_step2 = 0
for i, r in enumerate(rows1):
    if r["H/T"] == "T" and r["물성"] in ("대", "중"):
        final_ws[i] = r["기준계획작업장"]
        n_step2 += 1

# --- 단계 3: T + 소 + 동일 → 부모블록 ---
n_step3 = 0
for i, r in enumerate(rows1):
    if final_ws[i] is None and r["H/T"] == "T" and r["물성"] == "소" and r["선호작업장1"] == "동일":
        final_ws[i] = r["부모블록"]
        n_step3 += 1

# --- 단계 4: H+소 공수 월별 합산 (분석) ---
hso_mh_pm = {m: 0 for m in months}
for i, r in enumerate(rows1):
    if r["H/T"] == "H" and r["물성"] == "소":
        hso_mh_pm[month_of[i]] += r["공수"]

# --- 단계 5: area3~5 월별 잔여능력 (분석) ---
target_areas_357 = ["area3", "area4", "area5"]
cap345_pm = {m: sum(cap_by_area[a][m] for a in target_areas_357) for m in months}
assigned_345_pm = {m: 0 for m in months}
for i in range(N):
    if final_ws[i] in target_areas_357:
        assigned_345_pm[month_of[i]] += rows1[i]["공수"]
remaining_cap_pm = {m: cap345_pm[m] - assigned_345_pm[m] for m in months}

# --- 단계 6: 초과 검사 (분석) ---
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

# --- 단계 7: H+소 area3~5 라운드로빈 (월별 목표공수 한도) ---
pool_s7 = sorted(
    [i for i in range(N) if final_ws[i] is None and rows1[i]["물성"] == "소" and rows1[i]["H/T"] == "H"],
    key=lambda i: rows1[i]["착수일"]
)
month_cum_357 = {a: {m: 0 for m in months} for a in target_areas_357}
for i in range(N):
    if final_ws[i] in target_areas_357:
        month_cum_357[final_ws[i]][month_of[i]] += rows1[i]["공수"]

n_step7 = 0
next_idx = 0
for i in pool_s7:
    m = month_of[i]
    mh = rows1[i]["공수"]
    assigned_area = None
    for offset in range(3 - next_idx):
        a = target_areas_357[next_idx + offset]
        if month_cum_357[a][m] + mh > target_mh[a][m]:
            continue
        assigned_area = a
        month_cum_357[a][m] += mh
        final_ws[i] = a
        n_step7 += 1
        break
    next_idx = (target_areas_357.index(assigned_area) + 1) % 3 if assigned_area else 0

# --- 단계 8: H+소+공란 → '미지정' ---
n_step8 = 0
for i, r in enumerate(rows1):
    if final_ws[i] is None and r["H/T"] == "H" and r["물성"] == "소":
        final_ws[i] = "미지정"
        n_step8 += 1

# ===================================================================
# 신규 규칙 R1~R10  (헬퍼)
# ===================================================================
cum_per_area = {a: {m: 0 for m in months} for a in areas}
for i in range(N):
    if final_ws[i] in cum_per_area:
        cum_per_area[final_ws[i]][month_of[i]] += rows1[i]["공수"]

def assign_to(i, area):
    cum_per_area[area][month_of[i]] += rows1[i]["공수"]
    final_ws[i] = area

def group_fits(group_indices, area):
    monthly = defaultdict(float)
    for i in group_indices:
        monthly[month_of[i]] += rows1[i]["공수"]
    return all(cum_per_area[area][m] + monthly[m] <= target_mh[area][m] for m in monthly)

def assign_group(group_indices, area):
    for i in group_indices:
        assign_to(i, area)

def make_groups(pool, key_func):
    """key_func로 그룹화. 각 그룹은 착수일 asc. 그룹들은 그룹 내 최소 착수일 asc."""
    g = defaultdict(list)
    for i in pool:
        g[key_func(rows1[i])].append(i)
    for grp in g.values():
        grp.sort(key=lambda i: rows1[i]["착수일"])
    return sorted(g.values(), key=lambda grp: rows1[grp[0]]["착수일"])

def grouped_skip(pool, area, key=lambda r: (r["PRJ_N"], r["블록명"][:3])):
    """그룹화 → area 할당. 월별 목표공수 초과하는 그룹은 건너뛰고 다음 그룹 계속.
    한도 초과 area여도 다른 그룹·블록 처리는 멈추지 않음.
    Returns: (assigned_block_count, total_group_count, assigned_group_count)"""
    groups = make_groups(pool, key)
    cnt = 0
    grp_assigned = 0
    for grp in groups:
        if not group_fits(grp, area):
            continue   # 이 그룹만 건너뛰고 다음 그룹 시도
        assign_group(grp, area)
        cnt += len(grp)
        grp_assigned += 1
    return cnt, len(groups), grp_assigned

# --- R1: H + PRJ=A + 물성=중 + 블록명[:4] ∈ {D114, D174, D204} → AREA2 ---
TARGET_R1 = {"D114", "D174", "D204"}
pool_r1 = [i for i, r in enumerate(rows1) if final_ws[i] is None
           and r["H/T"] == "H" and r["PRJ"] == "A"
           and r["물성"] == "중" and r["블록명"][:4] in TARGET_R1]
n_r1 = 0
for i in pool_r1:
    assign_to(i, "area2")
    n_r1 += 1

# --- R2: H + 물성=중 + JG=F + 미배정 → AREA2 (착수일 asc, 월별 목표공수 한도) ---
pool_r2 = sorted(
    [i for i in range(N) if final_ws[i] is None
     and rows1[i]["H/T"] == "H" and rows1[i]["물성"] == "중" and rows1[i]["JG"] == "F"],
    key=lambda i: rows1[i]["착수일"]
)
n_r2 = 0
for i in pool_r2:
    m = month_of[i]
    if cum_per_area["area2"][m] + rows1[i]["공수"] > target_mh["area2"][m]:
        continue   # area2가 해당 월 목표공수 초과 → 이 블록은 건너뜀
    assign_to(i, "area2")
    n_r2 += 1

# --- R3: H + 물성=중 + 블록명[0]≠'H' + 블록명[:3] ∉ {E11, E51} + 미배정
#        → group(PRJ_N, 블록명[:3]),  AREA1 ↔ AREA6 교대 배정 ---
EXCLUDE_R3 = {"E11", "E51"}
pool_r3 = [i for i in range(N) if final_ws[i] is None
           and rows1[i]["H/T"] == "H" and rows1[i]["물성"] == "중"
           and rows1[i]["블록명"][0] != "H" and rows1[i]["블록명"][:3] not in EXCLUDE_R3]
groups_r3 = make_groups(pool_r3, lambda r: (r["PRJ_N"], r["블록명"][:3]))

next_area_r3 = "area1"
n_r3 = 0
n_r3_a1 = 0
n_r3_a6 = 0
n_r3_grp_assigned = 0
n_r3_grp_skipped = 0
for grp in groups_r3:
    primary = next_area_r3
    secondary = "area6" if primary == "area1" else "area1"
    if group_fits(grp, primary):
        assign_group(grp, primary)
        n_r3 += len(grp)
        if primary == "area1":
            n_r3_a1 += len(grp)
        else:
            n_r3_a6 += len(grp)
        n_r3_grp_assigned += 1
        next_area_r3 = secondary
    elif group_fits(grp, secondary):
        assign_group(grp, secondary)
        n_r3 += len(grp)
        if secondary == "area1":
            n_r3_a1 += len(grp)
        else:
            n_r3_a6 += len(grp)
        n_r3_grp_assigned += 1
        next_area_r3 = primary
    else:
        n_r3_grp_skipped += 1
        continue   # area1·6 모두 초과 → 이 그룹만 건너뜀

# --- R4: H + 대/중 + 블록명[0]='H' + 블록명[-1]='P' + 미배정 → group, AREA7 ---
pool_r4 = [i for i in range(N) if final_ws[i] is None
           and rows1[i]["H/T"] == "H" and rows1[i]["물성"] in ("대", "중")
           and rows1[i]["블록명"][0] == "H" and rows1[i]["블록명"][-1] == "P"]
n_r4, n_grp_r4, n_grp_r4_a = grouped_skip(pool_r4, "area7")

# --- R5: H + 대/중 + 블록명[0]='H' + 블록명[-1]='S' + 미배정 → group, AREA8 ---
pool_r5 = [i for i in range(N) if final_ws[i] is None
           and rows1[i]["H/T"] == "H" and rows1[i]["물성"] in ("대", "중")
           and rows1[i]["블록명"][0] == "H" and rows1[i]["블록명"][-1] == "S"]
n_r5, n_grp_r5, n_grp_r5_a = grouped_skip(pool_r5, "area8")

# --- R6: H + 대/중 + 블록명[:3] ∈ {E11, F51} + 블록명[-1]='P' + 미배정 → group, AREA9 ---
PREFIX_R6 = {"E11", "F51"}
pool_r6 = [i for i in range(N) if final_ws[i] is None
           and rows1[i]["H/T"] == "H" and rows1[i]["물성"] in ("대", "중")
           and rows1[i]["블록명"][:3] in PREFIX_R6 and rows1[i]["블록명"][-1] == "P"]
n_r6, n_grp_r6, n_grp_r6_a = grouped_skip(pool_r6, "area9")

# --- R7: H + 대/중 + 블록명[:3] ∈ {E11, F51} + 블록명[-1]='S' + 미배정 → group, AREA10 ---
pool_r7 = [i for i in range(N) if final_ws[i] is None
           and rows1[i]["H/T"] == "H" and rows1[i]["물성"] in ("대", "중")
           and rows1[i]["블록명"][:3] in PREFIX_R6 and rows1[i]["블록명"][-1] == "S"]
n_r7, n_grp_r7, n_grp_r7_a = grouped_skip(pool_r7, "area10")

# --- R8: H + 대/중 + 블록명[:3] ∈ {E11, F51} + 공란(R6/R7 미적용분) → AREA11 (개별, 착수일 asc) ---
pool_r8 = sorted(
    [i for i in range(N) if final_ws[i] is None
     and rows1[i]["H/T"] == "H" and rows1[i]["물성"] in ("대", "중")
     and rows1[i]["블록명"][:3] in PREFIX_R6],
    key=lambda i: rows1[i]["착수일"]
)
n_r8 = 0
for i in pool_r8:
    m = month_of[i]
    if cum_per_area["area11"][m] + rows1[i]["공수"] > target_mh["area11"][m]:
        continue   # area11 초과 → 이 블록만 건너뜀
    assign_to(i, "area11")
    n_r8 += 1

# --- R9: H + 대 + PC=P + 공란 → group(PRJ_N, 블록명[:3]), AREA12 ---
pool_r9 = [i for i in range(N) if final_ws[i] is None
           and rows1[i]["H/T"] == "H" and rows1[i]["물성"] == "대" and rows1[i]["PC"] == "P"]
n_r9, n_grp_r9, n_grp_r9_a = grouped_skip(pool_r9, "area12")

# --- R10: H + 공란 → AREA1, AREA2, AREA13 순차 (개별, 착수일 asc) ---
pool_r10 = sorted(
    [i for i in range(N) if final_ws[i] is None and rows1[i]["H/T"] == "H"],
    key=lambda i: rows1[i]["착수일"]
)
SEQ_R10 = ["area1", "area2", "area13"]
n_r10 = 0
n_r10_breakdown = {"area1": 0, "area2": 0, "area13": 0}
for i in pool_r10:
    m = month_of[i]
    for a in SEQ_R10:
        if cum_per_area[a][m] + rows1[i]["공수"] <= target_mh[a][m]:
            assign_to(i, a)
            n_r10 += 1
            n_r10_breakdown[a] += 1
            break
    # 세 area 모두 초과해도 다음 블록 시도 (이 블록은 그냥 건너뜀)

# 최종작업장 컬럼에 반영
for i, r in enumerate(rows1):
    r["최종작업장"] = final_ws[i]

# ===================================================================
# 엑셀 출력 (1번)
# ===================================================================
df1 = pd.DataFrame(rows1)
df1["착수일"] = pd.to_datetime(df1["착수일"])
try:
    df1.to_excel("1번_블록테이블.xlsx", index=False)
except PermissionError:
    print("[경고] 1번_블록테이블.xlsx 가 열려 있어 엑셀 쓰기를 건너뜁니다.")

# ===================================================================
# 엑셀 출력 (2번)
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
# 웹앱용 JSON
# ===================================================================
assignment_summary = []
for a in areas:
    cnt = sum(1 for v in final_ws if v == a)
    mh = sum(rows1[i]["공수"] for i in range(N) if final_ws[i] == a)
    assignment_summary.append({"workshop": a, "blockCount": cnt, "totalManhours": round(mh, 2)})
mz_cnt = sum(1 for v in final_ws if v == "미지정")
mz_mh = sum(rows1[i]["공수"] for i in range(N) if final_ws[i] == "미지정")
assignment_summary.append({"workshop": "미지정", "blockCount": mz_cnt, "totalManhours": round(mz_mh, 2)})
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
    "targetRate": [target_rate[m] for m in months],
    "targetManhours": {a: [target_mh[a][m] for m in months] for a in areas},
    "overloadTable": overload_rows,
    "stepCounts": {
        "step2": n_step2, "step3": n_step3, "step7": n_step7, "step8": n_step8,
        "r1": n_r1, "r2": n_r2, "r3": n_r3, "r4": n_r4, "r5": n_r5,
        "r6": n_r6, "r7": n_r7, "r8": n_r8, "r9": n_r9, "r10": n_r10,
    },
    # 검증용 상세 — 각 단계/규칙별 후보·배정·미배정·세부 분포
    "stepDetails": [
        {"code": "단계 2", "cond": "H/T=T  AND  물성∈{대,중}",
         "target": "기준계획작업장", "pool": n_step2, "assigned": n_step2,
         "skipped": 0, "note": "한도 검사 없음"},
        {"code": "단계 3", "cond": "H/T=T  AND  물성=소  AND  선호1='동일'",
         "target": "부모블록", "pool": n_step3, "assigned": n_step3,
         "skipped": 0, "note": "한도 검사 없음"},
        {"code": "단계 7", "cond": "H/T=H  AND  물성=소  (미배정)",
         "target": "area3·4·5 라운드로빈", "pool": len(pool_s7), "assigned": n_step7,
         "skipped": len(pool_s7) - n_step7, "note": "월별 목표공수 한도"},
        {"code": "단계 8", "cond": "H/T=H  AND  물성=소  잔여",
         "target": "'미지정'", "pool": n_step8, "assigned": n_step8,
         "skipped": 0, "note": "잔여 일괄 처리"},
        {"code": "R1", "cond": "H+PRJ=A+물성=중+첫4∈{D114,D174,D204}",
         "target": "area2", "pool": len(pool_r1), "assigned": n_r1,
         "skipped": 0, "note": "직접 배정 (한도 없음)"},
        {"code": "R2", "cond": "H+물성=중+JG=F",
         "target": "area2", "pool": len(pool_r2), "assigned": n_r2,
         "skipped": len(pool_r2) - n_r2, "note": "착수일 asc, 월별 한도"},
        {"code": "R3", "cond": "H+물성=중+첫≠H+첫3∉{E11,E51}",
         "target": "area1↔area6 (그룹)", "pool": len(pool_r3), "assigned": n_r3,
         "skipped": len(pool_r3) - n_r3,
         "note": f"area1: {n_r3_a1}, area6: {n_r3_a6}  /  그룹 {n_r3_grp_assigned}건 배정/{n_r3_grp_skipped}건 건너뜀"},
        {"code": "R4", "cond": "H+대중+첫=H+끝=P",
         "target": "area7 (그룹)", "pool": len(pool_r4), "assigned": n_r4,
         "skipped": len(pool_r4) - n_r4,
         "note": f"그룹 {n_grp_r4_a}/{n_grp_r4}"},
        {"code": "R5", "cond": "H+대중+첫=H+끝=S",
         "target": "area8 (그룹)", "pool": len(pool_r5), "assigned": n_r5,
         "skipped": len(pool_r5) - n_r5,
         "note": f"그룹 {n_grp_r5_a}/{n_grp_r5}"},
        {"code": "R6", "cond": "H+대중+첫3∈{E11,F51}+끝=P",
         "target": "area9 (그룹)", "pool": len(pool_r6), "assigned": n_r6,
         "skipped": len(pool_r6) - n_r6,
         "note": f"그룹 {n_grp_r6_a}/{n_grp_r6}"},
        {"code": "R7", "cond": "H+대중+첫3∈{E11,F51}+끝=S",
         "target": "area10 (그룹)", "pool": len(pool_r7), "assigned": n_r7,
         "skipped": len(pool_r7) - n_r7,
         "note": f"그룹 {n_grp_r7_a}/{n_grp_r7}"},
        {"code": "R8", "cond": "H+대중+첫3∈{E11,F51} 잔여",
         "target": "area11", "pool": len(pool_r8), "assigned": n_r8,
         "skipped": len(pool_r8) - n_r8, "note": "착수일 asc, 월별 한도"},
        {"code": "R9", "cond": "H+물성=대+PC=P",
         "target": "area12 (그룹)", "pool": len(pool_r9), "assigned": n_r9,
         "skipped": len(pool_r9) - n_r9,
         "note": f"그룹 {n_grp_r9_a}/{n_grp_r9}"},
        {"code": "R10", "cond": "H + 잔여 (catch-all)",
         "target": "area1·2·13 순차", "pool": len(pool_r10), "assigned": n_r10,
         "skipped": len(pool_r10) - n_r10,
         "note": f"area1: {n_r10_breakdown['area1']}, area2: {n_r10_breakdown['area2']}, area13: {n_r10_breakdown['area13']}"},
    ],
}

os.makedirs(os.path.join("web", "src", "data"), exist_ok=True)
with open(os.path.join("web", "src", "data", "data.json"), "w", encoding="utf-8") as f:
    json.dump(web_data, f, ensure_ascii=False, indent=2)

blocks_data = [
    {
        "prop": r["물성"], "ht": r["H/T"], "jg": r["JG"], "pc": r["PC"],
        "prj": r["PRJ"], "prjN": r["PRJ_N"],
        "pref1": r["선호작업장1"], "ref": r["기준계획작업장"], "parent": r["부모블록"],
        "mh": r["공수"], "date": r["착수일"].strftime("%Y-%m-%d"),
        "name": r["블록명"],
    }
    for r in rows1
]
with open(os.path.join("web", "src", "data", "blocks.json"), "w", encoding="utf-8") as f:
    json.dump(blocks_data, f, ensure_ascii=False, separators=(",", ":"))

# ===================================================================
# 검증 출력
# ===================================================================
print(f"1번 테이블: {df1.shape[0]}행 x {df1.shape[1]}열")
print(f"  물성 분포: {df1['물성'].value_counts().to_dict()}")
print(f"  블록명 첫자 상위: {df1['블록명'].str[0].value_counts().head(6).to_dict()}")
print(f"  블록명 끝자 상위: {df1['블록명'].str[-1].value_counts().head(6).to_dict()}")
print()
print("[기존 단계]")
print(f"  단계 2 (T+대중)        : {n_step2:>5,}")
print(f"  단계 3 (T+소+동일)     : {n_step3:>5,}")
print(f"  단계 7 (H+소 RR)        : {n_step7:>5,}")
print(f"  단계 8 (H+소 → 미지정) : {n_step8:>5,}")
print()
print("[신규 규칙]")
print(f"  R1  H+PRJ=A+물성중+D114/174/204 → area2 : {n_r1:>5,}")
print(f"  R2  H+물성중+JG=F → area2                : {n_r2:>5,}")
print(f"  R3  H+물성중+나머지 그룹 → area1/6 교대  : {n_r3:>5,}")
print(f"  R4  H+대중+첫H+끝P → area7 (group)       : {n_r4:>5,}")
print(f"  R5  H+대중+첫H+끝S → area8 (group)       : {n_r5:>5,}")
print(f"  R6  H+대중+E11/F51+끝P → area9 (group)   : {n_r6:>5,}")
print(f"  R7  H+대중+E11/F51+끝S → area10 (group)  : {n_r7:>5,}")
print(f"  R8  H+대중+E11/F51 나머지 → area11       : {n_r8:>5,}")
print(f"  R9  H+대+PC=P → area12 (group)           : {n_r9:>5,}")
print(f"  R10 H+공란 → area1/2/13 순차             : {n_r10:>5,}")
print()
n_area = sum(1 for v in final_ws if v in areas)
n_mz = sum(1 for v in final_ws if v == "미지정")
n_blank = sum(1 for v in final_ws if v is None)
print(f"[합계 검증] area지정 {n_area:,} + 미지정 {n_mz:,} + 공란 {n_blank:,} = {n_area+n_mz+n_blank:,}")
print()
print("[작업장별 배정 (>0건만)]")
for a in areas:
    cnt = sum(1 for v in final_ws if v == a)
    if cnt > 0:
        print(f"  {a:>7}: {cnt:>5,}건")

# -*- coding: utf-8 -*-
"""두 개의 데이터셋을 엑셀로 생성하고, 웹앱용 JSON을 내보낸다.

[블록의 월별 공수 분배]
 · 착수일은 2026-01-01 ~ 2026-12-31 사이 랜덤
 · 종료일 = 착수일 + random(10~45)일, 2026-12-31로 cap
 · 착수일~종료일 사이의 워킹데이(Mon~Fri) 기준으로 공수를 각 월에 비례 분배
   monthly_mh[m] = 공수 × (그 월의 워킹데이 수) / (전체 워킹데이 수)

[최종작업장 배정 로직 — 기존 1~8단계 + 신규 R1~R10]
 한도 검사가 있는 모든 단계에서 블록이 걸치는 *모든* 월에 대해 한도를 확인.
 한 월이라도 초과하면 그 area에 배정 불가 (다음 area 시도 또는 건너뜀).
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
# 1번 테이블 (블록, 1만 행)
# ===================================================================
N = 10000

# 블록명: 대문자+3자리숫자+대문자 (가중치 적용)
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

# 20개 물성코드 (알파벳 2자) + 우선순위 1~20 매핑
PROP_CODE_COUNT = 20
_all_2letter = [f"{a}{b}" for a in string.ascii_uppercase for b in string.ascii_uppercase]
prop_codes = random.sample(_all_2letter, PROP_CODE_COUNT)
_priorities = list(range(1, PROP_CODE_COUNT + 1))
random.shuffle(_priorities)
prop_code_priority = dict(zip(prop_codes, _priorities))   # {"AB": 7, "FG": 12, ...}

DONGIL_RATE = 0.20
START_BASE = datetime.date(2026, 1, 1)
START_RANGE_DAYS = 364   # 2026-01-01 ~ 2026-12-31
DURATION_MIN = 10
DURATION_MAX = 45
END_OF_YEAR = datetime.date(2026, 12, 31)


def compute_monthly_mh(start_d, end_d, total_mh):
    """착수일~종료일 사이의 워킹데이(Mon~Fri)를 월별로 카운트하고
    공수를 비례 분배. 합이 정확히 total_mh가 되도록 마지막 월에 잔여 배분."""
    wd_by_month = defaultdict(int)
    cur = start_d
    while cur <= end_d:
        if cur.weekday() < 5:
            wd_by_month[cur.month] += 1
        cur += datetime.timedelta(days=1)
    total_wd = sum(wd_by_month.values())
    if total_wd == 0:
        return {start_d.month: round(total_mh, 4)}
    months_sorted = sorted(wd_by_month.keys())
    result = {}
    allocated = 0.0
    for m in months_sorted[:-1]:
        p = round(total_mh * wd_by_month[m] / total_wd, 4)
        result[m] = p
        allocated += p
    result[months_sorted[-1]] = round(total_mh - allocated, 4)
    return result


rows1 = []
for i in range(N):
    prop = props[i]
    parent = random.choice(areas) if prop == "소" else None
    pref = random.sample(areas, 5)
    pref1 = "동일" if random.random() < DONGIL_RATE else pref[0]
    start_date = START_BASE + datetime.timedelta(days=random.randint(0, START_RANGE_DAYS))
    duration = random.randint(DURATION_MIN, DURATION_MAX)
    end_date = min(start_date + datetime.timedelta(days=duration), END_OF_YEAR)
    mh_total = round(random.randint(10, 2500) / 23, 2)
    monthly_mh = compute_monthly_mh(start_date, end_date, mh_total)
    prop_code = random.choice(prop_codes)
    rows1.append({
        "블록명": block_names[i],
        "물성": prop,
        "기준계획작업장": random.choice(areas),
        "H/T": random.choice(["H", "T"]),
        "JG": random.choice(["L", "D", "F"]),
        "PC": random.choice(["P", "C"]),
        "PRJ": random.choice(["A", "B", "C", "D"]),
        "PRJ_N": random.randint(1111, 1130),
        "물성코드": prop_code,
        "우선순위": prop_code_priority[prop_code],
        "공수": mh_total,
        "착수일": start_date,
        "종료일": end_date,
        "부모블록": parent,
        "선호작업장1": pref1,
        "선호작업장2": pref[1],
        "선호작업장3": pref[2],
        "선호작업장4": pref[3],
        "선호작업장5": pref[4],
        "monthly_mh": monthly_mh,   # 내부용 (Excel에는 안 나감)
    })

month_of = [r["착수일"].month for r in rows1]   # 착수일 월 (참조용, 다중월 분배는 monthly_mh 사용)

# ===================================================================
# 최종작업장 배정 — 기존 1~8단계 + 신규 R1~R10
# ===================================================================
final_ws = [None] * N
assigned_by = [None] * N
pools_of_block = [[] for _ in range(N)]

# --- 단계 1: 목표 조업도 + 목표 공수 ---
total_load_pm = {m: sum(load_by_area[a][m] for a in areas) for m in months}
total_cap_pm = {m: sum(cap_by_area[a][m] for a in areas) for m in months}
target_rate = {m: total_load_pm[m] / total_cap_pm[m] for m in months}
target_mh = {a: {m: target_rate[m] * cap_by_area[a][m] for m in months} for a in areas}

# --- 단계 2: T + 대/중 → 기준계획작업장 (한도 무시) ---
n_step2 = 0
for i, r in enumerate(rows1):
    if r["H/T"] == "T" and r["물성"] in ("대", "중"):
        pools_of_block[i].append("단계 2")
        final_ws[i] = r["기준계획작업장"]
        assigned_by[i] = "단계 2"
        n_step2 += 1

# --- 단계 3: T + 소 + 동일 → 부모블록 (한도 무시) ---
n_step3 = 0
for i, r in enumerate(rows1):
    if final_ws[i] is None and r["H/T"] == "T" and r["물성"] == "소" and r["선호작업장1"] == "동일":
        pools_of_block[i].append("단계 3")
        final_ws[i] = r["부모블록"]
        assigned_by[i] = "단계 3"
        n_step3 += 1

# --- 단계 4: H+소 공수 월별 합산 (monthly_mh 기반) ---
hso_mh_pm = {m: 0.0 for m in months}
for i, r in enumerate(rows1):
    if r["H/T"] == "H" and r["물성"] == "소":
        for m, mh in r["monthly_mh"].items():
            hso_mh_pm[m] += mh

# --- 단계 5: area3~5 월별 잔여능력 ---
target_areas_357 = ["area3", "area4", "area5"]
cap345_pm = {m: sum(cap_by_area[a][m] for a in target_areas_357) for m in months}
assigned_345_pm = {m: 0.0 for m in months}
for i in range(N):
    if final_ws[i] in target_areas_357:
        for m, mh in rows1[i]["monthly_mh"].items():
            assigned_345_pm[m] += mh
remaining_cap_pm = {m: cap345_pm[m] - assigned_345_pm[m] for m in months}

# --- 단계 6: 초과 검사 ---
overload_rows = []
for m in months:
    threshold = remaining_cap_pm[m] * 1.2
    is_over = hso_mh_pm[m] > threshold
    overload_rows.append({
        "month": m,
        "h_so_manhours": round(hso_mh_pm[m], 2),
        "remaining_capacity": round(remaining_cap_pm[m], 2),
        "threshold_120pct": round(threshold, 2),
        "excess": round(hso_mh_pm[m] - threshold, 2) if is_over else 0,
        "is_over": is_over,
    })

# --- 단계 7: H+소 area3~5 라운드로빈 (월별 목표공수 한도, 다중월 검사) ---
pool_s7 = sorted(
    [i for i in range(N) if final_ws[i] is None and rows1[i]["물성"] == "소" and rows1[i]["H/T"] == "H"],
    key=lambda i: rows1[i]["착수일"]
)
for i in pool_s7:
    pools_of_block[i].append("단계 7")
month_cum_357 = {a: {m: 0.0 for m in months} for a in target_areas_357}
for i in range(N):
    if final_ws[i] in target_areas_357:
        for m, mh in rows1[i]["monthly_mh"].items():
            month_cum_357[final_ws[i]][m] += mh

step7_last_assigned = {a: {m: None for m in months} for a in target_areas_357}

n_step7 = 0
next_idx = 0
for i in pool_s7:
    block_monthly = rows1[i]["monthly_mh"]
    assigned_area = None
    for offset in range(3 - next_idx):
        a = target_areas_357[next_idx + offset]
        # 다중월 검사: 블록이 걸친 모든 월에서 한도 충족 필요
        if any(month_cum_357[a][m] + mh > target_mh[a][m] for m, mh in block_monthly.items()):
            continue
        assigned_area = a
        for m, mh in block_monthly.items():
            month_cum_357[a][m] += mh
            step7_last_assigned[a][m] = i
        final_ws[i] = a
        assigned_by[i] = "단계 7"
        n_step7 += 1
        break
    next_idx = (target_areas_357.index(assigned_area) + 1) % 3 if assigned_area else 0

# --- 단계 8: H+소+공란 → '미지정' ---
pool_s8 = [i for i, r in enumerate(rows1) if final_ws[i] is None and r["H/T"] == "H" and r["물성"] == "소"]
for i in pool_s8:
    pools_of_block[i].append("단계 8")
n_step8 = 0
for i in pool_s8:
    final_ws[i] = "미지정"
    assigned_by[i] = "단계 8"
    n_step8 += 1

# ===================================================================
# 신규 규칙 R1~R10 (헬퍼)
# ===================================================================
cum_per_area = {a: {m: 0.0 for m in months} for a in areas}
for i in range(N):
    if final_ws[i] in cum_per_area:
        for m, mh in rows1[i]["monthly_mh"].items():
            cum_per_area[final_ws[i]][m] += mh

def block_fits(i, area):
    """블록이 area의 모든 월에 들어갈 수 있는지 (다중월 한도 검사)"""
    for m, mh in rows1[i]["monthly_mh"].items():
        if cum_per_area[area][m] + mh > target_mh[area][m]:
            return False
    return True

def assign_to(i, area, step_code=None):
    for m, mh in rows1[i]["monthly_mh"].items():
        cum_per_area[area][m] += mh
    final_ws[i] = area
    if step_code is not None:
        assigned_by[i] = step_code

def group_monthly_total(group_indices):
    """그룹의 월별 합산 공수"""
    monthly = defaultdict(float)
    for i in group_indices:
        for m, mh in rows1[i]["monthly_mh"].items():
            monthly[m] += mh
    return monthly

def group_fits(group_indices, area):
    monthly = group_monthly_total(group_indices)
    return all(cum_per_area[area][m] + mh <= target_mh[area][m] for m, mh in monthly.items())

def assign_group(group_indices, area, step_code=None):
    for i in group_indices:
        assign_to(i, area, step_code)

def make_groups(pool, key_func):
    g = defaultdict(list)
    for i in pool:
        g[key_func(rows1[i])].append(i)
    for grp in g.values():
        grp.sort(key=lambda i: rows1[i]["착수일"])
    return sorted(g.values(), key=lambda grp: rows1[grp[0]]["착수일"])

def grouped_skip(pool, area, step_code=None, key=lambda r: (r["PRJ_N"], r["블록명"][:3])):
    groups = make_groups(pool, key)
    cnt = 0
    grp_assigned = 0
    for grp in groups:
        if not group_fits(grp, area):
            continue
        assign_group(grp, area, step_code)
        cnt += len(grp)
        grp_assigned += 1
    return cnt, len(groups), grp_assigned

# --- R1 ---
TARGET_R1 = {"D114", "D174", "D204"}
pool_r1 = [i for i, r in enumerate(rows1) if final_ws[i] is None
           and r["H/T"] == "H" and r["PRJ"] == "A"
           and r["물성"] == "중" and r["블록명"][:4] in TARGET_R1]
for i in pool_r1:
    pools_of_block[i].append("R1")
n_r1 = 0
for i in pool_r1:
    assign_to(i, "area2", "R1")
    n_r1 += 1

# --- R2 ---
pool_r2 = sorted(
    [i for i in range(N) if final_ws[i] is None
     and rows1[i]["H/T"] == "H" and rows1[i]["물성"] == "중" and rows1[i]["JG"] == "F"],
    key=lambda i: rows1[i]["착수일"]
)
for i in pool_r2:
    pools_of_block[i].append("R2")
n_r2 = 0
for i in pool_r2:
    if not block_fits(i, "area2"):
        continue
    assign_to(i, "area2", "R2")
    n_r2 += 1

# --- R3 ---
EXCLUDE_R3 = {"E11", "E51"}
pool_r3 = [i for i in range(N) if final_ws[i] is None
           and rows1[i]["H/T"] == "H" and rows1[i]["물성"] == "중"
           and rows1[i]["블록명"][0] != "H" and rows1[i]["블록명"][:3] not in EXCLUDE_R3]
for i in pool_r3:
    pools_of_block[i].append("R3")
groups_r3 = make_groups(pool_r3, lambda r: (r["PRJ_N"], r["블록명"][:3]))

R3_CYCLE = ["area1", "area2", "area6"]   # 3개 area 라운드로빈 (그룹 단위)
next_idx_r3 = 0
n_r3 = 0
n_r3_per_area = {a: 0 for a in R3_CYCLE}
n_r3_grp_assigned = 0
n_r3_grp_skipped = 0
for grp in groups_r3:
    assigned_area = None
    for offset in range(len(R3_CYCLE)):
        idx = (next_idx_r3 + offset) % len(R3_CYCLE)
        area = R3_CYCLE[idx]
        if group_fits(grp, area):
            assign_group(grp, area, "R3")
            n_r3 += len(grp)
            n_r3_per_area[area] += len(grp)
            n_r3_grp_assigned += 1
            next_idx_r3 = (idx + 1) % len(R3_CYCLE)
            assigned_area = area
            break
    if assigned_area is None:
        n_r3_grp_skipped += 1

# --- R4~R7, R9 (grouped) ---
pool_r4 = [i for i in range(N) if final_ws[i] is None
           and rows1[i]["H/T"] == "H" and rows1[i]["물성"] in ("대", "중")
           and rows1[i]["블록명"][0] == "H" and rows1[i]["블록명"][-1] == "P"]
for i in pool_r4:
    pools_of_block[i].append("R4")
n_r4, n_grp_r4, n_grp_r4_a = grouped_skip(pool_r4, "area7", "R4")

pool_r5 = [i for i in range(N) if final_ws[i] is None
           and rows1[i]["H/T"] == "H" and rows1[i]["물성"] in ("대", "중")
           and rows1[i]["블록명"][0] == "H" and rows1[i]["블록명"][-1] == "S"]
for i in pool_r5:
    pools_of_block[i].append("R5")
n_r5, n_grp_r5, n_grp_r5_a = grouped_skip(pool_r5, "area8", "R5")

PREFIX_R6 = {"E11", "F51"}
pool_r6 = [i for i in range(N) if final_ws[i] is None
           and rows1[i]["H/T"] == "H" and rows1[i]["물성"] in ("대", "중")
           and rows1[i]["블록명"][:3] in PREFIX_R6 and rows1[i]["블록명"][-1] == "P"]
for i in pool_r6:
    pools_of_block[i].append("R6")
n_r6, n_grp_r6, n_grp_r6_a = grouped_skip(pool_r6, "area9", "R6")

pool_r7 = [i for i in range(N) if final_ws[i] is None
           and rows1[i]["H/T"] == "H" and rows1[i]["물성"] in ("대", "중")
           and rows1[i]["블록명"][:3] in PREFIX_R6 and rows1[i]["블록명"][-1] == "S"]
for i in pool_r7:
    pools_of_block[i].append("R7")
n_r7, n_grp_r7, n_grp_r7_a = grouped_skip(pool_r7, "area10", "R7")

# --- R8 ---
pool_r8 = sorted(
    [i for i in range(N) if final_ws[i] is None
     and rows1[i]["H/T"] == "H" and rows1[i]["물성"] in ("대", "중")
     and rows1[i]["블록명"][:3] in PREFIX_R6],
    key=lambda i: rows1[i]["착수일"]
)
for i in pool_r8:
    pools_of_block[i].append("R8")
n_r8 = 0
for i in pool_r8:
    if not block_fits(i, "area11"):
        continue
    assign_to(i, "area11", "R8")
    n_r8 += 1

# --- R9 ---
pool_r9 = [i for i in range(N) if final_ws[i] is None
           and rows1[i]["H/T"] == "H" and rows1[i]["물성"] == "대" and rows1[i]["PC"] == "P"]
for i in pool_r9:
    pools_of_block[i].append("R9")
n_r9, n_grp_r9, n_grp_r9_a = grouped_skip(pool_r9, "area12", "R9")

# --- R10 ---
pool_r10 = sorted(
    [i for i in range(N) if final_ws[i] is None and rows1[i]["H/T"] == "H"],
    key=lambda i: rows1[i]["착수일"]
)
for i in pool_r10:
    pools_of_block[i].append("R10")
SEQ_R10 = ["area7", "area8", "area9", "area10", "area12", "area13", "area14"]
n_r10 = 0
n_r10_breakdown = {a: 0 for a in SEQ_R10}
for i in pool_r10:
    for a in SEQ_R10:
        if not block_fits(i, a):
            continue
        assign_to(i, a, "R10")
        n_r10 += 1
        n_r10_breakdown[a] += 1
        break

# --- R11: T+소+공란 → 테이블2 우선순위순 작업장에 선호1~5 매칭으로 배정 ---
#  · pool: T+소+공란 (현재까지 미배정)
#  · 테이블2 우선순위 1번 작업장부터 15번까지 순회
#  · 각 작업장 W에 대해 선호작업장1 ~ 선호작업장5 순서로:
#      - 후보 = pool에서 미배정 + 선호N == W 인 블록
#      - (PRJ_N, 블록명, 물성코드)로 그룹화
#      - 그룹을 테이블1 우선순위 ASC(1=최우선)로 정렬
#      - 각 그룹: 다중월 한도 통과 시 W로 배정, 초과 시 건너뜀(continue)
#  · 5개 선호 모두 끝나면 다음 우선순위 작업장으로
pool_r11 = [i for i in range(N) if final_ws[i] is None
            and rows1[i]["H/T"] == "T" and rows1[i]["물성"] == "소"]
for i in pool_r11:
    pools_of_block[i].append("R11")

ws_sorted_by_priority = sorted(ws_data, key=lambda w: w["우선순위"])   # 1 = 최우선

n_r11 = 0
r11_per_area = defaultdict(int)
r11_per_pref = defaultdict(lambda: defaultdict(int))   # area -> {pref_idx: count}

for ws in ws_sorted_by_priority:
    area = ws["작업장"]
    for pref_idx in [1, 2, 3, 4, 5]:
        pref_col = f"선호작업장{pref_idx}"
        candidates = [i for i in pool_r11
                      if final_ws[i] is None and rows1[i][pref_col] == area]
        if not candidates:
            continue
        # (PRJ_N, 블록명, 물성코드) 그룹화 — 블록명 고유이므로 그룹은 사실상 1블록 단위
        groups = defaultdict(list)
        for i in candidates:
            groups[(rows1[i]["PRJ_N"], rows1[i]["블록명"], rows1[i]["물성코드"])].append(i)
        # 그룹 정렬: 테이블1 우선순위 ASC (1 = 최우선)
        sorted_groups = sorted(groups.values(),
                               key=lambda g: min(rows1[i]["우선순위"] for i in g))
        for grp in sorted_groups:
            if group_fits(grp, area):
                assign_group(grp, area, "R11")
                n_r11 += len(grp)
                r11_per_area[area] += len(grp)
                r11_per_pref[area][pref_idx] += len(grp)
            # else: 이 그룹 건너뛰고 다음 그룹 시도 (다른 월에 fit 가능한 작은 그룹 있을 수 있음)

# 최종작업장 컬럼에 반영
for i, r in enumerate(rows1):
    r["최종작업장"] = final_ws[i]

# ===================================================================
# 엑셀 출력 (1번) — 18열 (종료일 추가)
# ===================================================================
df1 = pd.DataFrame([{k: v for k, v in r.items() if k != "monthly_mh"} for r in rows1])
df1["착수일"] = pd.to_datetime(df1["착수일"])
df1["종료일"] = pd.to_datetime(df1["종료일"])
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
# stepDetails 생성용 헬퍼
# ===================================================================
def _last_date_iso(code):
    dates = [rows1[i]["착수일"] for i in range(N) if assigned_by[i] == code]
    return max(dates).isoformat() if dates else None

def _build_step7_monthly():
    rows = []
    for a in target_areas_357:
        months_data = []
        for m in months:
            target = round(target_mh[a][m], 2)
            cum = round(month_cum_357[a][m], 2)
            util = round(cum / target * 100, 1) if target > 0 else 0
            idx = step7_last_assigned[a][m]
            last_block = None
            if idx is not None:
                last_block = {
                    "name": rows1[idx]["블록명"],
                    "date": rows1[idx]["착수일"].isoformat(),
                    "mh": rows1[idx]["공수"],
                }
            months_data.append({
                "month": m, "target": target, "cum": cum,
                "util": util, "lastBlock": last_block,
            })
        rows.append({"area": a, "months": months_data})
    return rows

def _subrows_by_area(code, area_list, skip_empty=False):
    rows = []
    for a in area_list:
        idxs = [i for i in range(N) if assigned_by[i] == code and final_ws[i] == a]
        annual_target = round(sum(target_mh[a][m] for m in months), 2)
        if not idxs:
            if skip_empty:
                continue
            rows.append({"target": a, "assigned": 0, "mh": 0.0, "first": None,
                         "last": None, "annualTarget": annual_target, "util": 0.0})
            continue
        mh_sum = round(sum(rows1[i]["공수"] for i in idxs), 2)
        dates = [rows1[i]["착수일"] for i in idxs]
        rows.append({
            "target": a, "assigned": len(idxs), "mh": mh_sum,
            "first": min(dates).isoformat(), "last": max(dates).isoformat(),
            "annualTarget": annual_target,
            "util": round(mh_sum / annual_target * 100, 1) if annual_target > 0 else 0.0,
        })
    return rows

# ===================================================================
# 배정결과 기준 작업장별 월별 공수 (monthly_mh 분배 합산)
# ===================================================================
assigned_mh_pm = {a: {m: 0.0 for m in months} for a in areas}
for i in range(N):
    fa = final_ws[i]
    if fa in assigned_mh_pm:
        for m, mh in rows1[i]["monthly_mh"].items():
            assigned_mh_pm[fa][m] += mh

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
            "actualLoad": [round(assigned_mh_pm[w["작업장"]][m], 2) for m in months],
            "actualOperationRate": [
                round(assigned_mh_pm[w["작업장"]][m] / w["능력"][m], 4)
                if w["능력"][m] > 0 else 0
                for m in months
            ],
        }
        for w in ws_data
    ],
    "assignment": assignment_summary,
    "targetRate": [target_rate[m] for m in months],
    "targetManhours": {a: [target_mh[a][m] for m in months] for a in areas},
    "overloadTable": overload_rows,
    "step7Monthly": _build_step7_monthly(),
    "stepCounts": {
        "step2": n_step2, "step3": n_step3, "step7": n_step7, "step8": n_step8,
        "r1": n_r1, "r2": n_r2, "r3": n_r3, "r4": n_r4, "r5": n_r5,
        "r6": n_r6, "r7": n_r7, "r8": n_r8, "r9": n_r9, "r10": n_r10,
        "r11": n_r11,
    },
    "stepDetails": [
        {"code": "단계 2", "cond": "H/T=T  AND  물성∈{대,중}",
         "target": "기준계획작업장", "pool": n_step2, "assigned": n_step2,
         "skipped": 0, "note": "한도 검사 없음", "lastAssigned": _last_date_iso("단계 2")},
        {"code": "단계 3", "cond": "H/T=T  AND  물성=소  AND  선호1='동일'",
         "target": "부모블록", "pool": n_step3, "assigned": n_step3,
         "skipped": 0, "note": "한도 검사 없음", "lastAssigned": _last_date_iso("단계 3")},
        {"code": "단계 7", "cond": "H/T=H  AND  물성=소  (미배정)",
         "target": "area3·4·5 라운드로빈", "pool": len(pool_s7), "assigned": n_step7,
         "skipped": len(pool_s7) - n_step7,
         "note": "다중월 한도 (블록 걸친 모든 월 검사)",
         "lastAssigned": _last_date_iso("단계 7"),
         "subRows": _subrows_by_area("단계 7", target_areas_357)},
        {"code": "단계 8", "cond": "H/T=H  AND  물성=소  잔여",
         "target": "'미지정'", "pool": n_step8, "assigned": n_step8,
         "skipped": 0, "note": "잔여 일괄 처리", "lastAssigned": _last_date_iso("단계 8")},
        {"code": "R1", "cond": "H+PRJ=A+물성=중+첫4∈{D114,D174,D204}",
         "target": "area2", "pool": len(pool_r1), "assigned": n_r1,
         "skipped": 0, "note": "직접 배정 (한도 없음)", "lastAssigned": _last_date_iso("R1")},
        {"code": "R2", "cond": "H+물성=중+JG=F",
         "target": "area2", "pool": len(pool_r2), "assigned": n_r2,
         "skipped": len(pool_r2) - n_r2,
         "note": "착수일 asc, 다중월 한도", "lastAssigned": _last_date_iso("R2")},
        {"code": "R3", "cond": "H+물성=중+첫≠H+첫3∉{E11,E51}",
         "target": "area1·2·6 (그룹 라운드로빈)", "pool": len(pool_r3), "assigned": n_r3,
         "skipped": len(pool_r3) - n_r3,
         "note": f"그룹 {n_r3_grp_assigned}건 배정 / {n_r3_grp_skipped}건 건너뜀 · 3-way 순환",
         "lastAssigned": _last_date_iso("R3"),
         "subRows": _subrows_by_area("R3", R3_CYCLE)},
        {"code": "R4", "cond": "H+대중+첫=H+끝=P",
         "target": "area7 (그룹)", "pool": len(pool_r4), "assigned": n_r4,
         "skipped": len(pool_r4) - n_r4,
         "note": f"그룹 {n_grp_r4_a}/{n_grp_r4}", "lastAssigned": _last_date_iso("R4")},
        {"code": "R5", "cond": "H+대중+첫=H+끝=S",
         "target": "area8 (그룹)", "pool": len(pool_r5), "assigned": n_r5,
         "skipped": len(pool_r5) - n_r5,
         "note": f"그룹 {n_grp_r5_a}/{n_grp_r5}", "lastAssigned": _last_date_iso("R5")},
        {"code": "R6", "cond": "H+대중+첫3∈{E11,F51}+끝=P",
         "target": "area9 (그룹)", "pool": len(pool_r6), "assigned": n_r6,
         "skipped": len(pool_r6) - n_r6,
         "note": f"그룹 {n_grp_r6_a}/{n_grp_r6}", "lastAssigned": _last_date_iso("R6")},
        {"code": "R7", "cond": "H+대중+첫3∈{E11,F51}+끝=S",
         "target": "area10 (그룹)", "pool": len(pool_r7), "assigned": n_r7,
         "skipped": len(pool_r7) - n_r7,
         "note": f"그룹 {n_grp_r7_a}/{n_grp_r7}", "lastAssigned": _last_date_iso("R7")},
        {"code": "R8", "cond": "H+대중+첫3∈{E11,F51} 잔여",
         "target": "area11", "pool": len(pool_r8), "assigned": n_r8,
         "skipped": len(pool_r8) - n_r8,
         "note": "착수일 asc, 다중월 한도", "lastAssigned": _last_date_iso("R8")},
        {"code": "R9", "cond": "H+물성=대+PC=P",
         "target": "area12 (그룹)", "pool": len(pool_r9), "assigned": n_r9,
         "skipped": len(pool_r9) - n_r9,
         "note": f"그룹 {n_grp_r9_a}/{n_grp_r9}", "lastAssigned": _last_date_iso("R9")},
        {"code": "R10", "cond": "H + 잔여 (catch-all)",
         "target": "area7·8·9·10·12·13·14 순차", "pool": len(pool_r10), "assigned": n_r10,
         "skipped": len(pool_r10) - n_r10,
         "note": "한 블록당 area7→8→9→10→12→13→14 순서 시도",
         "lastAssigned": _last_date_iso("R10"),
         "subRows": _subrows_by_area("R10", SEQ_R10)},
        {"code": "R11", "cond": "T+소+공란 (선호1~5 = 우선순위순 작업장)",
         "target": "우선순위 1→15 작업장 × 선호1~5 순회",
         "pool": len(pool_r11), "assigned": n_r11,
         "skipped": len(pool_r11) - n_r11,
         "note": "그룹: (PRJ_N, 블록명, 물성코드) · 테이블1 우선순위 ASC · 한도 초과 그룹은 건너뜀",
         "lastAssigned": _last_date_iso("R11"),
         "subRows": _subrows_by_area("R11", [w["작업장"] for w in ws_sorted_by_priority], skip_empty=True)},
    ],
}

os.makedirs(os.path.join("web", "src", "data"), exist_ok=True)
with open(os.path.join("web", "src", "data", "data.json"), "w", encoding="utf-8") as f:
    json.dump(web_data, f, ensure_ascii=False, indent=2)

# 블록 레벨 데이터 (웹앱용)
blocks_data = []
for idx, r in enumerate(rows1):
    blocks_data.append({
        "name": r["블록명"],
        "prop": r["물성"],
        "ref": r["기준계획작업장"],
        "ht": r["H/T"],
        "jg": r["JG"], "pc": r["PC"], "prj": r["PRJ"], "prjN": r["PRJ_N"],
        "propCode": r["물성코드"], "propPriority": r["우선순위"],
        "mh": r["공수"],
        "date": r["착수일"].strftime("%Y-%m-%d"),
        "endDate": r["종료일"].strftime("%Y-%m-%d"),
        "monthlyMh": {str(m): round(v, 2) for m, v in r["monthly_mh"].items()},
        "parent": r["부모블록"],
        "pref1": r["선호작업장1"], "pref2": r["선호작업장2"], "pref3": r["선호작업장3"],
        "pref4": r["선호작업장4"], "pref5": r["선호작업장5"],
        "finalWs": final_ws[idx],
        "assignedBy": assigned_by[idx],
        "pools": pools_of_block[idx],
    })
with open(os.path.join("web", "src", "data", "blocks.json"), "w", encoding="utf-8") as f:
    json.dump(blocks_data, f, ensure_ascii=False, separators=(",", ":"))

# ===================================================================
# 검증 출력
# ===================================================================
print(f"1번 테이블: {df1.shape[0]}행 x {df1.shape[1]}열")
print(f"  착수일: {df1['착수일'].min().date()} ~ {df1['착수일'].max().date()}")
print(f"  종료일: {df1['종료일'].min().date()} ~ {df1['종료일'].max().date()}")

# 물성코드 ↔ 우선순위 매핑 + 블록 분포
print(f"  물성코드 매핑 (20개, 우선순위 1~20):")
mapping_sorted = sorted(prop_code_priority.items(), key=lambda kv: kv[1])
code_dist = df1['물성코드'].value_counts().to_dict()
for code, prio in mapping_sorted:
    cnt = code_dist.get(code, 0)
    print(f"    [{prio:>2}] {code} → {cnt:,}개 블록")

# 월별 분포 평균 검증
month_counts = defaultdict(int)
total_blocks_with_multi_month = 0
for r in rows1:
    n_months = len(r["monthly_mh"])
    month_counts[n_months] += 1
    if n_months > 1:
        total_blocks_with_multi_month += 1
print(f"  블록이 걸친 월 수 분포: {dict(month_counts)}")
print(f"  다중월 블록: {total_blocks_with_multi_month:,} ({total_blocks_with_multi_month/N*100:.1f}%)")
print()
print("[기존 단계]")
print(f"  단계 2 (T+대중)        : {n_step2:>5,}")
print(f"  단계 3 (T+소+동일)     : {n_step3:>5,}")
print(f"  단계 7 (H+소 RR)        : {n_step7:>5,}")
print(f"  단계 8 (H+소 → 미지정) : {n_step8:>5,}")
print()
print("[신규 규칙]")
print(f"  R1: {n_r1:>5,}  R2: {n_r2:>5,}  R3: {n_r3:>5,}  R4: {n_r4:>5,}  R5: {n_r5:>5,}")
print(f"  R6: {n_r6:>5,}  R7: {n_r7:>5,}  R8: {n_r8:>5,}  R9: {n_r9:>5,}  R10: {n_r10:>5,}")
print(f"  R11 (T+소+선호1~5 우선순위 매칭): {n_r11:,}건 / pool {len(pool_r11):,}건")
print(f"    작업장별 분포 (우선순위순, 선호별 breakdown):")
for ws in ws_sorted_by_priority:
    area = ws["작업장"]
    cnt = r11_per_area.get(area, 0)
    if cnt > 0:
        pref_str = ", ".join(f"선호{k}:{v}" for k, v in sorted(r11_per_pref[area].items()))
        print(f"      [우선순위 {ws['우선순위']:>2}] {area:>7}: {cnt:>4,}건  ({pref_str})")
print()
n_area = sum(1 for v in final_ws if v in areas)
n_mz = sum(1 for v in final_ws if v == "미지정")
n_blank = sum(1 for v in final_ws if v is None)
print(f"[합계 검증] area지정 {n_area:,} + 미지정 {n_mz:,} + 공란 {n_blank:,} = {n_area+n_mz+n_blank:,}")

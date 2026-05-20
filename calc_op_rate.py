# -*- coding: utf-8 -*-
"""현재 배정 상태에서 area3~5의 부하/능력/조업도를 집계한다."""
import pandas as pd

df1 = pd.read_excel("1번_블록테이블.xlsx")
df2 = pd.read_excel("2번_작업장테이블.xlsx")
df1["착수일"] = pd.to_datetime(df1["착수일"])

for area in ["area3", "area4", "area5"]:
    sub = df1[df1["최종작업장"] == area]
    total_mh = int(sub["공수"].sum())
    jan_mh = int(sub.loc[sub["착수일"].dt.month == 1, "공수"].sum())
    feb_mh = int(sub.loc[sub["착수일"].dt.month == 2, "공수"].sum())
    cap = df2[df2["작업장"] == area].iloc[0]
    jan_cap = int(cap["1월능력"])
    feb_cap = int(cap["2월능력"])
    annual_cap = int(sum(cap[f"{m}월능력"] for m in range(1, 13)))

    print(f"[{area}]  배정 블록 {len(sub):,}개")
    print(f"  부하(공수): 총 {total_mh:,}  (1월착수 {jan_mh:,} / 2월착수 {feb_mh:,})")
    print(f"  능력: 1월 {jan_cap:,}  2월 {feb_cap:,}  연간합 {annual_cap:,}")
    print(f"  A) 총공수 / 1월능력      = {total_mh / jan_cap * 100:7.1f}%")
    print(f"  B) 1월조업도(1월착수/1월능력) = {jan_mh / jan_cap * 100:7.1f}%"
          f"   2월조업도(2월착수/2월능력) = {feb_mh / feb_cap * 100:7.1f}%")
    print(f"  C) 총공수 / 연간능력합   = {total_mh / annual_cap * 100:7.1f}%")
    print()

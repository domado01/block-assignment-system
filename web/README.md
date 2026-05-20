# 작업장별 월간 조업도 대시보드

React + Vite 기반 모니터링 웹 화면.

## 실행 방법

```bash
cd web
npm install      # 최초 1회
npm run dev      # 개발 서버 실행 → http://localhost:5173
```

빌드(정적 배포용):

```bash
npm run build    # dist/ 생성
npm run preview  # 빌드 결과 미리보기
```

## 구성

- **월간 조업도** 탭 — 작업장(행) × 1~12월(열) 히트맵. 조업도 / 능력 / 부하 전환,
  행 클릭 시 해당 작업장의 월별 추이 차트 표시.
- **작업장별 배정 현황** 탭 — 1번 블록 테이블의 `최종작업장` 기준 배정 집계.

## 데이터

`src/data/data.json` 은 프로젝트 루트의 `generate_excel.py` 가 생성합니다.
데이터를 갱신하려면 루트에서 `python generate_excel.py` 를 다시 실행하세요.

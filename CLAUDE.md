# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Taste Log - 맛집 방문 기록 및 리뷰 관리 웹 애플리케이션

## 개발 명령어

```bash
# 로컬 서버 실행 (포트 3000)
node server.js

# 샘플 데이터 생성 (DB 초기화 + 성수동 맛집 10개 + 리뷰)
node seed-data.js

# 배포 (Vercel 자동 배포)
git push origin main
```

## 환경 변수 (.env)

```bash
# 필수 - PostgreSQL (Supabase)
DATABASE_URL=postgresql://[사용자]:[비밀번호]@[호스트]:[포트]/[데이터베이스]

# 필수 - 네이버 지역 검색 API
NAVER_CLIENT_ID=your_client_id
NAVER_CLIENT_SECRET=your_client_secret
```

## 기술 스택

- **백엔드**: Express.js + PostgreSQL (Supabase)
- **프론트엔드**: Vanilla JavaScript + Tailwind CSS (CDN)
- **배포**: Vercel Serverless Functions
- **외부 API**: 네이버 지역 검색, Open-Meteo (날씨), Nominatim (지오코딩)

## 아키텍처

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Browser        │ ──→ │  Vercel          │ ──→ │  PostgreSQL     │
│  index.html     │     │  api/index.js    │     │  (Supabase)     │
│  client.js      │     └────────┬─────────┘     └─────────────────┘
└─────────────────┘              │
                                 ↓
                    ┌───────────────────────┐
                    │  네이버 지역 검색 API  │
                    └───────────────────────┘
```

### 파일 구조
```
taste-log/
├── api/
│   └── index.js     # Vercel Serverless Function (배포용 API)
├── server.js        # 로컬 개발용 Express 서버
├── client.js        # 프론트엔드 로직, UI 렌더링
├── index.html       # HTML 마크업, Tailwind CSS
├── seed-data.js     # 샘플 데이터 생성 스크립트
├── vercel.json      # Vercel 배포 설정
└── .env             # 환경 변수 (Git 제외)
```

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/visits` | 방문 기록 목록 (쿼리: limit, offset, area, category, q) |
| `POST` | `/api/visits` | 새 기록 추가 |
| `PUT` | `/api/visits/:id` | 기록 수정 |
| `DELETE` | `/api/visits/:id` | 기록 삭제 |
| `GET` | `/api/places/search` | 네이버 지역 검색 (쿼리: query, display) |
| `GET` | `/api/places/popular` | 인기 장소 목록 |
| `GET` | `/api/summary` | 대시보드 통계 |
| `GET` | `/api/tags` | 태그 목록 |

## 데이터베이스 스키마 (visits)

| 필드 | 타입 | 설명 |
|------|------|------|
| `place_name` | TEXT | 장소명 (필수) |
| `category` | TEXT | 카테고리 |
| `visit_date` | DATE | 방문 날짜 |
| `rating_overall` | NUMERIC(2,1) | 전체 평점 |
| `tags` | TEXT[] | 태그 배열 |
| `notes` | TEXT | 메모 |
| `address` | TEXT | 주소 |
| `area` | TEXT | 지역 (필터링용, 예: "성수동") |
| `phone` | TEXT | 전화번호 |

## 코딩 컨벤션

- 한국어 주석 사용
- SQL 쿼리는 파라미터화 (SQL 인젝션 방지)
- 프론트엔드는 프레임워크 없이 순수 JavaScript 유지
- 비동기 처리는 async/await 패턴 사용

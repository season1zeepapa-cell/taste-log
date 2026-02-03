# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Taste Log - 맛집 방문 기록 및 리뷰 관리 웹 애플리케이션

## 개발 명령어

```bash
# 서버 실행 (기본 포트 3000)
node server.js

# 서버가 실행되면 브라우저에서 접속
# http://localhost:3000
```

## 환경 변수 설정 (.env)

```bash
# 필수 - PostgreSQL 데이터베이스 연결
DATABASE_URL=postgresql://[사용자]:[비밀번호]@[호스트]:[포트]/[데이터베이스]

# 필수 - 네이버 지역 검색 API (https://developers.naver.com)
NAVER_CLIENT_ID=your_client_id
NAVER_CLIENT_SECRET=your_client_secret

# 선택 - 서버 설정
PORT=3000
NODE_ENV=development
```

## 기술 스택

- **백엔드**: Express.js + PostgreSQL (Supabase)
- **프론트엔드**: Vanilla JavaScript + Tailwind CSS (CDN)
- **외부 API**:
  - 네이버 지역 검색 API (장소 검색)
  - Open-Meteo (날씨 정보)
  - Nominatim (지오코딩)

## 아키텍처

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  클라이언트 (Browser)  │ ──→ │  Express Server   │ ──→ │  PostgreSQL DB  │
│  index.html          │     │  server.js        │     │  (Supabase)     │
│  client.js           │     └────────┬─────────┘     └─────────────────┘
└─────────────────────┘              │
                                     ↓
                         ┌───────────────────────┐
                         │  외부 API              │
                         │  - 네이버 지역 검색     │
                         │  - Open-Meteo 날씨     │
                         └───────────────────────┘
```

### 파일 구조
```
taste-log/
├── server.js      # Express 서버, REST API, DB 연결, 네이버 API 프록시
├── client.js      # 프론트엔드 로직, UI 렌더링, 모달, API 통신
├── index.html     # HTML 마크업, Tailwind CSS, 모달 구조
├── .env           # 환경 변수 (Git 제외)
├── .gitignore     # Git 제외 파일 목록
└── package.json   # 프로젝트 의존성
```

## API 엔드포인트

### 방문 기록 (Visits)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/visits` | 방문 기록 목록 (필터링, 페이지네이션) |
| `GET` | `/api/visits/recent` | 최근 방문 기록 |
| `GET` | `/api/visits/:id` | 특정 방문 기록 조회 |
| `POST` | `/api/visits` | 새 기록 추가 |
| `PUT` | `/api/visits/:id` | 기록 수정 |
| `DELETE` | `/api/visits/:id` | 기록 삭제 |

### 장소 (Places)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/places/search` | 네이버 지역 검색 (쿼리 파라미터: query, display) |
| `GET` | `/api/places/popular` | 인기 장소 목록 |

### 기타
| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/summary` | 대시보드 통계 |
| `GET` | `/api/tags` | 태그 목록 |
| `GET` | `/api/health` | 서버 상태 확인 |

## 데이터베이스 스키마

### visits 테이블
| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | BIGSERIAL | 기본 키 |
| `place_name` | TEXT | 장소명 (필수) |
| `category` | TEXT | 카테고리 |
| `visit_date` | DATE | 방문 날짜 |
| `companions` | TEXT | 동행인 |
| `menu` | TEXT | 메뉴 |
| `price` | INTEGER | 가격 |
| `rating_overall` | NUMERIC(2,1) | 전체 평점 |
| `rating_taste` | NUMERIC(2,1) | 맛 평점 |
| `rating_service` | NUMERIC(2,1) | 서비스 평점 |
| `rating_atmosphere` | NUMERIC(2,1) | 분위기 평점 |
| `tags` | TEXT[] | 태그 배열 |
| `notes` | TEXT | 메모 |
| `address` | TEXT | 주소 |
| `phone` | TEXT | 전화번호 |
| `distance_m` | INTEGER | 거리 (미터) |
| `created_at` | TIMESTAMPTZ | 생성 시간 |

## 프론트엔드 주요 기능

### 모달 UI
- 방문 기록 입력을 위한 모달 창
- 장소명, 별점 평가, 메모 입력
- 클릭 가능한 별점 UI (1-5점)

### 대시보드
- 총 방문 횟수
- 평균 평점
- 이번 달 방문 횟수
- 태그 개수

### 인기 장소
- 방문 횟수 기준 인기 장소 목록
- 평균 평점, 마지막 방문일 표시

### 날씨 정보
- 현재 위치 기반 날씨 표시
- Open-Meteo API 활용

## 코딩 컨벤션

- 한국어 주석 사용
- SQL 쿼리는 파라미터화 (SQL 인젝션 방지)
- 프론트엔드는 프레임워크 없이 순수 JavaScript 유지
- 비동기 처리는 async/await 패턴 사용

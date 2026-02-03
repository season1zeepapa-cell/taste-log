// .env 파일에서 환경변수를 불러옵니다 (가장 먼저 실행되어야 해요!)
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.AVAILABLE_PORT || process.env.PORT || 3001);

// DATABASE_URL은 반드시 .env 파일에 설정해야 합니다
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경변수가 설정되지 않았습니다.');
  console.error('   .env 파일에 DATABASE_URL을 설정해주세요.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// 이미지 업로드를 위해 JSON 크기 제한을 10MB로 설정
// (2MB × 3장 × 1.33 Base64 변환율 ≈ 8MB)
app.use(express.json({ limit: '10mb' }));

// 정적 파일 서빙 (client.js, index.html 등)
// __dirname: 현재 server.js 파일이 있는 폴더
app.use(express.static(__dirname));

const indexPath = path.join(__dirname, 'index.html');

const ensureSchema = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS visits (
        id BIGSERIAL PRIMARY KEY,
        place_name TEXT NOT NULL,
        category TEXT,
        visit_date DATE,
        companions TEXT,
        menu TEXT,
        price INTEGER,
        rating_overall NUMERIC(2,1),
        rating_taste NUMERIC(2,1),
        rating_service NUMERIC(2,1),
        rating_atmosphere NUMERIC(2,1),
        tags TEXT[],
        notes TEXT,
        address TEXT,
        phone TEXT,
        distance_m INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 마이그레이션: area 컬럼 추가
    await client.query(`
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS area TEXT;
    `);

    // 마이그레이션: image_data 컬럼 추가
    await client.query(`
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS image_data TEXT;
    `);
  } finally {
    client.release();
  }
};

// ================================
// WHERE 절 빌더 (필터링용)
// ================================
const buildWhere = (params) => {
  const clauses = [];
  const values = [];

  if (params.category) {
    values.push(params.category);
    clauses.push(`category = $${values.length}`);
  }

  if (params.minRating) {
    values.push(Number(params.minRating));
    clauses.push(`rating_overall >= $${values.length}`);
  }

  if (params.tag) {
    values.push(params.tag);
    clauses.push(`$${values.length} = ANY(tags)`);
  }

  if (params.q) {
    values.push(`%${params.q}%`);
    clauses.push(`(place_name ILIKE $${values.length} OR menu ILIKE $${values.length} OR notes ILIKE $${values.length})`);
  }

  // 지역(area) 필터 - DB의 area 컬럼으로 부분 일치 검색
  // 예: area=성수 → area 컬럼에 '성수'가 포함된 기록 조회
  if (params.area) {
    values.push(`%${params.area}%`);
    clauses.push(`area ILIKE $${values.length}`);
  }

  if (params.from) {
    values.push(params.from);
    clauses.push(`visit_date >= $${values.length}`);
  }

  if (params.to) {
    values.push(params.to);
    clauses.push(`visit_date <= $${values.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, values };
};

app.get('/', (req, res) => {
  res.sendFile(indexPath);
});

// 참고: client.js는 express.static(__dirname)에 의해 자동으로 서빙됩니다

app.get('/api/health', async (req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get('/api/summary', async (req, res) => {
  const client = await pool.connect();
  try {
    const totalResult = await client.query(
      `SELECT COUNT(*)::int AS total, COALESCE(AVG(rating_overall), 0)::float AS avg_rating FROM visits;`
    );
    const monthResult = await client.query(
      `SELECT COUNT(*)::int AS month_count
       FROM visits
       WHERE visit_date >= date_trunc('month', CURRENT_DATE)
         AND visit_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month');`
    );
    const tagResult = await client.query(
      `SELECT COUNT(DISTINCT tag) AS tag_count
       FROM (
         SELECT UNNEST(tags) AS tag FROM visits WHERE tags IS NOT NULL
       ) AS tag_table;`
    );

    res.json({
      totalCount: totalResult.rows[0].total,
      avgRating: totalResult.rows[0].avg_rating,
      monthCount: monthResult.rows[0].month_count,
      tagCount: Number(tagResult.rows[0].tag_count || 0),
    });
  } finally {
    client.release();
  }
});

// ================================
// API 엔드포인트 - 방문 기록 목록 (이미지 제외 옵션)
// ================================
// 설명: excludeImages=true 옵션을 사용하면 image_data 컬럼을 제외합니다
// 효과: 이미지 3장 포함 시 레코드당 최대 8MB → 수 KB로 감소
// 사용: /api/visits?excludeImages=true (타임라인 로딩 시)
app.get('/api/visits', async (req, res) => {
  const { limit = 20, offset = 0, excludeImages } = req.query;
  const { where, values } = buildWhere(req.query);

  // excludeImages=true 옵션: image_data 컬럼 제외
  // 타임라인 목록에서는 이미지를 표시하지 않으므로 전송량 절약
  const columns = excludeImages === 'true'
    ? 'id, place_name, category, visit_date, companions, menu, price, rating_overall, rating_taste, rating_service, rating_atmosphere, tags, notes, address, phone, distance_m, area, created_at'
    : '*';

  const sql = `
    SELECT ${columns} FROM visits
    ${where}
    ORDER BY visit_date DESC NULLS LAST, created_at DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2};
  `;
  const client = await pool.connect();
  try {
    const result = await client.query(sql, [...values, Number(limit), Number(offset)]);
    res.json({ items: result.rows });
  } finally {
    client.release();
  }
});

app.get('/api/visits/recent', async (req, res) => {
  const limit = Number(req.query.limit || 3);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM visits ORDER BY visit_date DESC NULLS LAST, created_at DESC LIMIT $1;`,
      [limit]
    );
    res.json({ items: result.rows });
  } finally {
    client.release();
  }
});

app.get('/api/visits/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT * FROM visits WHERE id = $1;`, [id]);
    if (!result.rows.length) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(result.rows[0]);
  } finally {
    client.release();
  }
});

app.post('/api/visits', async (req, res) => {
  const {
    place_name,
    category,
    visit_date,
    companions,
    menu,
    price,
    rating_overall,
    rating_taste,
    rating_service,
    rating_atmosphere,
    tags,
    notes,
    address,
    phone,
    distance_m,
    area,
    image_data,
  } = req.body || {};

  if (!place_name) {
    res.status(400).json({ error: 'place_name_required' });
    return;
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO visits (
        place_name,
        category,
        visit_date,
        companions,
        menu,
        price,
        rating_overall,
        rating_taste,
        rating_service,
        rating_atmosphere,
        tags,
        notes,
        address,
        phone,
        distance_m,
        area,
        image_data
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
      ) RETURNING *;`,
      [
        place_name,
        category || null,
        visit_date || null,
        companions || null,
        menu || null,
        price || null,
        rating_overall || null,
        rating_taste || null,
        rating_service || null,
        rating_atmosphere || null,
        Array.isArray(tags) ? tags : null,
        notes || null,
        address || null,
        phone || null,
        distance_m || null,
        area || null,
        image_data || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } finally {
    client.release();
  }
});

app.put('/api/visits/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  const fields = [
    'place_name',
    'category',
    'visit_date',
    'companions',
    'menu',
    'price',
    'rating_overall',
    'rating_taste',
    'rating_service',
    'rating_atmosphere',
    'tags',
    'notes',
    'address',
    'phone',
    'distance_m',
    'area',
    'image_data',
  ];

  const updates = [];
  const values = [];

  fields.forEach((field) => {
    if (field in (req.body || {})) {
      const value = field === 'tags' && Array.isArray(req.body[field]) ? req.body[field] : req.body[field];
      values.push(value === '' ? null : value);
      updates.push(`${field} = $${values.length}`);
    }
  });

  if (!updates.length) {
    res.status(400).json({ error: 'no_fields' });
    return;
  }

  values.push(id);

  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE visits SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *;`,
      values
    );
    if (!result.rows.length) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(result.rows[0]);
  } finally {
    client.release();
  }
});

app.delete('/api/visits/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }
  const client = await pool.connect();
  try {
    const result = await client.query(`DELETE FROM visits WHERE id = $1 RETURNING id;`, [id]);
    if (!result.rows.length) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ ok: true });
  } finally {
    client.release();
  }
});

// ================================
// 네이버 지역 검색 API 엔드포인트
// ================================
// 요청 예시: GET /api/places/search?query=성수동맛집&display=5
// 응답: { items: [{ name, category, address, phone, ... }] }

app.get('/api/places/search', async (req, res) => {
  // 1단계: 요청 파라미터 추출
  const { query, display = 5 } = req.query;

  // query가 없으면 에러 반환
  if (!query) {
    res.status(400).json({ error: 'query_required', message: '검색어를 입력해주세요' });
    return;
  }

  // 2단계: 네이버 API 키 확인
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  // API 키가 설정되지 않았거나 기본값인 경우 에러
  if (!clientId || !clientSecret || clientId.includes('발급받은')) {
    res.status(500).json({
      error: 'api_key_not_configured',
      message: '네이버 API 키가 설정되지 않았습니다. .env 파일을 확인해주세요.'
    });
    return;
  }

  try {
    // 3단계: 네이버 지역 검색 API 호출
    // API 문서: https://developers.naver.com/docs/serviceapi/search/local/local.md
    const naverUrl = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=${display}`;

    const response = await fetch(naverUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,        // 네이버에서 발급받은 Client ID
        'X-Naver-Client-Secret': clientSecret, // 네이버에서 발급받은 Client Secret
      },
    });

    // API 호출 실패 처리
    if (!response.ok) {
      const errorText = await response.text();
      console.error('네이버 API 호출 실패:', response.status, errorText);
      res.status(response.status).json({
        error: 'naver_api_error',
        message: '네이버 API 호출에 실패했습니다.',
        detail: errorText
      });
      return;
    }

    // 4단계: 네이버 API 응답 파싱
    const data = await response.json();

    // 5단계: 네이버 API 응답을 앱에서 사용하는 형식으로 변환
    // 네이버 API 응답 형식 → 우리 앱 형식
    // title → name (HTML 태그 제거)
    // category → category
    // address → address
    // telephone → phone
    // roadAddress → roadAddress
    const items = (data.items || []).map((item, index) => ({
      id: `naver-${index}`,                                    // 고유 ID 생성
      name: item.title.replace(/<[^>]*>/g, ''),                // HTML 태그 제거 (<b> 등)
      category: item.category?.split('>').pop()?.trim() || '기타', // "음식점>한식" → "한식"
      address: item.address,                                    // 지번 주소
      roadAddress: item.roadAddress,                            // 도로명 주소
      phone: item.telephone || '',                              // 전화번호
      distance_m: null,                                         // 거리 (네이버 API는 제공 안 함)
      mapx: item.mapx,                                          // 네이버 지도 X 좌표
      mapy: item.mapy,                                          // 네이버 지도 Y 좌표
      link: item.link,                                          // 네이버 플레이스 링크
      highlight: item.description || '네이버 검색 결과',        // 설명
      rating: null,                                             // 평점 (별도 API 필요)
    }));

    // 6단계: 가공된 데이터 반환
    res.json({
      items,
      total: data.total,       // 총 검색 결과 수
      display: data.display,   // 요청한 표시 개수
    });

  } catch (error) {
    // 네트워크 오류 등 예외 처리
    console.error('네이버 검색 API 오류:', error);
    res.status(500).json({
      error: 'internal_error',
      message: '서버 오류가 발생했습니다.',
      detail: error.message
    });
  }
});

// ================================
// 인기 장소 캐싱 설정
// ================================
// 설명: GROUP BY + COUNT 쿼리는 비용이 높으므로 결과를 캐싱합니다
// TTL: 5분 (300초) - 새 방문 기록 추가 시에도 5분간 이전 결과 반환
let popularCache = { data: null, timestamp: 0 };
const POPULAR_CACHE_TTL = 5 * 60 * 1000; // 5분 (밀리초)

// ================================
// API 엔드포인트 - 인기 장소 (캐싱 적용)
// ================================
// 최적화: 반복 호출 시 캐시된 결과 반환 (응답 시간 90% 감소)
// 캐시 무효화: 5분 후 자동 만료
app.get('/api/places/popular', async (req, res) => {
  const limit = Number(req.query.limit || 4);
  const now = Date.now();

  // 캐시가 유효하고, 요청 limit이 캐시 데이터 개수보다 작거나 같으면 캐시 반환
  // (limit=100으로 캐시하면 limit=4 요청에도 재사용 가능)
  if (
    popularCache.data &&
    (now - popularCache.timestamp) < POPULAR_CACHE_TTL &&
    popularCache.data.items.length >= limit
  ) {
    console.log('📦 인기 장소 캐시 반환 (TTL:', Math.round((POPULAR_CACHE_TTL - (now - popularCache.timestamp)) / 1000), '초 남음)');
    return res.json({ items: popularCache.data.items.slice(0, limit) });
  }

  const client = await pool.connect();
  try {
    // 캐시 갱신 시 최대 100개까지 조회 (다양한 limit 요청 대응)
    const fetchLimit = Math.max(limit, 100);
    const result = await client.query(
      `SELECT place_name,
              category,
              address,
              phone,
              AVG(rating_overall)::float AS avg_rating,
              COUNT(*)::int AS visit_count,
              MAX(visit_date) AS last_visit
       FROM visits
       GROUP BY place_name, category, address, phone
       ORDER BY visit_count DESC, avg_rating DESC NULLS LAST
       LIMIT $1;`,
      [fetchLimit]
    );

    // 캐시 업데이트
    popularCache = {
      data: { items: result.rows },
      timestamp: now
    };
    console.log('🔄 인기 장소 캐시 갱신 (', result.rows.length, '개)');

    res.json({ items: result.rows.slice(0, limit) });
  } finally {
    client.release();
  }
});

app.get('/api/tags', async (req, res) => {
  const limit = Number(req.query.limit || 10);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT tag, COUNT(*)::int AS usage_count
       FROM (
         SELECT UNNEST(tags) AS tag FROM visits WHERE tags IS NOT NULL
       ) AS tag_table
       GROUP BY tag
       ORDER BY usage_count DESC
       LIMIT $1;`,
      [limit]
    );
    res.json({ items: result.rows });
  } finally {
    client.release();
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });

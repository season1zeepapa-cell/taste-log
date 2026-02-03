// ====================================
// Vercel Serverless Function으로 변환된 Taste Log API
// ====================================
// 이 파일은 Vercel에 배포될 때 사용됩니다.
// 로컬 개발 시에는 server.js를 사용하세요.

// dotenv: 환경변수 로드
require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');

const app = express();

// ====================================
// 데이터베이스 연결 설정
// ====================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ====================================
// 미들웨어 설정
// ====================================
app.use(express.json({ limit: '1mb' }));

// ====================================
// 데이터베이스 초기화 (한 번만 실행)
// ====================================
let isInitialized = false;

async function ensureSchema() {
  if (isInitialized) return;

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
        area TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 기존 테이블에 area 컬럼이 없으면 추가 (마이그레이션)
    await client.query(`
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS area TEXT;
    `);

    isInitialized = true;
    console.log('✅ 데이터베이스 테이블이 준비되었습니다!');
  } finally {
    client.release();
  }
}

// ====================================
// WHERE 절 빌더 (필터링용)
// ====================================
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
  // 예: area=성동 → area 컬럼에 '성동'이 포함된 기록 조회
  // (헤더의 "성동구"와 DB의 "성수동" 모두 매칭 가능)
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

// ====================================
// API 엔드포인트 - 헬스 체크
// ====================================
app.get('/api/health', async (req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

// ====================================
// API 엔드포인트 - 통계 요약
// ====================================
app.get('/api/summary', async (req, res) => {
  await ensureSchema();
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

// ====================================
// API 엔드포인트 - 방문 기록 목록
// ====================================
app.get('/api/visits', async (req, res) => {
  await ensureSchema();
  const { limit = 20, offset = 0 } = req.query;
  const { where, values } = buildWhere(req.query);
  const sql = `
    SELECT * FROM visits
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

// ====================================
// API 엔드포인트 - 최근 방문 기록
// ====================================
app.get('/api/visits/recent', async (req, res) => {
  await ensureSchema();
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

// ====================================
// API 엔드포인트 - 특정 방문 기록 조회
// ====================================
app.get('/api/visits/:id', async (req, res) => {
  await ensureSchema();
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

// ====================================
// API 엔드포인트 - 방문 기록 추가
// ====================================
app.post('/api/visits', async (req, res) => {
  await ensureSchema();
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
        area
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
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
      ]
    );
    res.status(201).json(result.rows[0]);
  } finally {
    client.release();
  }
});

// ====================================
// API 엔드포인트 - 방문 기록 수정
// ====================================
app.put('/api/visits/:id', async (req, res) => {
  await ensureSchema();
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

// ====================================
// API 엔드포인트 - 방문 기록 삭제
// ====================================
app.delete('/api/visits/:id', async (req, res) => {
  await ensureSchema();
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

// ====================================
// API 엔드포인트 - 네이버 지역 검색
// ====================================
app.get('/api/places/search', async (req, res) => {
  const { query, display = 5 } = req.query;

  if (!query) {
    res.status(400).json({ error: 'query_required', message: '검색어를 입력해주세요' });
    return;
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId.includes('발급받은')) {
    res.status(500).json({
      error: 'api_key_not_configured',
      message: '네이버 API 키가 설정되지 않았습니다.'
    });
    return;
  }

  try {
    const naverUrl = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=${display}`;

    const response = await fetch(naverUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

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

    const data = await response.json();

    const items = (data.items || []).map((item, index) => ({
      id: `naver-${index}`,
      name: item.title.replace(/<[^>]*>/g, ''),
      category: item.category?.split('>').pop()?.trim() || '기타',
      address: item.address,
      roadAddress: item.roadAddress,
      phone: item.telephone || '',
      distance_m: null,
      mapx: item.mapx,
      mapy: item.mapy,
      link: item.link,
      highlight: item.description || '네이버 검색 결과',
      rating: null,
    }));

    res.json({
      items,
      total: data.total,
      display: data.display,
    });

  } catch (error) {
    console.error('네이버 검색 API 오류:', error);
    res.status(500).json({
      error: 'internal_error',
      message: '서버 오류가 발생했습니다.',
      detail: error.message
    });
  }
});

// ====================================
// API 엔드포인트 - 인기 장소
// ====================================
app.get('/api/places/popular', async (req, res) => {
  await ensureSchema();
  const limit = Number(req.query.limit || 4);
  const client = await pool.connect();
  try {
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
      [limit]
    );
    res.json({ items: result.rows });
  } finally {
    client.release();
  }
});

// ====================================
// API 엔드포인트 - 태그 목록
// ====================================
app.get('/api/tags', async (req, res) => {
  await ensureSchema();
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

// ====================================
// 404 처리
// ====================================
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// ====================================
// Vercel Serverless Function으로 export
// ====================================
module.exports = app;

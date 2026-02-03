// ====================================
// 샘플 데이터 생성 스크립트
// ====================================
// 실행 방법: node seed-data.js
//
// 이 스크립트가 하는 일:
// 1. 기존 데이터 전체 삭제
// 2. 네이버 API로 성수동 맛집 10개 검색
// 3. 각 맛집에 1~3개 리뷰 생성

require('dotenv').config();
const { Pool } = require('pg');

// 데이터베이스 연결
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 네이버 API 설정
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// ====================================
// 샘플 리뷰 데이터 (랜덤 선택용)
// ====================================
const sampleNotes = [
  '정말 맛있어요! 또 올게요 👍',
  '분위기가 좋고 음식도 맛있었어요',
  '친구랑 갔는데 모두 만족했어요',
  '가격 대비 양이 푸짐해요',
  '직원분들이 친절해서 기분 좋았어요',
  '재방문 의사 100%! 강추합니다',
  '웨이팅이 좀 있지만 그만한 가치가 있어요',
  '데이트 코스로 추천해요 💕',
  '혼밥하기에도 좋은 곳이에요',
  '점심 특선이 가성비 최고!',
  '저녁에 와인 한 잔 하기 좋아요',
  '디저트까지 완벽했어요',
  '인테리어가 예뻐서 사진 찍기 좋아요',
  '주차가 편해서 좋았어요',
  '배달보다 매장에서 먹는 게 더 맛있어요',
];

const sampleTags = [
  ['맛집', '분위기좋은'],
  ['가성비', '푸짐한'],
  ['데이트', '분위기좋은'],
  ['혼밥', '빠른식사'],
  ['점심특선', '직장인'],
  ['주차가능', '넓은'],
  ['인스타감성', '예쁜'],
  ['재방문', '단골'],
];

// 랜덤 날짜 생성 (최근 3개월 내)
const getRandomDate = () => {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const randomTime = threeMonthsAgo.getTime() + Math.random() * (now.getTime() - threeMonthsAgo.getTime());
  return new Date(randomTime).toISOString().slice(0, 10);
};

// 랜덤 평점 생성 (3.5 ~ 5.0)
const getRandomRating = () => {
  return (Math.floor(Math.random() * 16) + 35) / 10; // 3.5, 3.6, ... 5.0
};

// 랜덤 선택
const randomPick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ====================================
// 네이버 API 검색 함수
// ====================================
async function searchNaver(query, display = 5) {
  const searchUrl = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=${display}`;

  const response = await fetch(searchUrl, {
    headers: {
      'X-Naver-Client-Id': NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
    },
  });

  if (!response.ok) {
    throw new Error(`네이버 API 오류: ${response.status}`);
  }

  const data = await response.json();
  return data.items || [];
}

// ====================================
// 메인 함수
// ====================================
async function main() {
  const client = await pool.connect();

  try {
    // 0단계: area 컬럼이 없으면 추가 (마이그레이션)
    console.log('🔧 0단계: 데이터베이스 마이그레이션...');
    await client.query('ALTER TABLE visits ADD COLUMN IF NOT EXISTS area TEXT;');
    console.log('✅ area 컬럼 확인/추가 완료!\n');

    console.log('🗑️  1단계: 기존 데이터 전체 삭제...');
    await client.query('DELETE FROM visits;');
    console.log('✅ 기존 데이터 삭제 완료!\n');

    console.log('🔍 2단계: 네이버 API로 성수동 맛집 검색...');

    // 다양한 검색어로 10개 이상 수집
    const searchQueries = [
      '성수동 맛집',
      '성수동 한식',
      '성수동 카페',
      '성수동 양식',
      '성수동 일식',
    ];

    const allPlaces = new Map(); // 중복 제거용

    for (const query of searchQueries) {
      console.log(`   🔎 "${query}" 검색 중...`);
      const results = await searchNaver(query, 5);

      for (const place of results) {
        const name = place.title.replace(/<[^>]*>/g, '');
        if (!allPlaces.has(name)) {
          allPlaces.set(name, place);
        }
      }

      // API 호출 간격
      await new Promise(r => setTimeout(r, 200));
    }

    // 10개만 선택
    const places = Array.from(allPlaces.values()).slice(0, 10);
    console.log(`✅ ${places.length}개 맛집 수집 완료!\n`);

    console.log('📝 3단계: 각 맛집에 리뷰 생성...\n');

    let totalReviews = 0;

    for (const place of places) {
      // HTML 태그 제거
      const placeName = place.title.replace(/<[^>]*>/g, '');
      const category = place.category?.split('>').pop()?.trim() || '기타';
      const address = place.address || '';
      const phone = place.telephone || '';

      // 1~3개 랜덤 리뷰 생성
      const reviewCount = Math.floor(Math.random() * 3) + 1;

      console.log(`🍽️  ${placeName} (${category}) - ${reviewCount}개 리뷰 생성`);

      for (let i = 0; i < reviewCount; i++) {
        const visitDate = getRandomDate();
        const rating = getRandomRating();
        const notes = randomPick(sampleNotes);
        const tags = randomPick(sampleTags);

        await client.query(
          `INSERT INTO visits (
            place_name, category, visit_date, rating_overall,
            notes, tags, address, phone, area
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [placeName, category, visitDate, rating, notes, tags, address, phone, '성수동']
        );

        console.log(`   📅 ${visitDate} | ⭐ ${rating} | "${notes.slice(0, 20)}..."`);
        totalReviews++;
      }
      console.log('');
    }

    console.log('========================================');
    console.log(`🎉 샘플 데이터 생성 완료!`);
    console.log(`   - 맛집: ${places.length}개`);
    console.log(`   - 리뷰: ${totalReviews}개`);
    console.log('========================================');

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

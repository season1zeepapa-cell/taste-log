(() => {
  const api = async (path, options = {}) => {
    const config = {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    };
    if (config.body && typeof config.body !== 'string') {
      config.body = JSON.stringify(config.body);
    }
    const response = await fetch(path, config);
    if (!response.ok) {
      const error = new Error(`Request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  };

  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const formatDate = (date) => {
    if (!date) return '날짜 미상';
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return '날짜 미상';
    return value.toISOString().slice(0, 10).replace(/-/g, '.');
  };

  const formatDistance = (meters) => {
    if (!meters && meters !== 0) return '거리 정보 없음';
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const formatPrice = (price) => {
    if (!price && price !== 0) return '';
    return `${Number(price).toLocaleString('ko-KR')}원`;
  };

  const weatherMap = {
    0: '맑음',
    1: '대체로 맑음',
    2: '부분적으로 흐림',
    3: '흐림',
    45: '안개',
    48: '서리 안개',
    51: '이슬비',
    61: '비',
    71: '눈',
    80: '소나기',
    95: '천둥',
  };

  // ================================
  // 카테고리별 기본 이미지 URL (Unsplash)
  // ================================
  // 설명: 네이버 API가 이미지를 제공하지 않아서
  // 카테고리에 맞는 음식 이미지를 기본으로 표시합니다
  const categoryImages = {
    '한식': 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=200&h=150&fit=crop',
    '양식': 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=200&h=150&fit=crop',
    '일식': 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=200&h=150&fit=crop',
    '중식': 'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=200&h=150&fit=crop',
    '카페': 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=200&h=150&fit=crop',
    '분식': 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=200&h=150&fit=crop',
    '육류': 'https://images.unsplash.com/photo-1544025162-d76694265947?w=200&h=150&fit=crop',
    '고기': 'https://images.unsplash.com/photo-1544025162-d76694265947?w=200&h=150&fit=crop',
    '퓨전': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&h=150&fit=crop',
    '치킨': 'https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?w=200&h=150&fit=crop',
    '피자': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&h=150&fit=crop',
    '베이커리': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&h=150&fit=crop',
    '디저트': 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=200&h=150&fit=crop',
    '기타': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&h=150&fit=crop',
  };

  // 카테고리 문자열에서 이미지 URL 가져오기
  // 예: "육류,고기요리" → 육류 이미지 반환
  const getCategoryImage = (category) => {
    if (!category) return categoryImages['기타'];

    // 카테고리 문자열에서 매칭되는 키워드 찾기
    for (const [key, url] of Object.entries(categoryImages)) {
      if (category.includes(key)) return url;
    }
    return categoryImages['기타'];
  };

  const state = {
    selectedPlace: null,
    exploreQuery: '',
    exploreCategory: '전체',
    exploreView: 'map',
    recordView: 'timeline',
    visits: [],
    tags: [],
    popularPlaces: [],     // 현재 표시된 맛집 목록 (중복 체크용)
    popularOffset: 0,      // 다음 검색에 사용할 오프셋
    currentArea: '성수동',  // 현재 위치 동네명 (기본값)
    selectedCategory: '전체', // 선택된 음식 카테고리
  };

  // ================================
  // 네이버 API 검색 결과를 저장할 변수
  // ================================
  // 이전: mockNearbyPlaces (가짜 데이터 6개)
  // 이후: 실제 네이버 API 호출 결과를 저장
  let searchResults = [];

  // ================================
  // 모달 관련 변수 및 함수
  // ================================
  // 설명: window.prompt 대신 예쁜 모달 창을 사용합니다
  let modalResolve = null;  // 모달 결과를 반환할 Promise resolve 함수

  // 모달 열기 함수
  // place: 미리 선택된 장소 정보 (선택사항)
  const openRecordModal = (place = null) => {
    return new Promise((resolve) => {
      modalResolve = resolve;

      // 모달 요소 가져오기
      const modal = qs('#record-modal');
      const nameInput = qs('#modal-place-name');
      const ratingInput = qs('#modal-rating');
      const noteInput = qs('#modal-note');
      const ratingDisplay = qs('#rating-display');
      const starBtns = qsa('.star-btn');

      // 입력 필드 초기화
      nameInput.value = place?.name || '';
      ratingInput.value = '4.5';
      noteInput.value = '';
      ratingDisplay.textContent = '4.5';

      // 별점 표시 업데이트
      updateStars(4.5, starBtns);

      // 모달 표시 (hidden 클래스 제거)
      modal.classList.remove('hidden');

      // 첫 번째 입력 필드에 포커스
      if (!place?.name) {
        nameInput.focus();
      } else {
        ratingInput.focus();
      }
    });
  };

  // 모달 닫기 함수
  const closeRecordModal = (result = null) => {
    const modal = qs('#record-modal');
    modal.classList.add('hidden');

    // Promise resolve 호출
    if (modalResolve) {
      modalResolve(result);
      modalResolve = null;
    }
  };

  // 별점 표시 업데이트 함수
  // rating: 현재 별점 (0~5)
  // starBtns: 별 버튼 배열
  const updateStars = (rating, starBtns) => {
    starBtns.forEach((btn, index) => {
      // index+1이 rating 이하면 노란색, 아니면 회색
      if (index + 1 <= rating) {
        btn.classList.remove('text-slate-300');
        btn.classList.add('text-amber-400');
      } else {
        btn.classList.remove('text-amber-400');
        btn.classList.add('text-slate-300');
      }
    });
  };

  // 모달 이벤트 설정 함수
  const setupModalEvents = () => {
    const modal = qs('#record-modal');
    const backdrop = qs('#modal-backdrop');
    const closeBtn = qs('#modal-close');
    const cancelBtn = qs('#modal-cancel');
    const confirmBtn = qs('#modal-confirm');
    const nameInput = qs('#modal-place-name');
    const ratingInput = qs('#modal-rating');
    const noteInput = qs('#modal-note');
    const ratingDisplay = qs('#rating-display');
    const starBtns = qsa('.star-btn');

    // 배경 클릭 시 닫기
    backdrop?.addEventListener('click', () => closeRecordModal(null));

    // X 버튼 클릭 시 닫기
    closeBtn?.addEventListener('click', () => closeRecordModal(null));

    // 취소 버튼 클릭 시 닫기
    cancelBtn?.addEventListener('click', () => closeRecordModal(null));

    // 확인 버튼 클릭 시 데이터 반환
    confirmBtn?.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const rating = parseFloat(ratingInput.value) || 0;
      const note = noteInput.value.trim();

      // 장소 이름이 없으면 경고
      if (!name) {
        nameInput.focus();
        nameInput.classList.add('border-red-400');
        return;
      }

      closeRecordModal({ name, rating, note });
    });

    // 별 클릭 시 별점 변경
    starBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const rating = parseInt(btn.dataset.rating, 10);
        ratingInput.value = rating;
        ratingDisplay.textContent = rating.toFixed(1);
        updateStars(rating, starBtns);
      });
    });

    // 숫자 입력 시 별점 표시 업데이트
    ratingInput?.addEventListener('input', () => {
      const rating = parseFloat(ratingInput.value) || 0;
      ratingDisplay.textContent = rating.toFixed(1);
      updateStars(Math.floor(rating), starBtns);
    });

    // 입력 필드 포커스 시 빨간 테두리 제거
    nameInput?.addEventListener('focus', () => {
      nameInput.classList.remove('border-red-400');
    });

    // ESC 키로 모달 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        closeRecordModal(null);
      }
    });
  };

  // ================================
  // 기본 검색어 (앱 시작 시 검색할 키워드)
  // ================================
  // 현재 위치 기반 검색어 생성 함수
  const getSearchQuery = () => `${state.currentArea} 맛집`;

  // ================================
  // 네이버 API 상태 확인 함수
  // ================================
  // 설명: 헤더에 네이버 API 연결 상태를 표시합니다
  // 정상: 파란색 점 + "네이버 API 정상"
  // 오류: 빨간색 점 + "네이버 API 오류"
  const checkNaverApiStatus = async () => {
    const dot = qs('#api-status-dot');
    const text = qs('#api-status-text');

    // 요소가 없으면 종료
    if (!dot || !text) return;

    try {
      // 간단한 검색으로 API 테스트 (결과 1개만 요청)
      const result = await api('/api/places/search?query=테스트&display=1');

      // 성공: 파란색 표시
      dot.classList.remove('bg-slate-400', 'bg-red-400');
      dot.classList.add('bg-blue-400');
      text.textContent = '네이버 API 정상';
    } catch (error) {
      // 실패: 빨간색 표시
      console.warn('네이버 API 상태 확인 실패:', error);
      dot.classList.remove('bg-slate-400', 'bg-blue-400');
      dot.classList.add('bg-red-400');
      text.textContent = '네이버 API 오류';
    }
  };

  // ================================
  // 네이버 지역 검색 API 호출 함수
  // ================================
  // 설명: 검색어를 받아서 서버의 /api/places/search 엔드포인트를 호출합니다
  // 흐름: 사용자 입력 → searchPlaces() → 서버 → 네이버 API → 결과 반환
  const searchPlaces = async (query) => {
    try {
      // 1단계: 검색어가 비어있으면 빈 배열 반환
      if (!query || query.trim() === '') {
        return [];
      }

      // 2단계: 서버의 검색 API 호출
      // encodeURIComponent: 한글이나 특수문자를 URL에서 사용 가능한 형식으로 변환
      // 예: "성수동 맛집" → "성수동%20맛집"
      const response = await api(`/api/places/search?query=${encodeURIComponent(query)}&display=10`);

      // 3단계: 검색 결과 반환
      return response.items || [];
    } catch (error) {
      // 4단계: 오류 발생 시 콘솔에 경고 출력하고 빈 배열 반환
      console.warn('네이버 검색 실패:', error);
      return [];
    }
  };

  const findSectionByTitle = (text) => {
    const heading = qsa('h2').find((el) => el.textContent.includes(text));
    if (!heading) return null;
    return heading.closest('section') || heading.closest('div.rounded-3xl') || heading.parentElement;
  };

  const setHeaderLocation = (locationText, weatherText) => {
    const header = qs('header');
    if (!header) return;
    const titleEl = qs('h1', header);
    const weatherEl = qsa('p', header).find((el) => el.textContent.includes('°C') || el.textContent.includes('미세먼지'));
    if (titleEl) titleEl.textContent = locationText;
    if (weatherEl) weatherEl.textContent = weatherText;
  };

  const loadWeather = async () => {
    const defaultLocation = '성수동 · 서울';
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      const { latitude, longitude } = position.coords;
      const geoResponse = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
        { headers: { 'Accept-Language': 'ko' } }
      );
      const geoJson = await geoResponse.json();
      const city = geoJson.address?.city || geoJson.address?.town || geoJson.address?.suburb || '현재 위치';
      const area = geoJson.address?.borough || geoJson.address?.district || geoJson.address?.county || '';
      const locationText = area ? `${area} · ${city}` : `${city}`;

      // 현재 위치를 state에 저장 (맛집 검색에 사용)
      if (area) {
        state.currentArea = area;
        console.log('📍 현재 위치:', area);
      }

      const weatherResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&timezone=Asia/Seoul`
      );
      const weatherJson = await weatherResponse.json();
      const temp = Math.round(weatherJson.current?.temperature_2m ?? 0);
      const code = weatherJson.current?.weathercode ?? 0;
      const condition = weatherMap[code] || '맑음';
      setHeaderLocation(locationText, `${condition} · ${temp}°C · 체감 쾌적`);
    } catch (error) {
      console.log('📍 위치 권한 거부 또는 오류, 기본 위치(성수동) 사용');
      setHeaderLocation(defaultLocation, '맑음 · 12°C · 미세먼지 좋음');
    }
  };

  // ================================
  // 대기 시간 더미 데이터 생성 함수
  // ================================
  const getWaitTimeMessage = () => {
    const messages = [
      { text: '바로 입장 가능', color: 'text-green-600' },
      { text: '대기 5분', color: 'text-green-600' },
      { text: '대기 10분', color: 'text-amber-600' },
      { text: '대기 15분', color: 'text-amber-600' },
      { text: '대기 20분', color: 'text-orange-600' },
      { text: '웨이팅 있음', color: 'text-red-500' },
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  // ================================
  // 맛집 카드 생성 함수 (재사용 가능)
  // ================================
  const createPlaceCard = (place) => {
    const card = document.createElement('article');
    // 카드 크기 고정: 너비 220px, 높이 280px
    card.className = 'w-[220px] h-[280px] flex-shrink-0 rounded-2xl border border-slate-100 bg-amber-50 p-4 flex flex-col';

    // 카테고리별 이미지 추가
    const img = document.createElement('img');
    img.src = getCategoryImage(place.category);
    img.alt = place.name;
    img.className = 'w-full h-24 object-cover rounded-xl mb-3 flex-shrink-0';
    img.onerror = () => { img.style.display = 'none'; };

    // 헤더: 장소명, 카테고리, 별점
    const header = document.createElement('div');
    header.className = 'flex items-start justify-between flex-shrink-0';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'font-semibold truncate';
    title.textContent = place.name;
    const meta = document.createElement('p');
    meta.className = 'text-xs text-slate-500';
    meta.textContent = `${place.category || '기타'} · ${formatDistance(place.distance_m)}`;

    titleWrap.append(title, meta);

    const rating = document.createElement('span');
    rating.className = 'rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white flex-shrink-0';
    rating.textContent = Number(place.rating || place.avg_rating || 0).toFixed(1);

    header.append(titleWrap, rating);

    // 주소 표시 (길면 줄바꿈, 최대 2줄)
    const addressText = document.createElement('p');
    addressText.className = 'mt-2 text-sm text-slate-600 break-words line-clamp-2';
    addressText.textContent = place.address || place.roadAddress || '';

    // 대기 시간 표시 (더미 데이터)
    const waitInfo = getWaitTimeMessage();
    const waitTime = document.createElement('p');
    waitTime.className = `mt-2 text-xs font-medium ${waitInfo.color} flex-grow`;
    waitTime.textContent = `⏱️ ${waitInfo.text}`;

    // 푸터: 방문횟수 + 바로 기록 버튼 (하단 고정)
    const footer = document.createElement('div');
    footer.className = 'mt-auto pt-2 flex items-center justify-between flex-shrink-0';

    const visitCount = document.createElement('span');
    visitCount.className = 'text-xs text-amber-700';
    // 방문횟수 표시 (visit_count가 있으면 표시, 없으면 기본 메시지)
    const count = place.visit_count || 0;
    visitCount.textContent = count > 0 ? `방문 ${count}회` : '새로운 맛집';

    const action = document.createElement('button');
    action.className = 'rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-800';
    action.textContent = '바로 기록';
    action.addEventListener('click', () => handleQuickRecord(place));

    footer.append(visitCount, action);
    card.append(img, header, addressText, waitTime, footer);

    return card;
  };

  // ================================
  // 맛집 카드 렌더링 (초기 로드)
  // ================================
  const renderHomePopular = (items) => {
    const section = findSectionByTitle('지금 주변 인기 맛집');
    if (!section) return;
    // mt-3 또는 mt-5 클래스를 가진 flex 컨테이너 찾기
    const container = qs('.mt-3.flex.gap-4', section) || qs('.mt-5.flex', section);
    if (!container) return;
    container.innerHTML = '';

    items.forEach((place) => {
      const card = createPlaceCard(place);
      container.appendChild(card);
    });
  };

  // ================================
  // 맛집 카드 추가 (더보기)
  // ================================
  const appendPlaceCards = (items) => {
    const section = findSectionByTitle('지금 주변 인기 맛집');
    if (!section) return;
    // mt-3 또는 mt-5 클래스를 가진 flex 컨테이너 찾기
    const container = qs('.mt-3.flex.gap-4', section) || qs('.mt-5.flex', section);
    if (!container) return;

    items.forEach((place) => {
      const card = createPlaceCard(place);
      container.appendChild(card);
    });

    // 새로 추가된 카드로 부드럽게 스크롤
    container.scrollTo({
      left: container.scrollWidth,
      behavior: 'smooth'
    });
  };

  // ================================
  // 더보기 기능 - 추가 5개 로드
  // ================================
  const loadMorePlaces = async () => {
    const btn = qs('#load-more-places');
    if (btn) {
      btn.textContent = '로딩 중...';
      btn.disabled = true;
    }

    try {
      // 현재 위치 기반 다양한 검색어로 더 많은 결과 가져오기
      const area = state.currentArea;
      const searchQueries = [
        `${area} 맛집`,
        `${area} 레스토랑`,
        `${area} 카페`,
        `${area} 음식점`,
        `${area} 맛있는곳`,
      ];
      const queryIndex = Math.floor(state.popularOffset / 5) % searchQueries.length;
      const query = searchQueries[queryIndex];
      console.log('🔍 더보기 검색:', query);

      // 네이버 API에서 10개 검색 (중복 제거 후 5개 선택)
      const results = await searchPlaces(query);

      // 중복 제거 (이름 기준)
      const existingNames = new Set(state.popularPlaces.map(p => p.name));
      const uniquePlaces = results.filter(p => !existingNames.has(p.name)).slice(0, 5);

      if (uniquePlaces.length === 0) {
        if (btn) btn.textContent = '더 이상 없음';
        return;
      }

      // 방문 기록에서 visit_count 가져와서 병합
      const popular = await api('/api/places/popular?limit=100');
      const visitCountMap = {};
      (popular.items || []).forEach(item => {
        visitCountMap[item.place_name] = item.visit_count || 0;
      });

      const newPlaces = uniquePlaces.map(place => ({
        ...place,
        visit_count: visitCountMap[place.name] || 0,
      }));

      // 상태 업데이트
      state.popularPlaces = [...state.popularPlaces, ...newPlaces];
      state.popularOffset += 5;

      // 새 카드 추가 렌더링
      appendPlaceCards(newPlaces);

      if (btn) {
        btn.textContent = '더보기';
        btn.disabled = false;
      }
    } catch (error) {
      console.warn('더보기 로드 실패:', error);
      if (btn) {
        btn.textContent = '다시 시도';
        btn.disabled = false;
      }
    }
  };

  // ================================
  // 더보기 버튼 이벤트 설정
  // ================================
  const setupLoadMore = () => {
    const btn = qs('#load-more-places');
    if (btn) {
      btn.addEventListener('click', loadMorePlaces);
    }
  };

  // ================================
  // 카테고리별 모던 그라데이션 색상
  // ================================
  const categoryGradients = {
    '전체': 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fcd34d 100%)',
    '한식': 'linear-gradient(135deg, #fee2e2 0%, #fecaca 50%, #f87171 100%)',
    '양식': 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 50%, #60a5fa 100%)',
    '일식': 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 50%, #f472b6 100%)',
    '중식': 'linear-gradient(135deg, #fef9c3 0%, #fef08a 50%, #facc15 100%)',
    '카페': 'linear-gradient(135deg, #ffedd5 0%, #fed7aa 50%, #fb923c 100%)',
    '분식': 'linear-gradient(135deg, #ffedd5 0%, #fdba74 50%, #f97316 100%)',
  };

  // 배경 그라데이션 변경 함수
  const changeBackgroundGradient = (category) => {
    const body = qs('#app-body');
    if (!body) return;
    const gradient = categoryGradients[category] || categoryGradients['전체'];
    body.style.background = gradient;
  };

  // ================================
  // 카테고리 필터 이벤트 설정
  // ================================
  const setupCategoryFilters = () => {
    const buttons = qsa('.category-btn');

    buttons.forEach(btn => {
      btn.addEventListener('click', async () => {
        // 1. 활성화 스타일 변경
        buttons.forEach(b => {
          b.classList.remove('bg-slate-900', 'text-white');
          b.classList.add('border', 'border-slate-200', 'text-slate-600');
        });
        btn.classList.add('bg-slate-900', 'text-white');
        btn.classList.remove('border', 'border-slate-200', 'text-slate-600');

        // 2. 선택된 카테고리 저장
        state.selectedCategory = btn.dataset.category;

        // 3. 배경 그라데이션 변경
        changeBackgroundGradient(state.selectedCategory);

        // 4. 카테고리에 맞는 검색어 생성
        const query = state.selectedCategory === '전체'
          ? getSearchQuery()
          : `${state.currentArea} ${state.selectedCategory}`;

        console.log('🏷️ 카테고리 필터:', state.selectedCategory, '→', query);

        // 5. 주변 맛집 검색 및 렌더링
        try {
          const results = await searchPlaces(query);
          state.popularPlaces = results.slice(0, 5);
          state.popularOffset = 5;
          renderHomePopular(state.popularPlaces);
        } catch (error) {
          console.warn('카테고리 검색 실패:', error);
        }

        // 6. 타임라인(내 기록)도 카테고리 필터링
        filterTimelineByCategory(state.selectedCategory);
      });
    });
  };

  // 카테고리별 리본 색상
  const getCategoryRibbonColor = (category) => {
    const colors = {
      '한식': 'bg-red-500',
      '양식': 'bg-blue-500',
      '일식': 'bg-pink-500',
      '중식': 'bg-yellow-600',
      '카페': 'bg-amber-600',
      '분식': 'bg-orange-500',
    };
    // 카테고리에 키워드가 포함되어 있으면 해당 색상 반환
    for (const [key, color] of Object.entries(colors)) {
      if (category && category.includes(key)) return color;
    }
    return 'bg-slate-500';
  };

  const renderTimeline = (items) => {
    const section = findSectionByTitle('내 맛집 로드');
    const container = section?.querySelector('.mt-6.grid');
    if (!container) return;
    container.innerHTML = '';

    items.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'relative flex gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 pl-6 overflow-hidden';
      // 필터용 데이터 속성 추가
      card.dataset.category = item.category || '기타';

      // 카테고리 리본 (왼쪽 상단)
      const ribbon = document.createElement('div');
      const ribbonColor = getCategoryRibbonColor(item.category);
      ribbon.className = `absolute -left-1 top-4 ${ribbonColor} text-white text-xs px-3 py-1 rounded-r-full shadow-md`;
      ribbon.textContent = item.category || '기타';

      // 썸네일 (카테고리 이미지)
      const thumb = document.createElement('img');
      thumb.src = getCategoryImage(item.category);
      thumb.alt = item.category || '기타';
      thumb.className = 'h-20 w-20 rounded-xl object-cover flex-shrink-0';
      thumb.onerror = () => { thumb.style.display = 'none'; };

      const body = document.createElement('div');
      body.className = 'flex-1 min-w-0';

      const header = document.createElement('div');
      header.className = 'flex items-center justify-between';

      const title = document.createElement('h3');
      title.className = 'font-semibold truncate';
      title.textContent = item.place_name;

      const rating = document.createElement('span');
      rating.className = 'rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white flex-shrink-0 ml-2';
      rating.textContent = Number(item.rating_overall || 0).toFixed(1);

      header.append(title, rating);

      const meta = document.createElement('p');
      meta.className = 'mt-1 text-xs text-slate-500';
      meta.textContent = `${formatDate(item.visit_date)}`;

      const tagsWrap = document.createElement('div');
      tagsWrap.className = 'mt-2 flex flex-wrap gap-2 text-xs';
      (item.tags || []).slice(0, 3).forEach((tag) => {
        const tagEl = document.createElement('span');
        tagEl.className = 'rounded-full bg-white px-2 py-1';
        tagEl.textContent = `#${tag}`;
        tagsWrap.appendChild(tagEl);
      });

      body.append(header, meta, tagsWrap);

      // 리뷰 내용 추가 (notes가 있으면 표시)
      if (item.notes) {
        const review = document.createElement('p');
        review.className = 'mt-2 text-sm text-slate-600 italic line-clamp-2';
        review.textContent = `"${item.notes}"`;
        body.appendChild(review);
      }

      card.append(ribbon, thumb, body);
      container.appendChild(card);
    });
  };

  // 타임라인 카테고리 필터 함수
  const filterTimelineByCategory = (category) => {
    const section = findSectionByTitle('내 맛집 로드');
    if (!section) return;
    const cards = section.querySelectorAll('[data-category]');
    cards.forEach(card => {
      if (category === '전체' || card.dataset.category.includes(category)) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  };

  // ================================
  // 빠른 기록 함수 (모달 사용)
  // ================================
  // 설명: "바로 기록" 또는 "빠른 기록하기" 버튼 클릭 시 호출됩니다
  // 흐름: 버튼 클릭 → 모달 열기 → 사용자 입력 → API 호출 → 저장
  const handleQuickRecord = async (place) => {
    // 1단계: 모달 열기 (사용자 입력 대기)
    const result = await openRecordModal(place);

    // 2단계: 취소 시 종료
    if (!result) return;

    // 3단계: 입력 데이터 추출
    const { name, rating, note } = result;

    const payload = {
      place_name: name,
      category: place?.category || '기타',
      visit_date: new Date().toISOString().slice(0, 10),
      rating_overall: rating,
      notes: note || null,
      address: place?.address || null,
      phone: place?.phone || null,
      distance_m: place?.distance_m || null,
      tags: place?.tags || null,
    };

    try {
      await api('/api/visits', { method: 'POST', body: payload });
      await refreshData();
    } catch (error) {
      console.warn('기록 저장 실패', error);
      window.alert('기록 저장에 실패했습니다.');
    }
  };

  const setupRecordActions = () => {
    const headerAdd = qsa('button').find((btn) => btn.textContent.includes('나의 기록'));
    if (headerAdd) {
      headerAdd.addEventListener('click', () => {
        handleQuickRecord(state.selectedPlace || {});
      });
    }
  };

  const setupRecordFilters = () => {
    const section = findSectionByTitle('내 맛집 로드');
    if (!section) return;

    const toggleButtons = qsa('div.rounded-full button', section).filter((btn) =>
      ['타임라인', '지도'].includes(btn.textContent.trim())
    );

    toggleButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleButtons.forEach((el) => {
          el.classList.remove('bg-slate-900', 'text-white');
          el.classList.add('text-slate-500');
        });
        btn.classList.add('bg-slate-900', 'text-white');
        btn.classList.remove('text-slate-500');
        state.recordView = btn.textContent.trim() === '타임라인' ? 'timeline' : 'map';
        renderTimeline(state.visits.slice(0, 6));
      });
    });

    const searchChip = qsa('div', section).find((el) => el.textContent.includes('검색'));
    if (searchChip) {
      searchChip.addEventListener('click', async () => {
        const query = window.prompt('검색어를 입력하세요 (장소명/메모)', '');
        if (query === null) return;
        try {
          const data = await api(`/api/visits?q=${encodeURIComponent(query)}&limit=8`);
          state.visits = data.items || [];
          renderTimeline(state.visits);
        } catch (error) {
          console.warn('검색 실패', error);
        }
      });
    }
  };

  // ================================
  // 데이터 새로고침 함수
  // ================================
  // 설명: 서버에서 최신 데이터를 가져와 화면을 업데이트합니다
  // 흐름: API 호출 → 데이터 가공 → 화면 렌더링
  const refreshData = async () => {
    try {
      // 1단계: 타임라인 데이터 로드
      const timeline = await api('/api/visits?limit=8');
      state.visits = timeline.items || [];
      renderTimeline(state.visits);

      // 2단계: 네이버 API로 주변 맛집 5개 검색
      console.log('🔍 최초 검색어:', getSearchQuery());
      const searchResults = await searchPlaces(getSearchQuery());
      const initialPlaces = searchResults.slice(0, 5);

      // 3단계: 방문 기록에서 visit_count 가져와서 병합
      const popular = await api('/api/places/popular?limit=100');
      const visitCountMap = {};
      (popular.items || []).forEach(item => {
        visitCountMap[item.place_name] = item.visit_count || 0;
      });

      // 4단계: 검색 결과에 visit_count 추가
      const placesWithVisitCount = initialPlaces.map(place => ({
        ...place,
        visit_count: visitCountMap[place.name] || 0,
      }));

      // 5단계: 상태 업데이트 및 렌더링
      state.popularPlaces = placesWithVisitCount;
      state.popularOffset = 5;
      renderHomePopular(placesWithVisitCount);

    } catch (error) {
      console.warn('데이터 로딩 실패', error);
      // 오류 발생 시에도 네이버 API로 기본 검색 시도
      try {
        const fallbackResults = await searchPlaces(getSearchQuery());
        const initialPlaces = fallbackResults.slice(0, 5);
        state.popularPlaces = initialPlaces;
        state.popularOffset = 5;
        renderHomePopular(initialPlaces);
      } catch (fallbackError) {
        console.warn('네이버 검색도 실패:', fallbackError);
        state.popularPlaces = [];
        state.popularOffset = 0;
        renderHomePopular([]);
      }
    }
  };

  const init = async () => {
    await loadWeather();          // 현재 위치 + 날씨 정보 로드
    await checkNaverApiStatus();  // 네이버 API 상태 확인
    setupModalEvents();           // 모달 이벤트 설정
    setupRecordActions();
    setupRecordFilters();
    setupLoadMore();              // 더보기 버튼 이벤트 설정
    setupCategoryFilters();       // 카테고리 필터 이벤트 설정
    refreshData();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

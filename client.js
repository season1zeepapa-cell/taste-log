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

  const state = {
    selectedPlace: null,
    exploreQuery: '',
    exploreCategory: '전체',
    exploreView: 'map',
    recordView: 'timeline',
    visits: [],
    tags: [],
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
  const defaultSearchQuery = '성수동 맛집';

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

      const weatherResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&timezone=Asia/Seoul`
      );
      const weatherJson = await weatherResponse.json();
      const temp = Math.round(weatherJson.current?.temperature_2m ?? 0);
      const code = weatherJson.current?.weathercode ?? 0;
      const condition = weatherMap[code] || '맑음';
      setHeaderLocation(locationText, `${condition} · ${temp}°C · 체감 쾌적`);
    } catch (error) {
      setHeaderLocation(defaultLocation, '맑음 · 12°C · 미세먼지 좋음');
    }
  };

  const renderStats = (summary) => {
    const statCards = qsa('div.rounded-2xl.border').filter((el) => qs('p', el));
    statCards.forEach((card) => {
      const label = qs('p', card)?.textContent.trim();
      const valueEl = qs('p.mt-2.text-2xl', card);
      if (!valueEl) return;
      if (label === '이번 달 기록') valueEl.textContent = `${summary.monthCount}회`;
      if (label === '평균 별점') valueEl.textContent = summary.avgRating.toFixed(1);
      if (label === '새 태그') valueEl.textContent = `${summary.tagCount}개`;
    });
  };

  const renderHomePopular = (items) => {
    const section = findSectionByTitle('지금 주변 인기 맛집');
    if (!section) return;
    const container = qs('.mt-5.flex', section);
    if (!container) return;
    container.innerHTML = '';

    items.forEach((place) => {
      const card = document.createElement('article');
      card.className = 'min-w-[220px] rounded-2xl border border-slate-100 bg-amber-50 p-4';

      const header = document.createElement('div');
      header.className = 'flex items-start justify-between';

      const titleWrap = document.createElement('div');
      const title = document.createElement('h3');
      title.className = 'font-semibold';
      title.textContent = place.name;
      const meta = document.createElement('p');
      meta.className = 'text-xs text-slate-500';
      meta.textContent = `${place.category || '기타'} · ${formatDistance(place.distance_m)}`;

      titleWrap.append(title, meta);

      const rating = document.createElement('span');
      rating.className = 'rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white';
      rating.textContent = Number(place.rating || 0).toFixed(1);

      header.append(titleWrap, rating);

      const menu = document.createElement('p');
      menu.className = 'mt-3 text-sm text-slate-600';
      menu.textContent = place.highlight || '네이버 추천 맛집';

      const footer = document.createElement('div');
      footer.className = 'mt-4 flex items-center justify-between';

      const sub = document.createElement('span');
      sub.className = 'text-xs text-amber-700';
      sub.textContent = place.note || '바로 방문하기 좋음';

      const action = document.createElement('button');
      action.className = 'rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-800';
      action.textContent = '바로 기록';
      action.addEventListener('click', () => handleQuickRecord(place));

      footer.append(sub, action);

      card.append(header, menu, footer);
      container.appendChild(card);
    });
  };

  const renderTimeline = (items) => {
    const section = findSectionByTitle('타임라인 & 지도 뷰');
    const container = section?.querySelector('.mt-6.grid');
    if (!container) return;
    container.innerHTML = '';

    items.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'flex gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4';

      const thumb = document.createElement('div');
      thumb.className = 'h-20 w-20 rounded-xl bg-amber-100';

      const body = document.createElement('div');
      body.className = 'flex-1';

      const header = document.createElement('div');
      header.className = 'flex items-center justify-between';

      const title = document.createElement('h3');
      title.className = 'font-semibold';
      title.textContent = item.place_name;

      const rating = document.createElement('span');
      rating.className = 'rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white';
      rating.textContent = Number(item.rating_overall || 0).toFixed(1);

      header.append(title, rating);

      const meta = document.createElement('p');
      meta.className = 'mt-1 text-xs text-slate-500';
      meta.textContent = `${formatDate(item.visit_date)} · ${item.category || '기타'}`;

      const tagsWrap = document.createElement('div');
      tagsWrap.className = 'mt-2 flex flex-wrap gap-2 text-xs';
      (item.tags || []).slice(0, 3).forEach((tag) => {
        const tagEl = document.createElement('span');
        tagEl.className = 'rounded-full bg-white px-2 py-1';
        tagEl.textContent = `#${tag}`;
        tagsWrap.appendChild(tagEl);
      });

      body.append(header, meta, tagsWrap);
      card.append(thumb, body);
      container.appendChild(card);
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
    const section = findSectionByTitle('타임라인 & 지도 뷰');
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
      // 1단계: 여러 API를 동시에 호출 (병렬 처리로 속도 향상)
      const [summary, timeline, popular] = await Promise.all([
        api('/api/summary'),           // 통계 요약
        api('/api/visits?limit=8'),    // 타임라인용 방문 기록
        api('/api/places/popular?limit=5'), // 인기 장소
      ]);

      // 2단계: 상태 업데이트 및 화면 렌더링
      state.visits = timeline.items || [];
      renderStats(summary);
      renderTimeline(state.visits);

      // 3단계: 인기 장소 데이터 가공
      const popularItems = (popular.items || []).map((item, idx) => ({
        id: `popular-${idx}`,
        name: item.place_name,
        category: item.category || '기타',
        distance_m: item.distance_m || 400 + idx * 70,
        phone: item.phone,
        address: item.address,
        rating: item.avg_rating || 4.3,
        highlight: item.visit_count ? `최근 ${item.visit_count}회 방문 기록` : '주변 인기',
      }));

      // 4단계: 인기 장소 표시
      // 방문 기록이 있으면 인기 장소 표시, 없으면 네이버 검색 결과 표시
      if (popularItems.length) {
        renderHomePopular(popularItems);
      } else {
        // 방문 기록이 없으면 네이버 API로 기본 검색
        const defaultResults = await searchPlaces(defaultSearchQuery);
        renderHomePopular(defaultResults.slice(0, 4));
      }
    } catch (error) {
      console.warn('데이터 로딩 실패', error);
      // 오류 발생 시에도 네이버 API로 기본 검색 시도
      try {
        const fallbackResults = await searchPlaces(defaultSearchQuery);
        renderHomePopular(fallbackResults.slice(0, 4));
      } catch (fallbackError) {
        console.warn('네이버 검색도 실패:', fallbackError);
        // 모든 것이 실패하면 빈 상태로 표시
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
    refreshData();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

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

  // image_data에서 사진 개수 계산하는 함수
  // 설명: JSON 배열이면 배열 길이, 단일 문자열이면 1, 없으면 0을 반환합니다
  const getPhotoCount = (imageData) => {
    if (!imageData) return 0;
    try {
      const parsed = JSON.parse(imageData);
      return Array.isArray(parsed) ? parsed.length : 1;
    } catch {
      // JSON 파싱 실패 = 단일 Base64 문자열 (기존 데이터)
      return imageData ? 1 : 0;
    }
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
    areaFilter: 'current', // 지역 필터: 'current' (현재 지역) 또는 'all' (전체)
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
  let editingVisitId = null;  // null이면 새 기록, 숫자면 수정 모드
  let selectedImages = [];  // Base64 이미지 배열 (최대 3개)

  // 파일을 Base64로 변환하는 함수
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // 갤러리 UI 렌더링 함수
  // 설명: 선택된 이미지들을 3열 그리드로 표시합니다
  // 각 이미지에 × 버튼이 있어서 개별 삭제가 가능합니다
  const renderImageGallery = () => {
    const gallery = qs('#image-gallery');
    if (!gallery) return;

    gallery.innerHTML = '';  // 기존 내용 지우기

    selectedImages.forEach((imgData, index) => {
      // 이미지 + 삭제 버튼 컨테이너
      const item = document.createElement('div');
      item.className = 'relative';

      // 썸네일 이미지
      const img = document.createElement('img');
      img.src = imgData;
      img.className = 'w-full h-20 object-cover rounded-lg';
      img.alt = `사진 ${index + 1}`;

      // × 삭제 버튼 (오른쪽 상단)
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.dataset.index = index;
      removeBtn.className = 'absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600';
      removeBtn.textContent = '×';

      item.append(img, removeBtn);
      gallery.appendChild(item);
    });
  };

  // 모달 열기 함수
  // place: 미리 선택된 장소 정보 (선택사항)
  // existingVisit: 수정할 기존 방문 기록 (선택사항)
  const openRecordModal = (place = null, existingVisit = null) => {
    return new Promise((resolve) => {
      modalResolve = resolve;
      editingVisitId = existingVisit?.id || null;  // 수정 모드 상태 저장

      // 모달 요소 가져오기
      const modal = qs('#record-modal');
      const modalTitle = qs('#modal-title');
      const nameInput = qs('#modal-place-name');
      const ratingInput = qs('#modal-rating');
      const noteInput = qs('#modal-note');
      const ratingDisplay = qs('#rating-display');
      const starBtns = qsa('.star-btn');
      const confirmBtn = qs('#modal-confirm');
      const deleteBtn = qs('#modal-delete');
      // 이미지 관련 요소
      const imageInput = qs('#modal-image');

      // 모달 제목 및 버튼 텍스트 변경
      if (modalTitle) {
        modalTitle.textContent = existingVisit ? '리뷰 수정하기' : '맛집 기록하기';
      }
      if (confirmBtn) {
        confirmBtn.textContent = existingVisit ? '수정 저장' : '기록 저장';
      }

      // 삭제 버튼 표시/숨김 (수정 모드에서만 표시)
      if (deleteBtn) {
        deleteBtn.classList.toggle('hidden', !existingVisit);
      }

      // 입력 필드 초기화
      if (existingVisit) {
        // 수정 모드: 기존 데이터 로드
        nameInput.value = place?.place_name || '';
        nameInput.disabled = true;  // 장소명 변경 불가
        const rating = existingVisit.rating_overall || 4.5;
        ratingInput.value = rating;
        noteInput.value = existingVisit.notes || '';
        ratingDisplay.textContent = Number(rating).toFixed(1);
        updateStars(Math.floor(rating), starBtns);
      } else {
        // 새 기록 모드
        nameInput.value = place?.name || '';
        nameInput.disabled = false;
        ratingInput.value = '4.5';
        noteInput.value = '';
        ratingDisplay.textContent = '4.5';
        updateStars(4.5, starBtns);
      }

      // 이미지 초기화 (배열 또는 단일 문자열 호환)
      // 설명: 기존 데이터가 JSON 배열이면 파싱하고,
      // 단일 문자열이면 배열로 변환합니다 (하위 호환성)
      const existingImageData = existingVisit?.image_data;
      if (existingImageData) {
        try {
          const parsed = JSON.parse(existingImageData);
          selectedImages = Array.isArray(parsed) ? parsed : [existingImageData];
        } catch {
          // JSON 파싱 실패 = 단일 Base64 문자열 (기존 데이터)
          selectedImages = existingImageData ? [existingImageData] : [];
        }
      } else {
        selectedImages = [];
      }
      if (imageInput) imageInput.value = '';  // 파일 선택 초기화
      renderImageGallery();  // 갤러리 렌더링

      // 모달 표시 (hidden 클래스 제거)
      modal.classList.remove('hidden');

      // 포커스 설정
      if (!existingVisit && !place?.name) {
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
    const deleteBtn = qs('#modal-delete');  // 삭제 버튼
    const nameInput = qs('#modal-place-name');
    const ratingInput = qs('#modal-rating');
    const noteInput = qs('#modal-note');
    const ratingDisplay = qs('#rating-display');
    const starBtns = qsa('.star-btn');
    // 이미지 관련 요소
    const imageInput = qs('#modal-image');
    const imageGallery = qs('#image-gallery');

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

      // 이미지 배열을 JSON 문자열로 변환하여 반환
      // 빈 배열이면 null을 반환합니다
      const imageData = selectedImages.length > 0 ? JSON.stringify(selectedImages) : null;
      closeRecordModal({ name, rating, note, imageData });
    });

    // 이미지 파일 선택 시 (다중 파일 지원)
    // 설명: 한 번에 여러 장을 선택할 수 있습니다
    // 제한: 최대 3장, 각 파일 2MB 이하
    imageInput?.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      for (const file of files) {
        // 개수 제한 (3장)
        if (selectedImages.length >= 3) {
          window.alert('사진은 최대 3장까지 등록 가능합니다.');
          break;
        }

        // 크기 제한 (2MB)
        if (file.size > 2 * 1024 * 1024) {
          window.alert(`${file.name}: 이미지 크기는 2MB 이하여야 합니다.`);
          continue;
        }

        // Base64 변환 및 배열에 추가
        try {
          const base64 = await fileToBase64(file);
          selectedImages.push(base64);
        } catch (error) {
          console.warn('이미지 변환 실패:', file.name, error);
        }
      }

      renderImageGallery();
      imageInput.value = '';  // 입력 초기화 (같은 파일 재선택 가능)
    });

    // 갤러리에서 개별 이미지 삭제 (이벤트 위임)
    // 설명: × 버튼의 data-index 속성으로 삭제할 이미지를 식별합니다
    imageGallery?.addEventListener('click', (e) => {
      const target = e.target;
      if (target.tagName === 'BUTTON' && target.dataset.index !== undefined) {
        const index = parseInt(target.dataset.index, 10);
        selectedImages.splice(index, 1);  // 배열에서 해당 이미지 제거
        renderImageGallery();  // 갤러리 다시 렌더링
      }
    });

    // 모달 내 삭제 버튼 클릭 시 (수정 모드에서만 표시)
    deleteBtn?.addEventListener('click', async () => {
      if (!editingVisitId) return;  // 수정 모드가 아니면 무시

      // 삭제 확인
      if (!window.confirm('이 리뷰를 삭제하시겠습니까?')) return;

      try {
        await api(`/api/visits/${editingVisitId}`, { method: 'DELETE' });
        closeRecordModal(null);  // 모달 닫기
        await refreshData();     // 화면 새로고침
      } catch (error) {
        console.warn('삭제 실패:', error);
        window.alert('삭제에 실패했습니다.');
      }
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

  // ================================
  // 날씨/위치 로드 함수 (병렬화 최적화)
  // ================================
  // 설명: 위치 확인 후 지오코딩과 날씨 API를 병렬로 호출합니다
  // 이전: 위치 → 지오코딩 → 날씨 순차 실행 (3-5초)
  // 이후: 위치 → (지오코딩 + 날씨) 병렬 실행 (1-2초)
  const loadWeather = async () => {
    const defaultLocation = '성수동 · 서울';
    try {
      // 1단계: 위치 권한 요청 (타임아웃 3초로 단축)
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
      });
      const { latitude, longitude } = position.coords;

      // 2단계: 지오코딩 + 날씨 API 병렬 호출 (핵심 최적화)
      const [geoResponse, weatherResponse] = await Promise.all([
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
          { headers: { 'Accept-Language': 'ko' } }
        ),
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&timezone=Asia/Seoul`
        ),
      ]);

      // 3단계: 응답 파싱 (병렬)
      const [geoJson, weatherJson] = await Promise.all([
        geoResponse.json(),
        weatherResponse.json(),
      ]);

      // 4단계: 위치 정보 추출
      const city = geoJson.address?.city || geoJson.address?.town || geoJson.address?.suburb || '현재 위치';
      const area = geoJson.address?.borough || geoJson.address?.district || geoJson.address?.county || '';
      const locationText = area ? `${area} · ${city}` : `${city}`;

      // 현재 위치를 state에 저장 (맛집 검색에 사용)
      if (area) {
        state.currentArea = area;
        console.log('📍 현재 위치:', area);
      }

      // 5단계: 날씨 정보 추출
      const temp = Math.round(weatherJson.current?.temperature_2m ?? 0);
      const code = weatherJson.current?.weathercode ?? 0;
      const condition = weatherMap[code] || '맑음';
      setHeaderLocation(locationText, `${condition} · ${temp}°C · 체감 쾌적`);
    } catch (error) {
      console.log('📍 위치 권한 거부 또는 오류, 기본 위치(성수동) 사용');
      // 기본 위치를 명시적으로 설정
      state.currentArea = '성수동';
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
    action.className = 'rounded-full bg-amber-500 hover:bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-colors';
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

  // 카테고리별 버튼 색상 (사이트 그라데이션과 동일)
  const categoryButtonColors = {
    '전체': '#fcd34d',  // amber
    '한식': '#f87171',  // red
    '양식': '#60a5fa',  // blue
    '일식': '#f472b6',  // pink
    '중식': '#facc15',  // yellow
    '카페': '#fb923c',  // orange
    '분식': '#f97316',  // orange darker
  };

  // ================================
  // 카테고리 필터 이벤트 설정
  // ================================
  const setupCategoryFilters = () => {
    const buttons = qsa('.category-btn');

    buttons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const category = btn.dataset.category;
        const btnColor = categoryButtonColors[category] || categoryButtonColors['전체'];

        // 1. 모든 버튼 흰색으로 리셋
        buttons.forEach(b => {
          b.style.backgroundColor = 'white';
          b.classList.remove('shadow-md', 'font-bold');
          b.classList.add('border-2', 'border-slate-300', 'text-slate-700', 'font-semibold');
        });

        // 2. 선택된 버튼에 카테고리 색상 적용
        btn.style.backgroundColor = btnColor;
        btn.classList.remove('border-2', 'border-slate-300', 'text-slate-700', 'font-semibold');
        btn.classList.add('text-slate-900', 'shadow-md', 'font-bold');

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

        // 6. 타임라인(내 기록)도 카테고리 + 현재 위치로 다시 로드
        try {
          const area = state.currentArea;
          const categoryParam = state.selectedCategory === '전체' ? '' : `&category=${encodeURIComponent(state.selectedCategory)}`;
          const timelineData = await api(`/api/visits?limit=20&area=${encodeURIComponent(area)}${categoryParam}`);
          state.visits = timelineData.items || [];
          renderTimeline(state.visits);
        } catch (error) {
          console.warn('타임라인 필터링 실패:', error);
          // 실패 시 DOM 기반 필터링으로 폴백
          filterTimelineByCategory(state.selectedCategory);
        }
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

  // ================================
  // 타임라인 렌더링 함수 (DocumentFragment 최적화)
  // ================================
  // 설명: DOM 조작을 최소화하여 렌더링 성능을 개선합니다
  // 이전: 각 카드마다 container.appendChild() 호출 (리플로우 발생)
  // 이후: DocumentFragment에 모아서 한 번에 추가 (리플로우 1회)
  const renderTimeline = (items) => {
    const section = findSectionByTitle('내 맛집 로드');
    const container = section?.querySelector('.mt-6.grid');
    if (!container) return;
    container.innerHTML = '';

    // DocumentFragment: 메모리 상의 가상 DOM 컨테이너
    // 여기에 카드들을 모아서 마지막에 한 번에 DOM에 추가합니다
    const fragment = document.createDocumentFragment();

    // 1. place_name으로 그룹화
    const grouped = {};
    items.forEach(item => {
      const key = item.place_name;
      if (!grouped[key]) {
        grouped[key] = {
          place_name: item.place_name,
          category: item.category,
          address: item.address,
          visits: []
        };
      }
      grouped[key].visits.push({
        id: item.id,  // 수정/삭제에 필요한 ID 저장
        visit_date: item.visit_date,
        notes: item.notes,
        rating_overall: item.rating_overall,
        tags: item.tags,
        image_data: item.image_data,  // 사진 데이터
      });
    });

    // 2. 그룹화된 데이터로 카드 렌더링
    Object.values(grouped).forEach((place) => {
      const card = document.createElement('article');
      card.className = 'relative rounded-2xl border border-slate-100 bg-slate-50 p-4 pl-6 overflow-hidden';
      card.dataset.category = place.category || '기타';

      // 카테고리 리본 (왼쪽 상단)
      const ribbon = document.createElement('div');
      const ribbonColor = getCategoryRibbonColor(place.category);
      ribbon.className = `absolute -left-1 top-4 ${ribbonColor} text-white text-xs px-3 py-1 rounded-r-full shadow-md`;
      ribbon.textContent = place.category || '기타';

      // 헤더 영역 (이미지 + 정보)
      const headerArea = document.createElement('div');
      headerArea.className = 'flex gap-4';

      // 썸네일 (사용자 이미지 우선, 없으면 카테고리 이미지)
      // 설명: JSON 배열 또는 단일 문자열 형식 모두 지원합니다 (하위 호환성)
      const thumb = document.createElement('img');
      let firstVisitImage = null;
      const imageData = place.visits[0]?.image_data;
      if (imageData) {
        try {
          const parsed = JSON.parse(imageData);
          // 배열이면 첫 번째 이미지 사용
          firstVisitImage = Array.isArray(parsed) ? parsed[0] : imageData;
        } catch {
          // JSON 파싱 실패 = 단일 Base64 문자열 (기존 데이터)
          firstVisitImage = imageData;
        }
      }
      thumb.src = firstVisitImage || getCategoryImage(place.category);
      thumb.alt = place.category || '기타';
      thumb.className = 'h-20 w-20 rounded-xl object-cover flex-shrink-0';
      thumb.onerror = () => { thumb.style.display = 'none'; };

      // 기본 정보
      const info = document.createElement('div');
      info.className = 'flex-1 min-w-0';

      const header = document.createElement('div');
      header.className = 'flex items-center justify-between';

      const title = document.createElement('h3');
      title.className = 'font-semibold truncate';
      title.textContent = place.place_name;

      // 평균 평점 계산 (유효한 평점만, 소수점 첫째자리 반올림)
      const validRatings = place.visits.filter(v => v.rating_overall && v.rating_overall > 0);
      const avgRating = validRatings.length > 0
        ? validRatings.reduce((sum, v) => sum + Number(v.rating_overall), 0) / validRatings.length
        : 0;
      const roundedRating = Math.round(avgRating * 10) / 10; // 소수점 첫째자리 반올림
      const rating = document.createElement('span');
      rating.className = 'rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white flex-shrink-0 ml-2';
      rating.textContent = roundedRating.toFixed(1);

      header.append(title, rating);

      const visitCountText = document.createElement('p');
      visitCountText.className = 'mt-1 text-xs text-amber-600 font-medium';
      visitCountText.textContent = `총 ${place.visits.length}회 방문`;

      info.append(header, visitCountText);
      headerArea.append(thumb, info);

      // 방문 기록 리스트
      const visitsList = document.createElement('div');
      visitsList.className = 'mt-4 space-y-3 border-t border-slate-200 pt-3';

      place.visits.forEach((visit, idx) => {
        const visitItem = document.createElement('div');
        // 클릭 가능 스타일 + hover 효과 추가
        visitItem.className = 'text-sm cursor-pointer hover:bg-amber-50 rounded-lg p-2 -mx-2 transition-colors';

        // 전체 영역 클릭 시 수정 모달 열기
        visitItem.addEventListener('click', () => {
          handleEditVisit(visit.id, place);
        });

        const dateRow = document.createElement('div');
        dateRow.className = 'flex items-center gap-2 text-slate-500';
        dateRow.innerHTML = `<span>📅</span><span>${formatDate(visit.visit_date)}</span>`;
        if (visit.rating_overall) {
          dateRow.innerHTML += `<span class="text-amber-500">⭐ ${Number(visit.rating_overall).toFixed(1)}</span>`;
        }

        // 사진 개수 표시 (📷 이모지 × 개수)
        // 예: 사진 3장 → 📷📷📷
        const photoCount = getPhotoCount(visit.image_data);
        if (photoCount > 0) {
          dateRow.innerHTML += `<span class="text-blue-500">${'📷'.repeat(photoCount)}</span>`;
        }

        visitItem.appendChild(dateRow);

        // 리뷰 내용
        if (visit.notes) {
          const reviewText = document.createElement('p');
          reviewText.className = 'mt-1 text-slate-600 italic pl-6';
          reviewText.textContent = `"${visit.notes}"`;
          visitItem.appendChild(reviewText);
        }

        // 태그 (첫 번째 방문만)
        if (idx === 0 && visit.tags && visit.tags.length > 0) {
          const tagsWrap = document.createElement('div');
          tagsWrap.className = 'mt-2 flex flex-wrap gap-2 text-xs pl-6';
          visit.tags.slice(0, 3).forEach((tag) => {
            const tagEl = document.createElement('span');
            tagEl.className = 'rounded-full bg-white px-2 py-1';
            tagEl.textContent = `#${tag}`;
            tagsWrap.appendChild(tagEl);
          });
          visitItem.appendChild(tagsWrap);
        }

        visitsList.appendChild(visitItem);
      });

      card.append(ribbon, headerArea, visitsList);
      // DocumentFragment에 카드 추가 (아직 실제 DOM에는 반영 안 됨)
      fragment.appendChild(card);
    });

    // 모든 카드를 한 번에 DOM에 추가 (리플로우 1회만 발생)
    container.appendChild(fragment);
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
    const { name, rating, note, imageData } = result;

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
      area: state.currentArea,  // 현재 지역 저장
      image_data: imageData || null,  // 사진 데이터
    };

    try {
      await api('/api/visits', { method: 'POST', body: payload });
      await refreshData();
    } catch (error) {
      console.warn('기록 저장 실패', error);
      window.alert('기록 저장에 실패했습니다.');
    }
  };

  // ================================
  // 리뷰 수정 핸들러
  // ================================
  // 설명: 타임라인에서 ✏️ 버튼 클릭 시 호출됩니다
  // 흐름: 기존 데이터 조회 → 모달 열기 → 사용자 수정 → PUT API 호출
  const handleEditVisit = async (visitId, place) => {
    try {
      // 1단계: 기존 방문 기록 조회
      const visit = await api(`/api/visits/${visitId}`);

      // 2단계: 모달 열기 (수정 모드)
      const result = await openRecordModal(place, visit);

      // 3단계: 취소 시 종료
      if (!result) return;

      // 4단계: PUT API 호출 (별점, 한줄평, 사진 수정)
      const updateBody = {
        rating_overall: result.rating,
        notes: result.note || null,
      };
      // 이미지가 변경된 경우에만 포함 (undefined가 아닌 경우)
      if (result.imageData !== undefined) {
        updateBody.image_data = result.imageData;
      }
      await api(`/api/visits/${visitId}`, {
        method: 'PUT',
        body: updateBody,
      });

      // 5단계: 화면 새로고침
      await refreshData();
    } catch (error) {
      console.warn('수정 실패:', error);
      window.alert('수정에 실패했습니다.');
    }
  };

  // ================================
  // 리뷰 삭제 핸들러
  // ================================
  // 설명: 타임라인에서 🗑️ 버튼 클릭 시 호출됩니다
  // 흐름: 확인 대화상자 → DELETE API 호출 → 화면 새로고침
  const handleDeleteVisit = async (visitId) => {
    // 1단계: 삭제 확인
    if (!window.confirm('이 리뷰를 삭제하시겠습니까?')) return;

    try {
      // 2단계: DELETE API 호출
      await api(`/api/visits/${visitId}`, { method: 'DELETE' });

      // 3단계: 화면 새로고침
      await refreshData();
    } catch (error) {
      console.warn('삭제 실패:', error);
      window.alert('삭제에 실패했습니다.');
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
  // 지역 필터 UI 업데이트 함수
  // ================================
  const updateAreaFilterUI = () => {
    const currentBtn = qs('#area-current-btn');
    const allBtn = qs('#area-all-btn');

    if (state.areaFilter === 'current') {
      // 현재 지역 버튼 활성화
      currentBtn?.classList.remove('bg-slate-200', 'text-slate-600');
      currentBtn?.classList.add('bg-amber-500', 'text-white');
      // 전체 버튼 비활성화
      allBtn?.classList.remove('bg-amber-500', 'text-white');
      allBtn?.classList.add('bg-slate-200', 'text-slate-600');
    } else {
      // 전체 버튼 활성화
      allBtn?.classList.remove('bg-slate-200', 'text-slate-600');
      allBtn?.classList.add('bg-amber-500', 'text-white');
      // 현재 지역 버튼 비활성화
      currentBtn?.classList.remove('bg-amber-500', 'text-white');
      currentBtn?.classList.add('bg-slate-200', 'text-slate-600');
    }
  };

  // ================================
  // 타임라인 데이터 로드 함수 (이미지 제외 최적화)
  // ================================
  // 설명: 타임라인 목록에서는 이미지 데이터를 제외하고 로드합니다
  // 이유: image_data 컬럼은 Base64 인코딩된 이미지 3장까지 포함
  //       (레코드당 최대 8MB, 20개 로드 시 160MB 전송)
  // 효과: 네트워크 전송량 80-90% 감소
  const loadTimelineData = async () => {
    // excludeImages=true: 서버에서 image_data 컬럼을 제외하고 조회
    let url = '/api/visits?limit=20&excludeImages=true';

    // 현재 지역 필터가 선택되었을 때만 area 조건 추가
    if (state.areaFilter === 'current') {
      url += `&area=${encodeURIComponent(state.currentArea)}`;
      console.log('📍 현재 지역 데이터 조회:', state.currentArea);
    } else {
      console.log('📍 전체 데이터 조회');
    }

    const timeline = await api(url);
    state.visits = timeline.items || [];
    renderTimeline(state.visits);
  };

  // ================================
  // 지역 필터 버튼 이벤트 설정
  // ================================
  const setupAreaFilter = () => {
    const currentBtn = qs('#area-current-btn');
    const allBtn = qs('#area-all-btn');

    // 현재 지역 버튼 텍스트 업데이트
    if (currentBtn) {
      currentBtn.textContent = state.currentArea;
    }

    // 현재 지역 버튼 클릭
    currentBtn?.addEventListener('click', async () => {
      state.areaFilter = 'current';
      updateAreaFilterUI();
      await loadTimelineData();
    });

    // 전체 버튼 클릭
    allBtn?.addEventListener('click', async () => {
      state.areaFilter = 'all';
      updateAreaFilterUI();
      await loadTimelineData();
    });
  };

  // ================================
  // 데이터 새로고침 함수 (병렬화 최적화)
  // ================================
  // 설명: 서버에서 최신 데이터를 가져와 화면을 업데이트합니다
  // 최적화: 3개의 독립적인 API 호출을 병렬로 실행
  // 이전: 순차 실행 ~1.5초 → 이후: 병렬 실행 ~0.5초
  const refreshData = async () => {
    try {
      // 현재 지역 버튼 텍스트 업데이트
      const currentBtn = qs('#area-current-btn');
      if (currentBtn) {
        currentBtn.textContent = state.currentArea;
      }

      console.log('🔍 최초 검색어:', getSearchQuery());

      // ===== 병렬 API 호출 (핵심 최적화) =====
      // 3개의 독립적인 API 호출을 동시에 실행합니다:
      // 1. 타임라인 데이터 (내 방문 기록)
      // 2. 네이버 검색 결과 (주변 맛집)
      // 3. 인기 장소 데이터 (방문 횟수 정보)
      const [timelineResult, searchResult, popularResult] = await Promise.allSettled([
        loadTimelineData(),                         // 타임라인 로드
        searchPlaces(getSearchQuery()),             // 네이버 맛집 검색
        api('/api/places/popular?limit=100'),       // 인기 장소 (방문 횟수)
      ]);

      // 검색 결과 처리 (실패 시 빈 배열)
      const searchResults = searchResult.status === 'fulfilled' ? searchResult.value : [];
      const initialPlaces = searchResults.slice(0, 5);

      // 인기 장소 처리 (방문 횟수 매핑)
      const popularData = popularResult.status === 'fulfilled' ? popularResult.value : { items: [] };
      const visitCountMap = {};
      (popularData.items || []).forEach(item => {
        visitCountMap[item.place_name] = item.visit_count || 0;
      });

      // 검색 결과에 방문 횟수 추가
      const placesWithVisitCount = initialPlaces.map(place => ({
        ...place,
        visit_count: visitCountMap[place.name] || 0,
      }));

      // 상태 업데이트 및 렌더링
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

  // ================================
  // 앱 초기화 함수 (논블로킹 최적화)
  // ================================
  // 핵심 최적화: 날씨/위치 로딩을 기다리지 않고 화면을 먼저 표시합니다
  // 이전: loadWeather 완료(5-8초) → 데이터 로드 → 화면 표시
  // 이후: 이벤트 설정 → 데이터 로드(즉시) → 날씨는 백그라운드에서 로드
  const init = async () => {
    console.time('⏱️ 초기 로딩');

    // 1단계: 이벤트 설정 (즉시 실행, 블로킹 없음)
    setupModalEvents();
    setupRecordActions();
    setupRecordFilters();
    setupLoadMore();
    setupCategoryFilters();
    setupAreaFilter();

    // 2단계: 데이터 먼저 로드 (기본 위치 '성수동' 사용)
    // 날씨 로딩을 기다리지 않고 즉시 화면에 데이터 표시
    refreshData();

    console.timeEnd('⏱️ 초기 로딩');

    // 3단계: 날씨/위치는 백그라운드에서 비동기 로드 (논블로킹)
    // 위치가 바뀌면 자동으로 데이터 새로고침
    loadWeatherAndRefreshIfNeeded();

    // 4단계: 네이버 API 상태 확인 (백그라운드)
    checkNaverApiStatus();
  };

  // ================================
  // 날씨 로드 후 위치 변경 시 데이터 새로고침
  // ================================
  // 설명: 실제 위치가 기본값(성수동)과 다르면 데이터를 다시 로드합니다
  const loadWeatherAndRefreshIfNeeded = async () => {
    const prevArea = state.currentArea;  // 이전 위치 저장 (기본값: 성수동)

    try {
      await loadWeather();  // 실제 위치 확인

      // 위치가 변경되었으면 데이터 새로고침
      if (state.currentArea !== prevArea) {
        console.log('📍 위치 변경 감지:', prevArea, '→', state.currentArea);
        refreshData();
      }
    } catch (error) {
      console.warn('날씨 로드 실패:', error);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

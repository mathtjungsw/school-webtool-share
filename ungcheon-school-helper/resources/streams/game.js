// ─── 게임 상태 ───
const state = {
    board: Array(20).fill(null),
    currentNumber: null,
    turnCount: 0,
    isGameOver: false,
    roomSeed: null,
    randomFunc: null,
    nickname: '',
    myTeam: '',
    gameMode: 'battle', // 'battle' 또는 'league'
    allowDuplicates: false, // 추가: 중복 허용 여부
    othersResults: [],
};

// ─── DOM 참조 ───
const screens = {
    main: document.getElementById('main-screen'),
    game: document.getElementById('game-screen'),
};

const el = {
    currentNumberValue: document.getElementById('current-number-value'),
    turnDisplay: document.getElementById('turn-display'),
    boardGrid: document.getElementById('board-grid'),
    drawBtn: document.getElementById('draw-btn'),
    generateArea: document.getElementById('generate-area'),
    howToModal: document.getElementById('how-to-modal'),
    resultModal: document.getElementById('result-modal'),
    multiplayerModal: document.getElementById('multiplayer-modal'), // 추가
    resultScore: document.getElementById('result-score'),
    resultGrade: document.getElementById('result-grade'),
    resultAnalysisText: document.getElementById('result-analysis-text'),
    streakReport: document.getElementById('streak-report'),
    roomCodeDisplay: document.getElementById('room-code-display'),
    roomCodeInput: document.getElementById('room-code-input'),
    nicknameInput: document.getElementById('nickname-input'), // 추가
    leaderboardList: document.getElementById('leaderboard-list'), // 추가
    rankingModal: document.getElementById('ranking-modal'),
    topRankingList: document.getElementById('top-ranking-list'),
};

// ─── 화면 전환 ───
function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

// ─── 배경 숫자 패턴 생성 ───
function createBgPattern() {
    const container = document.querySelector('.bg-pattern');
    for (let i = 0; i < 18; i++) {
        const el = document.createElement('div');
        el.className = 'bg-number';
        el.textContent = Math.floor(Math.random() * 30) + 1;
        el.style.left = Math.random() * 100 + 'vw';
        el.style.animationDuration = (12 + Math.random() * 20) + 's';
        el.style.animationDelay = (Math.random() * 15) + 's';
        el.style.fontSize = (1.5 + Math.random() * 2.5) + 'rem';
        container.appendChild(el);
    }
}

// ─── 결정론적 난수 생성기 (Mulberry32) ───
function seedRandom(a) {
    return function () {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// ─── 게임 상태 저장/복원 ───
const SAVE_KEY = 'streams_game_state';

function saveGameState() {
    if (state.isGameOver) {
        clearGameState();
        return;
    }
    const snapshot = {
        board: state.board,
        currentNumber: state.currentNumber,
        turnCount: state.turnCount,
        roomSeed: state.roomSeed,
        gameMode: state.gameMode,
        myTeam: state.myTeam,
        isMultiplayer: state.isMultiplayer || false,
        allowDuplicates: state.allowDuplicates,
        // PRNG 상태: 몇 번 호출했는지 기록 (turnCount + currentNumber 유무)
        prngCallCount: state.turnCount + (state.currentNumber !== null ? 1 : 0),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
}

function loadGameState() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function clearGameState() {
    localStorage.removeItem(SAVE_KEY);
}

// ─── 게임 초기화 ───
function initGame(seed = null, forceNew = false) {
    // 저장된 상태 확인 (새 게임 강제 시작이 아닐 때)
    if (!forceNew) {
        const saved = loadGameState();
        if (saved && saved.roomSeed === (seed || saved.roomSeed) && saved.turnCount > 0 && !saved.isGameOver) {
            const resume = confirm(`이전에 진행 중인 게임이 있습니다! (${saved.turnCount}/20턴)\n이어서 하시겠습니까?\n\n[확인] 이어하기  [취소] 새로 시작`);
            if (resume) {
                restoreGameState(saved);
                return;
            } else {
                clearGameState();
            }
        }
    }

    state.board = Array(20).fill(null);
    state.currentNumber = null;
    state.turnCount = 0;
    state.isGameOver = false;
    state.simulatedTeamMembers = null;

    // 시드 설정 (seed가 있으면 멀티플레이어, 없으면 혼자하기)
    state.isMultiplayer = !!seed;
    state.roomSeed = seed || Math.floor(Math.random() * 9000) + 1000;
    state.randomFunc = seedRandom(state.roomSeed);

    // UI 표시 업데이트 (멀티플레이어일 때만 방 번호 표시)
    document.querySelectorAll('.current-room-info').forEach(el => {
        if (state.isMultiplayer) {
            el.textContent = `방 번호: ${state.roomSeed}`;
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    });

    renderBoard();
    updateUI();
    el.generateArea.classList.remove('visible');
    showScreen('game');
    saveGameState();

    // 첫 번째 숫자 자동 뽑기
    setTimeout(() => {
        drawNumber();
    }, 500);
}

function restoreGameState(saved) {
    state.board = saved.board;
    state.currentNumber = saved.currentNumber;
    state.turnCount = saved.turnCount;
    state.isGameOver = false;
    state.roomSeed = saved.roomSeed;
    state.gameMode = saved.gameMode || 'battle';
    state.myTeam = saved.myTeam || '';
    state.isMultiplayer = saved.isMultiplayer || false;
    const allowDup = saved.allowDuplicates !== undefined ? saved.allowDuplicates : false;
    setDuplicateMode(allowDup);
    state.simulatedTeamMembers = null;

    // PRNG를 저장된 호출 횟수만큼 빠르게 재생
    state.randomFunc = seedRandom(state.roomSeed);
    for (let i = 0; i < saved.prngCallCount; i++) {
        state.randomFunc();
    }

    // UI 복원 (멀티플레이어일 때만 방 번호 표시)
    document.querySelectorAll('.current-room-info').forEach(el => {
        if (state.isMultiplayer) {
            el.textContent = `방 번호: ${state.roomSeed}`;
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    });

    renderBoard();
    updateUI();

    if (state.turnCount >= 20) {
        state.isGameOver = true;
        el.generateArea.classList.add('visible');
    } else {
        el.generateArea.classList.remove('visible');
    }

    showScreen('game');
}

// ─── 다인용 관련 함수 ───
function startSolo() {
    if (!saveNickname()) return; // 닉네임 체크
    initGame(null, true);
}

function openMultiplayer() {
    if (!saveNickname()) return; // 닉네임 체크
    const roomCode = Math.floor(Math.random() * 9000) + 1000;
    el.roomCodeDisplay.textContent = roomCode;
    openModal('multiplayer-modal');
}

function selectTeam(team) {
    state.myTeam = team;
    document.querySelectorAll('.team-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.team === team) btn.classList.add('active');
    });
}

function selectMode(mode) {
    state.gameMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mode === mode) btn.classList.add('active');
    });

    const teamSection = document.getElementById('team-select-section');
    if (mode === 'league') {
        teamSection.style.display = 'block';
    } else {
        teamSection.style.display = 'none';
        state.myTeam = '';
        document.querySelectorAll('.team-btn').forEach(btn => btn.classList.remove('active'));
    }
}

// ─── 중복 모드 설정 ───
function setDuplicateMode(allow) {
    state.allowDuplicates = allow;

    // UI 업데이트 (메인 화면)
    document.querySelectorAll('.dup-mode-btn').forEach(btn => {
        btn.classList.remove('active');
        if ((allow && btn.id === 'main-dup-true') || (!allow && btn.id === 'main-dup-false')) {
            btn.classList.add('active');
        }
    });

    // UI 업데이트 (멀티 모달)
    document.querySelectorAll('.multi-dup-btn').forEach(btn => {
        btn.classList.remove('active');
        if ((allow && btn.id === 'multi-dup-true') || (!allow && btn.id === 'multi-dup-false')) {
            btn.classList.add('active');
        }
    });

    // 배지 업데이트
    const badge = document.getElementById('game-mode-badge');
    if (badge) {
        badge.textContent = allow ? '중복 허용' : '중복 금지';
        badge.style.background = allow ? 'rgba(99, 102, 241, 0.2)' : 'rgba(251, 191, 36, 0.2)';
        badge.style.borderColor = allow ? 'var(--indigo-400)' : 'var(--yellow)';
        badge.style.color = allow ? 'var(--indigo-300)' : 'var(--yellow)';
    }
}

function saveNickname() {
    const name = el.nicknameInput.value.trim();
    if (!name) {
        alert('게임을 시작하기 전에 닉네임을 입력해주세요!');
        el.nicknameInput.focus();
        return false;
    }
    state.nickname = name;
    localStorage.setItem('streams_nickname', name);
    return true;
}

function loadNickname() {
    const saved = localStorage.getItem('streams_nickname');
    if (saved) {
        state.nickname = saved;
        el.nicknameInput.value = saved;
    }
}

// ─── URL 파라미터 체크 ───
function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const results = params.get('results');
    const team = params.get('team');
    const mode = params.get('mode');
    const dup = params.get('dup');

    if (dup !== null) {
        setDuplicateMode(dup === 'true');
    }

    if (mode) {
        selectMode(mode);
    }

    if (team) {
        selectTeam(team);
    }

    // 친구들 점수 파싱 (Alice:520:A,Bob:480:B)
    if (results) {
        state.othersResults = results.split(',').map(item => {
            const parts = item.split(':');
            return {
                name: decodeURIComponent(parts[0]),
                score: parseInt(parts[1]),
                team: parts[2] || 'A'
            };
        });
    }

    if (room && room.length === 4) {
        initGame(parseInt(room));
    }
}

function copyRoomLink() {
    const code = el.roomCodeDisplay.textContent;

    // 로컬 파일(file://)에서도 동작하도록 origin 처리
    const origin = (window.location.protocol === 'file:')
        ? ''
        : window.location.origin;
    let url = `${origin}${window.location.pathname}?room=${code}&mode=${state.gameMode}&dup=${state.allowDuplicates}`;

    if (state.gameMode === 'league' && state.myTeam) {
        url += `&team=${state.myTeam}`;
    }

    // 점수 이력 보존
    if (state.othersResults.length > 0) {
        const resultsStr = state.othersResults.map(r => `${encodeURIComponent(r.name)}:${r.score}:${r.team || ''}`).join(',');
        url += `&results=${resultsStr}`;
    }

    // 클립보드 복사 (로컬 파일은 경로 안내)
    if (window.location.protocol === 'file:') {
        alert(`방 번호를 친구에게 알려주세요!\n\n방 번호: ${code}\n\n친구는 게임 실행 후 "친구와 대결하기" → 방 번호 입력 후 입장하면 됩니다.`);
    } else {
        navigator.clipboard.writeText(url).then(() => {
            alert('초대 링크가 복사되었습니다!');
        });
    }
}

function startMultiplayer() {
    if (!saveNickname()) return;
    if (state.gameMode === 'league' && !state.myTeam) {
        alert('참여할 팀을 선택해주세요!');
        return;
    }
    const seed = parseInt(el.roomCodeDisplay.textContent);
    closeModal('multiplayer-modal');
    initGame(seed);
}

function joinRoom() {
    if (!saveNickname()) return;
    if (state.gameMode === 'league' && !state.myTeam) {
        alert('참여할 팀을 선택해주세요!');
        return;
    }
    const code = el.roomCodeInput.value.trim();
    if (code && code.length === 4) {
        closeModal('multiplayer-modal');
        initGame(parseInt(code));
    } else {
        alert('4자리 방 번호를 입력해주세요.');
    }
}

// ─── 랜덤 숫자 뽑기 (1~30) ───
function drawNumber() {
    if (state.currentNumber !== null || state.turnCount >= 20) return;

    // 시드 기반 난수 사용 (randomFunc가 없으면 생성)
    if (!state.randomFunc) state.randomFunc = seedRandom(Date.now());

    let num;
    if (state.allowDuplicates) {
        num = Math.floor(state.randomFunc() * 30) + 1;
    } else {
        // 중복 금지 모드: 현재 보드에 없는 숫자 중 선택
        const used = new Set(state.board.filter(n => n !== null));
        const available = [];
        for (let i = 1; i <= 30; i++) {
            if (!used.has(i)) available.push(i);
        }

        if (available.length === 0) {
            num = Math.floor(state.randomFunc() * 30) + 1; // 발생하면 안되지만 안전장치
        } else {
            const idx = Math.floor(state.randomFunc() * available.length);
            num = available[idx];
        }
    }
    state.currentNumber = num;

    el.currentNumberValue.textContent = state.currentNumber;
    el.currentNumberValue.classList.remove('pop');
    void el.currentNumberValue.offsetWidth; // reflow
    el.currentNumberValue.classList.add('pop');

    updateUI();
    saveGameState(); // 숫자 뽑기 후 자동 저장
}

// ─── 슬롯에 숫자 배치 ───
function placeNumber(index) {
    if (state.board[index] !== null || state.currentNumber === null) return;

    state.board[index] = state.currentNumber;
    state.currentNumber = null;
    state.turnCount++;

    el.currentNumberValue.textContent = '?';

    renderBoard();
    updateUI();

    if (state.turnCount >= 20) {
        state.isGameOver = true;
        clearGameState(); // 게임 종료 시 저장 데이터 삭제
        el.generateArea.classList.add('visible');
        el.generateArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        saveGameState(); // 자동 저장

        // 다음 숫자 자동 뽑기 추가
        setTimeout(() => {
            drawNumber();
        }, 300);
    }
}

// ─── 보드 렌더링 ───
function renderBoard() {
    el.boardGrid.innerHTML = '';
    const streakIndices = getStreakIndices();

    state.board.forEach((num, i) => {
        const slot = document.createElement('div');
        slot.className = 'slot';

        const indexLabel = document.createElement('span');
        indexLabel.className = 'slot-index';
        indexLabel.textContent = i + 1;

        const numLabel = document.createElement('span');
        numLabel.className = 'slot-number';

        if (num !== null) {
            slot.classList.add('filled');
            if (streakIndices.has(i)) slot.classList.add('streak-highlight');
            numLabel.textContent = num;
        } else {
            slot.classList.add('empty');
            if (state.currentNumber !== null) slot.classList.add('can-place');
            slot.addEventListener('click', () => {
                placeNumber(i);
                slot.classList.add('placed-anim');
            });
        }

        slot.appendChild(indexLabel);
        slot.appendChild(numLabel);
        el.boardGrid.appendChild(slot);
    });
}

// ─── UI 상태 업데이트 ───
function updateUI() {
    el.turnDisplay.innerHTML = `<span>${state.turnCount}</span> / 20`;
    el.drawBtn.disabled = state.currentNumber !== null || state.turnCount >= 20;

    updateTeamLiveStatus(); // 팀원 현황 갱신 추가
}

function updateTeamLiveStatus() {
    const panel = document.getElementById('team-live-panel');
    const nameEl = document.getElementById('live-team-name');
    const container = document.getElementById('team-live-members');

    if (state.gameMode !== 'league' || !state.myTeam) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    nameEl.textContent = state.myTeam;

    // 시뮬레이션 데이터 (한 번만 생성)
    if (!state.simulatedTeamMembers) {
        state.simulatedTeamMembers = [
            { name: '고수플레이어', progress: 0, speed: 0.8 + Math.random() * 0.4 },
            { name: '행운의숫자', progress: 0, speed: 0.6 + Math.random() * 0.4 },
            { name: '전략가', progress: 0, speed: 0.7 + Math.random() * 0.4 }
        ];
    }

    container.innerHTML = '';
    state.simulatedTeamMembers.forEach(m => {
        // 내 진행도에 맞춰서 조금씩 랜덤하게 전진
        m.progress = Math.min(20, Math.floor(state.turnCount * m.speed + Math.random() * 2));

        const item = document.createElement('div');
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 4px;">
                <span>${m.name}</span>
                <span>${m.progress}/20</span>
            </div>
            <div style="height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                <div style="width: ${(m.progress / 20) * 100}%; height: 100%; background: var(--indigo-400); transition: width 0.5s ease;"></div>
            </div>
        `;
        container.appendChild(item);
    });
}

// ─── 점수 계산 알고리즘 ───
// 오름차순 스트릭 탐지 + 삼각수 가중치 (길수록 보너스)
function calculateScore() {
    const streaks = getStreaks();
    let total = 0;
    streaks.forEach(len => {
        // 스트릭 길이 n → n*(n+1)/2 점 (사용자 요청에 따라 1/10 조정)
        total += (len * (len + 1) / 2);
    });
    return total;
}

// 스트릭 길이 배열 반환
function getStreaks() {
    const streaks = [];
    let current = 1;
    for (let i = 0; i < state.board.length - 1; i++) {
        const a = state.board[i];
        const b = state.board[i + 1];
        if (a !== null && b !== null && a <= b) {
            current++;
        } else {
            streaks.push(current);
            current = 1;
        }
    }
    streaks.push(current);
    return streaks;
}

// 스트릭에 속하는 인덱스 집합 반환 (길이 2 이상)
function getStreakIndices() {
    const indices = new Set();
    let start = 0;
    let current = 1;
    for (let i = 0; i < state.board.length - 1; i++) {
        const a = state.board[i];
        const b = state.board[i + 1];
        if (a !== null && b !== null && a <= b) {
            current++;
        } else {
            if (current >= 2) {
                for (let j = start; j <= i; j++) indices.add(j);
            }
            start = i + 1;
            current = 1;
        }
    }
    if (current >= 2) {
        for (let j = start; j < state.board.length; j++) indices.add(j);
    }
    return indices;
}

// ─── 점수 등급 판정 ───
function getGrade(score) {
    if (score >= 80) return { label: '🏆 전설', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' };
    if (score >= 60) return { label: '💎 다이아', color: '#818cf8', bg: 'rgba(129,140,248,0.15)' };
    if (score >= 40) return { label: '🥇 골드', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
    if (score >= 25) return { label: '🥈 실버', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' };
    return { label: '🥉 브론즈', color: '#b45309', bg: 'rgba(180,83,9,0.15)' };
}

// ─── 분석 문구 생성 ───
function getAnalysisText(score, streaks) {
    const maxStreak = Math.max(...streaks);
    const streakCount = streaks.filter(s => s >= 2).length;

    let msg = '';
    if (score >= 80) {
        msg = `완벽에 가까운 배치입니다! 숫자의 흐름을 완전히 장악했네요. 최장 연속 ${maxStreak}개의 오름차순 스트릭은 정말 인상적입니다. 🎉`;
    } else if (score >= 60) {
        msg = `매우 훌륭한 전략이었습니다! ${streakCount}개의 오름차순 그룹을 만들었고, 최장 ${maxStreak}개 연속 스트릭을 달성했습니다. 조금만 더 연습하면 전설 등급도 가능합니다!`;
    } else if (score >= 40) {
        msg = `좋은 배치였습니다! 최장 ${maxStreak}개 연속 스트릭을 만들었네요. 숫자를 더 크게 묶어 배치하면 점수가 크게 오릅니다.`;
    } else if (score >= 25) {
        msg = `나쁘지 않은 시작입니다! 오름차순으로 숫자를 묶는 전략에 익숙해지면 점수가 빠르게 오를 거예요. 최장 스트릭은 ${maxStreak}개였습니다.`;
    } else {
        msg = `처음엔 누구나 어렵습니다! 핵심은 작은 숫자를 앞쪽에, 큰 숫자를 뒤쪽에 배치하는 것입니다. 다시 도전해보세요! 💪`;
    }
    return msg;
}

// ─── 개인 기록 관리 ───
const BEST_KEY = 'streams_best_scores';

function loadBestScores() {
    try {
        return JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
    } catch { return []; }
}

function saveBestScore(score) {
    // 혼자하기 모드(roomSeed가 없거나 멀티 아닌 경우)에서만 저장
    const records = loadBestScores();
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
    records.push({ score, date: dateStr });
    // 최대 20개 보관 (최신순)
    records.sort((a, b) => b.score - a.score);
    localStorage.setItem(BEST_KEY, JSON.stringify(records.slice(0, 20)));
    return records;
}

function getPersonalBest() {
    const records = loadBestScores();
    return records.length > 0 ? records[0].score : null;
}

// ─── 결과 분석 표시 ───
function showAnalysis() {
    const score = calculateScore();
    const streaks = getStreaks();
    const grade = getGrade(score);

    // 개인 기록 처리 (혼자하기 모드에서만)
    const isSoloMode = !state.roomSeed || state.othersResults.length === 0;
    let prevBest = getPersonalBest();
    let isNewRecord = false;

    if (isSoloMode) {
        saveBestScore(score);
        isNewRecord = prevBest === null || score > prevBest;
    }

    el.resultScore.textContent = score.toLocaleString();
    el.resultGrade.textContent = grade.label;
    el.resultGrade.style.color = grade.color;
    el.resultGrade.style.background = grade.bg;
    el.resultGrade.style.border = `1px solid ${grade.color}40`;
    el.resultAnalysisText.textContent = getAnalysisText(score, streaks);

    // 신기록 배너 표시
    let recordBanner = document.getElementById('record-banner');
    if (!recordBanner) {
        recordBanner = document.createElement('div');
        recordBanner.id = 'record-banner';
        el.resultScore.parentNode.insertBefore(recordBanner, el.resultScore.nextSibling);
    }

    if (isSoloMode) {
        if (isNewRecord) {
            recordBanner.innerHTML = `
                <div style="text-align:center; margin: 10px 0; padding: 10px 16px; background: linear-gradient(135deg, rgba(251,191,36,0.2), rgba(245,158,11,0.1)); border: 1px solid var(--yellow); border-radius: 12px; animation: pulse 1.5s ease infinite;">
                    🎉 <strong style="color: var(--yellow);">신기록 달성!</strong>
                    ${prevBest !== null ? `<span style="font-size:0.8rem; color:var(--text-muted); margin-left:8px;">이전 최고: ${prevBest}점</span>` : ''}
                </div>`;
        } else {
            recordBanner.innerHTML = `
                <div style="text-align:center; margin: 10px 0; padding: 8px 16px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 12px;">
                    <span style="font-size:0.85rem; color:var(--text-muted);">🏅 개인 최고: <strong style="color:var(--indigo-300);">${prevBest}점</strong> | 이번: ${score}점 (${score >= prevBest ? '=' : `-${prevBest - score}`}점)</span>
                </div>`;
        }
    } else {
        recordBanner.innerHTML = '';
    }

    // 스트릭 리포트 배지
    el.streakReport.innerHTML = '';
    streaks.forEach((len, i) => {
        const badge = document.createElement('span');
        badge.className = 'streak-badge';
        badge.textContent = `그룹 ${i + 1}: ${len}연속 (+${(len * (len + 1) / 2)}점)`;
        el.streakReport.appendChild(badge);
    });

    // 결과 보드 하이라이트 갱신
    renderBoard();

    renderLeaderboard(score); // 순위표 렌더링 추가

    openModal('result-modal');
}

// ─── 순위표 렌더링 ───
function renderLeaderboard(myScore) {
    // 모든 점수 합치기 (나 + 친구들)
    let allResults = [...state.othersResults];

    // 내 점수가 이미 있는지 확인 (중복 방지)
    const myIndex = allResults.findIndex(r => r.name === state.nickname);
    if (myIndex > -1) {
        allResults[myIndex].score = Math.max(allResults[myIndex].score, myScore);
        allResults[myIndex].team = state.myTeam || '';
    } else {
        allResults.push({ name: state.nickname, score: myScore, team: state.myTeam || '' });
    }

    // 1. 개인별 순위표 렌더링
    allResults.sort((a, b) => b.score - a.score);
    el.leaderboardList.innerHTML = '';
    allResults.forEach((res, i) => {
        const isMe = res.name === state.nickname;
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '10px 14px';
        item.style.marginBottom = '6px';
        item.style.background = isMe ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)';
        item.style.borderRadius = '10px';
        item.style.border = isMe ? '1px solid var(--indigo-400)' : '1px solid transparent';

        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        const teamInfo = (state.gameMode === 'league' && res.team) ? `<span style="font-size: 0.7rem; color: var(--text-muted);">${res.team}팀</span>` : '';

        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 900; color: var(--indigo-300); width: 24px;">${medal}</span>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 700; color: ${isMe ? 'white' : 'var(--text-secondary)'};">${res.name} ${isMe ? '(나)' : ''}</span>
                    ${teamInfo}
                </div>
            </div>
            <span style="font-weight: 700; color: var(--indigo-300);">${res.score.toLocaleString()}</span>
        `;
        el.leaderboardList.appendChild(item);
    });

    // 2. 팀별 랭킹 (리그) 렌더링 (리그 모드에서만)
    if (state.gameMode === 'league') {
        renderTeamRanking(allResults);
    } else {
        const teamSection = document.getElementById('team-league-section');
        if (teamSection) teamSection.style.display = 'none';
    }

    // 공유 링크 업데이트 (현재 랭킹 포함)
    updateShareBtn(allResults);
}

function renderTeamRanking(allResults) {
    const teams = {}; // { A: [500, 400], B: [600] }
    allResults.forEach(r => {
        if (!teams[r.team]) teams[r.team] = [];
        teams[r.team].push(r.score);
    });

    const teamList = Object.keys(teams).map(t => {
        const scores = teams[t];
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return { name: t, avg: avg, count: scores.length };
    });

    teamList.sort((a, b) => b.avg - a.avg);

    // 팀 순위표 UI 생성
    let teamSection = document.getElementById('team-league-section');
    if (!teamSection) {
        teamSection = document.createElement('div');
        teamSection.id = 'team-league-section';
        teamSection.className = 'result-analysis';
        teamSection.style.borderColor = 'var(--yellow)';
        teamSection.style.marginTop = '20px';
        teamSection.innerHTML = `<h3 style="color: var(--yellow);">🏆 팀 대항 리그 순위</h3><div id="team-list" style="margin-top: 10px;"></div>`;
        el.leaderboardList.parentNode.insertBefore(teamSection, el.leaderboardList.nextSibling);
    }

    const teamListEl = teamSection.querySelector('#team-list');
    teamListEl.innerHTML = '';
    teamList.forEach((team, i) => {
        const isMyTeam = team.name === state.myTeam;
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.padding = '10px 14px';
        item.style.marginBottom = '6px';
        item.style.background = isMyTeam ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255,255,255,0.05)';
        item.style.borderRadius = '10px';
        item.style.border = isMyTeam ? '1px solid var(--yellow)' : '1px solid transparent';

        item.innerHTML = `
            <div>
                <span style="font-weight: 900; color: var(--yellow); margin-right: 8px;">${i + 1}위</span>
                <span style="font-weight: 700; color: white;">${team.name}팀 <small style="font-weight: 400; color: var(--text-muted);">(${team.count}명)</small></span>
            </div>
            <span style="font-weight: 900; color: var(--yellow);">평균 ${team.avg.toFixed(1)}</span>
        `;
        teamListEl.appendChild(item);
    });
}

function updateShareBtn(allResults) {
    const feedbackBtn = el.resultModal.querySelector('.btn-yellow');
    let shareBtn = document.getElementById('share-result-btn');

    // 혼자하기 모드이거나 멀티플레이어가 아니면 공유 버튼 숨김
    if (!state.isMultiplayer) {
        if (shareBtn) shareBtn.style.display = 'none';
        return;
    }

    const code = state.roomSeed;
    // 모든 사람의 점수를 포함한 결과 URL 생성 (name:score:team)
    const resultStr = allResults.map(r => `${encodeURIComponent(r.name)}:${r.score}:${r.team}`).join(',');

    // 로컬 파일(file://)에서도 동작하도록 origin 처리
    const origin = (window.location.protocol === 'file:') ? '' : window.location.origin;
    const shareUrl = `${origin}${window.location.pathname}?room=${code}&results=${resultStr}`;

    // 피드백 버튼 아래에 공유용 버튼 추가
    if (!shareBtn) {
        shareBtn = document.createElement('button');
        shareBtn.id = 'share-result-btn';
        shareBtn.className = 'btn btn-primary';
        shareBtn.style.width = '100%';
        shareBtn.style.marginTop = '12px';
        shareBtn.innerHTML = '🏆 리그 결과 공유하기';
        feedbackBtn.parentNode.insertBefore(shareBtn, feedbackBtn.nextSibling);
    }
    shareBtn.style.display = 'flex';

    shareBtn.onclick = () => {
        if (window.location.protocol === 'file:') {
            alert(`방 번호를 친구에게 알려주세요!\n\n방 번호: ${code}\n\n친구는 게임 실행 후 "친구와 대결하기" → 방 번호 입력 후 입장하면 됩니다.`);
        } else {
            navigator.clipboard.writeText(shareUrl).then(() => {
                alert('팀 리그 랭킹이 포함된 결과 링크가 복사되었습니다!');
            });
        }
    };
}

// ─── 모달 제어 ───
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// 오버레이 클릭 시 닫기
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
    });
});

// ─── 가이드 탭 전환 ───
function switchGuideTab(tabName) {
    // 탭 버튼 상태 업데이트
    document.querySelectorAll('.guide-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(`'${tabName}'`)) btn.classList.add('active');
    });

    // 가이드 콘텐츠 업데이트
    document.querySelectorAll('.guide-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`guide-${tabName}`).classList.add('active');
}

// ─── 카카오 피드백 링크 ───
function openKakao() {
    window.open('https://open.kakao.com/o/sh4gBw6c', '_blank');
}

// ─── 홈으로 이동 ───
function goToMain() {
    if (state.turnCount > 0 && state.turnCount < 20 && !state.isGameOver) {
        if (!confirm('게임이 진행 중입니다. 메인 화면으로 돌아가시겠습니까? (현재 진행 상황은 저장됩니다)')) {
            return;
        }
    }

    // 모달들 닫기
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
    });

    showScreen('main');
}

// ─── 최고 기록 랭킹 열기 ───
function openTopRankings() {
    renderTopRankingList();
    openModal('ranking-modal');
}

function renderTopRankingList() {
    const records = loadBestScores();
    const container = el.topRankingList;

    if (!container) return;

    container.innerHTML = '';

    if (records.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px;">아직 기록된 점수가 없습니다.<br>게임을 플레이하여 첫 기록을 남겨보세요!</p>`;
        return;
    }

    // 상위 10개만 표시
    const top10 = records.slice(0, 10);

    top10.forEach((rec, i) => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '12px 16px';
        item.style.marginBottom = '8px';
        item.style.background = 'rgba(255, 255, 255, 0.05)';
        item.style.borderRadius = '12px';
        item.style.border = '1px solid rgba(255, 255, 255, 0.05)';

        const rank = i + 1;
        const rankSymbol = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;

        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <span style="font-size: 1.1rem; font-weight: 900; color: var(--indigo-300); width: 24px; text-align: center;">${rankSymbol}</span>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 700; color: var(--text-primary);">${state.nickname || '익명'}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${rec.date}</span>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 1.2rem; font-weight: 900; color: var(--yellow);">${rec.score.toLocaleString()}</div>
                <div style="font-size: 0.7rem; color: var(--text-muted);">점</div>
            </div>
        `;
        container.appendChild(item);
    });
}

// ─── 게임 재시작 ───
function restartGame() {
    closeModal('result-modal');
    initGame(null, true); // 저장 상태 무시하고 새로 시작
}

// ─── 초기 실행 ───
createBgPattern();
loadNickname(); // 닉네임 로드 추가
checkUrlParams();
if (!screens.game.classList.contains('active')) {
    showScreen('main');
}

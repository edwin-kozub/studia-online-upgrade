let clickInterval = 60;
let autoClickEnabled = false;
let focusSimEnabled = true;
let nextClickTimer = null;

// =========================================================================
//  Guard: wykrywanie unieważnionego kontekstu po przeładowaniu wtyczki
// =========================================================================

function isContextValid() {
    try { return !!chrome.runtime?.id; } catch (_) { return false; }
}

let _mainIntervalId = null;

// =========================================================================
//  Śledzenie postępu nauki
// =========================================================================
const sessionOpenedAt = Date.now();
const sessionId = sessionOpenedAt + '-' + Math.random().toString(36).slice(2, 8);
const sessionStorageKey = 'wskz_active_' + sessionId;
const lessonKey = location.pathname.replace(/^\/+|\/+$/g, '');
let initialDataLoaded = false;
let cachedInitials = null; // { materials: [{id, initialPercent}], initialLessonPercent }

chrome.storage.sync.get(['clickInterval', 'autoClickEnabled', 'focusSimEnabled'], (result) => {
    clickInterval = result.clickInterval !== undefined ? result.clickInterval : 60;
    autoClickEnabled = result.autoClickEnabled !== undefined ? result.autoClickEnabled : false;
    focusSimEnabled = result.focusSimEnabled !== undefined ? result.focusSimEnabled : true;

    if (autoClickEnabled) {
        startAutoClicker();
    }

    // Wyślij stan skupienia do MAIN world (scroll_patch.js)
    syncFocusSim();

    insertDownloadButtonsAndModifyTitles();
    updateTitle();
    updateFavicon();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        let shouldRestart = false;

        if (changes.clickInterval) {
            clickInterval = changes.clickInterval.newValue;
            shouldRestart = true;
        }
        if (changes.autoClickEnabled) {
            autoClickEnabled = changes.autoClickEnabled.newValue;
            shouldRestart = true;
        }
        if (changes.focusSimEnabled) {
            focusSimEnabled = changes.focusSimEnabled.newValue;
            syncFocusSim();
            updateFavicon();
        }
        if (shouldRestart) {
            if (autoClickEnabled) {
                startAutoClicker();
            } else {
                stopAutoClicker();
            }
        }
    }
});

function syncFocusSim() {
    window.postMessage({ type: "WSKZ_FOCUS_SIM_TOGGLE", enabled: focusSimEnabled }, "*");
}

function startAutoClicker() {
    if (nextClickTimer) clearInterval(nextClickTimer);
    nextClickTimer = setInterval(attemptNextPage, clickInterval * 1000);
}

function stopAutoClicker() {
    if (nextClickTimer) {
        clearInterval(nextClickTimer);
        nextClickTimer = null;
    }
}

// =========================================================================
//  AUTO-NAWIGACJA PDF: przez input numeru strony + Enter
// =========================================================================
//
//  DLACZEGO NIE KLIKAMY button.next W PDF:
//    Kliknięcie button.next wewnątrz .pdf-container powoduje scroll
//    całej strony do kontenera PDF — uciążliwy efekt uboczny.
//
//  NOWA METODA:
//    Odczytujemy numer strony z input.page_num_input,
//    wpisujemy następny numer i wciskamy Enter.
//    Platforma PDF.js reaguje na Enter w inpucie — zmienia stronę
//    bez scrollowania strony.
//
//  UWAGA: Przeklikiwanie stron PDF NIE wpływa na postęp.
//    Postęp jest mierzony WYŁĄCZNIE czasem aktywności karty (hasFocus).
//    Platforma liczy sekundy i wysyła ticki co 25s — strony PDF są ignorowane.
// =========================================================================

function attemptNextPage() {
    const pdfContainers = document.querySelectorAll('.pdf-container');

    for (const container of pdfContainers) {
        const pageInput = container.querySelector('input.page_num_input');
        const pageCountSpan = container.querySelector('span.page_count');

        if (!pageInput || !pageCountSpan) continue;

        const currentPage = parseInt(pageInput.value, 10);
        const totalPages = parseInt(pageCountSpan.textContent, 10);

        if (isNaN(currentPage) || isNaN(totalPages)) continue;

        if (currentPage < totalPages) {
            const nextPage = currentPage + 1;
            const pdfIdx = pdfContainers.length > 1
                ? ` (PDF ${Array.from(pdfContainers).indexOf(container) + 1}/${pdfContainers.length})`
                : '';
            console.log(`WSKZ Auto: strona ${nextPage}/${totalPages}${pdfIdx}`);

            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeSetter.call(pageInput, nextPage.toString());

            pageInput.dispatchEvent(new Event('input', { bubbles: true }));
            pageInput.dispatchEvent(new Event('change', { bubbles: true }));

            pageInput.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
            }));
            pageInput.dispatchEvent(new KeyboardEvent('keypress', {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
            }));
            pageInput.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
            }));

            return;
        }
        // Ten PDF na ostatniej stronie — sprawdź kolejne kontenery
    }

    // Wszystkie PDF-y przeklinkane (lub brak PDF) → następna lekcja
    attemptNextLesson();
}

// Przycisk "następna lekcja" — button.next POZA .pdf-container
function attemptNextLesson() {
    const allNextBtns = document.querySelectorAll('button.next');
    for (const btn of allNextBtns) {
        if (!btn.closest('.pdf-container') && !btn.disabled) {
            console.log("WSKZ Auto: klikam przycisk następnej lekcji");
            window.postMessage({ type: "WSKZ_PREVENT_SCROLL" }, "*");
            btn.click();
            return;
        }
    }
}

// =========================================================================
//  Pobieranie plików i nazewnictwo
// =========================================================================

function extractCourseNumber() {
    const activeLesson = document.querySelector('.course-lesson--active');
    if (activeLesson) {
        const parentTopic = activeLesson.closest('.course-topic');
        if (parentTopic) {
            const topicLink = parentTopic.querySelector('.course-topic__link');
            if (topicLink) {
                const text = topicLink.textContent.trim();
                const match = text.match(/^(\d+)\./);
                if (match) return match[1] + ".";
            }
        }
    }

    // Fallback: .course-topic--active (lekcja NIE jest zagnieżdżona w topic)
    const activeTopicLink = document.querySelector('.course-topic--active .course-topic__link');
    if (activeTopicLink) {
        const text = activeTopicLink.textContent.trim();
        const match = text.match(/^(\d+)\./);
        if (match) return match[1] + ".";
    }

    return "X.";
}

function extractLessonNumber() {
    const activeLessonLink = document.querySelector('.course-lesson--active .course-lesson__link') || document.querySelector('.course-lesson__link');
    if (activeLessonLink) {
        const text = activeLessonLink.textContent.trim();
        const match = text.match(/^(\d+)\./);
        if (match) return match[1] + ".";
    }
    return "X.";
}

function getTitleFromSibling(element) {
    let currentEl = element.previousElementSibling;
    for (let i = 0; i < 5 && currentEl; i++) {
        if (currentEl.tagName === 'P' && currentEl.textContent.trim()) {
            return currentEl.textContent.trim();
        }
        currentEl = currentEl.previousElementSibling;
    }
    return "Zasób";
}

function buildFilename(baseName, extension) {
    const courseNum = extractCourseNumber();
    const lessonNum = extractLessonNumber();

    let match = baseName.match(/^(\d+)\.\s*(.*)/);
    if (match) {
        return `${courseNum}${lessonNum}${match[1]}. ${match[2]}.${extension}`
            .replace(/\s+/g, ' ').replace(/[<>:"\/\\|?*]+/g, '');
    }
    return `${courseNum}${lessonNum} ${baseName}.${extension}`
        .replace(/\s+/g, ' ').replace(/[<>:"\/\\|?*]+/g, '');
}

function buildBaseName(baseName) {
    const courseNum = extractCourseNumber();
    const lessonNum = extractLessonNumber();

    let match = baseName.match(/^(\d+)\.\s*(.*)/);
    if (match) {
        return `${courseNum}${lessonNum}${match[1]}. ${match[2]}`
            .replace(/\s+/g, ' ').replace(/[<>:"\/\\|?*]+/g, '');
    }
    return `${courseNum}${lessonNum} ${baseName}`
        .replace(/\s+/g, ' ').replace(/[<>:"\/\\|?*]+/g, '');
}

function createSmallDownloadButton(text, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerText = text;
    Object.assign(btn.style, {
        marginLeft: '15px', padding: '4px 8px',
        backgroundColor: '#0b5394', color: 'white',
        border: 'none', cursor: 'pointer', borderRadius: '4px',
        fontWeight: 'bold', fontSize: '12px', display: 'inline-block'
    });

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
    }, true);

    return btn;
}

function insertDownloadButtonsAndModifyTitles() {
    // 1. Przyciski pobierania PDF
    document.querySelectorAll('.pdf-container').forEach((container) => {
        if (container.hasAttribute('data-download-injected')) return;
        container.setAttribute('data-download-injected', 'true');

        const pdfUrl = container.getAttribute('data-url');
        if (!pdfUrl) return;

        const baseName = getTitleFromSibling(container);
        const finalFilename = buildFilename(baseName, 'pdf');

        const btn = createSmallDownloadButton('Pobierz PDF', () => {
            if (!isContextValid()) return;
            chrome.runtime.sendMessage({ action: 'download', url: pdfUrl, filename: finalFilename });
        });

        const toolbar = container.querySelector('.pdf-toolbar');
        if (toolbar) {
            toolbar.appendChild(btn);
        } else {
            container.parentNode.insertBefore(btn, container);
        }
    });

    // 2. Modyfikacja tytułów + kopiowanie do schowka
    document.querySelectorAll('p b').forEach((bElem) => {
        if (bElem.hasAttribute('data-title-modified')) return;

        const originalText = bElem.textContent.trim();
        if (!/^\d+\./.test(originalText)) return;

        bElem.setAttribute('data-title-modified', 'true');
        const newNameText = buildBaseName(originalText);

        bElem.textContent = newNameText;
        Object.assign(bElem.style, {
            cursor: 'pointer', color: '#0b5394', textDecoration: 'underline'
        });
        bElem.title = 'Kliknij, aby skopiować wygenerowaną nazwę pliku';

        bElem.addEventListener('click', (e) => {
            e.preventDefault();
            navigator.clipboard.writeText(newNameText).then(() => {
                const origColor = bElem.style.color;
                const origText = bElem.textContent;
                bElem.style.color = '#2e7d32';
                bElem.textContent = "Skopiowano!";
                setTimeout(() => {
                    bElem.style.color = origColor;
                    bElem.textContent = origText;
                }, 1000);
            });
        });
    });
}

// =========================================================================
//  Zbieranie danych postępu z DOM
// =========================================================================

function collectProgressData() {
    const activeLesson = document.querySelector('.course-lesson--active');
    if (!activeLesson) return null;

    // Nazwa lekcji
    let lessonTitle = '';
    let topicNum = '';
    const activeTopicLink = document.querySelector('.course-topic--active .course-topic__link');
    if (activeTopicLink) {
        const m = activeTopicLink.textContent.trim().match(/^(\d+)\./);
        if (m) topicNum = m[1];
    }
    const lessonLink = activeLesson.querySelector('.course-lesson__link');
    if (lessonLink) {
        const text = lessonLink.textContent.trim();
        const m = text.match(/^(\d+)\.\s*(.*)/);
        if (m) {
            lessonTitle = topicNum ? `${topicNum}.${m[1]} ${m[2]}` : text;
        } else {
            lessonTitle = text;
        }
    }

    // Materiały — wyciąg id z klasy: material-progress-pdf → "pdf", material-progress-58617 → "58617"
    const materials = [];
    const seen = new Set();
    let videoIdx = 0;
    const cNum = extractCourseNumber().replace(/\.$/, '');
    const lNum = extractLessonNumber().replace(/\.$/, '');
    const numPrefix = (cNum && lNum) ? cNum + '.' + lNum + '.' : '';

    document.querySelectorAll('[class*="material-progress"]').forEach(el => {
        const classList = Array.from(el.classList);
        const mpClass = classList.find(c => c.startsWith('material-progress-'));
        if (!mpClass) return;
        const id = mpClass.replace('material-progress-', '');
        if (seen.has(id)) return;
        seen.add(id);

        const textEl = el.querySelector('.course-material__progress-text');
        if (!textEl) return;
        const m = textEl.textContent.match(/(\d+)%/);
        if (!m) return;

        let label;
        let durationSec = null;
        let pageCount = null;

        if (id === 'pdf') {
            label = 'PDF';
            // Liczba stron PDF — z pierwszego kontenera (platforma traktuje PDF jako 1 materiał)
            const pdfContainer = document.querySelector('.pdf-container');
            if (pdfContainer) {
                const pcSpan = pdfContainer.querySelector('span.page_count');
                if (pcSpan) pageCount = parseInt(pcSpan.textContent, 10) || null;
            }
        } else {
            // Szukaj elementu video — document.getElementById nie wymaga CSS.escape
            let videoTag = null;
            let isVideo = false;

            const idEl = document.getElementById(id);
            if (idEl) {
                const tn = idEl.tagName.toLowerCase();
                if (tn === 'video-js' || tn === 'video') {
                    isVideo = true;
                    videoTag = tn === 'video' ? idEl : idEl.querySelector('video');
                } else if (idEl.querySelector('video, video-js')) {
                    isVideo = true;
                    videoTag = idEl.querySelector('video');
                }
            }

            // Fallback: data-media-id (atrybut — bez CSS.escape!)
            if (!isVideo) {
                const alt = document.querySelector('[data-media-id="' + id + '"]');
                if (alt) {
                    isVideo = true;
                    videoTag = alt.tagName.toLowerCase() === 'video' ? alt : alt.querySelector('video');
                }
            }

            // Fallback: liczbowy ID na tej platformie = zawsze wideo (PDF ma id "pdf")
            if (!isVideo && /^\d+$/.test(id)) {
                isVideo = true;
            }

            if (isVideo) {
                videoIdx++;
                label = 'Wideo ' + numPrefix + videoIdx;
                if (videoTag && isFinite(videoTag.duration)) {
                    durationSec = Math.round(videoTag.duration);
                }
            } else {
                label = 'Materiał ' + id;
            }
        }

        materials.push({ id, label, percent: parseInt(m[1], 10), durationSec, pageCount });
    });

    // Postęp lekcji
    let lessonPercent = null;
    const lessonProgressEl = activeLesson.querySelector('[id^="lesson-progress"]');
    if (lessonProgressEl) {
        const m = lessonProgressEl.textContent.match(/(\d+)%/);
        if (m) lessonPercent = parseInt(m[1], 10);
    }

    return { lessonTitle, materials, lessonPercent };
}

// =========================================================================
//  Aktualizacja tytułu karty: procenty postępu + nazwa lekcji
// =========================================================================

function updateTitle() {
    const data = collectProgressData();
    if (!data) return;

    const percents = data.materials.map(m => m.percent);

    function ci(pct) {
        if (pct >= 80) return '\u{1F7E2}';
        if (pct >= 40) return '\u{1F7E1}';
        return '\u{1F534}';
    }
    let title = percents.join('\u{00B7}');
    if (data.lessonPercent !== null) title += ci(data.lessonPercent) + data.lessonPercent + '|';
    if (data.lessonTitle) title += ' ' + data.lessonTitle;
    if (title) document.title = title;
}

// =========================================================================
//  Zapis postępu do chrome.storage.local
// =========================================================================

function saveProgressSnapshot() {
    if (!isContextValid()) { cleanupOnInvalidContext(); return; }

    const data = collectProgressData();
    if (!data) return;

    if (!initialDataLoaded) {
        initialDataLoaded = true;
        chrome.storage.local.get(['wskz_lastVisit'], (result) => {
            if (chrome.runtime.lastError) return;
            const lastVisit = result.wskz_lastVisit || {};
            const prev = lastVisit[lessonKey];

            const materialsWithInit = data.materials.map(m => {
                const prevMat = prev && prev.materials ? prev.materials.find(p => p.id === m.id) : null;
                return { ...m, initialPercent: prevMat ? prevMat.percent : m.percent };
            });
            const initialLessonPercent = prev ? (prev.lessonPercent ?? data.lessonPercent) : data.lessonPercent;

            cachedInitials = { materials: materialsWithInit.map(m => ({ id: m.id, initialPercent: m.initialPercent })), initialLessonPercent };

            chrome.storage.local.set({
                [sessionStorageKey]: {
                    sessionId,
                    lessonKey,
                    lessonTitle: data.lessonTitle,
                    openedAt: sessionOpenedAt,
                    updatedAt: Date.now(),
                    materials: materialsWithInit,
                    lessonPercent: data.lessonPercent,
                    initialLessonPercent
                }
            });
        });
        return;
    }

    if (!cachedInitials) return;

    const materialsWithInit = data.materials.map(m => {
        const init = cachedInitials.materials.find(ci => ci.id === m.id);
        return { ...m, initialPercent: init ? init.initialPercent : m.percent };
    });

    chrome.storage.local.set({
        [sessionStorageKey]: {
            sessionId,
            lessonKey,
            lessonTitle: data.lessonTitle,
            openedAt: sessionOpenedAt,
            updatedAt: Date.now(),
            materials: materialsWithInit,
            lessonPercent: data.lessonPercent,
            initialLessonPercent: cachedInitials.initialLessonPercent
        }
    });
}

// =========================================================================
//  Finalizacja sesji przy zamknięciu karty
// =========================================================================

function finalizeSession() {
    if (!isContextValid()) return;

    const now = Date.now();
    const durationMin = Math.round((now - sessionOpenedAt) / 60000);
    if (durationMin < 1) {
        try { chrome.storage.local.remove(sessionStorageKey); } catch (_) {}
        return;
    }

    const fmt = (ts) => {
        const d = new Date(ts);
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    };

    const data = collectProgressData();
    if (!data || !cachedInitials) {
        try { chrome.storage.local.remove(sessionStorageKey); } catch (_) {}
        return;
    }

    const lessonDelta = (data.lessonPercent ?? 0) - (cachedInitials.initialLessonPercent ?? 0);

    const sessionEntry = {
        lessonKey,
        lessonTitle: data.lessonTitle,
        date: new Date(sessionOpenedAt).toISOString().slice(0, 10),
        openedAt: sessionOpenedAt,
        closedAt: now,
        durationMin,
        timeRange: fmt(sessionOpenedAt) + '\u{2013}' + fmt(now),
        materials: data.materials.map(m => {
            const init = cachedInitials.materials.find(ci => ci.id === m.id);
            const startPct = init ? init.initialPercent : m.percent;
            const delta = m.percent - startPct;
            return {
                id: m.id, label: m.label, startPct, endPct: m.percent, delta,
                durationSec: m.durationSec || null,
                pageCount: m.pageCount || null,
                // Rate per materiał: delta% / czas sesji
                ratePerMin: durationMin > 0 && delta > 0 ? Math.round(delta / durationMin * 100) / 100 : 0,
                ratePerHour: durationMin > 0 && delta > 0 ? Math.round(delta / durationMin * 60 * 100) / 100 : 0
            };
        }),
        lessonStartPct: cachedInitials.initialLessonPercent ?? data.lessonPercent,
        lessonEndPct: data.lessonPercent,
        lessonDelta,
        // Rate lekcji (sumaryczny)
        ratePerMin: durationMin > 0 && lessonDelta > 0 ? Math.round(lessonDelta / durationMin * 100) / 100 : 0,
        ratePerHour: durationMin > 0 && lessonDelta > 0 ? Math.round(lessonDelta / durationMin * 60 * 100) / 100 : 0
    };

    chrome.storage.local.get(['wskz_sessions', 'wskz_lastVisit'], (result) => {
        const sessions = result.wskz_sessions || [];
        sessions.push(sessionEntry);

        const lastVisit = result.wskz_lastVisit || {};
        lastVisit[lessonKey] = {
            lessonPercent: data.lessonPercent,
            materials: data.materials.map(m => ({ id: m.id, percent: m.percent })),
            visitedAt: now
        };

        chrome.storage.local.set({ wskz_sessions: sessions, wskz_lastVisit: lastVisit });
        chrome.storage.local.remove(sessionStorageKey);
    });
}

window.addEventListener('beforeunload', finalizeSession);

// =========================================================================
//  Favicon: zielona/czerwona kropka w zależności od symulacji skupienia
// =========================================================================

let originalFavicon = null;

function updateFavicon() {
    // Zapamiętaj oryginalny favicon przy pierwszym wywołaniu
    if (originalFavicon === null) {
        const existing = document.querySelector('link[rel*="icon"]');
        originalFavicon = existing ? existing.href : '';
    }

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Zielona kropka = skupienie aktywne, czerwona = wyłączone
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, 2 * Math.PI);
    ctx.fillStyle = focusSimEnabled ? '#4CAF50' : '#F44336';
    ctx.fill();

    // Biała obwódka
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = canvas.toDataURL('image/png');
}

// =========================================================================
//  Cleanup: zatrzymaj wszystko gdy kontekst wtyczki zostanie unieważniony
//  (np. po przeładowaniu rozszerzenia bez odświeżania karty)
// =========================================================================

function cleanupOnInvalidContext() {
    if (_mainIntervalId) { clearInterval(_mainIntervalId); _mainIntervalId = null; }
    if (nextClickTimer) { clearInterval(nextClickTimer); nextClickTimer = null; }
    console.log('WSKZ: kontekst wtyczki unieważniony — interwały zatrzymane. Odśwież kartę.');
}

// =========================================================================
//  Interwał: aktualizacja tytułu, przycisków, favicon
// =========================================================================

_mainIntervalId = setInterval(() => {
    if (!isContextValid()) { cleanupOnInvalidContext(); return; }
    insertDownloadButtonsAndModifyTitles();
    updateTitle();
    saveProgressSnapshot();
}, 5000);

// Odblokowanie prawego kliku
document.addEventListener('contextmenu', (e) => {
    e.stopPropagation();
}, true);

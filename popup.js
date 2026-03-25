document.addEventListener('DOMContentLoaded', () => {
    // === Elementy ustawień ===
    const autoClickCheckbox = document.getElementById('autoClickEnabled');
    const intervalInput = document.getElementById('clickInterval');
    const focusSimCheckbox = document.getElementById('focusSimEnabled');
    const simultaneousVideoCheckbox = document.getElementById('allowSimultaneousVideo');
    const saveBtn = document.getElementById('saveBtn');
    const statusDiv = document.getElementById('status');

    // === Elementy postępu ===
    const sessionsContainer = document.getElementById('sessions-container');
    const noSessionEl = document.getElementById('no-session');
    const historyLink = document.getElementById('history-link');

    // === Wczytaj ustawienia ===
    chrome.storage.sync.get({
        autoClickEnabled: false,
        clickInterval: 60,
        focusSimEnabled: true,
        allowSimultaneousVideo: false
    }, (items) => {
        autoClickCheckbox.checked = items.autoClickEnabled;
        intervalInput.value = items.clickInterval;
        focusSimCheckbox.checked = items.focusSimEnabled;
        simultaneousVideoCheckbox.checked = items.allowSimultaneousVideo;
    });

    // === Auto-zapis checkboxów (natychmiastowy, bez klikania Zapisz) ===
    function saveAllSettings(showStatus) {
        chrome.storage.sync.set({
            autoClickEnabled: autoClickCheckbox.checked,
            clickInterval: parseInt(intervalInput.value) || 60,
            focusSimEnabled: focusSimCheckbox.checked,
            allowSimultaneousVideo: simultaneousVideoCheckbox.checked
        }, () => {
            if (showStatus) {
                statusDiv.textContent = 'Zapisano!';
                setTimeout(() => { statusDiv.textContent = ''; }, 2000);
            }
        });
    }

    focusSimCheckbox.addEventListener('change', () => saveAllSettings(true));
    autoClickCheckbox.addEventListener('change', () => saveAllSettings(true));

    // === Zapisz ustawienia (przycisk — dla interwału i reszty) ===
    saveBtn.addEventListener('click', () => saveAllSettings(true));

    // === Historia nauki ===
    historyLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
    });

    // === Helpers ===
    function formatDuration(ms) {
        const totalMin = Math.floor(ms / 60000);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        if (h > 0) return h + 'h ' + m + 'min';
        return m + 'min';
    }

    function deltaText(delta) {
        if (delta > 0) return '+' + delta + '%';
        if (delta < 0) return delta + '%';
        return '+0%';
    }

    function deltaClass(delta) {
        if (delta > 0) return 'delta-positive';
        if (delta < 0) return 'delta-negative';
        return 'delta-zero';
    }

    function escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    // === Wydobycie aktywnych sesji z storage ===
    function extractActiveSessions(storageData) {
        const sessions = [];
        const now = Date.now();
        for (const [key, val] of Object.entries(storageData)) {
            if (!key.startsWith('wskz_active_')) continue;
            if (!val || !val.openedAt) continue;
            // Stale sesje > 2 min (background cleanup działa na 30s,
            // ale popup trzyma dłużej żeby nie migotały)
            if (val.updatedAt && (now - val.updatedAt) > 120000) continue;
            sessions.push(val);
        }
        // Sortuj — najstarsza (najdłużej otwarta) na górze
        sessions.sort((a, b) => a.openedAt - b.openedAt);
        return sessions;
    }

    // === Renderowanie jednej sesji ===
    function renderSessionCard(session) {
        const card = document.createElement('div');
        card.className = 'session-card';
        card.setAttribute('data-session-id', session.sessionId || '');

        // Tytuł lekcji
        const titleEl = document.createElement('div');
        titleEl.className = 'lesson-title';
        titleEl.textContent = session.lessonTitle || session.lessonKey || '';
        titleEl.title = session.lessonTitle || '';
        card.appendChild(titleEl);

        // Materiały
        (session.materials || []).forEach(m => {
            const delta = m.percent - (m.initialPercent ?? m.percent);
            const row = document.createElement('div');
            row.className = 'progress-row';

            // Meta info: czas wideo lub strony PDF
            let metaStr = '';
            if (m.durationSec && m.durationSec > 0) {
                const mm = Math.floor(m.durationSec / 60);
                const ss = m.durationSec % 60;
                metaStr = ' (' + mm + ':' + (ss < 10 ? '0' : '') + ss + ')';
            } else if (m.pageCount && m.pageCount > 0) {
                metaStr = ' (' + m.pageCount + 'str)';
            }

            row.innerHTML =
                '<span class="progress-label" title="' + escHtml(m.label + metaStr) + '">' + escHtml(m.label) + '<span class="meta">' + escHtml(metaStr) + '</span></span>' +
                '<div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + m.percent + '%"></div></div>' +
                '<span class="progress-pct">' + m.percent + '%</span>' +
                '<span class="progress-delta ' + deltaClass(delta) + '">' + deltaText(delta) + '</span>';
            card.appendChild(row);
        });

        // Postęp lekcji
        if (session.lessonPercent !== null && session.lessonPercent !== undefined) {
            const ld = (session.lessonPercent ?? 0) - (session.initialLessonPercent ?? session.lessonPercent ?? 0);
            const row = document.createElement('div');
            row.className = 'progress-row lesson-row';
            row.innerHTML =
                '<span class="progress-label">Lekcja</span>' +
                '<div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + session.lessonPercent + '%"></div></div>' +
                '<span class="progress-pct">' + session.lessonPercent + '%</span>' +
                '<span class="progress-delta ' + deltaClass(ld) + '">' + deltaText(ld) + '</span>';
            card.appendChild(row);
        }

        // Timer i tempo
        const statsEl = document.createElement('div');
        statsEl.className = 'session-stats';
        const timerEl = document.createElement('div');
        timerEl.className = 'session-timer';
        const rateEl = document.createElement('div');
        rateEl.className = 'session-rate';
        statsEl.appendChild(timerEl);
        statsEl.appendChild(rateEl);
        card.appendChild(statsEl);

        updateCardTimer(card, session);

        return card;
    }

    function updateCardTimer(card, session) {
        if (!session || !session.openedAt) return;
        const elapsed = Date.now() - session.openedAt;
        const timerEl = card.querySelector('.session-timer');
        const rateEl = card.querySelector('.session-rate');
        if (timerEl) timerEl.textContent = 'Czas: ' + formatDuration(elapsed);

        if (!rateEl) return;
        const elapsedMin = elapsed / 60000;
        if (elapsedMin < 1) { rateEl.innerHTML = ''; return; }

        // Grupuj rate per typ materiału
        const videoRates = [];
        const pdfRates = [];
        const otherRates = [];

        (session.materials || []).forEach(m => {
            const delta = m.percent - (m.initialPercent ?? m.percent);
            if (delta <= 0) return;
            const rpm = (delta / elapsedMin).toFixed(2);
            const entry = escHtml(m.label) + ': ' + rpm + '%/min';
            if (m.label && m.label.startsWith('Wideo')) videoRates.push(entry);
            else if (m.label === 'PDF') pdfRates.push(entry);
            else otherRates.push(entry);
        });

        const lines = [];
        if (videoRates.length > 0) lines.push(videoRates.join(' | '));
        if (pdfRates.length > 0) lines.push(pdfRates.join(' | '));
        if (otherRates.length > 0) lines.push(otherRates.join(' | '));

        // Rate lekcji (sumaryczny)
        const ld = (session.lessonPercent ?? 0) - (session.initialLessonPercent ?? session.lessonPercent ?? 0);
        if (ld > 0) {
            lines.push('Lekcja: ' + (ld / elapsedMin).toFixed(2) + '%/min (' + (ld / elapsedMin * 60).toFixed(1) + '%/h)');
        }

        rateEl.innerHTML = lines.join('<br>');
    }

    // === Pełne renderowanie wszystkich sesji ===
    let activeSessions = [];

    function renderAllSessions(sessions) {
        activeSessions = sessions;
        sessionsContainer.innerHTML = '';

        if (sessions.length === 0) {
            noSessionEl.style.display = 'block';
            return;
        }

        noSessionEl.style.display = 'none';
        sessions.forEach(session => {
            sessionsContainer.appendChild(renderSessionCard(session));
        });
    }

    // === Inicjalizacja ===
    function refreshSessions() {
        chrome.storage.local.get(null, (all) => {
            if (chrome.runtime.lastError) return;
            renderAllSessions(extractActiveSessions(all));
        });
    }

    refreshSessions();

    // Timer — aktualizacja co sekundę (timery + dane co 3 cykle)
    let tickCount = 0;
    setInterval(() => {
        tickCount++;
        const cards = sessionsContainer.querySelectorAll('.session-card');
        cards.forEach((card, i) => {
            if (activeSessions[i]) {
                updateCardTimer(card, activeSessions[i]);
            }
        });
        // Co 3s pełny refresh danych ze storage
        if (tickCount % 3 === 0) refreshSessions();
    }, 1000);

    // Live update — przebuduj gdy zmieni się klucz wskz_active_*
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        const hasActiveChange = Object.keys(changes).some(k => k.startsWith('wskz_active_'));
        if (!hasActiveChange) return;
        refreshSessions();
    });
});

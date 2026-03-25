document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('history-body');
    const emptyMsg = document.getElementById('empty-msg');
    const tableEl = document.getElementById('history-table');
    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    const lessonFilter = document.getElementById('lesson-filter');
    const viewMode = document.getElementById('view-mode');
    const statSessions = document.getElementById('stat-sessions');
    const statTime = document.getElementById('stat-time');
    const statRate = document.getElementById('stat-rate');

    let allSessions = [];

    chrome.storage.local.get(['wskz_sessions'], (result) => {
        allSessions = result.wskz_sessions || [];
        populateLessonFilter();
        render();
    });

    dateFrom.addEventListener('change', render);
    dateTo.addEventListener('change', render);
    lessonFilter.addEventListener('change', render);
    viewMode.addEventListener('change', render);

    function populateLessonFilter() {
        const lessons = new Map();
        allSessions.forEach(s => {
            if (!lessons.has(s.lessonKey)) lessons.set(s.lessonKey, s.lessonTitle || s.lessonKey);
        });
        lessons.forEach((title, key) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = title;
            lessonFilter.appendChild(opt);
        });
    }

    function getFilteredSessions() {
        let filtered = allSessions;
        if (dateFrom.value) filtered = filtered.filter(s => s.date >= dateFrom.value);
        if (dateTo.value) filtered = filtered.filter(s => s.date <= dateTo.value);
        if (lessonFilter.value) filtered = filtered.filter(s => s.lessonKey === lessonFilter.value);
        return filtered.slice().sort((a, b) => b.openedAt - a.openedAt);
    }

    function render() {
        const sessions = getFilteredSessions();
        if (viewMode.value === 'lesson') {
            renderGrouped(sessions);
        } else {
            renderChrono(sessions);
        }
        updateSummary(sessions);
    }

    // =========================================================================
    //  Widok chronologiczny
    // =========================================================================
    function renderChrono(sessions) {
        tbody.innerHTML = '';
        if (sessions.length === 0) {
            emptyMsg.style.display = 'block'; tableEl.style.display = 'none'; return;
        }
        emptyMsg.style.display = 'none'; tableEl.style.display = '';

        sessions.forEach((s, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + esc(s.date) + '</td>' +
                '<td class="lesson-cell" title="' + esc(s.lessonTitle || '') + '">' + esc(s.lessonTitle || s.lessonKey) + '</td>' +
                '<td>' + s.durationMin + 'min</td>' +
                '<td>' + esc(s.timeRange || '') + '</td>' +
                '<td>' + (s.lessonStartPct ?? '—') + '%</td>' +
                '<td>' + (s.lessonEndPct ?? '—') + '%</td>' +
                '<td class="' + deltaClass(s.lessonDelta) + '">' + deltaText(s.lessonDelta) + '</td>' +
                '<td>' + fmtRate(s.ratePerMin) + '</td>' +
                '<td>' + fmtRate(s.ratePerHour) + '</td>' +
                '<td><button class="btn-expand" data-idx="' + idx + '">&#9660;</button></td>';
            tbody.appendChild(tr);

            // Wiersz szczegółów materiałów
            if (s.materials && s.materials.length > 0) {
                const detailTr = document.createElement('tr');
                detailTr.className = 'detail-row';
                detailTr.id = 'detail-' + idx;
                detailTr.style.display = 'none';
                detailTr.innerHTML = '<td colspan="10">' + renderMaterialsDetail(s.materials, s.durationMin) + '</td>';
                tbody.appendChild(detailTr);
            }
        });

        attachExpandListeners();
    }

    // =========================================================================
    //  Widok grupowany per lekcja
    // =========================================================================
    function renderGrouped(sessions) {
        tbody.innerHTML = '';
        if (sessions.length === 0) {
            emptyMsg.style.display = 'block'; tableEl.style.display = 'none'; return;
        }
        emptyMsg.style.display = 'none'; tableEl.style.display = '';

        // Grupuj per lessonKey
        const groups = new Map();
        sessions.forEach(s => {
            if (!groups.has(s.lessonKey)) groups.set(s.lessonKey, []);
            groups.get(s.lessonKey).push(s);
        });

        let gIdx = 0;
        groups.forEach((lessonSessions, lessonKey) => {
            const totalMin = lessonSessions.reduce((sum, s) => sum + (s.durationMin || 0), 0);
            const totalDelta = lessonSessions.reduce((sum, s) => sum + (s.lessonDelta || 0), 0);
            const firstPct = lessonSessions[lessonSessions.length - 1]?.lessonStartPct ?? '—';
            const lastPct = lessonSessions[0]?.lessonEndPct ?? '—';
            const title = lessonSessions[0]?.lessonTitle || lessonKey;

            // Zbierz unikalne info o materiałach (najnowsze dane)
            const matMap = new Map();
            lessonSessions.forEach(s => {
                (s.materials || []).forEach(m => {
                    const existing = matMap.get(m.id);
                    if (!existing) {
                        matMap.set(m.id, { ...m });
                    } else {
                        // Aktualizuj z najnowszej sesji
                        existing.endPct = m.endPct ?? existing.endPct;
                        existing.durationSec = m.durationSec || existing.durationSec;
                        existing.pageCount = m.pageCount || existing.pageCount;
                    }
                });
            });

            // Wiersz nagłówkowy lekcji
            const tr = document.createElement('tr');
            tr.className = 'group-header';
            tr.innerHTML =
                '<td>' + lessonSessions.length + ' sesji</td>' +
                '<td class="lesson-cell" title="' + esc(title) + '">' + esc(title) + '</td>' +
                '<td>' + totalMin + 'min</td>' +
                '<td></td>' +
                '<td>' + firstPct + '%</td>' +
                '<td>' + lastPct + '%</td>' +
                '<td class="' + deltaClass(totalDelta) + '">' + deltaText(totalDelta) + '</td>' +
                '<td>' + (totalMin > 0 && totalDelta > 0 ? (totalDelta / totalMin).toFixed(2) : '—') + '</td>' +
                '<td>' + (totalMin > 0 && totalDelta > 0 ? (totalDelta / totalMin * 60).toFixed(1) : '—') + '</td>' +
                '<td><button class="btn-expand" data-idx="g' + gIdx + '">&#9660;</button></td>';
            tbody.appendChild(tr);

            // Szczegóły: materiały + sesje
            const detailTr = document.createElement('tr');
            detailTr.className = 'detail-row';
            detailTr.id = 'detail-g' + gIdx;
            detailTr.style.display = 'none';

            let detailHtml = '<td colspan="10"><div class="group-detail">';

            // Materiały tej lekcji
            if (matMap.size > 0) {
                detailHtml += '<div class="group-materials-header">Materialy:</div>';
                matMap.forEach(m => {
                    let metaStr = '';
                    if (m.durationSec) {
                        const mm = Math.floor(m.durationSec / 60);
                        const ss = m.durationSec % 60;
                        metaStr = mm + ':' + (ss < 10 ? '0' : '') + ss;
                    } else if (m.pageCount) {
                        metaStr = m.pageCount + ' str.';
                    }
                    detailHtml +=
                        '<div class="material-row">' +
                        '<span class="mat-label">' + esc(m.label || m.id) + '</span>' +
                        '<span class="mat-meta">' + (metaStr || '') + '</span>' +
                        '<span>' + (m.endPct ?? '?') + '%</span>' +
                        '</div>';
                });
            }

            // Lista sesji
            detailHtml += '<div class="group-sessions-header">Sesje:</div>';
            lessonSessions.forEach(s => {
                detailHtml +=
                    '<div class="group-session-row">' +
                    '<span>' + esc(s.date) + '</span>' +
                    '<span>' + esc(s.timeRange || '') + '</span>' +
                    '<span>' + s.durationMin + 'min</span>' +
                    '<span class="' + deltaClass(s.lessonDelta) + '">' + deltaText(s.lessonDelta) + '</span>' +
                    '<span>' + fmtRate(s.ratePerMin) + '%/min</span>' +
                    '</div>';
            });

            detailHtml += '</div></td>';
            detailTr.innerHTML = detailHtml;
            tbody.appendChild(detailTr);

            gIdx++;
        });

        attachExpandListeners();
    }

    // =========================================================================
    //  Renderowanie szczegółów materiałów (wiersz rozwijany)
    // =========================================================================
    function renderMaterialsDetail(materials, sessionDurationMin) {
        let html = '<div class="materials-detail">';
        materials.forEach(m => {
            let metaStr = '';
            if (m.durationSec) {
                const mm = Math.floor(m.durationSec / 60);
                const ss = m.durationSec % 60;
                metaStr = mm + ':' + (ss < 10 ? '0' : '') + ss;
            } else if (m.pageCount) {
                metaStr = m.pageCount + ' str.';
            }

            // Rate per materiał
            const rateStr = m.ratePerMin ? m.ratePerMin + '%/min (' + m.ratePerHour + '%/h)' :
                (sessionDurationMin > 0 && m.delta > 0 ?
                    (m.delta / sessionDurationMin).toFixed(2) + '%/min (' + (m.delta / sessionDurationMin * 60).toFixed(1) + '%/h)' : '');

            html +=
                '<div class="material-row">' +
                '<span class="mat-label">' + esc(m.label || m.id) + '</span>' +
                (metaStr ? '<span class="mat-meta">' + metaStr + '</span>' : '') +
                '<span>' + (m.startPct ?? '?') + '% &rarr; ' + (m.endPct ?? '?') + '%</span>' +
                '<span class="' + deltaClass(m.delta) + '">' + deltaText(m.delta) + '</span>' +
                (rateStr ? '<span class="mat-rate">' + rateStr + '</span>' : '') +
                '</div>';
        });
        html += '</div>';
        return html;
    }

    // =========================================================================
    //  Przyciski rozwijania
    // =========================================================================
    function attachExpandListeners() {
        tbody.querySelectorAll('.btn-expand').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = btn.getAttribute('data-idx');
                const detail = document.getElementById('detail-' + idx);
                if (!detail) return;
                const visible = detail.style.display !== 'none';
                detail.style.display = visible ? 'none' : 'table-row';
                btn.innerHTML = visible ? '&#9660;' : '&#9650;';
            });
        });
    }

    // =========================================================================
    //  Statystyki
    // =========================================================================
    function updateSummary(sessions) {
        statSessions.textContent = 'Sesje: ' + sessions.length;
        const totalMin = sessions.reduce((sum, s) => sum + (s.durationMin || 0), 0);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        statTime.textContent = 'Czas: ' + (h > 0 ? h + 'h ' : '') + m + 'min';

        const totalDelta = sessions.reduce((sum, s) => sum + (s.lessonDelta || 0), 0);
        if (totalMin > 0 && totalDelta > 0) {
            statRate.textContent = 'Sr. tempo: ' + (totalDelta / totalMin).toFixed(2) + '%/min (' + (totalDelta / totalMin * 60).toFixed(1) + '%/h)';
        } else {
            statRate.textContent = 'Sr. tempo: —';
        }
    }

    // =========================================================================
    //  Eksport
    // =========================================================================
    document.getElementById('export-json').addEventListener('click', () => {
        const sessions = getFilteredSessions();
        const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
        downloadBlob(blob, 'wskz_historia_' + todayStr() + '.json');
    });

    document.getElementById('export-csv').addEventListener('click', () => {
        const sessions = getFilteredSessions();
        const headers = ['Data', 'Lekcja', 'LessonKey', 'Czas_min', 'Godziny', 'Start%', 'Koniec%', 'Delta%', '%/min', '%/h', 'Materialy'];
        const rows = sessions.map(s => {
            const matStr = (s.materials || []).map(m => {
                let info = (m.label || m.id) + ':' + (m.startPct ?? '?') + '->' + (m.endPct ?? '?') + '(' + deltaText(m.delta) + ')';
                if (m.durationSec) info += '[' + m.durationSec + 's]';
                if (m.pageCount) info += '[' + m.pageCount + 'p]';
                if (m.ratePerMin) info += '{' + m.ratePerMin + '%/min}';
                return info;
            }).join('; ');
            return [
                s.date,
                csvEscape(s.lessonTitle || s.lessonKey),
                csvEscape(s.lessonKey),
                s.durationMin,
                csvEscape(s.timeRange || ''),
                s.lessonStartPct ?? '',
                s.lessonEndPct ?? '',
                s.lessonDelta ?? '',
                s.ratePerMin ?? '',
                s.ratePerHour ?? '',
                csvEscape(matStr)
            ].join(',');
        });
        const csv = headers.join(',') + '\n' + rows.join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, 'wskz_historia_' + todayStr() + '.csv');
    });

    document.getElementById('clear-history').addEventListener('click', () => {
        if (!confirm('Na pewno wyczysc cala historie nauki?')) return;
        chrome.storage.local.set({ wskz_sessions: [] }, () => {
            allSessions = [];
            render();
        });
    });

    // =========================================================================
    //  Helpers
    // =========================================================================
    function deltaText(d) {
        if (d === null || d === undefined) return '—';
        return (d > 0 ? '+' : '') + d + '%';
    }
    function deltaClass(d) {
        if (d > 0) return 'delta-positive';
        if (d < 0) return 'delta-negative';
        return '';
    }
    function fmtRate(r) {
        if (r === null || r === undefined || r === 0) return '—';
        return r;
    }
    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }
    function csvEscape(s) {
        if (!s) return '';
        if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
    }
    function todayStr() { return new Date().toISOString().slice(0, 10); }
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    }
});

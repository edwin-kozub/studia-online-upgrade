const RULES = [
    {
        id: 1,
        priority: 1,
        action: {
            type: "modifyHeaders",
            requestHeaders: [
                { header: "Referer", operation: "set", value: "https://studia-online.pl/" },
                { header: "Origin", operation: "set", value: "https://studia-online.pl" }
            ]
        },
        condition: {
            urlFilter: "||ultracloud.pl*",
            resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "media", "other"]
        }
    }
];

chrome.runtime.onInstalled.addListener(() => {
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],
        addRules: RULES
    });
});

// =========================================================================
//  Safety net: sprzątanie nieaktywnych sesji (stale > 30s bez updatu)
// =========================================================================

function cleanupStaleSessions() {
    chrome.storage.local.get(null, (all) => {
        const now = Date.now();
        const staleKeys = [];
        const sessionsToFinalize = [];

        for (const [key, session] of Object.entries(all)) {
            if (!key.startsWith('wskz_active_')) continue;
            if (!session || !session.openedAt) { staleKeys.push(key); continue; }
            // Sesja nieaktualizowana > 30s = karta zamknięta
            if (session.updatedAt && (now - session.updatedAt) > 30000) {
                staleKeys.push(key);
                sessionsToFinalize.push(session);
            }
        }

        if (staleKeys.length === 0) return;

        const fmt = (ts) => {
            const d = new Date(ts);
            return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
        };

        const sessions = all.wskz_sessions || [];
        const lastVisit = all.wskz_lastVisit || {};

        for (const session of sessionsToFinalize) {
            const durationMin = Math.round((now - session.openedAt) / 60000);
            if (durationMin < 1) continue;

            const lessonStartPct = session.initialLessonPercent ?? session.lessonPercent ?? 0;
            const lessonEndPct = session.lessonPercent ?? 0;
            const lessonDelta = lessonEndPct - lessonStartPct;

            sessions.push({
                lessonKey: session.lessonKey,
                lessonTitle: session.lessonTitle,
                date: new Date(session.openedAt).toISOString().slice(0, 10),
                openedAt: session.openedAt,
                closedAt: now,
                durationMin,
                timeRange: fmt(session.openedAt) + '\u{2013}' + fmt(now),
                materials: (session.materials || []).map(m => {
                    const startPct = m.initialPercent ?? m.percent;
                    const delta = m.percent - startPct;
                    return {
                        id: m.id, label: m.label, startPct, endPct: m.percent, delta,
                        durationSec: m.durationSec || null,
                        pageCount: m.pageCount || null,
                        ratePerMin: durationMin > 0 && delta > 0 ? Math.round(delta / durationMin * 100) / 100 : 0,
                        ratePerHour: durationMin > 0 && delta > 0 ? Math.round(delta / durationMin * 60 * 100) / 100 : 0
                    };
                }),
                lessonStartPct, lessonEndPct, lessonDelta,
                ratePerMin: durationMin > 0 && lessonDelta > 0 ? Math.round(lessonDelta / durationMin * 100) / 100 : 0,
                ratePerHour: durationMin > 0 && lessonDelta > 0 ? Math.round(lessonDelta / durationMin * 60 * 100) / 100 : 0
            });

            lastVisit[session.lessonKey] = {
                lessonPercent: session.lessonPercent,
                materials: (session.materials || []).map(m => ({ id: m.id, percent: m.percent })),
                visitedAt: now
            };
        }

        chrome.storage.local.set({ wskz_sessions: sessions, wskz_lastVisit: lastVisit });
        chrome.storage.local.remove(staleKeys);
    });
}

chrome.tabs.onRemoved.addListener(() => {
    // Odczekaj chwilę — beforeunload w content.js może zdążyć
    setTimeout(cleanupStaleSessions, 3000);
});

// =========================================================================
//  Obsługa pobierania plików
// =========================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'download') {
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [1],
            addRules: RULES
        }, () => {
            chrome.downloads.download({
                url: request.url,
                filename: request.filename,
                saveAs: true
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error("Download failed:", chrome.runtime.lastError.message);
                } else {
                    console.log("Download started with ID:", downloadId);
                }
            });
        });
    }
});

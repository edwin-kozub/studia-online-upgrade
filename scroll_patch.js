(function () {
    // =========================================================================
    //  FLAG: sterowanie symulacją skupienia (domyślnie WŁĄCZONA)
    //  content.js wysyła WSKZ_FOCUS_SIM_TOGGLE po odczytaniu ustawień z storage
    // =========================================================================

    window.__wskzFocusSimEnabled = true;

    window.addEventListener("message", (event) => {
        if (event.source === window && event.data.type === "WSKZ_FOCUS_SIM_TOGGLE") {
            window.__wskzFocusSimEnabled = !!event.data.enabled;
        }
    });

    // =========================================================================
    //  MODUŁ 1: Symulacja aktywnej karty (WARUNKOWA)
    // =========================================================================
    //
    //  JAK DZIAŁA ŚLEDZENIE PLATFORMY:
    //    Platforma (user-lesson-log-only-focus.min.js) co 1 sekundę sprawdza:
    //      isVisible && getIsVisible()
    //    Jeśli true → activeSeconds++ (lokalny licznik w przeglądarce)
    //    Co N sekund (materialInterval z serwera, domyślnie 25) → POST /ajax/user-lesson-log-tick
    //
    //    getIsVisible() sprawdza:
    //      Desktop: document.hasFocus()
    //      Mobile:  !document.hidden
    //
    //  WAŻNE: scroll_patch.js musi działać w world: "MAIN" i run_at: "document_start"
    //  żeby nadpisania były gotowe ZANIM załaduje się kod platformy.
    //
    //  ANTY-THROTTLING (Moduł 1b):
    //    Chromium/Brave throttluje setInterval w kartach w tle do ~1/min.
    //    Moduł 1b przechwytuje setInterval(fn, 1000) i kieruje go przez
    //    Web Worker (który nie jest throttlowany) lub kompensuje utracone ticki.
    // =========================================================================

    // --- 1a. Nadpisanie document.hasFocus() ---
    const origHasFocus = Document.prototype.hasFocus;
    Document.prototype.hasFocus = function () {
        if (window.__wskzFocusSimEnabled) return true;
        return origHasFocus.call(this);
    };

    // --- 1b. Nadpisanie document.hidden ---
    const origHiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(Document.prototype, 'hidden', {
        get: function () {
            if (window.__wskzFocusSimEnabled) return false;
            return origHiddenDesc ? origHiddenDesc.get.call(this) : false;
        },
        configurable: true
    });

    // --- 1c. Nadpisanie document.visibilityState ---
    const origVisDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(Document.prototype, 'visibilityState', {
        get: function () {
            if (window.__wskzFocusSimEnabled) return 'visible';
            return origVisDesc ? origVisDesc.get.call(this) : 'visible';
        },
        configurable: true
    });

    // --- 2. Blokowanie eventów blur / visibilitychange / pagehide (WARUNKOWE) ---
    window.addEventListener('blur', (e) => {
        if (window.__wskzFocusSimEnabled) e.stopImmediatePropagation();
    }, true);

    window.addEventListener('pagehide', (e) => {
        if (window.__wskzFocusSimEnabled) e.stopImmediatePropagation();
    }, true);

    document.addEventListener('visibilitychange', (e) => {
        if (window.__wskzFocusSimEnabled) e.stopImmediatePropagation();
    }, true);

    // =========================================================================
    //  MODUŁ 1b: Anty-throttling — ochrona przed spowolnieniem timerów w tle
    // =========================================================================
    //
    //  PROBLEM: Chromium/Brave po ~5 min w tle ogranicza setInterval
    //    do max 1 wywołania/minutę. Platformowy master interval (1s)
    //    liczy activeSeconds+=1 co wywołanie — w tle rośnie ~60x wolniej.
    //
    //  STRATEGIA A: Web Worker timer (nie podlega throttlingowi).
    //  STRATEGIA B (fallback CSP): kompensacja — przy każdym opóźnionym
    //    wywołaniu nadrabiamy pominięte ticki.
    // =========================================================================

    (function installAntiThrottle() {
        const origSetInterval = window.setInterval;
        const origClearInterval = window.clearInterval;

        // --- Próba utworzenia Web Workera ---
        let worker = null;
        try {
            const code = 'const T=new Map();self.onmessage=e=>{const d=e.data;if(d.c==="s"){T.set(d.i,setInterval(()=>self.postMessage(d.i),d.m))}else if(d.c==="x"){clearInterval(T.get(d.i));T.delete(d.i)}};';
            worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
        } catch (e) { /* CSP blokuje blob: Worker — fallback B */ }

        if (worker) {
            // === STRATEGIA A: Web Worker — dokładny timer nawet w tle ===
            const cbs = new Map();
            let fakeId = 900000;

            worker.onmessage = function (e) {
                const fn = cbs.get(e.data);
                if (fn) fn();
            };

            window.setInterval = function (fn, ms) {
                if (typeof fn === 'function' && ms >= 900 && ms <= 1100) {
                    const id = fakeId++;
                    const args = Array.prototype.slice.call(arguments, 2);
                    cbs.set(id, function () { fn.apply(null, args); });
                    worker.postMessage({ c: 's', i: id, m: ms });
                    return id;
                }
                return origSetInterval.apply(window, arguments);
            };

            window.clearInterval = function (id) {
                if (cbs.has(id)) {
                    worker.postMessage({ c: 'x', i: id });
                    cbs.delete(id);
                } else {
                    origClearInterval.call(window, id);
                }
            };
        } else {
            // === STRATEGIA B: kompensacja utraconych ticków ===
            window.setInterval = function (fn, ms) {
                if (typeof fn === 'function' && ms >= 900 && ms <= 1100) {
                    const args = Array.prototype.slice.call(arguments, 2);
                    let lastCall = Date.now();
                    return origSetInterval.call(window, function () {
                        const now = Date.now();
                        const ticks = Math.max(1, Math.round((now - lastCall) / ms));
                        lastCall = now;
                        for (let i = 0; i < ticks; i++) {
                            fn.apply(null, args);
                        }
                    }, ms);
                }
                return origSetInterval.apply(window, arguments);
            };
        }
    })();

    // --- 3. Heartbeat (WARUNKOWY) ---
    setInterval(() => {
        if (window.__wskzFocusSimEnabled) {
            window.dispatchEvent(new Event('focus'));
        }
    }, 60000);

    // =========================================================================
    //  MODUŁ 2: Anty-scroll (blokowanie przewijania przy auto-kliku)
    // =========================================================================

    let preventScroll = false;

    window.addEventListener("message", (event) => {
        if (event.source === window && event.data.type === "WSKZ_PREVENT_SCROLL") {
            preventScroll = true;
            setTimeout(() => {
                preventScroll = false;
            }, 800);
        }
    });

    const origScrollTo = window.scrollTo;
    window.scrollTo = function () {
        if (preventScroll) return;
        origScrollTo.apply(this, arguments);
    };

    const origScrollBy = window.scrollBy;
    window.scrollBy = function () {
        if (preventScroll) return;
        origScrollBy.apply(this, arguments);
    };

    const origSIV = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () {
        if (preventScroll) return;
        origSIV.apply(this, arguments);
    };

    function patchJQuery() {
        if (typeof jQuery !== 'undefined') {
            const origAnimate = jQuery.fn.animate;
            jQuery.fn.animate = function (props) {
                if (preventScroll && (props.scrollTop !== undefined || props.scrollLeft !== undefined)) {
                    return this;
                }
                return origAnimate.apply(this, arguments);
            };
        } else {
            setTimeout(patchJQuery, 1000);
        }
    }
    patchJQuery();

    // =========================================================================
    //  MODUŁ 3: Automatyczne zamknięcie modala "isActiveModal" (WARUNKOWE)
    // =========================================================================

    function suppressActiveModal() {
        if (window.__wskzFocusSimEnabled) {
            sessionStorage.setItem("isActiveModal", "1");
        }

        const observer = new MutationObserver(() => {
            if (!window.__wskzFocusSimEnabled) return;
            const modal = document.getElementById('isActiveModal');
            if (modal && (modal.style.display === 'block' || modal.classList.contains('show'))) {
                const closeBtn = modal.querySelector('[data-dismiss="modal"], .close, .btn-close');
                if (closeBtn) {
                    closeBtn.click();
                } else {
                    modal.style.display = 'none';
                    modal.classList.remove('show');
                }
                sessionStorage.setItem("isActiveModal", "1");
            }
        });

        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', suppressActiveModal);
    } else {
        suppressActiveModal();
    }
})();

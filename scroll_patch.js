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
    //    Co 25 sekund (activeSeconds - lastTickSent >= 25) → POST /ajax/user-lesson-log-tick
    //
    //    getIsVisible() sprawdza:
    //      Desktop: document.hasFocus()
    //      Mobile:  !document.hidden
    //
    //  WAŻNE: scroll_patch.js musi działać w world: "MAIN" i run_at: "document_start"
    //  żeby nadpisania były gotowe ZANIM załaduje się kod platformy.
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

(function () {
    // =========================================================================
    //  MODUŁ 1: Symulacja aktywnej karty (oszukiwanie systemu śledzenia WSKZ)
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
    //    Zmienna isVisible jest ustawiana przez event listenery:
    //      blur/pagehide     → isVisible = false, stopAllIntervals(), sendTick(BLUR)
    //      focus/pageshow    → isVisible = true,  startActiveIntervals(), sendTick(FOCUS)
    //      visibilitychange  → jak wyżej, w zależności od document.hidden
    //
    //  NASZA STRATEGIA:
    //    1. Nadpisujemy hasFocus(), hidden, visibilityState → getIsVisible() zawsze true
    //    2. Blokujemy blur/visibilitychange eventy → isVisible nigdy nie zmieni się na false
    //    3. Efekt: platforma sama inkrementuje licznik co 1s i wysyła ticki co 25s
    //       My NIE musimy sami nic wysyłać — kod platformy robi to za nas.
    //
    //  WAŻNE: scroll_patch.js musi działać w world: "MAIN" i run_at: "document_start"
    //  żeby nadpisania były gotowe ZANIM załaduje się kod platformy.
    // =========================================================================

    // --- 1a. Nadpisanie document.hasFocus() → zawsze true ---
    //    To jest KLUCZOWE — platforma sprawdza to co sekundę w interwale.
    Document.prototype.hasFocus = function () {
        return true;
    };

    // --- 1b. Nadpisanie document.hidden → zawsze false ---
    //    Używane na urządzeniach mobilnych (iPad/iPhone/Android).
    Object.defineProperty(Document.prototype, 'hidden', {
        get: function () {
            return false;
        },
        configurable: true
    });

    // --- 1c. Nadpisanie document.visibilityState → zawsze "visible" ---
    //    Spójność z hidden — niektóre przeglądarki mogą sprawdzać oba.
    Object.defineProperty(Document.prototype, 'visibilityState', {
        get: function () {
            return 'visible';
        },
        configurable: true
    });

    // --- 2. Blokowanie eventów blur / visibilitychange / pagehide ---
    //    Przechwytujemy w fazie CAPTURE (true), zanim listenery platformy
    //    zdążą ustawić isVisible = false i wywołać stopAllIntervals().
    //    Bez tego: platforma wysłałaby tick BLUR i zatrzymała licznik.

    window.addEventListener('blur', (e) => {
        e.stopImmediatePropagation();
    }, true);

    window.addEventListener('pagehide', (e) => {
        e.stopImmediatePropagation();
    }, true);

    document.addEventListener('visibilitychange', (e) => {
        e.stopImmediatePropagation();
    }, true);

    // --- 3. Zabezpieczenie: periodyczny focus heartbeat ---
    //    W 99% przypadków powyższe nadpisania wystarczą. Heartbeat jest
    //    asekuracją na wypadek gdyby jakiś edge case (np. alert systemowy)
    //    spowodował że platforma ustawiła isVisible = false mimo naszych blokad.
    //
    //    onFocusEvent w platformie sprawdza: if (!isVisible) { ... }
    //    Jeśli isVisible jest true (bo blur zablokowany), focus event to no-op.
    //    Więc heartbeat nie generuje duplikatów ticków FOCUS na serwerze.

    setInterval(() => {
        window.dispatchEvent(new Event('focus'));
    }, 60000); // co 60s — rzadko, tylko jako safety net

    // =========================================================================
    //  MODUŁ 2: Anty-scroll (blokowanie przewijania przy auto-kliku)
    // =========================================================================
    //  Gdy content.js klika przycisk "następna lekcja", strona scrolluje
    //  do elementu. Ten moduł tymczasowo blokuje scroll po sygnale
    //  WSKZ_PREVENT_SCROLL (800ms okno blokady).

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
    //  MODUŁ 3: Automatyczne zamknięcie modala "isActiveModal"
    // =========================================================================
    //  Platforma pokazuje modal ostrzeżenia "Nie skupiasz się na nauce" przy
    //  utracie fokusu (raz na sesję, sprawdzane przez sessionStorage).
    //  Na wypadek gdyby pojawił się mimo naszych blokad — zamykamy go
    //  i ustawiamy sessionStorage żeby nie pojawiał się ponownie.

    function suppressActiveModal() {
        // Ustaw sessionStorage od razu — platforma sprawdza to przed wyświetleniem
        sessionStorage.setItem("isActiveModal", "1");

        // Observer jako backup — gdyby modal się jednak pojawił
        const observer = new MutationObserver(() => {
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

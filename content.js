let clickInterval = 60;
let autoClickEnabled = false;
let nextClickTimer = null;

chrome.storage.sync.get(['clickInterval', 'autoClickEnabled'], (result) => {
    clickInterval = result.clickInterval !== undefined ? result.clickInterval : 60;
    autoClickEnabled = result.autoClickEnabled !== undefined ? result.autoClickEnabled : false;

    if (autoClickEnabled) {
        startAutoClicker();
    }

    insertDownloadButtonsAndModifyTitles();
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

        if (shouldRestart) {
            if (autoClickEnabled) {
                startAutoClicker();
            } else {
                stopAutoClicker();
            }
        }
    }
});

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
//  UWAGA O ŚLEDZENIU:
//    Klikanie w PDF NIE jest śledzone przez system ticków.
//    Sprawdzono: user-lesson-log-only-focus.min.js nie zawiera
//    eventów click/mousedown/touch/scroll.
//    pdf_viewer.min.js obsługuje kliknięcia ale jest całkowicie
//    odizolowany od systemu śledzenia (brak sendTick, materials, itp.)
//    Czas nauki nalicza się TYLKO od aktywności karty (hasFocus),
//    niezależnie od tego czy i jak użytkownik nawiguje po PDF.
//
//  PRIORYTET MATERIAŁÓW:
//    Gdy odtwarzane jest video/audio → PDF tracking jest zatrzymany.
//    Platforma sama to obsługuje (stopAllIntervals przy play,
//    startActiveIntervals przy pause/ended → PDF wznawia tylko
//    gdy żadne medium nie gra). Nasza wtyczka nie musi tego obsługiwać.
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
            console.log(`WSKZ Auto: strona ${nextPage}/${totalPages}`);

            // Ustawiamy wartość przez natywny setter — żeby platforma
            // (PDF.js) wykryła zmianę wartości inputa
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeSetter.call(pageInput, nextPage.toString());

            // Dispatch input + change (dla kompatybilności z różnymi handlerami)
            pageInput.dispatchEvent(new Event('input', { bubbles: true }));
            pageInput.dispatchEvent(new Event('change', { bubbles: true }));

            // Enter — pdf_viewer.min.js nasłuchuje keydown na inpucie
            // i przy Enter przechodzi na wpisaną stronę
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
        } else {
            // Ostatnia strona PDF → przejdź do następnej lekcji
            console.log("WSKZ Auto: ostatnia strona PDF, przechodzę do następnej lekcji...");
            attemptNextLesson();
            return;
        }
    }

    // Brak kontenerów PDF na stronie → próbuj przycisk następnej lekcji
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
    // Strategia: znajdź aktywną lekcję, przejdź w górę do jej tematu (przedmiotu)
    const activeLesson = document.querySelector('.course-lesson--active');
    if (activeLesson) {
        // Szukamy rodzica z klasą .course-topic (BEM: blok nadrzędny)
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

    // Fallback: szukaj klasy --active na poziomie tematu
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

setInterval(insertDownloadButtonsAndModifyTitles, 5000);

// Odblokowanie prawego kliku
document.addEventListener('contextmenu', (e) => {
    e.stopPropagation();
}, true);

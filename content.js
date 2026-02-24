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
    nextClickTimer = setInterval(attemptNextClick, clickInterval * 1000);
}

function stopAutoClicker() {
    if (nextClickTimer) {
        clearInterval(nextClickTimer);
        nextClickTimer = null;
    }
}

function attemptNextClick() {
    const nextBtns = document.querySelectorAll('button.next');
    for (const nextBtn of nextBtns) {
        if (!nextBtn.disabled) {
            console.log("Auto Clicker: Dodaję auto kliknięcie w przycisk NEXT...");

            // Skrypt tymczasowo blokujący jakiekolwiek automatyczne przewijanie ekranu po interakcji autoklikera
            const preventScrollScript = document.createElement('script');
            preventScrollScript.textContent = `
                window._wskzPreventScroll = true;
                setTimeout(() => window._wskzPreventScroll = false, 800);
                
                if (!window._wskzScrollPatched) {
                    window._wskzScrollPatched = true;
                    
                    const origScrollTo = window.scrollTo;
                    window.scrollTo = function() {
                        if (window._wskzPreventScroll) return;
                        origScrollTo.apply(this, arguments);
                    };
                    
                    const origScrollBy = window.scrollBy;
                    window.scrollBy = function() {
                        if (window._wskzPreventScroll) return;
                        origScrollBy.apply(this, arguments);
                    };
                    
                    const origSIV = Element.prototype.scrollIntoView;
                    Element.prototype.scrollIntoView = function() {
                        if (window._wskzPreventScroll) return;
                        origSIV.apply(this, arguments);
                    };
                    
                    if (typeof jQuery !== 'undefined') {
                        const origAnimate = jQuery.fn.animate;
                        jQuery.fn.animate = function(props) {
                            if (window._wskzPreventScroll && (props.scrollTop !== undefined || props.scrollLeft !== undefined)) {
                                return this;
                            }
                            return origAnimate.apply(this, arguments);
                        };
                    }
                }
            `;
            document.documentElement.appendChild(preventScrollScript);
            preventScrollScript.remove();

            nextBtn.click();
            return;
        }
    }
}

function extractCourseNumber() {
    const courseTopicLink = document.querySelector('.course-topic__link');
    if (courseTopicLink) {
        const text = courseTopicLink.textContent.trim();
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
    let finalFilename = "";

    let match = baseName.match(/^(\d+)\.\s*(.*)/);
    if (match) {
        let part3Num = match[1] + ".";
        let desc = match[2];
        finalFilename = `${courseNum}${lessonNum}${part3Num} ${desc}.${extension}`;
    } else {
        finalFilename = `${courseNum}${lessonNum} ${baseName}.${extension}`;
    }

    return finalFilename.replace(/\s+/g, ' ').replace(/[<>:"\/\\|?*]+/g, '');
}

function buildBaseName(baseName) {
    const courseNum = extractCourseNumber();
    const lessonNum = extractLessonNumber();
    let finalName = "";

    let match = baseName.match(/^(\d+)\.\s*(.*)/);
    if (match) {
        let part3Num = match[1] + ".";
        let desc = match[2];
        finalName = `${courseNum}${lessonNum}${part3Num} ${desc}`;
    } else {
        finalName = `${courseNum}${lessonNum} ${baseName}`;
    }

    return finalName.replace(/\s+/g, ' ').replace(/[<>:"\/\\|?*]+/g, '');
}

function createSmallDownloadButton(text, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerText = text;
    btn.style.marginLeft = '15px';
    btn.style.padding = '4px 8px';
    btn.style.backgroundColor = '#0b5394';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.style.borderRadius = '4px';
    btn.style.fontWeight = 'bold';
    btn.style.fontSize = '12px';
    btn.style.display = 'inline-block';

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
    }, true);

    return btn;
}

function insertDownloadButtonsAndModifyTitles() {
    // 1. PDF
    const pdfContainers = document.querySelectorAll('.pdf-container');
    pdfContainers.forEach((container) => {
        if (!container.hasAttribute('data-download-injected')) {
            container.setAttribute('data-download-injected', 'true');

            const pdfUrl = container.getAttribute('data-url');
            if (pdfUrl) {
                const baseName = getTitleFromSibling(container);
                const finalFilename = buildFilename(baseName, 'pdf');

                const btn = createSmallDownloadButton(`Pobierz PDF`, () => {
                    chrome.runtime.sendMessage({ action: 'download', url: pdfUrl, filename: finalFilename });
                });

                const toolbar = container.querySelector('.pdf-toolbar');
                if (toolbar) {
                    toolbar.appendChild(btn);
                } else {
                    container.parentNode.insertBefore(btn, container);
                }
            }
        }
    });

    // 2. MODYFIKACJA TYTUŁÓW (w <b> wewnątrz <p>) I MOŻLIWOŚĆ ICH KOPIOWANIA
    const bElements = document.querySelectorAll('p b');
    bElements.forEach((bElem) => {
        if (!bElem.hasAttribute('data-title-modified')) {
            const originalText = bElem.textContent.trim();
            // Sprawdź czy to przypomina tytuł materiału typu "1. Tytuł lekcji..."
            if (/^\d+\./.test(originalText)) {
                bElem.setAttribute('data-title-modified', 'true');

                const newNameText = buildBaseName(originalText);

                bElem.textContent = newNameText;
                bElem.style.cursor = 'pointer';
                bElem.style.color = '#0b5394';
                bElem.style.textDecoration = 'underline';
                bElem.title = 'Kliknij, aby skopiować wygenerowaną nazwę pliku';

                bElem.addEventListener('click', (e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(newNameText).then(() => {
                        const originalColor = bElem.style.color;
                        const originalContent = bElem.textContent;

                        bElem.style.color = '#2e7d32'; // zielony
                        bElem.textContent = "Skopiowano!";

                        setTimeout(() => {
                            bElem.style.color = originalColor;
                            bElem.textContent = originalContent;
                        }, 1000);
                    });
                });
            }
        }
    });
}

setInterval(insertDownloadButtonsAndModifyTitles, 5000);

// Globalne odblokowanie prawego kliku na platformie
document.addEventListener('contextmenu', (e) => {
    e.stopPropagation();
}, true);

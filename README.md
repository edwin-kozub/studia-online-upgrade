# Auto Clicker & Downloader — rozszerzenie Chrome

Rozszerzenie do przeglądarki Chrome automatyzujące nawigację, pobieranie plików i zarządzanie nazwami na platformie e-learningowej.

---

## Co potrafi ta wtyczka?

1. **Automatyczne przechodzenie lekcji (Auto-Clicker)**
   Wtyczka samoczynnie przechodzi do kolejnych stron PDF-ów i lekcji, dzięki czemu nie musisz ręcznie przewijać i odklikiwać materiałów. Interwał między przejściami ustawiasz z poziomu menu po kliknięciu ikonki wtyczki.

2. **Symulacja aktywnej karty**
   Wtyczka sprawia, że platforma widzi kartę jako aktywną nawet gdy pracujesz w innym oknie lub na innej karcie. Czas nauki nalicza się w tle bez przerw. Nie potrzebujesz już żadnych dodatkowych rozszerzeń typu "Always Active Window".

3. **Pobieranie plików PDF z poprawnymi nazwami**
   Rozszerzenie sprawdza nazwę lekcji i numerację (np. `1.1.1. Koncepcje...`). Na pasku nad każdym PDF-em wyświetla przycisk **"Pobierz PDF"**. Kliknięcie zapisuje plik w uporządkowanym formacie na dysku.

4. **Inteligentne kopiowanie nazw**
   Wtyczka dodaje pełną numerację (np. `1.1.2...`) w pogrubionym tytule na ekranie. Tytuł jest wyróżniony na niebiesko — kliknięcie kopiuje wygenerowaną nazwę do schowka (pojawia się zielony komunikat "Skopiowano!"). Przydatne do zapisywania wideo przez "Zapisz jako...".

5. **Odblokowanie prawego kliknięcia**
   Platforma blokuje prawy przycisk myszy na odtwarzaczach wideo. Wtyczka znosi tę blokadę — możesz korzystać z menu kontekstowego i opcji "Zapisz wideo jako..." lub dodatków pobierających.

6. **Anti-Scrolling**
   Skrypt blokuje agresywne przewijanie strony generowane przez platformę w momencie zmiany materiału przez Auto-Clicker. Ekran zostaje w miejscu.

---

## Instalacja

1. Zapisz cały folder z wtyczką w bezpieczne miejsce na dysku (np. folder *Dokumenty*).
2. Otwórz **Google Chrome**.
3. W pasku adresu wpisz `chrome://extensions/` i naciśnij Enter.
4. W prawym górnym rogu włącz **Tryb programisty** (*Developer mode*).
5. Kliknij **"Załaduj rozpakowane"** (*Load unpacked*).
6. Wskaż folder z wtyczką (zawierający `manifest.json`) i zatwierdź.
7. Gotowe — ikona wtyczki pojawi się obok paska adresu.

Kliknij ikonę wtyczki, zaznacz Auto-Klikacz i ustaw interwał w sekundach. Zmiany działają natychmiast, bez odświeżania strony.

---

## Changelog

### v1.6 — Ochrona wideo w tle + adaptacja do zmian platformy

**Co się stało:** Platforma zaktualizowała skrypt śledzenia (~21 marca 2026). Zmieniono architekturę z osobnych timerów per materiał na jeden główny timer z przełącznikiem aktywnego materiału. Efekt uboczny: gdy przeglądarka wstrzymuje wideo w tle, platforma przełącza śledzenie na PDF — procenty wideo przestają rosnąć.

**Co naprawia ta wersja:**

- **Wideo liczy się w tle** — wtyczka blokuje wstrzymanie wideo przez przeglądarkę gdy karta jest w tle. Odtwarzacz działa nieprzerwanie, a procenty realizacji wideo rosną normalnie.
- **Auto-wznowienie** — jeśli przeglądarka mimo wszystko wstrzyma wideo, wtyczka automatycznie je wznawia co 3 sekundy.
- **Symulacja postępu** — nawet gdy natywne odtwarzanie jest zablokowane, wtyczka symuluje rosnący czas wideo, zapewniając poprawne ticki do serwera.
- **Blokada przełączenia na PDF** — event `pause` wywołany przez przeglądarkę (nie przez użytkownika) jest przechwytywany i nie dociera do kodu platformy, więc tracking pozostaje na wideo.

**Zmiany na platformie wykryte w tej wersji:**

| Element | Stara wersja (v=1772547442) | Nowa wersja (v=1774348103) |
|---------|---------------------------|--------------------------|
| Architektura timerów | `startInterval()`/`stopInterval()` per materiał | Jeden `masterInterval` + `activeMaterial` |
| Przy blur | `stopAllIntervals()` | Flaga `isVisible = false` (timer ciągle bije) |
| Przy focus | `startActiveIntervals()` | Flaga `isVisible = true` |
| Przy pause wideo | `stopInterval(video); startActiveIntervals()` | `activeMaterial = materials.pdf` |
| UI statusu | Prosty toggle | + `IntersectionObserver` dla sticky bar |

**Szczegóły techniczne (v1.6):**

- `scroll_patch.js` — nowy Moduł 4 (ochrona wideo):
  - 4a: Override `HTMLMediaElement.prototype.pause` — blokada browser-initiated pauz (rozróżnienie przez prawdziwy `document.hidden`)
  - 4b: Przechwycenie eventu `pause` w fazie capture — `stopImmediatePropagation()` dla pauz przeglądarki
  - 4c: Tracking stanu `__wskzWasPlaying` per element `<video>`
  - 4d: Heartbeat auto-resume co 3s dla wstrzymanych wideo
  - 4e: Override `currentTime` getter/setter — symulacja rosnącego czasu gdy natywne odtwarzanie zablokowane (`Math.max(real, simulated)`)
- Zaktualizowano komentarze mechanizmu platformy (masterInterval, activeMaterial)

### v1.5 — Anty-throttling: pełna prędkość naliczania czasu w tle

**Problem:** Przeglądarki Chromium (Chrome, Brave, Edge) po ~5 minutach w tle spowalniają timery strony do max 1 wywołania na minutę. Przez to czas nauki naliczał się nawet **60x wolniej** gdy karta była w tle — mimo włączonej symulacji skupienia.

**Rozwiązanie:**

- **Web Worker timer** — wtyczka przechwytuje timer platformy i przenosi go do Web Workera, który **nie podlega ograniczeniom przeglądarki** dla kart w tle. Czas nauki nalicza się z pełną prędkością niezależnie od tego, czy karta jest aktywna.
- **Fallback kompensacyjny** — jeśli strona blokuje tworzenie Workera (polityka CSP), wtyczka automatycznie nadrabia pominięte sekundy przy każdym wywołaniu timera.

**Efekt:** Ticki ACTIVE lecą co 25 sekund bez przerw, nawet gdy pracujesz na innej karcie lub w innej aplikacji.

**Szczegóły techniczne (v1.5):**

- `scroll_patch.js` — nowy Moduł 1b (anty-throttling):
  - Strategia A: inline Web Worker (blob URL) przejmuje `setInterval` dla interwałów ~1000ms
  - Strategia B (fallback): kompensacja opóźnionych wywołań — przy throttlowanym odpaleniu callback wykonywany jest `Math.round(elapsed/ms)` razy
  - Przechwycenie `setInterval`/`clearInterval` z zachowaniem kompatybilności ID
- Zaktualizowano dokumentację mechanizmu śledzenia platformy (konfigurowalny `materialInterval`)

### v1.4 — Historia nauki, statystyki i monitoring sesji

**Nowe funkcje:**

- **Panel historii (Historia nauki)** — Dedykowana strona z podglądem wszystkich sesji nauki, filtrowaniem i szczegółowymi logami (dostępna przez "Opcje" rozszerzenia).
- **Monitoring sesji w czasie rzeczywistym** — Pop-up wyświetla teraz aktywne timery dla każdej otwartej lekcji, pokazując czas spędzony i aktualny postęp (Delta %).
- **Zaawansowane statystyki** — Automatyczne obliczanie tempa nauki (`%/min` i `%/h`) oraz przyrostu postępu dla całych lekcji i poszczególnych materiałów (PDF/Wideo).
- **Eksport danych** — Możliwość pobrania pełnej historii nauki do formatu **JSON** lub **CSV** (gotowy do analizy w Excelu).
- **Inteligentne zarządzanie sesjami** — Background worker automatycznie wykrywa zamknięcie kart i finalizuje sesje, zapobiegając utracie danych.

**Zmiany techniczne:**

- Dodano pliki `history.html`, `history.js`, `history.css`.
- Przebudowano `background.js` (logika sprzątania sesji, obsługa nagłówków Referer dla `ultracloud.pl`).
- Odświeżono interfejs `popup.html` i `popup.js` (live update aktywnych sesji).
- Rozszerzono uprawnienia w `manifest.json` o `declarativeNetRequest` i `tabs`.

### v1.2 — v1.3 — Prace rozwojowe

- Stabilizacja mechanizmów Focus Simulation.
- Ulepszona obsługa wielu zakładek jednocześnie.
- Poprawki błędów w downloaderze.

### v1.1 — Symulacja aktywnej karty + nawigacja PDF bez scrollowania

**Nowe funkcje:**

- **Wbudowana symulacja aktywnej karty** — wtyczka nadpisuje mechanizmy wykrywania fokusu bezpośrednio w kontekście strony. Platforma widzi kartę jako aktywną nawet gdy jest w tle. Zbędne stało się osobne rozszerzenie "Always Active Window".
- **Automatyczne zamykanie modala ostrzeżenia** — jeśli platforma wyświetli modal "nie skupiasz się na nauce", wtyczka zamyka go natychmiast i zapobiega ponownemu pojawieniu.

**Zmiany:**

- **Nawigacja PDF przez input numeru strony** — zamiast klikać przycisk "Następny" wewnątrz PDF (co powodowało uciążliwe przewijanie strony do kontenera), wtyczka wpisuje numer następnej strony w pole tekstowe i wciska Enter. Strona PDF zmienia się bez żadnego scrollowania.
- **Rozdzielenie przycisków PDF i lekcji** — przycisk "następna lekcja" klikany jest tylko gdy nie ma PDF-a do przewinięcia, lub gdy PDF jest na ostatniej stronie.

**Szczegóły techniczne (v1.1):**

- `scroll_patch.js` (świat MAIN, document_start) — trzy moduły:
  - Moduł 1: nadpisanie `hasFocus()`, `document.hidden`, `document.visibilityState`; blokowanie eventów `blur`, `pagehide`, `visibilitychange` w fazie capture
  - Moduł 2: anty-scroll (bez zmian)
  - Moduł 3: suppresja modala `isActiveModal` przez `sessionStorage` + MutationObserver
- `content.js` — nowa funkcja `attemptNextPage()` zastępuje `attemptNextClick()`; nawigacja przez `nativeInputValueSetter` + dispatch `KeyboardEvent('Enter')`

### v1.0 — Wersja początkowa

- Auto-Clicker z konfigurowalnym interwałem
- Pobieranie PDF z inteligentnym nazewnictwem
- Kopiowanie nazw do schowka
- Odblokowanie prawego kliknięcia
- Anti-Scrolling

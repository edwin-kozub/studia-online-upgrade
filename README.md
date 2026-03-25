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

document.addEventListener('DOMContentLoaded', () => {
    const autoClickCheckbox = document.getElementById('autoClickEnabled');
    const intervalInput = document.getElementById('clickInterval');
    const saveBtn = document.getElementById('saveBtn');
    const statusDiv = document.getElementById('status');

    // Wczytaj obecne
    chrome.storage.sync.get({
        autoClickEnabled: false,
        clickInterval: 60
    }, (items) => {
        autoClickCheckbox.checked = items.autoClickEnabled;
        intervalInput.value = items.clickInterval;
    });

    // Zapisz ustawienia
    saveBtn.addEventListener('click', () => {
        const autoClickEnabled = autoClickCheckbox.checked;
        const clickInterval = parseInt(intervalInput.value) || 60;

        chrome.storage.sync.set({
            autoClickEnabled,
            clickInterval
        }, () => {
            statusDiv.textContent = 'Zapisano! Działa bez odświeżania karty.';
            setTimeout(() => {
                statusDiv.textContent = '';
            }, 3000);
        });
    });
});

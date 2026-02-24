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

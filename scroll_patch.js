(function () {
    let preventScroll = false;

    window.addEventListener("message", (event) => {
        if (event.source === window && event.data.type === "WSKZ_PREVENT_SCROLL") {
            preventScroll = true;
            setTimeout(() => {
                preventScroll = false;
            }, 800);
        }
    });

    // Patch scrolling functions
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

    // Patch jQuery if available
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
})();

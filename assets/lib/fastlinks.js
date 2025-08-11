function replaceOnClickWithOnMouseDownForLinks() {
    document.querySelectorAll('a').forEach(link => {
        if (link.target === '_blank' || link.href.startsWith('javascript:')) {
            return;
        }
        const callback = link.onclick || (link.href ? () => globalThis.location = link.href : null);

        if (callback) {
            link.onmousedown = e => {
                if (e.button === 0 && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) { // Left mouse button, no modifiers
                    callback(this, e);
                }
            };
        }
        link.onclick = null;
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replaceOnClickWithOnMouseDownForLinks);
} else {
    // DOM is already loaded
    replaceOnClickWithOnMouseDownForLinks();
}

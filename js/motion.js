(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) return;

    const selectors = [
        '.features-grid .feature-card', '.role-card', '.objective-card',
        '.workflow-step', '.about-feature-item', '.planning-copy', '.planning-flow',
        '.technology-stack', '.dashboard-main > .card', '.manager-welcome',
        '.manager-grid > .card', '.signup-card'
    ];
    const targets = [...new Set(selectors.flatMap(selector => [...document.querySelectorAll(selector)]))];
    if (!targets.length) return;

    document.documentElement.classList.add('motion-ready');
    const observer = new IntersectionObserver((entries, currentObserver) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('is-visible');
            currentObserver.unobserve(entry.target);
        }
    }, { threshold: 0.08, rootMargin: '0px 0px -36px 0px' });

    targets.forEach((element, index) => {
        element.dataset.reveal = '';
        element.style.setProperty('--reveal-delay', `${(index % 4) * 65}ms`);
        observer.observe(element);
    });
})();

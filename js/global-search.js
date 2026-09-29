window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('globalSearchForm');
    if (!form) return;
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const query = document.getElementById('globalSearchInput').value.trim();
        const output = document.getElementById('globalSearchResults');
        if (query.length < 2) {
            output.textContent = 'Enter at least two characters.';
            return;
        }
        output.textContent = 'Searching your permitted records…';
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || 'Search failed.');
            output.innerHTML = data.results.length ? `<ul>${data.results.map(item => `<li><span class="global-search-type">${globalSearchEscape(item.type)}</span><strong>${globalSearchEscape(item.title)}</strong><small>${globalSearchEscape(item.detail)}</small></li>`).join('')}</ul><small>${data.count} result(s), limited to records your role may view.</small>` : '<p>No matching records in the data you can access.</p>';
        } catch (error) { output.textContent = error.message; }
    });
});

function globalSearchEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

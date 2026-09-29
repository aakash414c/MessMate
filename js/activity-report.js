window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('activityReportFilters');
    if (!form) return;
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    document.getElementById('activityReportFrom').value = activityDateKey(from);
    document.getElementById('activityReportTo').value = activityDateKey(today);
    form.addEventListener('submit', event => { event.preventDefault(); loadActivityReport(); });
    document.getElementById('activityReportSort').addEventListener('change', loadActivityReport);
    loadActivityReport();
});

function activityDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function activityEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

async function loadActivityReport() {
    const query = new URLSearchParams({
        from: document.getElementById('activityReportFrom').value,
        to: document.getElementById('activityReportTo').value,
        q: document.getElementById('activityReportSearch').value.trim()
    });
    const status = document.getElementById('activityReportMessage');
    if (!query.get('from') || !query.get('to') || query.get('from') > query.get('to')) { status.textContent = 'Choose a valid date range.'; return; }
    status.textContent = 'Loading user activity…';
    try {
        const response = await fetch(`/api/reports/activity?${query}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Unable to load activity.');
        const records = [...data.records];
        if (document.getElementById('activityReportSort').value === 'user') records.sort((a, b) => a.actorId.localeCompare(b.actorId));
        const body = document.getElementById('activityReportRows');
        body.innerHTML = records.length ? records.map(row => `<tr><td>${activityEscape(new Date(row.createdAt).toLocaleString())}</td><td>${activityEscape(row.actorId)}</td><td>${activityEscape(row.actorRole)}</td><td>${activityEscape(row.method)}</td><td>${activityEscape(row.action)}</td><td>${activityEscape(row.statusCode)}</td></tr>`).join('') : '<tr><td colspan="6">No activity matches these filters.</td></tr>';
        document.getElementById('activityReportCsv').href = `/api/reports/activity.csv?${query}`;
        status.textContent = `${records.length} successful account action(s) shown. Passwords, payment secrets, and request bodies are not stored in this report.${data.truncated ? ' Narrow the date range; the display limit was reached.' : ''}`;
    } catch (error) { status.textContent = error.message; document.getElementById('activityReportRows').innerHTML = '<tr><td colspan="6">Activity could not be loaded.</td></tr>'; }
}

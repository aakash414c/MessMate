window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('operationsReportFilters');
    if (!form) return;
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    document.getElementById('operationsReportFrom').value = reportDateKey(start);
    document.getElementById('operationsReportTo').value = reportDateKey(today);
    form.addEventListener('submit', event => { event.preventDefault(); loadOperationsReport(); });
    document.getElementById('operationsReportSort').addEventListener('change', loadOperationsReport);
    document.getElementById('operationsReportThen').addEventListener('change', loadOperationsReport);
    loadOperationsReport();
});

function reportDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function reportEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function reportQuery() {
    const query = new URLSearchParams({
        from: document.getElementById('operationsReportFrom').value,
        to: document.getElementById('operationsReportTo').value,
        meal: document.getElementById('operationsReportMeal').value,
        status: document.getElementById('operationsReportStatus').value,
        q: document.getElementById('operationsReportSearch').value.trim()
    });
    return query;
}

async function loadOperationsReport() {
    const message = document.getElementById('operationsReportMessage');
    const query = reportQuery();
    const from = query.get('from');
    const to = query.get('to');
    if (!from || !to || from > to) {
        message.textContent = 'Choose a valid date range.';
        return;
    }
    message.textContent = 'Loading matching bookings and check-ins…';
    try {
        const response = await fetch(`/api/reports/operations?${query}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Unable to load operations report.');
        const primary = document.getElementById('operationsReportSort').value;
        const secondary = document.getElementById('operationsReportThen').value;
        const bookings = sortOperationRows(data.bookings, primary, secondary);
        const checkIns = sortOperationRows(data.checkIns, primary, secondary);
        document.getElementById('operationsBookings').innerHTML = bookings.length ? bookings.map(row => `<tr><td>${reportEscape(row.date)}</td><td>${reportEscape(row.meal)}</td><td>${reportEscape(row.userId)}</td><td>${reportEscape(row.status)}</td></tr>`).join('') : '<tr><td colspan="4">No bookings match these filters.</td></tr>';
        document.getElementById('operationsCheckIns').innerHTML = checkIns.length ? checkIns.map(row => `<tr><td>${reportEscape(row.date)}</td><td>${reportEscape(row.meal)}</td><td>${reportEscape(row.userId)}</td><td>${reportEscape(row.checkedInBy)}</td><td>${row.checkedInAt ? reportEscape(new Date(row.checkedInAt).toLocaleString()) : '—'}</td></tr>`).join('') : '<tr><td colspan="5">No check-ins match these filters.</td></tr>';
        const csvQuery = reportQuery();
        document.getElementById('operationsBookingsCsv').href = `/api/reports/bookings.csv?${csvQuery}`;
        document.getElementById('operationsCheckInsCsv').href = `/api/reports/check-ins.csv?${csvQuery}`;
        message.textContent = `Showing ${bookings.length} booking(s) and ${checkIns.length} check-in(s) for ${from} to ${to}.${data.truncated ? ' The on-screen result cap was reached; narrow the date range or search.' : ''}`;
    } catch (error) {
        message.textContent = error.message;
        document.getElementById('operationsBookings').innerHTML = '<tr><td colspan="4">Report could not be loaded.</td></tr>';
        document.getElementById('operationsCheckIns').innerHTML = '<tr><td colspan="5">Report could not be loaded.</td></tr>';
    }
}

function sortOperationRows(rows, primary, secondary) {
    const primaryField = primary === 'student' ? 'userId' : 'date';
    const primaryDirection = primary === 'oldest' || primary === 'student' ? 1 : -1;
    const compare = (left, right, field, direction = 1) => {
        const a = String(left[field] ?? '');
        const b = String(right[field] ?? '');
        return direction * a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    };
    return [...rows].sort((a, b) => {
        const primaryResult = compare(a, b, primaryField, primaryDirection);
        if (primaryResult) return primaryResult;
        if (secondary !== 'none' && secondary !== primaryField) {
            const secondaryResult = compare(a, b, secondary);
            if (secondaryResult) return secondaryResult;
        }
        return compare(a, b, 'date', -1) || compare(a, b, 'meal') || compare(a, b, 'userId');
    });
}

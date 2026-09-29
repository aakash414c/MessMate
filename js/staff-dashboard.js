window.addEventListener('DOMContentLoaded', async function() {
    const user = await checkAuth(['staff', 'manager']);
    if (!user) return;
    if (user.type === 'manager') document.querySelector('.user-info-card h2').textContent = 'Mess Manager Dashboard';

    updateDateTime();
    const dateNow = new Date();
    document.getElementById('checkInDate').value = `${dateNow.getFullYear()}-${String(dateNow.getMonth() + 1).padStart(2, '0')}-${String(dateNow.getDate()).padStart(2, '0')}`;
    const dateKey = `${dateNow.getFullYear()}-${String(dateNow.getMonth() + 1).padStart(2, '0')}-${String(dateNow.getDate()).padStart(2, '0')}`;
    document.getElementById('menuDate').value = dateKey;
    document.getElementById('menuDate').min = dateKey;
    const menuMax = new Date(dateNow);
    menuMax.setDate(menuMax.getDate() + 30);
    document.getElementById('menuDate').max = `${menuMax.getFullYear()}-${String(menuMax.getMonth() + 1).padStart(2, '0')}-${String(menuMax.getDate()).padStart(2, '0')}`;
    document.getElementById('weeklyMenuDay').value = String(dateNow.getDay());
    await loadMenu();
    await loadWeeklyMenu();
    await refreshCounts();
    await loadReviews();
    await updateStats();
    await loadStaffComplaints();
    await loadMyDuties();

    setInterval(refreshCounts, 30000);
    setInterval(updateStats, 30000);
    setInterval(loadReviews, 30000);
    setInterval(updateDateTime, 60000);
});

function getStoredUser() {
    return JSON.parse(localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo') || 'null');
}

async function api(path, options = {}) {
    const user = getStoredUser();
    const response = await fetch(path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || 'Request failed.');
    }

    return data;
}

async function checkAuth(expectedType) {
    const userInfo = getStoredUser();

    const allowedTypes = Array.isArray(expectedType) ? expectedType : [expectedType];
    if (!userInfo || !allowedTypes.includes(userInfo.type)) {
        window.location.href = 'index.html';
        return null;
    }

    try {
        const data = await api('/api/auth/me');
        document.getElementById('userId').textContent = data.user.userId;
        return data.user;
    } catch {
        clearAuth();
        window.location.href = 'index.html';
        return null;
    }
}

async function publishAnnouncement(event) {
    event.preventDefault();
    const message = document.getElementById('announcementMessage');
    try {
        await api('/api/announcements', { method: 'POST', body: JSON.stringify({
            title: document.getElementById('announcementTitle').value,
            body: document.getElementById('announcementBody').value
        }) });
        document.getElementById('announcementForm').reset();
        message.textContent = 'Announcement published.';
    } catch (error) {
        message.textContent = error.message;
    }
}

async function loadStaffComplaints() {
    try {
        const { complaints } = await api('/api/complaints');
        const container = document.getElementById('staffComplaints');
        container.innerHTML = complaints.length ? complaints.map(item => `
            <article class="notice-item"><strong>${escapeHtml(item.subject)}</strong><p>${escapeHtml(item.description)}</p><small>Student ${escapeHtml(item.userId)} · ${item.status === 'in_progress' ? 'In Progress' : capitalize(item.status)}</small>${item.hasAttachment ? `<p><a href="/api/complaints/${encodeURIComponent(item.id)}/image" target="_blank" rel="noopener">View attached photo</a></p>` : ''}
                <label for="complaint-${item.id}">Status</label>
                <select id="complaint-${item.id}" onchange="updateComplaintStatus('${item.id}', this.value)">
                    <option value="pending" ${item.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="resolved" ${item.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                </select>
            </article>`).join('') : '<p class="no-data">No complaints to process.</p>';
    } catch (error) {
        document.getElementById('staffComplaints').textContent = error.message;
    }
}

async function updateComplaintStatus(id, status) {
    try {
        await api(`/api/complaints/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
        await loadStaffComplaints();
    } catch (error) { alert(error.message); }
}

let qrScanner = null;
let qrScanBusy = false;

async function startQrScanner() {
    const message = document.getElementById('qrScanMessage');
    if (!window.Html5Qrcode) { message.textContent = 'Camera scanner could not load. Use manual check-in below.'; return; }
    try {
        if (!qrScanner) qrScanner = new Html5Qrcode('qrReader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] });
        if (qrScanner.isScanning) return;
        message.textContent = 'Requesting camera access…';
        await qrScanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 }, handleQrScan, () => {});
        message.textContent = 'Camera active. Hold a student pass inside the frame.';
    } catch (error) {
        message.textContent = error?.message || 'Unable to start the camera. Allow access or use manual check-in.';
    }
}

async function handleQrScan(qrText) {
    if (qrScanBusy) return;
    qrScanBusy = true;
    const message = document.getElementById('qrScanMessage');
    try {
        const result = await api('/api/check-ins/scan', { method: 'POST', body: JSON.stringify({ qrText }) });
        message.textContent = `Verified and checked in ${result.checkIn.userId} for ${capitalize(result.checkIn.meal)}.`;
        if (qrScanner?.isScanning) await qrScanner.stop();
    } catch (error) {
        message.textContent = error.message;
    } finally {
        window.setTimeout(() => { qrScanBusy = false; }, 1200);
    }
}

async function stopQrScanner() {
    if (!qrScanner?.isScanning) {
        document.getElementById('qrScanMessage').textContent = 'Camera is stopped.';
        return;
    }
    try { await qrScanner.stop(); document.getElementById('qrScanMessage').textContent = 'Camera is stopped.'; }
    catch (error) { document.getElementById('qrScanMessage').textContent = error.message; }
}

window.addEventListener('pagehide', () => { if (qrScanner?.isScanning) qrScanner.stop().catch(() => {}); });

async function recordCheckIn(event) {
    event.preventDefault();
    const message = document.getElementById('checkInMessage');
    try {
        const result = await api('/api/check-ins', { method: 'POST', body: JSON.stringify({
            userId: document.getElementById('checkInStudent').value.trim(),
            meal: document.getElementById('checkInMeal').value,
            date: document.getElementById('checkInDate').value
        }) });
        message.textContent = `Check-in recorded for ${result.checkIn.userId}.`;
        document.getElementById('checkInStudent').value = '';
    } catch (error) { message.textContent = error.message; }
}

async function loadMyDuties() {
    try {
        const { duties } = await api('/api/duties');
        const container = document.getElementById('staffDuties');
        container.innerHTML = duties.length ? duties.map(item => `<article class="notice-item"><strong>${escapeHtml(item.title)}</strong><p>${item.dueAt ? `Due ${new Date(item.dueAt).toLocaleString()}` : 'No due date'}</p><select aria-label="Duty status" onchange="updateDutyStatus('${item.id}', this.value)"><option value="assigned" ${item.status === 'assigned' ? 'selected' : ''}>Assigned</option><option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>In Progress</option><option value="completed" ${item.status === 'completed' ? 'selected' : ''}>Completed</option></select></article>`).join('') : '<p class="no-data">No duties assigned to you.</p>';
    } catch (error) { document.getElementById('staffDuties').textContent = error.message; }
}

async function updateDutyStatus(id, status) {
    try { await api(`/api/duties/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadMyDuties(); }
    catch (error) { alert(error.message); }
}

function updateDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', options);
}

async function loadMenu() {
    try {
        const date = document.getElementById('menuDate').value;
        if (!date) return;
        const data = await api(`/api/menu?date=${encodeURIComponent(date)}`);
        document.getElementById('breakfastMenu').value = data.menu.breakfast || '';
        document.getElementById('lunchMenu').value = data.menu.lunch || '';
        document.getElementById('snacksMenu').value = data.menu.snacks || '';
        document.getElementById('dinnerMenu').value = data.menu.dinner || '';
        const selectedDate = new Date(`${date}T00:00:00`);
        document.getElementById('menuTitle').textContent = `Menu for ${selectedDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`;
        const labels = { date: 'one-day override', weekly: 'weekly schedule', default: 'basic fallback' };
        const sources = Object.entries(data.sources || {}).map(([meal, source]) => `${capitalize(meal)}: ${labels[source] || source}`);
        document.getElementById('menuSourceNote').textContent = sources.join(' · ');
    } catch (error) {
        alert(error.message);
    }
}

async function updateMenu() {
    const date = document.getElementById('menuDate').value;
    if (!date) return alert('Choose a menu date first.');
    const menu = {
        breakfast: document.getElementById('breakfastMenu').value,
        lunch: document.getElementById('lunchMenu').value,
        snacks: document.getElementById('snacksMenu').value,
        dinner: document.getElementById('dinnerMenu').value
    };

    try {
        await api(`/api/menu/${encodeURIComponent(date)}`, {
            method: 'PUT',
            body: JSON.stringify(menu)
        });
        document.getElementById('menuSourceNote').textContent = 'Date-specific menu saved. It overrides the weekly menu for this date.';
        await loadMenu();
    } catch (error) {
        alert(error.message);
    }
}

async function clearDateMenu() {
    const date = document.getElementById('menuDate').value;
    if (!date || !window.confirm(`Clear the date-specific menu for ${date}? The weekly or default menu will apply.`)) return;
    try {
        const result = await api(`/api/menu/${encodeURIComponent(date)}`, { method: 'DELETE' });
        document.getElementById('menuSourceNote').textContent = result.message;
        await loadMenu();
    } catch (error) { alert(error.message); }
}

async function loadWeeklyMenu() {
    const day = document.getElementById('weeklyMenuDay').value;
    try {
        const { menus } = await api(`/api/menu/weekly?dayOfWeek=${encodeURIComponent(day)}`);
        document.getElementById('weeklyBreakfastMenu').value = menus.breakfast || '';
        document.getElementById('weeklyLunchMenu').value = menus.lunch || '';
        document.getElementById('weeklySnacksMenu').value = menus.snacks || '';
        document.getElementById('weeklyDinnerMenu').value = menus.dinner || '';
        document.getElementById('weeklyMenuMessage').textContent = Object.keys(menus).length ? 'Edit the saved recurring menu, or fill all meals to create one.' : 'No recurring menu saved for this weekday yet.';
    } catch (error) { document.getElementById('weeklyMenuMessage').textContent = error.message; }
}

async function updateWeeklyMenu() {
    const day = document.getElementById('weeklyMenuDay').value;
    const menus = {
        breakfast: document.getElementById('weeklyBreakfastMenu').value,
        lunch: document.getElementById('weeklyLunchMenu').value,
        snacks: document.getElementById('weeklySnacksMenu').value,
        dinner: document.getElementById('weeklyDinnerMenu').value
    };
    try {
        await api(`/api/menu/weekly/${encodeURIComponent(day)}`, { method: 'PUT', body: JSON.stringify(menus) });
        document.getElementById('weeklyMenuMessage').textContent = 'Recurring menu saved. Future dates on this weekday will use it unless they have a date-specific override.';
        await loadMenu();
    } catch (error) { document.getElementById('weeklyMenuMessage').textContent = error.message; }
}

async function clearWeeklyMenu() {
    const day = document.getElementById('weeklyMenuDay').value;
    const dayName = document.getElementById('weeklyMenuDay').selectedOptions[0].textContent;
    if (!window.confirm(`Remove the recurring menu for ${dayName}? Date-specific menus will remain.`)) return;
    try {
        const result = await api(`/api/menu/weekly/${encodeURIComponent(day)}`, { method: 'DELETE' });
        document.getElementById('weeklyMenuMessage').textContent = result.message;
        await loadWeeklyMenu();
        await loadMenu();
    } catch (error) { document.getElementById('weeklyMenuMessage').textContent = error.message; }
}

async function refreshCounts() {
    try {
        const summary = await api('/api/dashboard/summary');
        animateCount('breakfastCount', summary.counts.breakfast);
        animateCount('lunchCount', summary.counts.lunch);
        animateCount('snacksCount', summary.counts.snacks);
        animateCount('dinnerCount', summary.counts.dinner);
        document.getElementById('lastUpdated').textContent = summary.lastUpdated;
    } catch (error) {
        console.error(error);
    }
}

function animateCount(elementId, targetValue) {
    const element = document.getElementById(elementId);
    const currentValue = parseInt(element.textContent, 10) || 0;

    if (currentValue === targetValue) return;

    const increment = targetValue > currentValue ? 1 : -1;
    const steps = Math.max(Math.abs(targetValue - currentValue), 1);
    const stepDuration = 500 / steps;
    let current = currentValue;

    const timer = setInterval(() => {
        current += increment;
        element.textContent = current;

        if (current === targetValue) {
            clearInterval(timer);
        }
    }, stepDuration);
}

async function loadReviews() {
    try {
        const data = await api('/api/reviews?today=true');
        const reviewsList = document.getElementById('reviewsList');

        if (data.reviews.length === 0) {
            reviewsList.innerHTML = '<p class="no-data">No reviews yet</p>';
            return;
        }

        reviewsList.innerHTML = data.reviews.map(review => `
            <div class="review-item">
                <div class="review-header">
                    <span class="review-user">Student ${review.userId.slice(-4)}</span>
                    <span class="review-rating">${'Star '.repeat(review.rating).trim()}</span>
                </div>
                <p class="review-meal">${capitalize(review.meal)}</p>
                <p class="review-comment">${escapeHtml(review.comment)}</p>
                <p class="review-time">${formatTime(review.timestamp)}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error(error);
    }
}

async function updateStats() {
    try {
        const summary = await api('/api/dashboard/summary');
        document.getElementById('totalStudents').textContent = summary.uniqueStudents;
        document.getElementById('totalMeals').textContent = summary.totalMeals;
        document.getElementById('avgRating').textContent = summary.avgRating;
        document.getElementById('reviewCount').textContent = summary.totalReviews;
    } catch (error) {
        console.error(error);
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

async function logout() {
    try {
        await api('/api/auth/logout', { method: 'POST' });
    } catch {
        // Continue logout locally.
    }
    clearAuth();
    window.location.href = 'index.html';
}

function clearAuth() {
    localStorage.removeItem('userInfo');
    sessionStorage.removeItem('userInfo');
}

function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

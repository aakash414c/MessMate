let currentTab = 'reviews';
let currentComplaintId = null;
let allReviews = [];
let allComplaints = [];
let allPaymentRows = [];

window.addEventListener('DOMContentLoaded', async function() {
    const user = await checkAuth('admin');
    if (!user) return;

    updateDateTime();
    await refreshData();

    setInterval(refreshData, 30000);
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

    if (!userInfo || userInfo.type !== expectedType) {
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

function updateDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', options);
}

async function refreshData() {
    await Promise.all([
        loadMealCounts(),
        updateOverview(),
        loadPayments(),
        loadFeedback(),
        loadAttendanceSummary(),
        loadUsers()
    ]);
}

async function loadUsers() {
    const container = document.getElementById('accountList');
    if (!container) return;
    try {
        const role = document.getElementById('accountRoleFilter').value;
        const { users } = await api(`/api/users?type=${encodeURIComponent(role)}`);
        container.innerHTML = users.length ? users.map(user => `
            <div class="account-row"><strong>${escapeHtml(user.userId)}</strong><span>${escapeHtml(user.type)}</span>
                <select aria-label="Role for ${escapeHtml(user.userId)}" onchange="changeAccountRole('${encodeURIComponent(user.userId)}', this.value)">
                    ${['student', 'staff', 'manager', 'admin'].map(type => `<option value="${type}" ${user.type === type ? 'selected' : ''}>${type === 'admin' ? 'Administrator' : type === 'manager' ? 'Mess Manager' : type === 'staff' ? 'Mess Staff' : 'Student'}</option>`).join('')}
                </select>
                ${user.type === 'student' ? `<div class="wallet-admin-tools"><small>Wallet balance · ${formatCurrency(user.walletBalance || 0)}</small><input id="walletAmount-${encodeURIComponent(user.userId)}" type="number" min="0.01" max="100000" step="0.01" placeholder="Credit amount"><input id="walletNote-${encodeURIComponent(user.userId)}" maxlength="200" placeholder="Deposit/adjustment note"><button type="button" onclick="creditStudentWallet('${encodeURIComponent(user.userId)}')">Record credit</button></div>` : ''}
            </div>`).join('') : '<p class="no-data">No accounts match this role.</p>';
    } catch (error) { container.textContent = error.message; }
}

async function createAccount(event) {
    event.preventDefault();
    const message = document.getElementById('accountAdminMessage');
    try {
        const result = await api('/api/users', { method: 'POST', body: JSON.stringify({
            userId: document.getElementById('newUserId').value.trim(),
            password: document.getElementById('newUserPassword').value,
            type: document.getElementById('newUserRole').value
        }) });
        event.target.reset();
        message.textContent = `Created ${result.user.type} account ${result.user.userId}.`;
        await loadUsers();
    } catch (error) { message.textContent = error.message; }
}

async function changeAccountRole(encodedUserId, type) {
    const userId = decodeURIComponent(encodedUserId);
    try {
        await api(`/api/users/${encodeURIComponent(userId)}/role`, { method: 'PATCH', body: JSON.stringify({ type }) });
        await loadUsers();
    } catch (error) { alert(error.message); await loadUsers(); }
}

async function creditStudentWallet(encodedUserId) {
    const userId = decodeURIComponent(encodedUserId);
    const message = document.getElementById('accountAdminMessage');
    const amount = Number(document.getElementById(`walletAmount-${encodedUserId}`).value);
    const note = document.getElementById(`walletNote-${encodedUserId}`).value.trim();
    if (!amount || !note) { message.textContent = 'Enter a positive amount and a deposit/adjustment note.'; return; }
    try {
        const result = await api(`/api/users/${encodeURIComponent(userId)}/wallet/credit`, { method: 'POST', body: JSON.stringify({ amount, note }) });
        message.textContent = `Recorded wallet credit for ${result.userId}. New balance ${formatCurrency(result.walletBalance)}. This is an administrator-recorded balance entry.`;
        await loadUsers();
    } catch (error) { message.textContent = error.message; }
}

async function loadMealCounts() {
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

async function updateOverview() {
    try {
        const summary = await api('/api/dashboard/summary');
        document.getElementById('uniqueStudents').textContent = summary.uniqueStudents;
        document.getElementById('totalMeals').textContent = summary.totalMeals;
        document.getElementById('avgRating').textContent = summary.avgRating;
        document.getElementById('totalReviews').textContent = summary.totalReviews;
    } catch (error) {
        console.error(error);
    }
}

function switchTab(tab) {
    currentTab = tab;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(tab));
    });

    document.getElementById('reviewsTab').style.display = tab === 'reviews' ? 'block' : 'none';
    document.getElementById('complaintsTab').style.display = tab === 'complaints' ? 'block' : 'none';
}

async function loadFeedback() {
    try {
        const [reviewData, complaintData] = await Promise.all([
            api('/api/reviews?today=true'),
            api('/api/complaints')
        ]);

        allReviews = reviewData.reviews;
        allComplaints = complaintData.complaints;
        filterReviews();
        filterComplaints();
    } catch (error) {
        console.error(error);
    }
}

async function loadPayments() {
    try {
        const data = await api('/api/payments/admin');
        document.getElementById('adminPaymentMonth').textContent = data.label;
        document.getElementById('totalCollected').textContent = formatCurrency(data.totalCollected);
        document.getElementById('paidStudents').textContent = `${data.paidStudents}/${data.totalStudents}`;
        document.getElementById('pendingStudents').textContent = data.pendingStudents;
        displayPayments(data.payments, data.pendingUsers);
    } catch (error) {
        console.error(error);
    }
}

function displayPayments(payments, pendingUsers) {
    const pendingItems = pendingUsers.map(userId => ({
        userId,
        status: 'pending',
        amount: 0,
        provider: 'not paid',
        createdAt: null
    }));
    allPaymentRows = [...payments, ...pendingItems];
    filterPaymentList();
}

function filterPaymentList() {
    const container = document.getElementById('paymentsList');
    const search = (document.getElementById('paymentSearch')?.value || '').trim().toLowerCase();
    const sort = document.getElementById('paymentSort')?.value || 'status';
    const rows = allPaymentRows.filter(payment => payment.userId.toLowerCase().includes(search));
    rows.sort(sort === 'student' ? (a, b) => a.userId.localeCompare(b.userId) : sort === 'amount' ? (a, b) => Number(b.amount) - Number(a.amount) : sort === 'recent' ? (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) : (a, b) => Number(a.status === 'paid') - Number(b.status === 'paid') || a.userId.localeCompare(b.userId));

    if (!rows.length) {
        container.innerHTML = allPaymentRows.length ? '<p class="no-data">No payments match this search.</p>' : '<p class="no-data">No payment data available</p>';
        return;
    }

    container.innerHTML = rows.map(payment => {
        const visibleStatus = payment.status === 'paid' ? 'paid' : 'pending';
        return `
        <div class="payment-row ${visibleStatus}">
            <div>
                <strong>${escapeHtml(payment.userId)}</strong>
                <span>${escapeHtml(payment.provider || 'not paid')}</span>
            </div>
            <div>
                <strong>${visibleStatus === 'paid' ? formatCurrency(payment.amount) : 'Pending'}</strong>
                <span>${payment.createdAt ? formatDateTime(payment.createdAt) : 'No payment yet'}</span>
            </div>
            <span class="payment-status ${visibleStatus}">${visibleStatus.toUpperCase()}</span>
        </div>
    `;
    }).join('');
}

function filterReviews() {
    const mealFilter = document.getElementById('reviewMealFilter').value;
    const ratingFilter = document.getElementById('reviewRatingFilter').value;

    let filtered = [...allReviews];

    if (mealFilter !== 'all') {
        filtered = filtered.filter(review => review.meal === mealFilter);
    }

    if (ratingFilter !== 'all') {
        filtered = filtered.filter(review => Number(review.rating) === Number(ratingFilter));
    }

    displayReviews(filtered);
}

function displayReviews(reviews) {
    const reviewsList = document.getElementById('reviewsList');

    if (reviews.length === 0) {
        reviewsList.innerHTML = '<p class="no-data">No reviews found</p>';
        return;
    }

    reviewsList.innerHTML = reviews.map(review => `
        <div class="review-item">
            <div class="feedback-header-row">
                <span class="feedback-user">Student ${review.userId.slice(-4)}</span>
                <span class="review-rating">${'Star '.repeat(review.rating).trim()}</span>
            </div>
            <div class="feedback-meta">
                <span>Meal: ${capitalize(review.meal)}</span>
            </div>
            <p class="feedback-content-text">${escapeHtml(review.comment)}</p>
            <p class="feedback-time">${formatDateTime(review.timestamp)}</p>
        </div>
    `).join('');
}

function filterComplaints() {
    const statusFilter = document.getElementById('complaintStatusFilter').value;
    const mealFilter = document.getElementById('complaintMealFilter').value;

    let filtered = [...allComplaints];

    if (statusFilter !== 'all') {
        filtered = filtered.filter(complaint => complaint.status === statusFilter);
    }

    if (mealFilter !== 'all') {
        filtered = filtered.filter(complaint => complaint.meal === mealFilter);
    }

    displayComplaints(filtered);
}

function displayComplaints(complaints) {
    const complaintsList = document.getElementById('complaintsList');

    if (complaints.length === 0) {
        complaintsList.innerHTML = '<p class="no-data">No complaints found</p>';
        return;
    }

    complaintsList.innerHTML = complaints.map(complaint => `
        <div class="complaint-item ${complaint.status}">
            <div class="feedback-header-row">
                <span class="feedback-user">Student ${complaint.userId.slice(-4)}</span>
                <span class="complaint-status ${complaint.status}">${complaint.status.toUpperCase()}</span>
            </div>
            <div class="feedback-meta">
                <span>Meal: ${capitalize(complaint.meal)}</span>
                <span>Subject: ${escapeHtml(complaint.subject)}</span>
            </div>
            <p class="feedback-content-text">${escapeHtml(complaint.description)}</p>
            <p class="feedback-time">${formatDateTime(complaint.timestamp)}</p>
            ${complaint.hasAttachment ? `<p><a href="/api/complaints/${encodeURIComponent(complaint.id)}/image" target="_blank" rel="noopener">View attached photo</a></p>` : ''}
            ${complaint.status === 'pending' ? `
                <div class="complaint-actions">
                    <button class="action-btn view-btn" onclick="viewComplaint('${complaint.id}')">View Details</button>
                    <button class="action-btn resolve-btn" onclick="quickResolve('${complaint.id}')">Mark Resolved</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function viewComplaint(id) {
    const complaint = allComplaints.find(item => item.id === id);
    if (!complaint) return;

    currentComplaintId = id;
    document.getElementById('complaintDetails').innerHTML = `
        <div class="detail-row">
            <div class="detail-label">Student ID:</div>
            <div class="detail-value">${complaint.userId}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Meal:</div>
            <div class="detail-value">${capitalize(complaint.meal)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Subject:</div>
            <div class="detail-value">${escapeHtml(complaint.subject)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Description:</div>
            <div class="detail-value">${escapeHtml(complaint.description)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Submitted:</div>
            <div class="detail-value">${formatDateTime(complaint.timestamp)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Status:</div>
            <div class="detail-value">
                <span class="complaint-status ${complaint.status}">${complaint.status.toUpperCase()}</span>
            </div>
        </div>
    `;

    document.getElementById('complaintModal').style.display = 'block';
}

function quickResolve(id) {
    currentComplaintId = id;
    resolveComplaint();
}

async function resolveComplaint() {
    if (!currentComplaintId) return;

    try {
        await api(`/api/complaints/${currentComplaintId}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
        closeModal();
        await loadFeedback();
        alert('Complaint marked as resolved');
    } catch (error) {
        alert(error.message);
    }
}

function closeModal() {
    document.getElementById('complaintModal').style.display = 'none';
    currentComplaintId = null;
}

window.onclick = function(event) {
    const modal = document.getElementById('complaintModal');
    if (event.target === modal) {
        closeModal();
    }
};

async function loadAttendanceSummary() {
    const container = document.getElementById('attendanceSummary');
    if (!container) return;

    try {
        const data = await api('/api/dashboard/check-ins');
        const mealNames = { breakfast: 'Breakfast', lunch: 'Lunch', snacks: 'Snacks', dinner: 'Dinner' };
        container.innerHTML = data.meals.map(({ meal, booked, checkedIn, remaining }) => `
            <article class="attendance-summary-item">
                <h4>${mealNames[meal] || escapeHtml(meal)}</h4>
                <div class="attendance-summary-values">
                    <div><span>Booked</span><strong>${booked}</strong></div>
                    <div><span>Checked in</span><strong>${checkedIn}</strong></div>
                </div>
                <p>${remaining} remaining</p>
            </article>`).join('');
    } catch (error) {
        container.textContent = error.message;
    }
}

function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
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

function formatCurrency(amount) {
    return `Rs. ${Number(amount || 0).toLocaleString('en-IN')}`;
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

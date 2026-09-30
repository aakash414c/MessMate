let currentMeal = '';
let currentRating = 0;
let currentUser = null;
let currentPaymentBill = null;
let walletCurrentBalance = 0;
let bookingCutoffs = { breakfast: '07:30', lunch: '10:30', snacks: '15:00', dinner: '17:30' };
let currentQrMeal = '';
let qrExpiryTimer = null;
let qrEligibleMeals = new Set();
let attendanceData = {
    breakfast: 'no',
    lunch: 'no',
    snacks: 'no',
    dinner: 'no'
};
let savedMealStatuses = {};
let menuData = {
    breakfast: '',
    lunch: '',
    snacks: '',
    dinner: ''
};

window.addEventListener('DOMContentLoaded', async function() {
    currentUser = await checkAuth('student');
    if (!currentUser) return;

    updateDateTime();
    await loadMenu();
    await loadPaymentSummary();
    await loadWallet();
    initializeBookingDate();
    await Promise.all([loadBookings(), loadAnnouncements(), loadMyComplaints()]);
    checkTimeLimits();

    setInterval(updateDateTime, 60000);
    setInterval(checkTimeLimits, 60000);
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
        window.location.replace('index.html');
        return null;
    }

    try {
        const data = await api('/api/auth/me');
        document.getElementById('userId').textContent = data.user.userId;
        return data.user;
    } catch {
        clearAuth();
        window.location.replace('index.html');
        return null;
    }
}

function updateDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', options);
}

async function loadMenu(date = document.getElementById('bookingDate')?.value) {
    try {
        const data = await api(`/api/menu${date ? `?date=${encodeURIComponent(date)}` : ''}`);
        menuData = data.menu;
        bookingCutoffs = data.cutoffs || bookingCutoffs;
        updateCutoffLabels();
    } catch (error) {
        alert(error.message);
    }
}

function cutoffMinutes(value) {
    const [hours, minutes] = String(value || '00:00').split(':').map(Number);
    return hours * 60 + minutes;
}

function updateCutoffLabels() {
    for (const meal of ['breakfast', 'lunch', 'snacks', 'dinner']) {
        const element = document.getElementById(`${meal}Time`);
        if (element) element.textContent = `Booking cutoff · ${bookingCutoffs[meal] || '--:--'}`;
    }
}

function checkTimeLimits() {
    const now = new Date();
    const selectedDate = document.getElementById('bookingDate')?.value;
    const isToday = !selectedDate || selectedDate === localDateKey(now);
    const currentTime = now.getHours() * 60 + now.getMinutes();
    for (const meal of ['breakfast', 'lunch', 'snacks', 'dinner']) {
        const section = [...document.querySelectorAll('.meal-section')].find(item => item.querySelector('h4')?.textContent.toLowerCase() === meal);
        if (!section) continue;
        const expired = isToday && currentTime >= cutoffMinutes(bookingCutoffs[meal]);
        section.querySelectorAll('.attendance-btn').forEach(button => {
            button.disabled = expired;
            button.style.opacity = expired ? '0.5' : '';
            button.style.cursor = expired ? 'not-allowed' : '';
        });
        const timeElement = document.getElementById(`${meal}Time`);
        if (timeElement) {
            timeElement.textContent = expired ? 'Booking cutoff passed' : `Booking cutoff · ${bookingCutoffs[meal] || '--:--'}`;
            timeElement.style.color = expired ? 'var(--danger-color)' : '';
        }
    }
}

function disableMealSelection(meal) {
    document.querySelectorAll('.meal-section').forEach(section => {
        const h4 = section.querySelector('h4');
        if (h4 && h4.textContent.toLowerCase() === meal) {
            section.querySelectorAll('.attendance-btn').forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            });
        }
    });
}

function selectAttendance(meal, choice) {
    attendanceData[meal] = choice;

    document.querySelectorAll('.meal-section').forEach(section => {
        const h4 = section.querySelector('h4');
        if (h4 && h4.textContent.toLowerCase() === meal) {
            section.querySelector('.yes-btn').classList.toggle('active', choice === 'yes');
            section.querySelector('.no-btn').classList.toggle('active', choice === 'no');
        }
    });
}

async function showQrPass(meal) {
    if (!meal) return;
    currentQrMeal = meal;
    const modal = document.getElementById('qrPassModal');
    const image = document.getElementById('qrPassImage');
    const countdown = document.getElementById('qrPassCountdown');
    document.getElementById('qrPassTitle').textContent = `${capitalize(meal)} entry pass`;
    document.getElementById('qrPassDetails').textContent = `${new Date().toLocaleDateString()} · ${capitalize(meal)} · valid for today's booking`;
    image.removeAttribute('src');
    countdown.textContent = 'Preparing a secure pass…';
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    if (qrExpiryTimer) clearInterval(qrExpiryTimer);
    const today = localDateKey(new Date());
    const selectedDate = document.getElementById('bookingDate').value;
    if (selectedDate !== today) {
        countdown.textContent = 'QR passes are only available for a meal booked for today.';
        return;
    }
    if (!qrEligibleMeals.has(meal)) {
        countdown.textContent = 'Reserve and save this meal for today before requesting a QR pass.';
        return;
    }
    try {
        const data = await api('/api/check-ins/qr-pass', {
            method: 'POST',
            body: JSON.stringify({ date: localDateKey(new Date()), meal })
        });
        image.src = data.qrDataUrl;
        const updateCountdown = () => {
            const seconds = Math.max(0, Math.ceil((data.expiresAt - Date.now()) / 1000));
            countdown.textContent = seconds ? `Pass expires in ${seconds} seconds` : 'Pass expired. Refresh to get a new code.';
            if (!seconds && qrExpiryTimer) { clearInterval(qrExpiryTimer); qrExpiryTimer = null; }
        };
        updateCountdown();
        qrExpiryTimer = setInterval(updateCountdown, 1000);
    } catch (error) {
        countdown.textContent = error.message;
    }
}

async function showMenu(meal) {
    currentMeal = meal;
    if (!menuData[meal]) {
        await loadMenu(document.getElementById('bookingDate').value);
    }
    const selectedDate = document.getElementById('bookingDate').value || localDateKey(new Date());
    document.getElementById('menuTitle').textContent = `${capitalize(meal)} menu · ${new Date(`${selectedDate}T00:00:00`).toLocaleDateString()}`;
    const menuItems = parseMenuItems(menuData[meal]);
    const illustration = { breakfast: 'breakfast.svg', lunch: 'lunch.svg', snacks: 'lunch.svg', dinner: 'dinner.svg' }[meal];
    document.getElementById('menuContent').innerHTML = menuItems.length ? `
        <figure class="menu-illustration">
            <img src="./assets/menu/${illustration}" alt="Illustration of an Indian ${escapeHtml(meal)} meal">
            <figcaption>Illustrative serving suggestion · actual preparation and presentation may vary.</figcaption>
        </figure>
        <h3 class="menu-items-heading">Planned for ${escapeHtml(new Date(`${selectedDate}T00:00:00`).toLocaleDateString())}</h3>
        <ul class="menu-item-list">${menuItems.map(item => `<li><span class="menu-item-mark" aria-hidden="true">${menuFoodIcon(item)}</span><span>${escapeHtml(item)}</span></li>`).join('')}</ul>
    ` : '<p class="no-data">Menu not available for this date.</p>';
    document.getElementById('menuModal').style.display = 'block';
}

function parseMenuItems(value) {
    return String(value || '').split(/\r?\n/).map(item => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
}

function menuFoodIcon(item) {
    const value = item.toLowerCase();
    if (/tea|coffee|chai/.test(value)) return '☕';
    if (/banana|fruit|apple|orange/.test(value)) return '🍌';
    if (/bread|toast|sandwich/.test(value)) return '🍞';
    if (/roti|chapati|paratha|naan/.test(value)) return '🫓';
    if (/rice|poha|pulao|biryani/.test(value)) return '🍚';
    if (/salad|vegetable|gobi|aloo|sabzi/.test(value)) return '🥗';
    if (/curd|yogurt|raita/.test(value)) return '🥣';
    if (/sweet|dessert|halwa|gulab|kheer/.test(value)) return '🍮';
    if (/dal|rajma|curry|paneer|sambar/.test(value)) return '🍲';
    return '🍽️';
}

function showReview(meal) {
    currentMeal = meal;
    currentRating = 0;
    document.getElementById('reviewTitle').textContent = `Review ${capitalize(meal)}`;
    document.getElementById('reviewText').value = '';
    document.querySelectorAll('.star').forEach(star => star.classList.remove('active'));
    document.getElementById('reviewModal').style.display = 'block';
}

function showComplaint(meal) {
    currentMeal = meal;
    document.getElementById('complaintTitle').textContent = `Complaint for ${capitalize(meal)}`;
    document.getElementById('complaintSubject').value = '';
    document.getElementById('complaintText').value = '';
    document.getElementById('complaintImage').value = '';
    document.getElementById('complaintModal').style.display = 'block';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    if (modalId === 'qrPassModal' && qrExpiryTimer) { clearInterval(qrExpiryTimer); qrExpiryTimer = null; }
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) closeModal(event.target.id);
};

function setRating(rating) {
    currentRating = rating;
    document.querySelectorAll('.star').forEach((star, index) => {
        star.classList.toggle('active', index < rating);
    });
}

async function submitReview(event) {
    event.preventDefault();

    if (currentRating === 0) {
        alert('Please select a rating');
        return;
    }

    try {
        await api('/api/reviews', {
            method: 'POST',
            body: JSON.stringify({
                meal: currentMeal,
                rating: currentRating,
                comment: document.getElementById('reviewText').value
            })
        });
        alert('Thank you for your review!');
        closeModal('reviewModal');
    } catch (error) {
        alert(error.message);
    }
}

async function submitComplaint(event) {
    event.preventDefault();

    try {
        const imageData = await compressComplaintImage(document.getElementById('complaintImage').files[0]);
        await api('/api/complaints', {
            method: 'POST',
            body: JSON.stringify({
                meal: currentMeal,
                subject: document.getElementById('complaintSubject').value,
                description: document.getElementById('complaintText').value,
                imageData
            })
        });
        alert('Your complaint has been submitted. We will look into it.');
        closeModal('complaintModal');
        await loadMyComplaints();
    } catch (error) {
        alert(error.message);
    }
}

function compressComplaintImage(file) {
    if (!file) return Promise.resolve('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
        return Promise.reject(new Error('Choose a JPEG, PNG, or WebP image under 12 MB.'));
    }
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d');
            if (!context) return reject(new Error('Could not process the selected image.'));
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            let quality = 0.82;
            let dataUrl = canvas.toDataURL('image/jpeg', quality);
            while (dataUrl.length > 440000 && quality > 0.46) {
                quality -= 0.08;
                dataUrl = canvas.toDataURL('image/jpeg', quality);
            }
            if (dataUrl.length > 450000) return reject(new Error('The image is too large after resizing. Choose a smaller photo.'));
            resolve(dataUrl);
        };
        image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('The selected image could not be read.')); };
        image.src = objectUrl;
    });
}

async function submitAttendance() {
    const date = document.getElementById('bookingDate').value;
    const changes = Object.entries(attendanceData).filter(([meal, choice]) =>
        (savedMealStatuses[meal] === 'booked') !== (choice === 'yes')
    );
    const status = document.getElementById('bookingStatus');
    if (!changes.length) {
        status.textContent = 'No booking changes to save.';
        return;
    }

    const results = await Promise.allSettled(changes.map(([meal, choice]) => api('/api/bookings/me', {
        method: 'PUT',
        body: JSON.stringify({ date, meal, booked: choice === 'yes' })
    })));
    const failures = results.filter(result => result.status === 'rejected');
    await loadBookings();
    status.textContent = failures.length
        ? `${changes.length - failures.length} booking changes saved. ${failures.length} could not be changed: ${failures[0].reason.message}`
        : 'Your meal bookings are saved.';
}

function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function initializeBookingDate() {
    const input = document.getElementById('bookingDate');
    const today = new Date();
    const lastDate = new Date();
    lastDate.setDate(lastDate.getDate() + 14);
    input.min = localDateKey(today);
    input.max = localDateKey(lastDate);
    input.value = input.min;
}

async function loadBookings() {
    try {
        const { bookings, cutoffs } = await api('/api/bookings/me');
        const date = document.getElementById('bookingDate').value;
        const saved = Object.fromEntries(bookings.filter(row => row.date === date).map(row => [row.meal, row.status]));
        savedMealStatuses = saved;
        const isToday = date === localDateKey(new Date());
        qrEligibleMeals = new Set(isToday
            ? Object.entries(saved).filter(([, status]) => status === 'booked').map(([meal]) => meal)
            : []);
        updateQrPassButtons(date, saved);
        for (const meal of ['breakfast', 'lunch', 'snacks', 'dinner']) {
            attendanceData[meal] = saved[meal] === 'booked' ? 'yes' : 'no';
            selectAttendance(meal, attendanceData[meal]);
            const cutoffText = document.getElementById(`${meal}Time`);
            cutoffText.textContent = `Cutoff ${cutoffs[meal]} · ${saved[meal] === 'booked' ? 'Booked' : 'Not booked'}`;
            const [hour, minute] = cutoffs[meal].split(':').map(Number);
            const cutoffPassed = date === localDateKey(new Date()) && new Date().getHours() * 60 + new Date().getMinutes() >= hour * 60 + minute;
            document.querySelectorAll('.meal-section').forEach(section => {
                if (section.querySelector('h4')?.textContent.toLowerCase() === meal) {
                    section.querySelectorAll('.attendance-btn').forEach(button => { button.disabled = cutoffPassed; });
                }
            });
        }
    } catch (error) {
        document.getElementById('bookingStatus').textContent = error.message;
    }
}

function updateQrPassButtons(date, saved) {
    const today = localDateKey(new Date());
    document.querySelectorAll('.meal-section').forEach(section => {
        const meal = section.querySelector('h4')?.textContent.trim().toLowerCase();
        const button = section.querySelector('.qr-pass-btn');
        if (!meal || !button) return;

        const isToday = date === today;
        const isBooked = saved[meal] === 'booked';
        const eligible = isToday && isBooked;
        const [cutoffHour, cutoffMinute] = String(bookingCutoffs[meal] || '00:00').split(':').map(Number);
        const cutoffPassed = isToday && new Date().getHours() * 60 + new Date().getMinutes() >= cutoffHour * 60 + cutoffMinute;
        button.disabled = !eligible;
        button.textContent = eligible ? 'QR pass' : !isToday ? 'Today only' : cutoffPassed ? 'No booking' : 'Save booking first';
        button.title = eligible
            ? `Generate a QR pass for today's ${meal} booking.`
            : !isToday
                ? 'QR passes are only available for bookings on today’s date.'
                : cutoffPassed
                    ? `No ${meal} booking was saved before the ${bookingCutoffs[meal]} cutoff.`
                    : `Select Reserve for ${meal}, then save your meal bookings to generate a QR pass.`;
        button.setAttribute('aria-label', button.title);
    });
}

async function bookingDateChanged() {
    await Promise.all([loadBookings(), loadMenu(document.getElementById('bookingDate').value)]);
}

async function loadAnnouncements() {
    try {
        const { notifications, unreadCount } = await api('/api/notifications');
        const container = document.getElementById('studentAnnouncements');
        document.getElementById('announcementUnreadCount').textContent = `${unreadCount} unread`;
        container.innerHTML = notifications.length ? notifications.map(item => `
            <article class="notice-item ${item.read ? 'read' : 'unread'}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p><small>${new Date(item.createdAt).toLocaleString()} · ${item.read ? 'Read' : 'Unread'}</small>${item.read ? '' : `<button class="mark-notice-read" type="button" onclick="markAnnouncementRead('${item.id}')">Mark as read</button>`}</article>
        `).join('') : '<p class="no-data">No current announcements.</p>';
    } catch (error) {
        document.getElementById('studentAnnouncements').textContent = error.message;
    }
}

async function markAnnouncementRead(id) {
    try { await api(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }); await loadAnnouncements(); }
    catch (error) { document.getElementById('studentAnnouncements').textContent = error.message; }
}

async function loadMyComplaints() {
    try {
        const { complaints } = await api('/api/complaints/me');
        const container = document.getElementById('myComplaints');
        container.innerHTML = complaints.length ? complaints.map(item => `
            <article class="notice-item complaint-item"><div class="complaint-item-head"><strong>${escapeHtml(item.subject)}</strong><span class="complaint-status ${escapeHtml(item.status)}">${item.status === 'in_progress' ? 'IN PROGRESS' : item.status.toUpperCase()}</span></div><p>${escapeHtml(item.description)}</p><small>${capitalize(item.meal)} · ${new Date(item.timestamp).toLocaleDateString()}</small>${item.hasAttachment ? `<p><a href="/api/complaints/${encodeURIComponent(item.id)}/image" target="_blank" rel="noopener">View attached photo</a></p>` : ''}</article>
        `).join('') : '<p class="no-data">No complaints submitted.</p>';
    } catch (error) {
        document.getElementById('myComplaints').textContent = error.message;
    }
}

async function loadPaymentSummary() {
    try {
        const data = await api('/api/payments/me');
        renderPaymentBill(data.bill);
        renderPaymentHistory(data.history);
    } catch (error) {
        console.error(error);
    }
}

async function loadWallet() {
    try {
        const data = await api('/api/wallet/me');
        walletCurrentBalance = Number(data.balance || 0);
        document.getElementById('walletBalance').textContent = formatCurrency(data.balance);
        document.getElementById('walletNote').textContent = data.note;
        const container = document.getElementById('walletTransactions');
        container.innerHTML = data.transactions.length ? data.transactions.map(row => `<div class="wallet-transaction-row"><span><strong>${escapeHtml(row.kind.replace('_', ' '))}</strong><small>${escapeHtml(row.note)} · ${new Date(row.createdAt).toLocaleDateString()}</small></span><strong>${row.kind === 'credit' ? '+' : '−'}${formatCurrency(row.amount)}</strong></div>`).join('') : '<p class="no-data">No wallet entries yet. An administrator can record a deposit or adjustment.</p>';
        updateWalletPaymentButton();
    } catch (error) {
        document.getElementById('walletTransactions').textContent = error.message;
    }
}

function renderPaymentBill(bill) {
    currentPaymentBill = bill;
    const status = bill.status === 'paid' ? 'paid' : 'pending';
    const statusElement = document.getElementById('paymentStatus');
    const payButton = document.getElementById('payButton');

    document.getElementById('paymentMonth').textContent = bill.label;
    document.getElementById('paymentAmount').textContent = formatCurrency(bill.amount);
    statusElement.textContent = status.toUpperCase();
    statusElement.className = `payment-status ${status}`;
    payButton.disabled = status === 'paid';
    payButton.textContent = status === 'paid' ? 'Paid' : 'Pay Now';
    document.getElementById('paymentModeNote').textContent = bill.provider === 'demo'
        ? 'Demo payment mode · no money is transferred.'
        : bill.provider === 'wallet' ? 'Paid from the MessMate ledger.' : 'Online payment via Razorpay.';
    updateWalletPaymentButton();
}

function updateWalletPaymentButton() {
    const button = document.getElementById('walletPayButton');
    const hint = document.getElementById('walletPayHint');
    if (!button || !hint || !currentPaymentBill) return;
    const due = currentPaymentBill.status !== 'paid';
    const canPay = due && walletCurrentBalance >= Number(currentPaymentBill.amount || 0);
    button.disabled = !canPay;
    hint.textContent = !due ? 'This month’s fee is already settled.' : canPay
        ? `Wallet balance covers the ${formatCurrency(currentPaymentBill.amount)} fee.`
        : `Add ${formatCurrency(Math.max(0, currentPaymentBill.amount - walletCurrentBalance))} in administrator-recorded credits to use this option.`;
}

async function payFeeFromWallet() {
    if (!currentPaymentBill || currentPaymentBill.status === 'paid') return;
    if (!confirm(`Use ${formatCurrency(currentPaymentBill.amount)} from your MessMate wallet ledger to pay this month’s fee?`)) return;
    try {
        const result = await api('/api/payments/wallet', { method: 'POST', body: JSON.stringify({}) });
        renderPaymentBill(result.bill);
        await Promise.all([loadPaymentSummary(), loadWallet()]);
        alert('Fee payment recorded from your wallet ledger.');
    } catch (error) { alert(error.message); }
}

function renderPaymentHistory(history) {
    const container = document.getElementById('paymentHistory');

    if (!history.length) {
        container.innerHTML = '<p class="no-data">No payments yet</p>';
        return;
    }

    container.innerHTML = history.map(payment => `
        <div class="payment-history-item">
            <div>
                <strong>${escapeHtml(payment.label)}</strong>
                <span>${escapeHtml(payment.provider)} · ${escapeHtml(payment.status)}${payment.paidAt ? ` · ${escapeHtml(new Date(payment.paidAt).toLocaleDateString())}` : ''}</span>
                ${payment.status === 'paid' && payment.id ? `<a class="payment-receipt-link" href="/api/payments/${encodeURIComponent(payment.id)}/receipt" target="_blank" rel="noopener">View / print receipt</a>` : ''}
            </div>
            <strong>${formatCurrency(payment.amount)}</strong>
        </div>
    `).join('');
}

async function payMessFee() {
    try {
        const checkout = await api('/api/payments/checkout', { method: 'POST' });

        if (checkout.alreadyPaid) {
            renderPaymentBill(checkout.bill);
            alert('This month is already paid.');
            return;
        }

        if (checkout.gateway === 'razorpay' && window.Razorpay) {
            const options = {
                key: checkout.keyId,
                amount: checkout.order.amount,
                currency: checkout.order.currency,
                name: 'MessMate',
                description: `Mess fee for ${checkout.bill.label}`,
                order_id: checkout.order.id,
                prefill: {
                    name: currentUser.userId
                },
                handler: async function(response) {
                    await verifyPayment({
                        paymentRecordId: checkout.bill.id,
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature
                    });
                }
            };
            new window.Razorpay(options).open();
            return;
        }

        const confirmDemo = confirm('Demo payment mode is active. Mark this mess fee as paid?');
        if (confirmDemo) {
            await verifyPayment({ paymentRecordId: checkout.bill.id });
        }
    } catch (error) {
        alert(error.message);
    }
}

async function verifyPayment(payload) {
    try {
        const data = await api('/api/payments/verify', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        renderPaymentBill(data.bill);
        await loadPaymentSummary();
        alert('Payment completed successfully.');
    } catch (error) {
        alert(error.message);
    }
}

async function logout() {
    try {
        await api('/api/auth/logout', { method: 'POST' });
    } catch {
        // Clear local auth even if the server session has already expired.
    }
    clearAuth();
    window.location.replace('index.html');
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

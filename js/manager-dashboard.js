function storedUser() {
    return JSON.parse(localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo') || 'null');
}

let inventoryData = { items: [], transactions: [] };
let wasteData = { logs: [], totals: { surplus: 0, discarded: 0 }, basis: '' };
let dutyData = [];
let visibleDutyIds = [];
let complaintData = [];
let supplierData = [];
let orderData = [];

async function api(path, options = {}) {
    const user = storedUser();
    const response = await fetch(path, { ...options, headers: {
        'Content-Type': 'application/json',
        ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        ...(options.headers || {})
    } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Request failed.');
    return data;
}

window.addEventListener('DOMContentLoaded', async () => {
    const user = storedUser();
    if (!user || user.type !== 'manager') return window.location.replace('index.html');
    try {
        const session = await api('/api/auth/me');
        document.getElementById('managerId').textContent = `Signed in · ${session.user.userId}`;
        const today = new Date();
        const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        document.getElementById('wasteDate').value = date;
        await refreshManagerData();
    } catch {
        clearAuth();
        window.location.replace('index.html');
    }
});

async function refreshManagerData() {
    const [inventory, waste, duties, complaints, announcements, forecast, suppliers, orders] = await Promise.all([
        api('/api/inventory'), api('/api/waste'), api('/api/duties'), api('/api/complaints'), api('/api/announcements'), api('/api/reports/forecast'), api('/api/suppliers'), api('/api/purchase-orders')
    ]);
    renderInventory(inventory);
    renderWaste(waste);
    renderDuties(duties.duties);
    renderComplaints(complaints.complaints);
    renderAnnouncements(announcements.announcements);
    renderForecast(forecast);
    renderSuppliers(suppliers.suppliers);
    renderPurchaseOrders(orders.orders);
}

async function createInventoryItem(event) {
    event.preventDefault();
    try {
        await api('/api/inventory', { method: 'POST', body: JSON.stringify({
            name: document.getElementById('itemName').value,
            unit: document.getElementById('itemUnit').value,
            quantity: Number(document.getElementById('itemQuantity').value),
            minimumQuantity: Number(document.getElementById('itemMinimum').value),
            supplier: document.getElementById('itemSupplier').value
        }) });
        event.target.reset();
        document.getElementById('inventoryMessage').textContent = 'Inventory item added.';
        const inventory = await api('/api/inventory');
        renderInventory(inventory);
    } catch (error) { document.getElementById('inventoryMessage').textContent = error.message; }
}

function renderInventory(data) {
    inventoryData = data;
    const list = document.getElementById('inventoryList');
    const select = document.getElementById('transactionItem');
    select.innerHTML = data.items.length ? data.items.map(item => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.unit)})</option>`).join('') : '<option value="">Add an item first</option>';
    document.getElementById('poItem').innerHTML = select.innerHTML;
    const search = (document.getElementById('inventorySearch')?.value || '').trim().toLowerCase();
    const sort = document.getElementById('inventorySort')?.value || 'name';
    const items = data.items.filter(item => `${item.name} ${item.unit} ${item.supplier || ''}`.toLowerCase().includes(search));
    items.sort(sort === 'quantity' ? (a, b) => a.quantity - b.quantity : sort === 'low' ? (a, b) => (a.quantity - a.minimumQuantity) - (b.quantity - b.minimumQuantity) : (a, b) => a.name.localeCompare(b.name));
    list.innerHTML = items.length ? items.map(item => `
        <div class="inventory-row"><strong>${escapeHtml(item.name)}</strong> · ${item.quantity} ${escapeHtml(item.unit)}
        <span class="${item.quantity <= item.minimumQuantity ? 'low-stock' : ''}">${item.quantity <= item.minimumQuantity ? ' · LOW STOCK' : ''}</span>
        <small> · Threshold ${item.minimumQuantity} ${escapeHtml(item.unit)} · Supplier ${escapeHtml(item.supplier || 'not set')}</small>
        <div class="form-row"><input id="minimum-${item.id}" type="number" min="0" step="0.01" value="${item.minimumQuantity}" aria-label="Low stock threshold for ${escapeHtml(item.name)}"><input id="supplier-${item.id}" value="${escapeHtml(item.supplier || '')}" maxlength="100" aria-label="Supplier for ${escapeHtml(item.name)}"><button class="small-action" onclick="updateInventoryItem('${item.id}')">Save</button></div></div>`).join('') : '<p class="no-data">No stock items have been recorded.</p>';
    document.getElementById('transactionHistory').innerHTML = data.transactions.length ? data.transactions.slice(0, 8).map(item => `<div class="manager-list-row">${escapeHtml(item.itemName)} · ${escapeHtml(item.kind)} ${item.quantity} · ${new Date(item.createdAt).toLocaleDateString()}</div>`).join('') : '<p class="no-data">No stock movements yet.</p>';
}

async function updateInventoryItem(id) {
    try {
        await api(`/api/inventory/${id}`, { method: 'PATCH', body: JSON.stringify({
            minimumQuantity: Number(document.getElementById(`minimum-${id}`).value),
            supplier: document.getElementById(`supplier-${id}`).value
        }) });
        renderInventory(await api('/api/inventory'));
    } catch (error) { alert(error.message); }
}

async function recordTransaction() {
    const itemId = document.getElementById('transactionItem').value;
    try {
        await api(`/api/inventory/${itemId}/transactions`, { method: 'POST', body: JSON.stringify({
            kind: document.getElementById('transactionKind').value,
            quantity: Number(document.getElementById('transactionQuantity').value),
            note: document.getElementById('transactionNote').value
        }) });
        const inventory = await api('/api/inventory');
        renderInventory(inventory);
        document.getElementById('transactionQuantity').value = '';
        document.getElementById('transactionNote').value = '';
    } catch (error) { alert(error.message); }
}

async function recordWaste(event) {
    event.preventDefault();
    try {
        await api('/api/waste', { method: 'POST', body: JSON.stringify({
            date: document.getElementById('wasteDate').value,
            meal: document.getElementById('wasteMeal').value,
            category: document.getElementById('wasteCategory').value,
            kilograms: Number(document.getElementById('wasteKg').value),
            ...(document.getElementById('wasteCo2eFactor').value !== '' ? {
                co2ePerKg: Number(document.getElementById('wasteCo2eFactor').value),
                factorSource: document.getElementById('wasteFactorSource').value
            } : {}),
            note: document.getElementById('wasteNote').value
        }) });
        document.getElementById('wasteKg').value = '';
        document.getElementById('wasteCo2eFactor').value = '';
        document.getElementById('wasteFactorSource').value = '';
        document.getElementById('wasteNote').value = '';
        renderWaste(await api('/api/waste'));
    } catch (error) { alert(error.message); }
}

function renderWaste(data) {
    wasteData = data;
    document.getElementById('wasteSummary').innerHTML = `<p><strong>${data.totals.surplus} kg</strong> surplus · <strong>${data.totals.discarded} kg</strong> discarded</p><p><strong>${Number(data.totals.carbonKgCo2e || 0).toFixed(2)} kg CO₂e</strong> estimated for ${Number(data.totals.carbonRecords || 0)} recorded factor(s)</p><small>${escapeHtml(data.basis)}</small>`;
    const byDate = new Map();
    for (const row of data.logs) {
        const entry = byDate.get(row.date) || { surplus: 0, discarded: 0, carbonKgCo2e: 0, carbonRecords: 0 };
        entry[row.category] += Number(row.kilograms);
        if (Number.isFinite(Number(row.co2ePerKg)) && row.factorSource) {
            entry.carbonKgCo2e += Number(row.kilograms) * Number(row.co2ePerKg);
            entry.carbonRecords++;
        }
        byDate.set(row.date, entry);
    }
    const trend = [...byDate.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 7).reverse();
    const max = Math.max(0.01, ...trend.map(([, values]) => values.surplus + values.discarded));
    document.getElementById('wasteTrend').innerHTML = trend.length ? `<h4>Latest measured dates</h4>${trend.map(([date, values]) => {
        const total = values.surplus + values.discarded;
        const discardedPercent = Math.max(0, Math.min(100, values.discarded / max * 100));
        const totalPercent = Math.max(2, Math.min(100, total / max * 100));
        const carbon = values.carbonRecords ? ` · ${values.carbonKgCo2e.toFixed(2)} kg CO₂e estimated` : '';
        return `<div class="waste-trend-row"><span>${escapeHtml(date)}</span><div class="waste-trend-track" role="img" aria-label="${escapeHtml(date)}: ${values.surplus.toFixed(2)} kilograms surplus, ${values.discarded.toFixed(2)} kilograms discarded"><div class="waste-trend-total" style="width:${totalPercent}%"><div class="waste-trend-discarded" style="width:${total ? discardedPercent / total * 100 : 0}%"></div></div><small>${total.toFixed(2)} kg${carbon}</small></div></div>`;
    }).join('')}<small>Bars show recorded waste weight. CO₂e estimates include only entries with a supplied factor and source.</small>` : '<p class="no-data">Add measured records to see a waste trend.</p>';
    const carbonTrend = data.monthlyCarbon || [];
    if (carbonTrend.length) {
        const latest = carbonTrend.at(-1);
        const previous = carbonTrend.at(-2);
        const maxCarbon = Math.max(0.01, ...carbonTrend.map(row => row.kgCo2e));
        const comparison = previous
            ? ` Latest recorded month: ${latest.kgCo2e.toFixed(2)} kg CO₂e vs ${previous.kgCo2e.toFixed(2)} kg in ${previous.month}; calendar months may be incomplete.`
            : '';
        document.getElementById('wasteTrend').insertAdjacentHTML('beforeend', `<section class="carbon-trend" aria-labelledby="carbonTrendTitle"><h4 id="carbonTrendTitle">Sourced CO₂e estimate by month</h4>${carbonTrend.map(row => {
            const percent = Math.max(2, Math.min(100, row.kgCo2e / maxCarbon * 100));
            return `<div class="waste-trend-row"><span>${escapeHtml(row.month)}</span><div class="waste-trend-track" role="img" aria-label="${escapeHtml(row.month)}: ${row.kgCo2e.toFixed(3)} kilograms CO₂e estimated from ${row.records} sourced record(s)"><div class="waste-trend-total" style="width:${percent}%"></div><small>${row.kgCo2e.toFixed(2)} kg CO₂e · ${row.records} record(s)</small></div></div>`;
        }).join('')}<small>${escapeHtml(comparison)} Estimates reflect only logged waste with a team-entered factor and source; they do not measure avoided emissions.</small></section>`);
    }
    const search = (document.getElementById('wasteSearch')?.value || '').trim().toLowerCase();
    const sort = document.getElementById('wasteSort')?.value || 'newest';
    const visible = data.logs.filter(row => `${row.date} ${row.meal} ${row.category} ${row.note || ''} ${row.factorSource || ''}`.toLowerCase().includes(search));
    visible.sort(sort === 'oldest' ? (a, b) => a.date.localeCompare(b.date) : sort === 'weight' ? (a, b) => b.kilograms - a.kilograms : (a, b) => b.date.localeCompare(a.date));
    document.getElementById('wasteHistory').innerHTML = visible.length ? visible.slice(0, 20).map(row => `<div class="manager-list-row">${escapeHtml(row.date)} · ${escapeHtml(row.meal)} · ${escapeHtml(row.category)} ${row.kilograms} kg${Number.isFinite(Number(row.co2ePerKg)) && row.factorSource ? ` · ${(Number(row.kilograms) * Number(row.co2ePerKg)).toFixed(2)} kg CO₂e estimated (${escapeHtml(row.factorSource)})` : ''}${row.note ? ` · ${escapeHtml(row.note)}` : ''}</div>`).join('') : '<p class="no-data">No matching waste records.</p>';
}

async function createDuty(event) {
    event.preventDefault();
    try {
        await api('/api/duties', { method: 'POST', body: JSON.stringify({
            title: document.getElementById('dutyTitle').value,
            assigneeUserId: document.getElementById('dutyAssignee').value,
            dueAt: document.getElementById('dutyDue').value || undefined
        }) });
        document.getElementById('dutyTitle').value = '';
        renderDuties((await api('/api/duties')).duties);
    } catch (error) { alert(error.message); }
}

function renderDuties(duties) {
    dutyData = duties;
    const container = document.getElementById('dutyList');
    const search = (document.getElementById('dutySearch')?.value || '').trim().toLowerCase();
    const sort = document.getElementById('dutySort')?.value || 'due';
    const visible = duties.filter(row => `${row.title} ${row.assigneeUserId} ${row.status}`.toLowerCase().includes(search));
    visible.sort(sort === 'status' ? (a, b) => a.status.localeCompare(b.status) : sort === 'staff' ? (a, b) => a.assigneeUserId.localeCompare(b.assigneeUserId) : (a, b) => new Date(a.dueAt || '9999-12-31') - new Date(b.dueAt || '9999-12-31'));
    visibleDutyIds = visible.slice(0, 100).map(row => row.id);
    container.innerHTML = visible.length ? visible.map(row => `<div class="manager-list-row"><strong>${escapeHtml(row.title)}</strong><br><small>${escapeHtml(row.assigneeUserId)} · ${row.dueAt ? new Date(row.dueAt).toLocaleString() : 'No due date'} · ${escapeHtml(row.status)}</small></div>`).join('') : '<p class="no-data">No matching staff duties.</p>';
    const bulkButton = document.querySelector('[onclick="updateVisibleDuties()"]');
    if (bulkButton) bulkButton.disabled = !visibleDutyIds.length;
}

async function updateVisibleDuties() {
    if (!visibleDutyIds.length) return;
    const status = document.getElementById('dutyBulkStatus').value;
    if (!confirm(`Update ${visibleDutyIds.length} visible duty record(s) to ${status.replace('_', ' ')}?`)) return;
    const message = document.getElementById('dutyBulkMessage');
    try {
        const result = await api('/api/duties/bulk', { method: 'PATCH', body: JSON.stringify({ ids: visibleDutyIds, status }) });
        message.textContent = `${result.updated} duty record(s) updated.`;
        renderDuties((await api('/api/duties')).duties);
    } catch (error) { message.textContent = error.message; }
}

function renderComplaints(complaints) {
    complaintData = complaints;
    const container = document.getElementById('managerComplaints');
    const search = (document.getElementById('complaintSearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('complaintStatusFilter')?.value || 'all';
    const sort = document.getElementById('complaintSort')?.value || 'newest';
    const visible = complaints.filter(row => (status === 'all' || row.status === status) && `${row.subject} ${row.description} ${row.userId}`.toLowerCase().includes(search));
    visible.sort(sort === 'oldest' ? (a, b) => new Date(a.timestamp) - new Date(b.timestamp) : sort === 'status' ? (a, b) => a.status.localeCompare(b.status) : (a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    container.innerHTML = visible.length ? visible.map(row => `<div class="manager-list-row"><strong>${escapeHtml(row.subject)}</strong><p>${escapeHtml(row.description)}</p><small>Student ${escapeHtml(row.userId)}</small>${row.hasAttachment ? `<p><a href="/api/complaints/${encodeURIComponent(row.id)}/image" target="_blank" rel="noopener">View attached photo</a></p>` : ''}<select aria-label="Complaint status" onchange="setComplaintStatus('${row.id}', this.value)"><option value="pending" ${row.status === 'pending' ? 'selected' : ''}>Pending</option><option value="in_progress" ${row.status === 'in_progress' ? 'selected' : ''}>In Progress</option><option value="resolved" ${row.status === 'resolved' ? 'selected' : ''}>Resolved</option></select></div>`).join('') : '<p class="no-data">No matching complaints.</p>';
    const button = document.querySelector('[onclick="resolveVisibleComplaints()"]');
    if (button) button.disabled = !visible.some(row => row.status !== 'resolved');
}

async function setComplaintStatus(id, status) {
    try {
        await api(`/api/complaints/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
        renderComplaints((await api('/api/complaints')).complaints);
    } catch (error) { alert(error.message); renderComplaints((await api('/api/complaints')).complaints); }
}

async function resolveVisibleComplaints() {
    const search = (document.getElementById('complaintSearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('complaintStatusFilter')?.value || 'all';
    const visible = complaintData.filter(row => (status === 'all' || row.status === status) && `${row.subject} ${row.description} ${row.userId}`.toLowerCase().includes(search) && row.status !== 'resolved');
    if (!visible.length) return;
    const batch = visible.slice(0, 100);
    if (!window.confirm(`Mark ${batch.length} visible complaint(s) as resolved? Students will see the updated status.${visible.length > 100 ? ' Apply again to process the remaining records.' : ''}`)) return;
    const message = document.getElementById('complaintListMessage');
    try {
        const result = await api('/api/complaints/bulk', {
            method: 'PATCH',
            body: JSON.stringify({ ids: batch.map(row => row.id), status: 'resolved' })
        });
        message.textContent = `${result.updated} complaint(s) resolved.${visible.length > batch.length ? ` ${visible.length - batch.length} remain; apply again.` : ''}`;
    } catch (error) { message.textContent = error.message; }
    const latest = (await api('/api/complaints')).complaints;
    renderComplaints(latest);
}

async function publishAnnouncement(event) {
    event.preventDefault();
    try {
        await api('/api/announcements', { method: 'POST', body: JSON.stringify({ title: document.getElementById('noticeTitle').value, body: document.getElementById('noticeBody').value }) });
        event.target.reset();
        renderAnnouncements((await api('/api/announcements')).announcements);
    } catch (error) { alert(error.message); }
}

function renderAnnouncements(items) {
    document.getElementById('announcementList').innerHTML = items.length ? items.slice(0, 5).map(row => `<div class="manager-list-row"><strong>${escapeHtml(row.title)}</strong><p>${escapeHtml(row.body)}</p></div>`).join('') : '<p class="no-data">No announcements published.</p>';
}

function renderForecast(data) {
    document.getElementById('forecastMethod').textContent = data.method;
    document.getElementById('forecastCards').innerHTML = Object.entries(data.forecast).map(([meal, value]) => `<div class="metric-card"><span>${capitalize(meal)}</span><strong>~${value.estimatedNextDay}</strong><small>estimate for ${escapeHtml(data.targetDate)} · ${value.daysObserved} history dates · ${value.bookedTotal} bookings and ${value.checkInTotal} check-ins in 28 days · ${value.hasAttendanceHistory ? `attendance ${Math.round(value.attendanceRate * 100)}%` : 'booking-only attendance fallback'}</small></div>`).join('');
}

async function createSupplier(event) {
    event.preventDefault();
    try {
        await api('/api/suppliers', { method: 'POST', body: JSON.stringify({
            name: document.getElementById('supplierName').value,
            contactName: document.getElementById('supplierContact').value,
            phone: document.getElementById('supplierPhone').value,
            email: document.getElementById('supplierEmail').value
        }) });
        event.target.reset();
        const { suppliers } = await api('/api/suppliers');
        renderSuppliers(suppliers);
    } catch (error) { alert(error.message); }
}

function renderSuppliers(suppliers) {
    supplierData = suppliers;
    document.getElementById('poSupplier').innerHTML = suppliers.length ? suppliers.map(row => `<option value="${row.id}">${escapeHtml(row.name)}</option>`).join('') : '<option value="">Add a supplier first</option>';
    const search = (document.getElementById('supplierSearch')?.value || '').trim().toLowerCase();
    const sort = document.getElementById('supplierSort')?.value || 'name';
    const visible = suppliers.filter(row => `${row.name} ${row.contactName || ''} ${row.phone || ''} ${row.email || ''}`.toLowerCase().includes(search));
    visible.sort(sort === 'contact' ? (a, b) => (a.contactName || '').localeCompare(b.contactName || '') : (a, b) => a.name.localeCompare(b.name));
    document.getElementById('supplierList').innerHTML = visible.length ? visible.map(row => `<div class="manager-list-row">${escapeHtml(row.name)} · ${escapeHtml(row.contactName || 'No contact')} ${escapeHtml(row.phone || '')}</div>`).join('') : '<p class="no-data">No matching suppliers.</p>';
}

async function createPurchaseOrder(event) {
    event.preventDefault();
    try {
        await api('/api/purchase-orders', { method: 'POST', body: JSON.stringify({
            supplierId: document.getElementById('poSupplier').value,
            items: [{ itemId: document.getElementById('poItem').value, quantity: Number(document.getElementById('poQuantity').value), unitPrice: Number(document.getElementById('poUnitPrice').value) }]
        }) });
        document.getElementById('poQuantity').value = '';
        document.getElementById('poUnitPrice').value = '';
        renderPurchaseOrders((await api('/api/purchase-orders')).orders);
    } catch (error) { alert(error.message); }
}

function renderPurchaseOrders(orders) {
    orderData = orders;
    const container = document.getElementById('purchaseOrderList');
    const search = (document.getElementById('orderSearch')?.value || '').trim().toLowerCase();
    const sort = document.getElementById('orderSort')?.value || 'newest';
    const visible = orders.filter(row => `${row.supplierName} ${row.status} ${row.items.map(item => item.itemName).join(' ')}`.toLowerCase().includes(search));
    visible.sort(sort === 'oldest' ? (a, b) => new Date(a.createdAt) - new Date(b.createdAt) : sort === 'status' ? (a, b) => a.status.localeCompare(b.status) : (a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    container.innerHTML = visible.length ? visible.map(row => {
        const fullyPriced = row.items.every(item => Number.isFinite(item.unitPrice));
        const total = fullyPriced ? row.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) : null;
        return `<div class="manager-list-row"><strong>${escapeHtml(row.supplierName)}</strong> · ${row.items.map(item => `${escapeHtml(item.itemName)} x ${item.quantity}`).join(', ')} · ${escapeHtml(row.status)} · ${total === null ? 'Cost not recorded' : `Estimated order total ${managerCurrency(total)}`}${row.status === 'placed' ? `<button class="small-action" onclick="receivePurchaseOrder('${row.id}')">Mark received</button>` : ''}</div>`;
    }).join('') : '<p class="no-data">No matching purchase orders.</p>';
}

async function receivePurchaseOrder(id) {
    try {
        await api(`/api/purchase-orders/${id}/receive`, { method: 'PATCH' });
        const [inventory, orders] = await Promise.all([api('/api/inventory'), api('/api/purchase-orders')]);
        renderInventory(inventory);
        renderPurchaseOrders(orders.orders);
    } catch (error) { alert(error.message); }
}

function capitalize(value) { return value[0].toUpperCase() + value.slice(1); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function clearAuth() { localStorage.removeItem('userInfo'); sessionStorage.removeItem('userInfo'); }
function managerCurrency(amount) { return `Rs. ${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { }
    clearAuth();
    window.location.replace('index.html');
}

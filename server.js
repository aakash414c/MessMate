require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const QRCode = require('qrcode');
const webpush = require('web-push');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const MONGODB_URI = process.env.MONGODB_URI || (IS_PRODUCTION ? '' : 'mongodb://127.0.0.1:27017/messplanner');
const MESS_MONTHLY_FEE = Number(process.env.MESS_MONTHLY_FEE || 2500);
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const DEMO_ACCOUNT_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD || 'MessMateDemo!2026';
const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || (IS_PRODUCTION ? '' : crypto.randomBytes(32).toString('hex'));
const BOOTSTRAP_ADMIN_USER_ID = process.env.BOOTSTRAP_ADMIN_USER_ID || '';
const BOOTSTRAP_ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:messmate-admin@example.com';
const PUSH_ENABLED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (PUSH_ENABLED) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
else if (VAPID_PUBLIC_KEY || VAPID_PRIVATE_KEY) console.warn('Web push is disabled until both VAPID keys are configured.');
const BOOKING_CUTOFFS = {
    breakfast: process.env.BREAKFAST_CUTOFF || '07:30',
    lunch: process.env.LUNCH_CUTOFF || '10:30',
    snacks: process.env.SNACKS_CUTOFF || '15:00',
    dinner: process.env.DINNER_CUTOFF || '17:30'
};

if (IS_PRODUCTION && !MONGODB_URI) throw new Error('MONGODB_URI must point to a persistent production MongoDB database.');
if (IS_PRODUCTION && Buffer.byteLength(QR_SIGNING_SECRET, 'utf8') < 32) throw new Error('Set QR_SIGNING_SECRET to a stable random value with at least 32 bytes in production.');

const defaultMenu = {
    breakfast: '- Poha with Peanuts\n- Bread and Butter\n- Tea/Coffee\n- Banana',
    lunch: '- Dal Tadka\n- Rice\n- Roti (3 pcs)\n- Mixed Vegetable\n- Salad\n- Curd',
    snacks: '- Seasonal fruit\n- Tea',
    dinner: '- Rajma Curry\n- Rice\n- Roti (3 pcs)\n- Aloo Gobi\n- Pickle\n- Sweet'
};

const sampleWeeklyMenus = {
    0: { breakfast: 'Masala dosa\nCoconut chutney\nSambar\nTea/Coffee', lunch: 'Chole masala\nSteamed rice\nRoti\nCucumber raita\nSalad', snacks: 'Vegetable sandwich and lemon water', dinner: 'Vegetable pulao\nDal fry\nRoti\nGulab jamun' },
    1: { breakfast: 'Aloo paratha\nCurd\nPickle\nTea/Coffee', lunch: 'Rajma masala\nSteamed rice\nRoti\nSalad', snacks: 'Sprouts chaat and tea', dinner: 'Paneer bhurji\nJeera rice\nRoti\nSeasonal fruit' },
    2: { breakfast: 'Poha with peanuts\nBanana\nTea/Coffee', lunch: 'Kadhi pakora\nSteamed rice\nRoti\nSalad', snacks: 'Banana and roasted chana', dinner: 'Vegetable khichdi\nKachumber salad\nPapad\nCurd' },
    3: { breakfast: 'Idli\nSambar\nCoconut chutney\nTea/Coffee', lunch: 'Vegetable pulao\nDal tadka\nRaita\nSalad', snacks: 'Dhokla and mint chutney', dinner: 'Aloo gobi\nSteamed rice\nRoti\nKheer' },
    4: { breakfast: 'Besan chilla\nGreen chutney\nSeasonal fruit\nTea/Coffee', lunch: 'Kadhi chawal\nRoti\nOnion and cucumber salad\nPapad', snacks: 'Corn chaat and buttermilk', dinner: 'Paneer butter masala\nJeera rice\nRoti\nSalad' },
    5: { breakfast: 'Upma with vegetables\nCoconut chutney\nTea/Coffee', lunch: 'Chana dal\nSteamed rice\nRoti\nBhindi sabzi\nSalad', snacks: 'Fruit bowl and tea', dinner: 'Veg biryani\nRaita\nRoti\nSeasonal fruit' },
    6: { breakfast: 'Chole bhature\nPickle\nTea/Coffee', lunch: 'Dal makhani\nSteamed rice\nRoti\nMixed vegetable\nSalad', snacks: 'Samosa and mint chutney', dinner: 'Pav bhaji\nButtered pav\nOnion salad\nKulfi' }
};

const seedUsers = [
    { userId: '240010130009', type: 'student' },
    { userId: '240010130024', type: 'student' },
    { userId: '240010130002', type: 'student' },
    { userId: '240010130048', type: 'student' },
    { userId: 'BH4256854', type: 'staff' },
    { userId: 'BH4256855', type: 'staff' },
    { userId: 'BH4256856', type: 'staff' },
    { userId: 'BH4256836', type: 'admin' },
    { userId: 'BH4256837', type: 'admin' },
    { userId: 'BH4256838', type: 'manager' }
];

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    type: { type: String, required: true, enum: ['student', 'staff', 'manager', 'admin'] },
    walletBalance: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

const sessionSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: '7d' }
});

const menuSchema = new mongoose.Schema({
    meal: { type: String, required: true, unique: true, enum: ['breakfast', 'lunch', 'snacks', 'dinner'] },
    items: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
});

const menuScheduleSchema = new mongoose.Schema({
    date: { type: String, required: true },
    meal: { type: String, required: true, enum: ['breakfast', 'lunch', 'snacks', 'dinner'] },
    items: { type: String, required: true, maxlength: 2000 },
    updatedBy: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
});
menuScheduleSchema.index({ date: 1, meal: 1 }, { unique: true });

const weeklyMenuSchema = new mongoose.Schema({
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    meal: { type: String, required: true, enum: ['breakfast', 'lunch', 'snacks', 'dinner'] },
    items: { type: String, required: true, maxlength: 2000 },
    updatedBy: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
});
weeklyMenuSchema.index({ dayOfWeek: 1, meal: 1 }, { unique: true });

const attendanceSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    hostel: { type: String, required: true },
    date: { type: String, required: true },
    meals: {
        breakfast: { type: String, required: true, enum: ['yes', 'no'] },
        lunch: { type: String, required: true, enum: ['yes', 'no'] },
        snacks: { type: String, required: true, enum: ['yes', 'no'] },
        dinner: { type: String, required: true, enum: ['yes', 'no'] }
    },
    timestamp: { type: Date, default: Date.now }
});
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

const bookingSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    date: { type: String, required: true },
    meal: { type: String, required: true, enum: ['breakfast', 'lunch', 'snacks', 'dinner'] },
    status: { type: String, required: true, enum: ['booked', 'cancelled'], default: 'booked' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
bookingSchema.index({ userId: 1, date: 1, meal: 1 }, { unique: true });

const reviewSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    meal: { type: String, required: true, enum: ['breakfast', 'lunch', 'snacks', 'dinner'] },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const complaintSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    meal: { type: String, required: true, enum: ['breakfast', 'lunch', 'snacks', 'dinner'] },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, required: true, enum: ['pending', 'in_progress', 'resolved'], default: 'pending' },
    updatedAt: { type: Date, default: Date.now },
    timestamp: { type: Date, default: Date.now },
    resolvedAt: Date,
    hasAttachment: { type: Boolean, default: false },
    attachmentMimeType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'] },
    attachmentData: { type: String, maxlength: 450000, select: false }
});

const paymentSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    month: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, required: true, enum: ['created', 'paid', 'failed'], default: 'created' },
    provider: { type: String, required: true, enum: ['demo', 'razorpay', 'wallet'], default: 'demo' },
    orderId: { type: String, required: true },
    paymentId: String,
    signature: String,
    paidAt: Date,
    createdAt: { type: Date, default: Date.now }
});
paymentSchema.index({ userId: 1, month: 1 }, { unique: true });

const walletTransactionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    kind: { type: String, required: true, enum: ['credit', 'debit', 'fee_payment'] },
    amount: { type: Number, required: true, min: 0.01 },
    balanceAfter: { type: Number, required: true, min: 0 },
    note: { type: String, required: true, maxlength: 200 },
    actorId: { type: String, required: true },
    reference: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});
walletTransactionSchema.index({ userId: 1, createdAt: -1 });

const activityLogSchema = new mongoose.Schema({
    actorId: { type: String, required: true },
    actorRole: { type: String, required: true, enum: ['student', 'staff', 'manager', 'admin'] },
    method: { type: String, required: true },
    action: { type: String, required: true, maxlength: 160 },
    statusCode: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ actorId: 1, createdAt: -1 });

const appStateSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true }
});

const announcementSchema = new mongoose.Schema({
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 2000 },
    authorId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date
});

const notificationReceiptSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    announcementId: { type: mongoose.Schema.Types.ObjectId, required: true },
    readAt: { type: Date, default: Date.now }
});
notificationReceiptSchema.index({ userId: 1, announcementId: 1 }, { unique: true });

const pushSubscriptionSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 2048 },
    keys: {
        p256dh: { type: String, required: true, maxlength: 200 },
        auth: { type: String, required: true, maxlength: 100 }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const checkInSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    date: { type: String, required: true },
    meal: { type: String, required: true, enum: ['breakfast', 'lunch', 'snacks', 'dinner'] },
    checkedInBy: { type: String, required: true },
    checkedInAt: { type: Date, default: Date.now }
});
checkInSchema.index({ userId: 1, date: 1, meal: 1 }, { unique: true });

const inventoryItemSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    unit: { type: String, required: true, trim: true, maxlength: 24 },
    quantity: { type: Number, required: true, min: 0 },
    minimumQuantity: { type: Number, required: true, min: 0 },
    supplier: { type: String, default: '', maxlength: 100 },
    updatedAt: { type: Date, default: Date.now }
});

const stockTransactionSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    itemName: { type: String, required: true },
    kind: { type: String, required: true, enum: ['received', 'used', 'adjustment'] },
    quantity: { type: Number, required: true, min: 0 },
    note: { type: String, default: '', maxlength: 300 },
    actorId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const wasteLogSchema = new mongoose.Schema({
    date: { type: String, required: true },
    meal: { type: String, required: true, enum: ['breakfast', 'lunch', 'snacks', 'dinner'] },
    category: { type: String, required: true, enum: ['surplus', 'discarded'] },
    kilograms: { type: Number, required: true, min: 0 },
    co2ePerKg: { type: Number, min: 0 },
    factorSource: { type: String, default: '', maxlength: 160 },
    note: { type: String, default: '', maxlength: 300 },
    actorId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const staffDutySchema = new mongoose.Schema({
    title: { type: String, required: true, maxlength: 160 },
    assigneeUserId: { type: String, required: true },
    dueAt: Date,
    status: { type: String, required: true, enum: ['assigned', 'in_progress', 'completed'], default: 'assigned' },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    completedAt: Date
});

const supplierSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    contactName: { type: String, default: '', maxlength: 120 },
    phone: { type: String, default: '', maxlength: 40 },
    email: { type: String, default: '', maxlength: 160 },
    createdAt: { type: Date, default: Date.now }
});

const purchaseOrderSchema = new mongoose.Schema({
    supplierId: { type: mongoose.Schema.Types.ObjectId, required: true },
    supplierName: { type: String, required: true },
    items: [{ itemId: mongoose.Schema.Types.ObjectId, itemName: String, quantity: { type: Number, min: 0.01 }, unitPrice: { type: Number, min: 0 } }],
    status: { type: String, required: true, enum: ['placed', 'received', 'cancelled'], default: 'placed' },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    receivedAt: Date
});

const User = mongoose.model('User', userSchema);
const Session = mongoose.model('Session', sessionSchema);
const Menu = mongoose.model('Menu', menuSchema);
const MenuSchedule = mongoose.model('MenuSchedule', menuScheduleSchema);
const WeeklyMenu = mongoose.model('WeeklyMenu', weeklyMenuSchema);
const AttendanceRecord = mongoose.model('AttendanceRecord', attendanceSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const Review = mongoose.model('Review', reviewSchema);
const Complaint = mongoose.model('Complaint', complaintSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
const AppState = mongoose.model('AppState', appStateSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);
const NotificationReceipt = mongoose.model('NotificationReceipt', notificationReceiptSchema);
const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
const CheckIn = mongoose.model('CheckIn', checkInSchema);
const InventoryItem = mongoose.model('InventoryItem', inventoryItemSchema);
const StockTransaction = mongoose.model('StockTransaction', stockTransactionSchema);
const WasteLog = mongoose.model('WasteLog', wasteLogSchema);
const StaffDuty = mongoose.model('StaffDuty', staffDutySchema);
const Supplier = mongoose.model('Supplier', supplierSchema);
const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many sign-in or registration attempts. Wait 15 minutes and try again.' }
});
const paymentRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many payment attempts. Wait a few minutes and try again.' }
});

app.disable('x-powered-by');
if (IS_PRODUCTION) app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    strictTransportSecurity: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: false } : false
}));
app.use(express.json({ limit: '1mb' }));
for (const directory of ['assets', 'css', 'js', 'vendor']) {
    app.use(`/${directory}`, express.static(path.join(__dirname, directory), {
        dotfiles: 'ignore',
        index: false,
        maxAge: IS_PRODUCTION ? '1h' : 0
    }));
}
const publicPages = new Map([
    ['/', 'index.html'], ['/index.html', 'index.html'], ['/signup.html', 'signup.html'],
    ['/student-dashboard.html', 'student-dashboard.html'], ['/staff-dashboard.html', 'staff-dashboard.html'],
    ['/manager-dashboard.html', 'manager-dashboard.html'], ['/admin-dashboard.html', 'admin-dashboard.html'],
    ['/offline.html', 'offline.html'], ['/manifest.webmanifest', 'manifest.webmanifest']
]);
app.get([...publicPages.keys()], (req, res) => {
    const file = publicPages.get(req.path);
    if (req.path === '/manifest.webmanifest') res.type('application/manifest+json');
    if (req.path === '/offline.html') res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, file));
});
app.get('/service-worker.js', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'service-worker.js'));
});
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.on('finish', () => {
        const actor = req.activityActor || req.user;
        if (!actor || res.statusCode >= 400 || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
        const routePath = typeof req.route?.path === 'string' ? req.route.path : req.path;
        ActivityLog.create({
            actorId: actor.userId,
            actorRole: actor.type,
            method: req.method,
            action: routePath.slice(0, 160),
            statusCode: res.statusCode
        }).catch(error => console.error('Activity log write failed:', error.message));
    });
    next();
});

async function seedDatabase() {
    await User.updateMany({ walletBalance: { $exists: false } }, { $set: { walletBalance: 0 } });
    if (IS_PRODUCTION) {
        if (Boolean(BOOTSTRAP_ADMIN_USER_ID) !== Boolean(BOOTSTRAP_ADMIN_PASSWORD)) {
            throw new Error('Set both BOOTSTRAP_ADMIN_USER_ID and BOOTSTRAP_ADMIN_PASSWORD, or leave both empty.');
        }
        if (BOOTSTRAP_ADMIN_USER_ID) {
            if (!/^[A-Za-z0-9_-]{4,32}$/.test(BOOTSTRAP_ADMIN_USER_ID) || BOOTSTRAP_ADMIN_PASSWORD.length < 16 || BOOTSTRAP_ADMIN_PASSWORD.length > 200) {
                throw new Error('Bootstrap admin needs a 4–32 character ID and a 16–200 character password.');
            }
            let admin = await User.findOne({ userId: BOOTSTRAP_ADMIN_USER_ID });
            if (!admin) {
                admin = await User.create({ userId: BOOTSTRAP_ADMIN_USER_ID, type: 'admin', password: await hashPassword(BOOTSTRAP_ADMIN_PASSWORD) });
                console.log('Created the one-time bootstrap administrator account. Remove its bootstrap environment variables after verifying access.');
            } else if (admin.type !== 'admin') {
                throw new Error('BOOTSTRAP_ADMIN_USER_ID is already in use by a non-admin account.');
            }
        }
    } else {
        for (const user of seedUsers) {
            const existing = await User.findOne({ userId: user.userId });
            if (!existing) {
                await User.create({ ...user, password: await hashPassword(DEMO_ACCOUNT_PASSWORD) });
            } else if (!String(existing.password).startsWith('scrypt$')) {
                existing.password = await hashPassword(String(existing.password || DEMO_ACCOUNT_PASSWORD));
                await existing.save();
            }
        }
    }

    const legacyUsers = await User.find({ password: { $not: /^scrypt\$/ } });
    for (const user of legacyUsers) {
        user.password = await hashPassword(String(user.password || DEMO_ACCOUNT_PASSWORD));
        await user.save();
    }

    for (const [meal, items] of Object.entries(defaultMenu)) {
        await Menu.updateOne(
            { meal },
            { $setOnInsert: { meal, items, updatedAt: new Date() } },
            { upsert: true }
        );
    }

    const weeklySampleSeedKey = 'sample-weekly-menus-v2';
    if (!(await AppState.exists({ key: weeklySampleSeedKey }))) {
        const updatedAt = new Date();
        for (const [dayKey, meals] of Object.entries(sampleWeeklyMenus)) {
            const dayOfWeek = Number(dayKey);
            for (const [meal, items] of Object.entries(meals)) {
                await WeeklyMenu.updateOne(
                    { dayOfWeek, meal },
                    { $setOnInsert: { dayOfWeek, meal, items, updatedBy: 'system-sample', updatedAt } },
                    { upsert: true }
                );
            }
        }
        await AppState.updateOne({ key: weeklySampleSeedKey }, { $set: { value: 'initialized' } }, { upsert: true });
    }
}

async function sendAnnouncementPush(announcement) {
    if (!PUSH_ENABLED) return;
    const subscriptions = await PushSubscription.find({}).lean();
    const payload = JSON.stringify({
        title: announcement.title,
        body: announcement.body,
        url: '/student-dashboard.html#announcements'
    });
    await Promise.allSettled(subscriptions.map(async subscription => {
        try {
            await webpush.sendNotification(
                { endpoint: subscription.endpoint, keys: subscription.keys },
                payload,
                { TTL: 120, urgency: 'normal' }
            );
        } catch (error) {
            if (error.statusCode === 404 || error.statusCode === 410) {
                await PushSubscription.deleteOne({ _id: subscription._id });
                return;
            }
            console.warn('Push delivery failed for one subscription:', error.statusCode || error.message);
        }
    }));
}

function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.scrypt(password, salt, 64, (error, derivedKey) => {
            if (error) return reject(error);
            resolve(`scrypt$${salt}$${derivedKey.toString('hex')}`);
        });
    });
}

function verifyPassword(password, encoded) {
    const [scheme, salt, expectedHex] = String(encoded).split('$');
    if (scheme !== 'scrypt' || !salt || !expectedHex) return false;
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (error, derivedKey) => {
            if (error) return reject(error);
            const expected = Buffer.from(expectedHex, 'hex');
            resolve(expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey));
        });
    });
}

function todayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function todayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
}

function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleString('en-US', {
        month: 'long',
        year: 'numeric'
    });
}

function publicUser(user) {
    return {
        userId: user.userId,
        type: user.type
    };
}

function getToken(req) {
    const cookies = (req.headers.cookie || '').split(';');
    const sessionCookie = cookies.map(cookie => cookie.trim()).find(cookie => cookie.startsWith('messmate_session='));
    return sessionCookie ? decodeURIComponent(sessionCookie.slice('messmate_session='.length)) : '';
}

function sessionHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function setSessionCookie(res, token, clear = false) {
    const parts = ['messmate_session=' + (clear ? '' : encodeURIComponent(token)), 'Path=/', 'HttpOnly', 'SameSite=Strict'];
    parts.push(clear ? 'Max-Age=0' : 'Max-Age=604800');
    if (process.env.NODE_ENV === 'production') parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

function signQrPayload(payload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', QR_SIGNING_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
}

function verifyQrPayload(value) {
    if (typeof value !== 'string' || !value.startsWith('MESSMATE_QR|')) return null;
    const token = value.slice('MESSMATE_QR|'.length);
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;
    const expected = crypto.createHmac('sha256', QR_SIGNING_SECRET).update(encoded).digest();
    let received;
    try { received = Buffer.from(signature, 'base64url'); } catch { return null; }
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
    try {
        const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
        if (!payload || typeof payload.userId !== 'string' || !isValidDateKey(payload.date) || !validMeal(payload.meal) || !Number.isInteger(payload.exp) || payload.exp <= Date.now()) return null;
        return payload;
    } catch { return null; }
}

function validMeal(meal) {
    return ['breakfast', 'lunch', 'snacks', 'dinner'].includes(meal);
}

function isValidDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function canChangeBooking(date, meal) {
    if (!isValidDateKey(date) || !validMeal(meal)) return false;
    const [hour, minute] = BOOKING_CUTOFFS[meal].split(':').map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return false;
    const cutoff = new Date(`${date}T00:00:00`);
    cutoff.setHours(hour, minute, 0, 0);
    const today = new Date();
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 14);
    const requested = new Date(`${date}T00:00:00`);
    return requested >= new Date(today.getFullYear(), today.getMonth(), today.getDate()) && requested <= maxDate && today < cutoff;
}

async function requireAuth(req, res, next) {
    try {
        const token = getToken(req);
        const session = token ? await Session.findOne({ token: sessionHash(token) }).lean() : null;

        if (!session) {
            return res.status(401).json({ message: 'Please login again.' });
        }

        const user = await User.findOne({ userId: session.userId }).lean();
        if (!user) {
            return res.status(401).json({ message: 'User not found.' });
        }

        req.user = user;
        req.sessionHash = session.token;
        next();
    } catch (error) {
        next(error);
    }
}

function requireRole(role) {
    return (req, res, next) => {
        if (req.user.type !== role) {
            return res.status(403).json({ message: 'You do not have access to this page.' });
        }
        next();
    };
}

function requireAnyRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.type)) {
            return res.status(403).json({ message: 'You do not have access to this resource.' });
        }
        next();
    };
}

async function readMenu() {
    const rows = await Menu.find({}).lean();
    return rows.reduce((menu, row) => {
        menu[row.meal] = row.items;
        return menu;
    }, {});
}

async function mealCounts() {
    const rows = await Booking.aggregate([
        { $match: { date: todayString(), status: 'booked' } },
        { $group: { _id: '$meal', count: { $sum: 1 } } }
    ]);
    return Object.fromEntries(['breakfast', 'lunch', 'snacks', 'dinner'].map(meal => [meal, rows.find(row => row._id === meal)?.count || 0]));
}

async function dashboardSummary() {
    const today = todayString();
    const { start, end } = todayRange();
    const counts = await mealCounts();
    const [uniqueStudents, reviews, lastUpdated] = await Promise.all([
        Booking.distinct('userId', { date: today, status: 'booked' }),
        Review.find({ timestamp: { $gte: start, $lt: end } }).lean(),
        AppState.findOne({ key: 'countsLastUpdated' }).lean()
    ]);
    const totalMeals = counts.breakfast + counts.lunch + counts.snacks + counts.dinner;
    const avgRating = reviews.length
        ? (reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length).toFixed(1)
        : '0.0';

    return {
        counts,
        lastUpdated: lastUpdated?.value || '--:--',
        uniqueStudents: uniqueStudents.length,
        totalMeals,
        avgRating,
        totalReviews: reviews.length
    };
}

async function hostelBreakdown() {
    const today = todayString();
    const rows = await AttendanceRecord.aggregate([
        { $match: { date: today } },
        {
            $group: {
                _id: '$hostel',
                total: { $sum: 1 },
                breakfast: { $sum: { $cond: [{ $eq: ['$meals.breakfast', 'yes'] }, 1, 0] } },
                lunch: { $sum: { $cond: [{ $eq: ['$meals.lunch', 'yes'] }, 1, 0] } },
                snacks: { $sum: { $cond: [{ $eq: ['$meals.snacks', 'yes'] }, 1, 0] } },
                dinner: { $sum: { $cond: [{ $eq: ['$meals.dinner', 'yes'] }, 1, 0] } }
            }
        }
    ]);

    return rows.reduce((result, row) => {
        result[row._id] = {
            total: row.total || 0,
            breakfast: row.breakfast || 0,
            lunch: row.lunch || 0,
            snacks: row.snacks || 0,
            dinner: row.dinner || 0
        };
        return result;
    }, {});
}

function hasRazorpayConfig() {
    return Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
}

function razorpayClient() {
    return new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET
    });
}

function paymentBill(payment, userId = '') {
    const month = payment?.month || currentMonthKey();
    return {
        id: payment?.id,
        userId: payment?.userId || userId,
        month,
        label: monthLabel(month),
        amount: payment?.amount || MESS_MONTHLY_FEE,
        currency: payment?.currency || 'INR',
        status: payment?.status || 'pending',
        provider: payment?.provider || (hasRazorpayConfig() ? 'razorpay' : 'demo'),
        orderId: payment?.orderId,
        paymentId: payment?.paymentId,
        paidAt: payment?.paidAt,
        createdAt: payment?.createdAt
    };
}

async function paymentAdminSummary(month = currentMonthKey()) {
    const students = await User.find({ type: 'student' }).lean();
    const payments = await Payment.find({ month }).sort({ createdAt: -1 }).lean();
    const paidPayments = payments.filter(payment => payment.status === 'paid');
    const paidUserIds = new Set(paidPayments.map(payment => payment.userId));
    const recordedUserIds = new Set(payments.map(payment => payment.userId));
    const pendingStudents = students.filter(student => !paidUserIds.has(student.userId));
    const noRecordStudents = students.filter(student => !recordedUserIds.has(student.userId));
    const totalCollected = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    return {
        month,
        label: monthLabel(month),
        amountPerStudent: MESS_MONTHLY_FEE,
        totalStudents: students.length,
        paidStudents: paidUserIds.size,
        pendingStudents: pendingStudents.length,
        totalCollected,
        payments: payments.map(formatDoc),
        pendingUsers: noRecordStudents.map(student => student.userId)
    };
}

function getPublicAppUrl() {
    const configuredUrl = process.env.MESSMATE_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
    try {
        const url = new URL(configuredUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return '';
        return url.origin;
    } catch {
        return '';
    }
}

app.get('/api/health', (req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({ status: connected ? 'ok' : 'unavailable', app: 'MessMate', database: connected ? 'connected' : 'disconnected' });
});

app.get('/api/public-app', (req, res) => {
    const url = getPublicAppUrl();
    res.json({ available: Boolean(url), url: url || null });
});

app.get('/app-qr.png', async (req, res, next) => {
    const url = getPublicAppUrl();
    if (!url) return res.status(404).json({ message: 'Set MESSMATE_PUBLIC_URL to a public HTTPS origin to enable the phone QR code.' });
    try {
        const image = await QRCode.toBuffer(`${url}/`, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 360, color: { dark: '#174b3a', light: '#fffdf8' } });
        res.set({ 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
        res.type('png').send(image);
    } catch (error) {
        next(error);
    }
});

app.post('/api/auth/register', authRateLimiter, async (req, res, next) => {
    try {
        const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
        const password = req.body.password;
        if (!/^\d{12}$/.test(userId)) return res.status(400).json({ message: 'Enter your 12-digit student ID.' });
        if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
            return res.status(400).json({ message: 'Use a password with at least 12 characters.' });
        }
        const user = await User.create({ userId, password: await hashPassword(password), type: 'student' });
        const token = crypto.randomBytes(24).toString('hex');
        await Session.create({ token: sessionHash(token), userId: user.userId });
        setSessionCookie(res, token);
        req.activityActor = publicUser(user);
        res.status(201).json({ user: publicUser(user) });
    } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ message: 'An account already uses that student ID. Sign in or contact the administrator.' });
        next(error);
    }
});

app.post('/api/auth/login', authRateLimiter, async (req, res, next) => {
    try {
        const { userId, password, type } = req.body;
        if (typeof userId !== 'string' || typeof password !== 'string' || password.length > 200) {
            return res.status(400).json({ message: 'Enter a valid user ID and password.' });
        }
        const user = await User.findOne({ userId, type }).lean();

        if (!user || !(await verifyPassword(password, user.password))) {
            return res.status(401).json({ message: 'Invalid User ID or password.' });
        }

        const token = crypto.randomBytes(24).toString('hex');
        await Session.create({ token: sessionHash(token), userId: user.userId });
        setSessionCookie(res, token);
        req.activityActor = publicUser(user);

        res.json({ user: publicUser(user) });
    } catch (error) {
        next(error);
    }
});

app.post('/api/auth/logout', requireAuth, async (req, res, next) => {
    try {
        await Session.deleteOne({ token: req.sessionHash });
        setSessionCookie(res, '', true);
        res.json({ message: 'Logged out.' });
    } catch (error) {
        next(error);
    }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
});

app.get('/api/menu', requireAuth, async (req, res, next) => {
    try {
        const date = req.query.date || todayString();
        if (!isValidDateKey(date)) return res.status(400).json({ message: 'Choose a valid menu date.' });
        const menu = await readMenu();
        const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
        const weekly = await WeeklyMenu.find({ dayOfWeek }).lean();
        const sources = Object.fromEntries(['breakfast', 'lunch', 'snacks', 'dinner'].map(meal => [meal, 'default']));
        for (const row of weekly) {
            menu[row.meal] = row.items;
            sources[row.meal] = 'weekly';
        }
        const scheduled = await MenuSchedule.find({ date }).lean();
        for (const row of scheduled) {
            menu[row.meal] = row.items;
            sources[row.meal] = 'date';
        }
        res.json({ menu, date, scheduledMeals: scheduled.map(row => row.meal), sources, cutoffs: BOOKING_CUTOFFS });
    } catch (error) {
        next(error);
    }
});

app.get('/api/menu/weekly', requireAuth, requireAnyRole('staff', 'manager'), async (req, res, next) => {
    try {
        const dayOfWeek = Number(req.query.dayOfWeek);
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return res.status(400).json({ message: 'Choose a weekday from 0 to 6.' });
        const rows = await WeeklyMenu.find({ dayOfWeek }).lean();
        const menus = Object.fromEntries(rows.map(row => [row.meal, row.items]));
        res.json({ dayOfWeek, menus });
    } catch (error) { next(error); }
});

app.put('/api/menu/weekly/:dayOfWeek', requireAuth, requireAnyRole('staff', 'manager'), async (req, res, next) => {
    try {
        const dayOfWeek = Number(req.params.dayOfWeek);
        const { breakfast, lunch, snacks, dinner } = req.body;
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return res.status(400).json({ message: 'Choose a valid weekday.' });
        if (![breakfast, lunch, snacks, dinner].every(value => typeof value === 'string' && value.trim() && value.length <= 2000)) {
            return res.status(400).json({ message: 'Enter a weekly menu for all four meal slots (up to 2,000 characters each).' });
        }
        const updatedAt = new Date();
        await Promise.all(Object.entries({ breakfast, lunch, snacks, dinner }).map(([meal, items]) => WeeklyMenu.findOneAndUpdate(
            { dayOfWeek, meal }, { dayOfWeek, meal, items: items.trim(), updatedBy: req.user.userId, updatedAt }, { upsert: true, returnDocument: 'after', runValidators: true }
        )));
        res.json({ dayOfWeek, menus: { breakfast: breakfast.trim(), lunch: lunch.trim(), snacks: snacks.trim(), dinner: dinner.trim() } });
    } catch (error) { next(error); }
});

app.delete('/api/menu/weekly/:dayOfWeek', requireAuth, requireAnyRole('staff', 'manager'), async (req, res, next) => {
    try {
        const dayOfWeek = Number(req.params.dayOfWeek);
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return res.status(400).json({ message: 'Choose a valid weekday.' });
        const result = await WeeklyMenu.deleteMany({ dayOfWeek });
        res.json({ message: `Removed ${result.deletedCount} recurring meal menu(s). Date-specific overrides remain in place.`, deletedCount: result.deletedCount });
    } catch (error) { next(error); }
});

app.put('/api/menu/:date', requireAuth, requireAnyRole('staff', 'manager'), async (req, res, next) => {
    try {
        const { date } = req.params;
        const { breakfast, lunch, snacks, dinner } = req.body;
        const requested = new Date(`${date}T00:00:00`);
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + 30);
        if (!isValidDateKey(date) || requested < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) || requested > maxDate) {
            return res.status(400).json({ message: 'Menu schedules can be set from today through the next 30 days.' });
        }
        if (![breakfast, lunch, snacks, dinner].every(value => typeof value === 'string' && value.trim() && value.length <= 2000)) {
            return res.status(400).json({ message: 'Enter a menu for breakfast, lunch, snacks, and dinner (up to 2,000 characters each).' });
        }
        const updatedAt = new Date();
        await Promise.all(Object.entries({ breakfast, lunch, snacks, dinner }).map(([meal, items]) => MenuSchedule.findOneAndUpdate(
            { date, meal }, { date, meal, items: items.trim(), updatedBy: req.user.userId, updatedAt }, { upsert: true, returnDocument: 'after', runValidators: true }
        )));
        res.json({ menu: { breakfast: breakfast.trim(), lunch: lunch.trim(), snacks: snacks.trim(), dinner: dinner.trim() }, date });
    } catch (error) { next(error); }
});

app.delete('/api/menu/:date', requireAuth, requireAnyRole('staff', 'manager'), async (req, res, next) => {
    try {
        if (!isValidDateKey(req.params.date)) return res.status(400).json({ message: 'Choose a valid menu date.' });
        const result = await MenuSchedule.deleteMany({ date: req.params.date });
        res.json({ message: `Removed ${result.deletedCount} date-specific menu override(s). The weekly menu or default menu will apply.`, deletedCount: result.deletedCount });
    } catch (error) { next(error); }
});

app.put('/api/menu', requireAuth, requireAnyRole('staff', 'manager'), async (req, res, next) => {
    try {
        const { breakfast, lunch, snacks, dinner } = req.body;

        if (![breakfast, lunch, snacks, dinner].every(value => typeof value === 'string' && value.trim() && value.length <= 2000)) {
            return res.status(400).json({ message: 'Please fill in all menu fields.' });
        }

        const updatedAt = new Date();
        await Promise.all(Object.entries({ breakfast, lunch, snacks, dinner }).map(([meal, items]) =>
            Menu.updateOne({ meal }, { meal, items: items.trim(), updatedAt }, { upsert: true })
        ));

        res.json({ menu: await readMenu() });
    } catch (error) {
        next(error);
    }
});

app.post('/api/attendance', requireAuth, requireRole('student'), async (req, res, next) => {
    try {
        const { hostel, meals } = req.body;
        const validMeals = meals && ['breakfast', 'lunch', 'snacks', 'dinner'].every(meal => ['yes', 'no'].includes(meals[meal]));

        if (!hostel || !validMeals) {
            return res.status(400).json({ message: 'Please select hostel and attendance for all meals.' });
        }

        const now = new Date();
        await AttendanceRecord.findOneAndUpdate(
            { userId: req.user.userId, date: todayString() },
            {
                userId: req.user.userId,
                hostel,
                date: todayString(),
                meals,
                timestamp: now
            },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );
        await AppState.updateOne(
            { key: 'countsLastUpdated' },
            { key: 'countsLastUpdated', value: now.toLocaleTimeString() },
            { upsert: true }
        );

        res.json({ message: 'Attendance submitted successfully.', summary: await dashboardSummary() });
    } catch (error) {
        next(error);
    }
});

app.post('/api/reviews', requireAuth, requireRole('student'), async (req, res, next) => {
    try {
        const { meal, rating, comment } = req.body;
        const numericRating = Number(rating);

        if (!validMeal(meal) || typeof comment !== 'string' || !comment.trim() || comment.length > 2000 || !Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({ message: 'Please select a rating and write your review.' });
        }

        const review = await Review.create({
            userId: req.user.userId,
            meal,
            rating: numericRating,
            comment,
            timestamp: new Date()
        });

        res.status(201).json({ review: formatDoc(review) });
    } catch (error) {
        next(error);
    }
});

app.get('/api/reviews', requireAuth, async (req, res, next) => {
    try {
        const { today, meal, rating } = req.query;
        const query = {};
        if (req.user.type === 'student') query.userId = req.user.userId;

        if (today === 'true') {
            const { start, end } = todayRange();
            query.timestamp = { $gte: start, $lt: end };
        }

        if (meal && meal !== 'all') {
            query.meal = meal;
        }

        if (rating && rating !== 'all') {
            query.rating = Number(rating);
        }

        const reviews = await Review.find(query).sort({ timestamp: -1 }).lean();
        res.json({ reviews: reviews.map(formatDoc) });
    } catch (error) {
        next(error);
    }
});

app.post('/api/complaints', requireAuth, requireRole('student'), async (req, res, next) => {
    try {
        const { meal, subject, description } = req.body;
        const imageData = req.body.imageData;
        let attachment = null;

        if (!validMeal(meal) || typeof subject !== 'string' || !subject.trim() || subject.length > 120 || typeof description !== 'string' || !description.trim() || description.length > 2000) {
            return res.status(400).json({ message: 'Please complete the complaint form.' });
        }
        if (imageData !== undefined && imageData !== '') {
            const match = typeof imageData === 'string' && imageData.length <= 450000
                ? imageData.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/)
                : null;
            if (!match) return res.status(400).json({ message: 'Attach a JPEG, PNG, or WebP image smaller than 330 KB.' });
            const bytes = Buffer.from(match[2], 'base64');
            const mime = match[1];
            const validSignature = mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
                : mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
                    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
            if (!bytes.length || bytes.length > 330000 || !validSignature) return res.status(400).json({ message: 'The attachment is too large or is not a valid supported image.' });
            attachment = { attachmentMimeType: mime, attachmentData: match[2], hasAttachment: true };
        }

        const complaint = await Complaint.create({
            userId: req.user.userId,
            meal,
            subject,
            description,
            ...(attachment || {}),
            timestamp: new Date(),
            status: 'pending'
        });

        res.status(201).json({ complaint: formatComplaintDoc(complaint) });
    } catch (error) {
        next(error);
    }
});

app.get('/api/complaints/me', requireAuth, requireRole('student'), async (req, res, next) => {
    try {
        const complaints = await Complaint.find({ userId: req.user.userId }).sort({ timestamp: -1 }).lean();
        res.json({ complaints: complaints.map(formatComplaintDoc) });
    } catch (error) {
        next(error);
    }
});

app.get('/api/complaints', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const { status, meal } = req.query;
        const query = {};

        if (status && status !== 'all') {
            query.status = status;
        }

        if (meal && meal !== 'all') {
            query.meal = meal;
        }

        const complaints = await Complaint.find(query).sort({ timestamp: -1 }).lean();
        res.json({ complaints: complaints.map(formatComplaintDoc) });
    } catch (error) {
        next(error);
    }
});

app.get('/api/complaints/:id/image', requireAuth, async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Image not found.');
        const complaint = await Complaint.findById(req.params.id).select('+attachmentData').lean();
        if (!complaint?.hasAttachment || !complaint.attachmentData) return res.status(404).send('Image not found.');
        if (req.user.type === 'student' && complaint.userId !== req.user.userId) return res.status(404).send('Image not found.');
        if (!['student', 'staff', 'manager', 'admin'].includes(req.user.type)) return res.status(403).send('Access denied.');
        res.set({
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; base-uri 'none'",
            'Content-Disposition': 'inline; filename="messmate-complaint-image"'
        });
        res.type(complaint.attachmentMimeType).send(Buffer.from(complaint.attachmentData, 'base64'));
    } catch (error) { next(error); }
});

app.patch('/api/complaints/bulk', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const { ids, status } = req.body;
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || ids.some(id => !mongoose.isValidObjectId(id))
            || !['pending', 'in_progress', 'resolved'].includes(status)) {
            return res.status(400).json({ message: 'Select up to 100 valid complaints and choose a status.' });
        }
        const now = new Date();
        const update = { $set: { status, updatedAt: now } };
        if (status === 'resolved') update.$set.resolvedAt = now;
        else update.$unset = { resolvedAt: 1 };
        const result = await Complaint.updateMany({ _id: { $in: ids }, status: { $ne: status } }, update);
        res.json({ updated: result.modifiedCount, requested: ids.length });
    } catch (error) { next(error); }
});

app.patch('/api/complaints/:id', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!['pending', 'in_progress', 'resolved'].includes(status)) {
            return res.status(400).json({ message: 'Choose Pending, In Progress, or Resolved.' });
        }
        const fields = { status, updatedAt: new Date() };
        if (status === 'resolved') fields.resolvedAt = new Date();
        else fields.$unset = { resolvedAt: 1 };
        const complaint = await Complaint.findByIdAndUpdate(req.params.id, fields, { returnDocument: 'after' }).lean();

        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found.' });
        }

        res.json({ complaint: formatComplaintDoc(complaint) });
    } catch (error) {
        next(error);
    }
});

app.get('/api/bookings/me', requireAuth, requireRole('student'), async (req, res, next) => {
    try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 14);
        const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const bookings = await Booking.find({ userId: req.user.userId, date: { $gte: dateKey(start), $lte: dateKey(end) } }).sort({ date: 1 }).lean();
        res.json({ bookings: bookings.map(formatDoc), cutoffs: BOOKING_CUTOFFS });
    } catch (error) {
        next(error);
    }
});

app.put('/api/bookings/me', requireAuth, requireRole('student'), async (req, res, next) => {
    try {
        const { date, meal, booked } = req.body;
        if (typeof booked !== 'boolean' || !canChangeBooking(date, meal)) {
            return res.status(400).json({ message: 'This meal can no longer be changed, or the date is outside the 14-day booking window.' });
        }
        const booking = await Booking.findOneAndUpdate(
            { userId: req.user.userId, date, meal },
            { userId: req.user.userId, date, meal, status: booked ? 'booked' : 'cancelled', updatedAt: new Date() },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true }
        );
        await AppState.updateOne({ key: 'countsLastUpdated' }, { key: 'countsLastUpdated', value: new Date().toLocaleTimeString() }, { upsert: true });
        res.json({ booking: formatDoc(booking), cutoffs: BOOKING_CUTOFFS });
    } catch (error) {
        next(error);
    }
});

app.get('/api/announcements', requireAuth, async (req, res, next) => {
    try {
        const announcements = await Announcement.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).sort({ createdAt: -1 }).limit(20).lean();
        res.json({ announcements: announcements.map(formatDoc) });
    } catch (error) {
        next(error);
    }
});

app.get('/api/notifications', requireAuth, async (req, res, next) => {
    try {
        const announcements = await Announcement.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).sort({ createdAt: -1 }).limit(30).lean();
        const receipts = await NotificationReceipt.find({ userId: req.user.userId, announcementId: { $in: announcements.map(item => item._id) } }).lean();
        const readIds = new Set(receipts.map(row => String(row.announcementId)));
        const notifications = announcements.map(row => ({ ...formatDoc(row), read: readIds.has(String(row._id)) }));
        res.json({ notifications, unreadCount: notifications.filter(item => !item.read).length });
    } catch (error) { next(error); }
});

app.post('/api/notifications/:id/read', requireAuth, async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Notification not found.' });
        const exists = await Announcement.exists({ _id: req.params.id, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
        if (!exists) return res.status(404).json({ message: 'Notification not found.' });
        await NotificationReceipt.updateOne({ userId: req.user.userId, announcementId: req.params.id }, { $setOnInsert: { userId: req.user.userId, announcementId: req.params.id, readAt: new Date() } }, { upsert: true });
        res.json({ message: 'Announcement marked as read.' });
    } catch (error) { next(error); }
});

function safeSearchRegex(text) {
    return new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

app.get('/api/search', requireAuth, async (req, res, next) => {
    try {
        const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        if (term.length < 2 || term.length > 80) return res.status(400).json({ message: 'Search must be between 2 and 80 characters.' });
        const match = safeSearchRegex(term);
        const results = [];
        const add = (type, title, detail) => { if (results.length < 80) results.push({ type, title: String(title || ''), detail: String(detail || '') }); };
        const announcements = await Announcement.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }], $and: [{ $or: [{ title: match }, { body: match }] }] }).sort({ createdAt: -1 }).limit(10).lean();
        announcements.forEach(row => add('Announcement', row.title, row.createdAt?.toISOString()));
        const schedules = await MenuSchedule.find({ items: match }).sort({ date: 1 }).limit(10).lean();
        schedules.forEach(row => add('Date menu', `${row.date} · ${row.meal}`, row.items));
        const weekly = await WeeklyMenu.find({ items: match }).limit(10).lean();
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        weekly.forEach(row => add('Weekly menu', `${weekdays[row.dayOfWeek]} · ${row.meal}`, row.items));
        const baseMenus = await Menu.find({ items: match }).limit(5).lean();
        baseMenus.forEach(row => add('Default menu', row.meal, row.items));

        const ownQuery = { userId: req.user.userId };
        if (req.user.type === 'student') {
            const [bookings, complaints, payments] = await Promise.all([
                Booking.find({ ...ownQuery, $or: [{ date: match }, { meal: match }, { status: match }] }).sort({ date: -1 }).limit(10).lean(),
                Complaint.find({ ...ownQuery, $or: [{ subject: match }, { description: match }, { status: match }, { meal: match }] }).sort({ timestamp: -1 }).limit(10).lean(),
                Payment.find({ ...ownQuery, $or: [{ month: match }, { status: match }, { provider: match }] }).sort({ createdAt: -1 }).limit(5).lean()
            ]);
            bookings.forEach(row => add('My booking', `${row.date} · ${row.meal}`, row.status));
            complaints.forEach(row => add('My complaint', row.subject, `${row.status} · ${row.meal}`));
            payments.forEach(row => add('My payment', monthLabel(row.month), `${row.status} · ${row.provider}`));
        } else {
            const dutyQuery = req.user.type === 'staff' ? { assigneeUserId: req.user.userId, $or: [{ title: match }, { status: match }] } : { $or: [{ title: match }, { status: match }, { assigneeUserId: match }] };
            const duties = await StaffDuty.find(dutyQuery).sort({ createdAt: -1 }).limit(10).lean();
            duties.forEach(row => add('Staff duty', row.title, `${row.assigneeUserId} · ${row.status}`));
            const bookings = await Booking.find({ userId: match }).sort({ date: -1 }).limit(10).lean();
            bookings.forEach(row => add('Meal booking', `${row.date} · ${row.meal}`, `${row.userId} · ${row.status}`));
            if (req.user.type === 'staff') {
                const complaints = await Complaint.find({ $or: [{ subject: match }, { description: match }, { userId: match }, { status: match }] }).sort({ timestamp: -1 }).limit(10).lean();
                complaints.forEach(row => add('Complaint', row.subject, `${row.userId} · ${row.status}`));
            }
            if (req.user.type !== 'staff') {
                const [items, suppliers, complaints, users] = await Promise.all([
                    InventoryItem.find({ $or: [{ name: match }, { supplier: match }] }).limit(10).lean(),
                    Supplier.find({ $or: [{ name: match }, { contactName: match }, { email: match }] }).limit(10).lean(),
                    Complaint.find({ $or: [{ subject: match }, { description: match }, { userId: match }] }).sort({ timestamp: -1 }).limit(10).lean(),
                    req.user.type === 'admin' ? User.find({ userId: match }).select('userId type').limit(10).lean() : Promise.resolve([])
                ]);
                items.forEach(row => add('Inventory', row.name, `${row.quantity} ${row.unit}${row.quantity <= row.minimumQuantity ? ' · low stock' : ''}`));
                suppliers.forEach(row => add('Supplier', row.name, row.contactName));
                complaints.forEach(row => add('Complaint', row.subject, `${row.userId} · ${row.status}`));
                users.forEach(row => add('Account', row.userId, row.type));
            }
            if (['manager', 'admin'].includes(req.user.type)) {
                const [waste, orders] = await Promise.all([
                    WasteLog.find({ $or: [{ date: match }, { meal: match }, { category: match }, { note: match }, { factorSource: match }] }).sort({ date: -1 }).limit(10).lean(),
                    PurchaseOrder.find({ $or: [{ supplierName: match }, { status: match }, { 'items.itemName': match }] }).sort({ createdAt: -1 }).limit(10).lean()
                ]);
                waste.forEach(row => add('Waste record', `${row.date} · ${row.meal} · ${row.category}`, `${row.kilograms} kg${row.factorSource ? ` · factor source: ${row.factorSource}` : ''}`));
                orders.forEach(row => add('Purchase order', row.supplierName, `${row.status} · ${row.items.map(item => item.itemName).join(', ')}`));
            }
        }
        res.json({ results, count: results.length });
    } catch (error) { next(error); }
});

app.post('/api/announcements', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
        const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
        if (!title || !body || title.length > 120 || body.length > 2000) {
            return res.status(400).json({ message: 'Add a title (up to 120 characters) and message (up to 2,000 characters).' });
        }
        const announcement = await Announcement.create({ title, body, authorId: req.user.userId });
        sendAnnouncementPush(announcement).catch(error => console.warn('Announcement push fan-out failed:', error.message));
        res.status(201).json({ announcement: formatDoc(announcement) });
    } catch (error) {
        next(error);
    }
});

app.get('/api/push/config', requireAuth, (req, res) => {
    res.json({ enabled: PUSH_ENABLED, publicKey: PUSH_ENABLED ? VAPID_PUBLIC_KEY : null });
});

app.post('/api/push/subscriptions', requireAuth, async (req, res, next) => {
    try {
        if (!PUSH_ENABLED) return res.status(503).json({ message: 'Browser push is not configured on this server. Add VAPID keys in .env first.' });
        const subscription = req.body.subscription;
        let endpoint;
        try { endpoint = new URL(subscription?.endpoint); } catch { return res.status(400).json({ message: 'The browser subscription is invalid.' }); }
        const trustedPushHost = endpoint.hostname === 'fcm.googleapis.com'
            || endpoint.hostname.endsWith('.push.services.mozilla.com')
            || endpoint.hostname === 'push.services.mozilla.com'
            || endpoint.hostname === 'web.push.apple.com'
            || endpoint.hostname.endsWith('.notify.windows.com');
        const p256dh = subscription?.keys?.p256dh;
        const auth = subscription?.keys?.auth;
        if (endpoint.protocol !== 'https:' || !trustedPushHost || endpoint.href.length > 2048
            || typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{40,200}$/.test(p256dh)
            || typeof auth !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(auth)) {
            return res.status(400).json({ message: 'The browser push endpoint or encryption keys are invalid.' });
        }
        await PushSubscription.findOneAndUpdate(
            { endpoint: endpoint.href },
            { $set: { userId: req.user.userId, keys: { p256dh, auth }, updatedAt: new Date() }, $setOnInsert: { endpoint: endpoint.href } },
            { upsert: true, returnDocument: 'after', runValidators: true }
        );
        res.status(201).json({ subscribed: true });
    } catch (error) { next(error); }
});

app.delete('/api/push/subscriptions', requireAuth, async (req, res, next) => {
    try {
        const endpoint = typeof req.body.endpoint === 'string' ? req.body.endpoint : '';
        if (!endpoint || endpoint.length > 2048) return res.status(400).json({ message: 'Choose a valid subscription to remove.' });
        await PushSubscription.deleteOne({ userId: req.user.userId, endpoint });
        res.json({ subscribed: false });
    } catch (error) { next(error); }
});

app.post('/api/check-ins/qr-pass', requireAuth, requireRole('student'), async (req, res, next) => {
    try {
        const { date, meal } = req.body;
        if (date !== todayString() || !isValidDateKey(date) || !validMeal(meal)) {
            return res.status(400).json({ message: 'QR passes are available only for a valid meal booked for today.' });
        }
        const booking = await Booking.findOne({ userId: req.user.userId, date, meal, status: 'booked' }).lean();
        if (!booking) return res.status(409).json({ message: 'Book this meal before requesting an entry pass.' });
        const expiresAt = Date.now() + 90_000;
        const token = signQrPayload({ userId: req.user.userId, date, meal, exp: expiresAt, nonce: crypto.randomBytes(8).toString('hex') });
        const qrText = `MESSMATE_QR|${token}`;
        const qrDataUrl = await QRCode.toDataURL(qrText, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
        res.json({ qrDataUrl, expiresAt, date, meal, expiresInSeconds: 90 });
    } catch (error) { next(error); }
});

app.post('/api/check-ins/scan', requireAuth, requireAnyRole('staff', 'manager'), async (req, res, next) => {
    try {
        const payload = verifyQrPayload(req.body.qrText);
        if (!payload) return res.status(400).json({ message: 'This QR pass is invalid or has expired. Ask the student to refresh it.' });
        if (payload.date !== todayString()) return res.status(400).json({ message: 'This pass is not valid for today.' });
        const student = await User.findOne({ userId: payload.userId, type: 'student' }).lean();
        if (!student) return res.status(404).json({ message: 'Student account not found.' });
        const booking = await Booking.findOne({ userId: payload.userId, date: payload.date, meal: payload.meal, status: 'booked' }).lean();
        if (!booking) return res.status(409).json({ message: 'The booking for this pass is no longer active.' });
        const checkIn = await CheckIn.create({ userId: payload.userId, date: payload.date, meal: payload.meal, checkedInBy: req.user.userId });
        res.status(201).json({ checkIn: formatDoc(checkIn) });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'This meal has already been checked in.' });
        next(error);
    }
});

app.post('/api/check-ins', requireAuth, requireAnyRole('staff', 'manager'), async (req, res, next) => {
    try {
        const { userId, date, meal } = req.body;
        if (typeof userId !== 'string' || !isValidDateKey(date) || !validMeal(meal) || date !== todayString()) {
            return res.status(400).json({ message: 'Enter a valid student ID and meal for today.' });
        }
        const student = await User.findOne({ userId, type: 'student' }).lean();
        if (!student) return res.status(404).json({ message: 'Student account not found.' });
        const booking = await Booking.findOne({ userId, date, meal, status: 'booked' }).lean();
        if (!booking) return res.status(409).json({ message: 'This student has no active booking for that meal.' });
        const checkIn = await CheckIn.create({ userId, date, meal, checkedInBy: req.user.userId });
        res.status(201).json({ checkIn: formatDoc(checkIn) });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'This meal has already been checked in.' });
        next(error);
    }
});

app.get('/api/inventory', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const [items, transactions] = await Promise.all([
            InventoryItem.find({}).sort({ name: 1 }).lean(),
            StockTransaction.find({}).sort({ createdAt: -1 }).limit(30).lean()
        ]);
        res.json({ items: items.map(formatDoc), transactions: transactions.map(formatDoc) });
    } catch (error) { next(error); }
});

app.post('/api/inventory', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const { name, unit, quantity, minimumQuantity, supplier = '' } = req.body;
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || typeof unit !== 'string' || !unit.trim() || unit.length > 24 || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(minimumQuantity) || minimumQuantity < 0 || typeof supplier !== 'string' || supplier.length > 100) {
            return res.status(400).json({ message: 'Enter a name, unit, non-negative quantity and threshold, and optional supplier.' });
        }
        const item = await InventoryItem.create({ name: name.trim(), unit: unit.trim(), quantity, minimumQuantity, supplier: supplier.trim() });
        if (quantity > 0) await StockTransaction.create({ itemId: item._id, itemName: item.name, kind: 'received', quantity, note: 'Opening stock', actorId: req.user.userId });
        res.status(201).json({ item: formatDoc(item) });
    } catch (error) { next(error); }
});

app.patch('/api/inventory/:id', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const { minimumQuantity, supplier } = req.body;
        if (!Number.isFinite(minimumQuantity) || minimumQuantity < 0 || typeof supplier !== 'string' || supplier.length > 100) {
            return res.status(400).json({ message: 'Enter a non-negative low-stock threshold and supplier name.' });
        }
        const item = await InventoryItem.findByIdAndUpdate(req.params.id, { minimumQuantity, supplier: supplier.trim(), updatedAt: new Date() }, { returnDocument: 'after', runValidators: true });
        if (!item) return res.status(404).json({ message: 'Inventory item not found.' });
        res.json({ item: formatDoc(item) });
    } catch (error) { next(error); }
});

app.post('/api/inventory/:id/transactions', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const { kind, quantity, note = '' } = req.body;
        if (!['received', 'used', 'adjustment'].includes(kind) || !Number.isFinite(quantity) || quantity <= 0 || typeof note !== 'string' || note.length > 300) {
            return res.status(400).json({ message: 'Choose a transaction type and enter a positive quantity.' });
        }
        const item = await InventoryItem.findById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Inventory item not found.' });
        const nextQuantity = kind === 'received' ? item.quantity + quantity : item.quantity - quantity;
        if (nextQuantity < 0) return res.status(400).json({ message: 'That update would make stock negative.' });
        item.quantity = nextQuantity;
        item.updatedAt = new Date();
        await item.save();
        const transaction = await StockTransaction.create({ itemId: item._id, itemName: item.name, kind, quantity, note: note.trim(), actorId: req.user.userId });
        res.status(201).json({ item: formatDoc(item), transaction: formatDoc(transaction) });
    } catch (error) { next(error); }
});

app.get('/api/waste', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const [logs, monthlyCarbon] = await Promise.all([
            WasteLog.find({}).sort({ date: -1, createdAt: -1 }).limit(200).lean(),
            WasteLog.aggregate([
                { $match: { co2ePerKg: { $type: 'number' }, factorSource: { $type: 'string', $nin: [''] } } },
                { $group: { _id: { $substrBytes: ['$date', 0, 7] }, kgCo2e: { $sum: { $multiply: ['$kilograms', '$co2ePerKg'] } }, records: { $sum: 1 } } },
                { $sort: { _id: -1 } },
                { $limit: 12 }
            ])
        ]);
        const totals = logs.reduce((result, log) => {
            result[log.category] += Number(log.kilograms);
            if (Number.isFinite(log.co2ePerKg) && log.factorSource) {
                result.carbonKgCo2e += Number(log.kilograms) * Number(log.co2ePerKg);
                result.carbonRecords++;
            }
            return result;
        }, { surplus: 0, discarded: 0, carbonKgCo2e: 0, carbonRecords: 0 });
        res.json({ logs: logs.map(formatDoc), totals: { surplus: Number(totals.surplus.toFixed(2)), discarded: Number(totals.discarded.toFixed(2)), carbonKgCo2e: Number(totals.carbonKgCo2e.toFixed(2)), carbonRecords: totals.carbonRecords }, monthlyCarbon: monthlyCarbon.reverse().map(row => ({ month: row._id, kgCo2e: Number(row.kgCo2e.toFixed(3)), records: row.records })), basis: 'Waste totals cover the latest 200 recorded entries. Monthly CO₂e estimates cover the latest 12 months with sourced factors; both depend on staff-entered data and are not avoided-emissions measurements.' });
    } catch (error) { next(error); }
});

app.post('/api/waste', requireAuth, requireAnyRole('staff', 'manager'), async (req, res, next) => {
    try {
        const { date, meal, category, kilograms, co2ePerKg, factorSource = '', note = '' } = req.body;
        const hasFactor = co2ePerKg !== undefined && co2ePerKg !== null && co2ePerKg !== '';
        const factorIsValid = !hasFactor || (Number.isFinite(co2ePerKg) && co2ePerKg >= 0 && co2ePerKg <= 1000 && typeof factorSource === 'string' && factorSource.trim().length > 0 && factorSource.length <= 160);
        if (!isValidDateKey(date) || !validMeal(meal) || !['surplus', 'discarded'].includes(category) || !Number.isFinite(kilograms) || kilograms <= 0 || kilograms > 10000 || typeof note !== 'string' || note.length > 300 || typeof factorSource !== 'string' || !factorIsValid || (!hasFactor && factorSource.trim())) {
            return res.status(400).json({ message: 'Enter a valid waste record. Carbon factor and its source must be provided together.' });
        }
        const log = await WasteLog.create({ date, meal, category, kilograms, ...(hasFactor ? { co2ePerKg, factorSource: factorSource.trim() } : {}), note: note.trim(), actorId: req.user.userId });
        res.status(201).json({ log: formatDoc(log) });
    } catch (error) { next(error); }
});

app.get('/api/duties', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const query = req.user.type === 'staff' ? { assigneeUserId: req.user.userId } : {};
        const duties = await StaffDuty.find(query).sort({ dueAt: 1, createdAt: -1 }).lean();
        res.json({ duties: duties.map(formatDoc) });
    } catch (error) { next(error); }
});

app.post('/api/duties', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const { title, assigneeUserId, dueAt } = req.body;
        const assignee = await User.findOne({ userId: assigneeUserId, type: 'staff' }).lean();
        if (typeof title !== 'string' || !title.trim() || title.length > 160 || !assignee || (dueAt && Number.isNaN(Date.parse(dueAt)))) {
            return res.status(400).json({ message: 'Provide a task, valid staff account, and optional due date.' });
        }
        const duty = await StaffDuty.create({ title: title.trim(), assigneeUserId, dueAt: dueAt || undefined, createdBy: req.user.userId });
        res.status(201).json({ duty: formatDoc(duty) });
    } catch (error) { next(error); }
});

app.patch('/api/duties/bulk', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const { ids, status } = req.body;
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || ids.some(id => !mongoose.isValidObjectId(id))
            || !['assigned', 'in_progress', 'completed'].includes(status)) {
            return res.status(400).json({ message: 'Select up to 100 valid duties and choose a status.' });
        }
        const update = { $set: { status } };
        if (status === 'completed') update.$set.completedAt = new Date();
        else update.$unset = { completedAt: 1 };
        const result = await StaffDuty.updateMany({ _id: { $in: ids }, status: { $ne: status } }, update);
        res.json({ updated: result.modifiedCount, requested: ids.length });
    } catch (error) { next(error); }
});

app.patch('/api/duties/:id', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!['assigned', 'in_progress', 'completed'].includes(status)) return res.status(400).json({ message: 'Choose a valid task status.' });
        const duty = await StaffDuty.findById(req.params.id);
        if (!duty) return res.status(404).json({ message: 'Task not found.' });
        if (req.user.type === 'staff' && duty.assigneeUserId !== req.user.userId) return res.status(403).json({ message: 'You can only update tasks assigned to you.' });
        duty.status = status;
        duty.completedAt = status === 'completed' ? new Date() : undefined;
        await duty.save();
        res.json({ duty: formatDoc(duty) });
    } catch (error) { next(error); }
});

app.get('/api/suppliers', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const suppliers = await Supplier.find({}).sort({ name: 1 }).lean();
        res.json({ suppliers: suppliers.map(formatDoc) });
    } catch (error) { next(error); }
});

app.post('/api/suppliers', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const { name, contactName = '', phone = '', email = '' } = req.body;
        if (typeof name !== 'string' || !name.trim() || name.length > 120 || ![contactName, phone, email].every(value => typeof value === 'string') || contactName.length > 120 || phone.length > 40 || email.length > 160) {
            return res.status(400).json({ message: 'Enter a supplier name and valid contact details.' });
        }
        const supplier = await Supplier.create({ name: name.trim(), contactName: contactName.trim(), phone: phone.trim(), email: email.trim() });
        res.status(201).json({ supplier: formatDoc(supplier) });
    } catch (error) { next(error); }
});

app.get('/api/purchase-orders', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const orders = await PurchaseOrder.find({}).sort({ createdAt: -1 }).limit(100).lean();
        res.json({ orders: orders.map(formatDoc) });
    } catch (error) { next(error); }
});

app.post('/api/purchase-orders', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const { supplierId, items } = req.body;
        if (!mongoose.isValidObjectId(supplierId) || !Array.isArray(items) || items.length < 1 || items.length > 50) return res.status(400).json({ message: 'Select a supplier and at least one stock item.' });
        const supplier = await Supplier.findById(supplierId).lean();
        if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });
        const validated = [];
        for (const row of items) {
            if (!mongoose.isValidObjectId(row.itemId) || !Number.isFinite(row.quantity) || row.quantity <= 0 || !Number.isFinite(row.unitPrice) || row.unitPrice < 0 || row.unitPrice > 10000000) return res.status(400).json({ message: 'Each order line needs an item, positive quantity, and unit price from Rs. 0 to Rs. 10,000,000.' });
            const item = await InventoryItem.findById(row.itemId).lean();
            if (!item) return res.status(404).json({ message: 'An inventory item was not found.' });
            validated.push({ itemId: item._id, itemName: item.name, quantity: row.quantity, unitPrice: row.unitPrice });
        }
        const order = await PurchaseOrder.create({ supplierId: supplier._id, supplierName: supplier.name, items: validated, createdBy: req.user.userId });
        res.status(201).json({ order: formatDoc(order) });
    } catch (error) { next(error); }
});

app.patch('/api/purchase-orders/:id/receive', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const order = await PurchaseOrder.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Purchase order not found.' });
        if (order.status !== 'placed') return res.status(409).json({ message: 'Only placed purchase orders can be received.' });
        for (const row of order.items) {
            const item = await InventoryItem.findById(row.itemId);
            if (!item) return res.status(409).json({ message: `${row.itemName} is no longer in inventory.` });
            item.quantity += row.quantity;
            item.updatedAt = new Date();
            await item.save();
            await StockTransaction.create({ itemId: item._id, itemName: item.name, kind: 'received', quantity: row.quantity, note: `Purchase order ${order.id}`, actorId: req.user.userId });
        }
        order.status = 'received';
        order.receivedAt = new Date();
        await order.save();
        res.json({ order: formatDoc(order) });
    } catch (error) { next(error); }
});

app.get('/api/reports/forecast', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(today);
        start.setDate(start.getDate() - 27);
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + 1);
        const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const startKey = dateKey(start);
        const todayKey = dateKey(today);
        const targetKey = dateKey(targetDate);
        const [bookings, checkIns] = await Promise.all([
            Booking.aggregate([{ $match: { date: { $gte: startKey, $lte: todayKey }, status: 'booked' } }, { $group: { _id: { date: '$date', meal: '$meal' }, count: { $sum: 1 } } }]),
            CheckIn.aggregate([{ $match: { date: { $gte: startKey, $lte: todayKey } } }, { $group: { _id: { date: '$date', meal: '$meal' }, count: { $sum: 1 } } }])
        ]);
        const bookingByDateMeal = new Map(bookings.map(row => [`${row._id.date}|${row._id.meal}`, row.count]));
        const checkInByDateMeal = new Map(checkIns.map(row => [`${row._id.date}|${row._id.meal}`, row.count]));
        const observedDates = [];
        for (const date = new Date(start); date <= today; date.setDate(date.getDate() + 1)) observedDates.push(dateKey(date));
        const targetWeekday = targetDate.getDay();
        const weekdayDates = observedDates.filter(date => new Date(`${date}T00:00:00`).getDay() === targetWeekday);
        const forecast = Object.fromEntries(['breakfast', 'lunch', 'snacks', 'dinner'].map(meal => {
            const rows = observedDates.map(date => ({ date, bookings: bookingByDateMeal.get(`${date}|${meal}`) || 0, checkIns: checkInByDateMeal.get(`${date}|${meal}`) || 0 }));
            const bookedTotal = rows.reduce((sum, row) => sum + row.bookings, 0);
            const checkInTotal = rows.reduce((sum, row) => sum + row.checkIns, 0);
            const matchingWeekdays = rows.filter(row => weekdayDates.includes(row.date));
            const useWeekdayPattern = matchingWeekdays.length >= 2;
            const samples = useWeekdayPattern ? matchingWeekdays : rows;
            const weightedBookingTotal = samples.reduce((sum, row, index) => sum + row.bookings * (index + 1), 0);
            const weightTotal = samples.reduce((sum, _row, index) => sum + index + 1, 0);
            const averageBookings = weightTotal ? weightedBookingTotal / weightTotal : 0;
            const sampleBooked = samples.reduce((sum, row) => sum + row.bookings, 0);
            const sampleCheckIns = samples.reduce((sum, row) => sum + row.checkIns, 0);
            const hasAttendanceHistory = sampleBooked > 0 && sampleCheckIns > 0;
            const attendanceRate = hasAttendanceHistory ? Math.min(1, sampleCheckIns / sampleBooked) : 1;
            return [meal, {
                bookedTotal,
                checkInTotal,
                daysObserved: samples.length,
                weekdayObservations: matchingWeekdays.length,
                usedWeekdayPattern: useWeekdayPattern,
                attendanceRate: Number(attendanceRate.toFixed(2)),
                hasAttendanceHistory,
                estimatedNextDay: Math.round(averageBookings * attendanceRate)
            }];
        }));
        res.json({ forecast, targetDate: targetKey, method: 'For each meal, MessMate calculates a recency-weighted average of bookings from the same weekday over the last 28 days (or uses all available dates when fewer than two matching weekdays exist). It adjusts that estimate by observed check-ins for those sample dates when available; without check-in history it uses the booking estimate.' });
    } catch (error) { next(error); }
});

function csvCell(value) {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function operationalReportFilters(query) {
    let defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 29);
    const defaultFrom = `${defaultStart.getFullYear()}-${String(defaultStart.getMonth() + 1).padStart(2, '0')}-${String(defaultStart.getDate()).padStart(2, '0')}`;
    const from = query.from || defaultFrom;
    const to = query.to || todayString();
    const meal = query.meal || 'all';
    const status = query.status || 'all';
    const search = typeof query.q === 'string' ? query.q.trim() : '';
    if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) return { error: 'Choose a valid date range.' };
    if (validMeal(meal) === false && meal !== 'all') return { error: 'Choose a valid meal filter.' };
    if (!['all', 'booked', 'cancelled'].includes(status)) return { error: 'Choose a valid booking status filter.' };
    if (search.length > 80) return { error: 'Search text must be 80 characters or fewer.' };
    const safeSearch = search ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    const date = { $gte: from, $lte: to };
    const bookingQuery = { date };
    const checkInQuery = { date };
    if (meal !== 'all') { bookingQuery.meal = meal; checkInQuery.meal = meal; }
    if (status !== 'all') bookingQuery.status = status;
    if (safeSearch) {
        bookingQuery.userId = safeSearch;
        checkInQuery.$or = [{ userId: safeSearch }, { checkedInBy: safeSearch }];
    }
    return { from, to, meal, status, search, bookingQuery, checkInQuery };
}

app.get('/api/reports/operations', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const filters = operationalReportFilters(req.query);
        if (filters.error) return res.status(400).json({ message: filters.error });
        const [bookings, checkIns] = await Promise.all([
            Booking.find(filters.bookingQuery).sort({ date: -1, meal: 1, userId: 1 }).limit(1000).lean(),
            CheckIn.find(filters.checkInQuery).sort({ date: -1, meal: 1, userId: 1 }).limit(1000).lean()
        ]);
        res.json({ bookings: bookings.map(formatDoc), checkIns: checkIns.map(formatDoc), filters: { from: filters.from, to: filters.to, meal: filters.meal, status: filters.status, search: filters.search }, truncated: bookings.length === 1000 || checkIns.length === 1000 });
    } catch (error) { next(error); }
});

app.get('/api/reports/activity', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        let start = new Date();
        start.setDate(start.getDate() - 29);
        const defaultFrom = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
        const from = req.query.from || defaultFrom;
        const to = req.query.to || todayString();
        const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        if (!isValidDateKey(from) || !isValidDateKey(to) || from > to || search.length > 80) return res.status(400).json({ message: 'Choose a valid range and search text up to 80 characters.' });
        const begin = new Date(`${from}T00:00:00`);
        const finish = new Date(`${to}T23:59:59.999`);
        const query = { createdAt: { $gte: begin, $lte: finish } };
        if (search) query.$or = [{ actorId: safeSearchRegex(search) }, { action: safeSearchRegex(search) }, { actorRole: safeSearchRegex(search) }];
        const records = await ActivityLog.find(query).sort({ createdAt: -1 }).limit(500).lean();
        res.json({ records: records.map(formatDoc), truncated: records.length === 500 });
    } catch (error) { next(error); }
});

app.get('/api/reports/activity.csv', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const from = req.query.from;
        const to = req.query.to;
        const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        if (!isValidDateKey(from) || !isValidDateKey(to) || from > to || search.length > 80) return res.status(400).json({ message: 'Choose a valid range and search text up to 80 characters.' });
        const query = { createdAt: { $gte: new Date(`${from}T00:00:00`), $lte: new Date(`${to}T23:59:59.999`) } };
        if (search) query.$or = [{ actorId: safeSearchRegex(search) }, { action: safeSearchRegex(search) }, { actorRole: safeSearchRegex(search) }];
        const records = await ActivityLog.find(query).sort({ createdAt: -1 }).limit(10000).lean();
        sendCsv(res, 'messmate-activity.csv', [['timestamp', 'userId', 'role', 'method', 'action', 'status'], ...records.map(row => [row.createdAt?.toISOString(), row.actorId, row.actorRole, row.method, row.action, row.statusCode])]);
    } catch (error) { next(error); }
});

app.get('/api/reports/bookings.csv', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const filters = operationalReportFilters(req.query);
        if (filters.error) return res.status(400).json({ message: filters.error });
        const bookings = await Booking.find(filters.bookingQuery).sort({ date: -1, meal: 1 }).limit(10000).lean();
        const lines = [['date', 'meal', 'studentId', 'status'], ...bookings.map(row => [row.date, row.meal, row.userId, row.status])];
        res.type('text/csv').attachment('messmate-bookings.csv').send(lines.map(line => line.map(csvCell).join(',')).join('\r\n'));
    } catch (error) { next(error); }
});

function sendCsv(res, filename, rows) {
    res.type('text/csv').attachment(filename).send(rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
}

app.get('/api/reports/check-ins.csv', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const filters = operationalReportFilters(req.query);
        if (filters.error) return res.status(400).json({ message: filters.error });
        const rows = await CheckIn.find(filters.checkInQuery).sort({ date: -1, meal: 1 }).limit(10000).lean();
        sendCsv(res, 'messmate-check-ins.csv', [['date', 'meal', 'studentId', 'checkedInBy', 'checkedInAt'], ...rows.map(row => [row.date, row.meal, row.userId, row.checkedInBy, row.checkedInAt?.toISOString()])]);
    } catch (error) { next(error); }
});

app.get('/api/reports/complaints.csv', requireAuth, requireAnyRole('staff', 'manager', 'admin'), async (req, res, next) => {
    try {
        const rows = await Complaint.find({}).sort({ timestamp: -1 }).lean();
        sendCsv(res, 'messmate-complaints.csv', [['submittedAt', 'studentId', 'meal', 'subject', 'status'], ...rows.map(row => [row.timestamp?.toISOString(), row.userId, row.meal, row.subject, row.status])]);
    } catch (error) { next(error); }
});

app.get('/api/reports/inventory.csv', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const rows = await InventoryItem.find({}).sort({ name: 1 }).lean();
        sendCsv(res, 'messmate-inventory.csv', [['item', 'unit', 'quantity', 'minimumQuantity', 'supplier', 'lowStock'], ...rows.map(row => [row.name, row.unit, row.quantity, row.minimumQuantity, row.supplier, row.quantity <= row.minimumQuantity])]);
    } catch (error) { next(error); }
});

app.get('/api/reports/expenses.csv', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const orders = await PurchaseOrder.find({}).sort({ createdAt: -1 }).lean();
        const rows = [['orderId', 'orderedAt', 'receivedAt', 'supplier', 'item', 'quantity', 'unitPriceINR', 'lineTotalINR', 'status', 'recordedBy']];
        for (const order of orders) {
            for (const item of order.items || []) {
                const hasUnitPrice = Number.isFinite(item.unitPrice);
                rows.push([
                    order._id.toString(),
                    order.createdAt?.toISOString(),
                    order.receivedAt?.toISOString() || '',
                    order.supplierName,
                    item.itemName,
                    item.quantity,
                    hasUnitPrice ? item.unitPrice : '',
                    hasUnitPrice ? (item.unitPrice * item.quantity).toFixed(2) : '',
                    order.status,
                    order.createdBy
                ]);
            }
        }
        sendCsv(res, 'messmate-purchase-expenses.csv', rows);
    } catch (error) { next(error); }
});

app.get('/api/reports/waste.csv', requireAuth, requireAnyRole('manager', 'admin'), async (req, res, next) => {
    try {
        const rows = await WasteLog.find({}).sort({ date: -1 }).lean();
        sendCsv(res, 'messmate-waste.csv', [['date', 'meal', 'category', 'kilograms', 'co2ePerKg', 'factorSource', 'estimatedKgCo2e', 'note', 'recordedBy'], ...rows.map(row => [row.date, row.meal, row.category, row.kilograms, row.co2ePerKg ?? '', row.factorSource || '', Number.isFinite(row.co2ePerKg) && row.factorSource ? (row.kilograms * row.co2ePerKg).toFixed(3) : '', row.note, row.actorId])]);
    } catch (error) { next(error); }
});

app.get('/api/reports/fees.csv', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const month = req.query.month || currentMonthKey();
        if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ message: 'Use a month in YYYY-MM format.' });
        const rows = await Payment.find({ month }).sort({ userId: 1 }).lean();
        sendCsv(res, `messmate-fees-${month}.csv`, [['month', 'studentId', 'amount', 'currency', 'status', 'provider', 'createdAt', 'paidAt'], ...rows.map(row => [row.month, row.userId, row.amount, row.currency, row.status, row.provider, row.createdAt?.toISOString(), row.paidAt?.toISOString()])]);
    } catch (error) { next(error); }
});

app.get('/api/users', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.type && req.query.type !== 'all') {
            if (!['student', 'staff', 'manager', 'admin'].includes(req.query.type)) return res.status(400).json({ message: 'Choose a valid role filter.' });
            filter.type = req.query.type;
        }
        const users = await User.find(filter).select('userId type createdAt walletBalance').sort({ type: 1, userId: 1 }).limit(500).lean();
        res.json({ users });
    } catch (error) { next(error); }
});

app.post('/api/users', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { userId, password, type } = req.body;
        if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{3,32}$/.test(userId) || typeof password !== 'string' || password.length < 12 || password.length > 200 || !['student', 'staff', 'manager', 'admin'].includes(type)) {
            return res.status(400).json({ message: 'Use a 3–32 character ID, a password of at least 12 characters, and a valid role.' });
        }
        const user = await User.create({ userId, password: await hashPassword(password), type });
        res.status(201).json({ user: publicUser(user) });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'That user ID is already in use.' });
        next(error);
    }
});

app.patch('/api/users/:userId/role', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { type } = req.body;
        if (!['student', 'staff', 'manager', 'admin'].includes(type)) return res.status(400).json({ message: 'Choose a valid account role.' });
        const user = await User.findOne({ userId: req.params.userId });
        if (!user) return res.status(404).json({ message: 'Account not found.' });
        if (user.type === 'admin' && type !== 'admin' && await User.countDocuments({ type: 'admin' }) <= 1) {
            return res.status(409).json({ message: 'At least one administrator account must remain.' });
        }
        user.type = type;
        await user.save();
        res.json({ user: publicUser(user) });
    } catch (error) { next(error); }
});

app.put('/api/users/:userId/password', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { password } = req.body;
        if (typeof password !== 'string' || password.length < 12 || password.length > 200) return res.status(400).json({ message: 'Use a password with at least 12 characters.' });
        const user = await User.findOne({ userId: req.params.userId });
        if (!user) return res.status(404).json({ message: 'Account not found.' });
        user.password = await hashPassword(password);
        await user.save();
        await Session.deleteMany({ userId: user.userId });
        res.json({ message: 'Password updated. Existing sessions for this account were signed out.' });
    } catch (error) { next(error); }
});

app.post('/api/users/:userId/wallet/credit', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const amount = Number(req.body.amount);
        const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
        if (!Number.isFinite(amount) || amount <= 0 || amount > 100000 || !note || note.length > 200) {
            return res.status(400).json({ message: 'Enter a positive wallet credit up to Rs. 100,000 and a note.' });
        }
        const user = await User.findOneAndUpdate({ userId: req.params.userId, type: 'student' }, { $inc: { walletBalance: amount } }, { returnDocument: 'after', runValidators: true });
        if (!user) return res.status(404).json({ message: 'Student account not found.' });
        await WalletTransaction.create({ userId: user.userId, kind: 'credit', amount, balanceAfter: user.walletBalance, note, actorId: req.user.userId, reference: `admin-credit-${crypto.randomBytes(6).toString('hex')}` });
        res.status(201).json({ userId: user.userId, walletBalance: user.walletBalance });
    } catch (error) { next(error); }
});

app.get('/api/wallet/me', requireAuth, requireRole('student'), async (req, res, next) => {
    try {
        const [user, transactions] = await Promise.all([
            User.findOne({ userId: req.user.userId }).select('walletBalance').lean(),
            WalletTransaction.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(50).lean()
        ]);
        res.json({ balance: user?.walletBalance || 0, transactions: transactions.map(formatDoc), note: 'This demo ledger tracks administrator-entered credits and fee debits. It does not hold or transfer real money.' });
    } catch (error) { next(error); }
});

app.get('/api/dashboard/summary', requireAuth, async (req, res, next) => {
    try {
        if (!['staff', 'manager', 'admin'].includes(req.user.type)) {
            return res.status(403).json({ message: 'You do not have access to dashboard summaries.' });
        }

        res.json(await dashboardSummary());
    } catch (error) {
        next(error);
    }
});

app.get('/api/dashboard/hostels', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        res.json({ hostels: await hostelBreakdown() });
    } catch (error) {
        next(error);
    }
});

app.get('/api/payments/me', requireAuth, requireRole('student'), async (req, res, next) => {
    try {
        const month = currentMonthKey();
        const [currentPayment, history] = await Promise.all([
            Payment.findOne({ userId: req.user.userId, month }).lean(),
            Payment.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(12).lean()
        ]);

        res.json({
            gateway: hasRazorpayConfig() ? 'razorpay' : 'demo',
            keyId: hasRazorpayConfig() ? RAZORPAY_KEY_ID : null,
            bill: paymentBill(currentPayment ? formatDoc(currentPayment) : null, req.user.userId),
            history: history.map(payment => paymentBill(formatDoc(payment), req.user.userId))
        });
    } catch (error) {
        next(error);
    }
});

function receiptHtmlEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}

app.get('/api/payments/:paymentId/receipt', requireAuth, requireRole('student'), async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.paymentId)) return res.status(404).send('Receipt not found.');
        const payment = await Payment.findOne({ _id: req.params.paymentId, userId: req.user.userId, status: 'paid' }).lean();
        if (!payment) return res.status(404).send('Receipt not found.');
        const rows = [
            ['Receipt number', payment.paymentId || payment.orderId],
            ['Student ID', payment.userId],
            ['Fee period', monthLabel(payment.month)],
            ['Amount paid', `${payment.currency} ${Number(payment.amount).toFixed(2)}`],
            ['Payment method', payment.provider === 'demo' ? 'Demo (no money transferred)' : payment.provider === 'wallet' ? 'MessMate wallet ledger' : 'Razorpay'],
            ['Status', 'Paid'],
            ['Paid at', payment.paidAt ? new Date(payment.paidAt).toLocaleString() : 'Date unavailable']
        ];
        const receiptNote = payment.provider === 'demo' || payment.provider === 'wallet' ? 'Academic demo receipt. No money was transferred.' : 'Payment verified by MessMate.';
        const content = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MessMate receipt · ${receiptHtmlEscape(payment.month)}</title><style>body{font:16px/1.5 system-ui,sans-serif;color:#20352b;background:#f3f7f4;margin:0;padding:2rem}.receipt{max-width:680px;margin:2rem auto;background:#fff;padding:2rem;border:1px solid #dce6df;border-radius:16px}.brand{color:#176146;font-size:1.4rem;font-weight:750}h1{margin:.4rem 0 1.5rem}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.8rem .4rem;border-bottom:1px solid #e3ebe5}th{width:38%;color:#58695f}.note{margin-top:1.2rem;color:#596b61;font-size:.9rem}button{margin-top:1.5rem;padding:.8rem 1rem;border:0;border-radius:9px;background:#176146;color:white;font:inherit;font-weight:700;cursor:pointer}@media print{body{background:#fff;padding:0}.receipt{margin:0 auto;border:0;box-shadow:none}button{display:none}}</style></head><body><main class="receipt"><div class="brand">MessMate</div><h1>Mess fee receipt</h1><table><tbody>${rows.map(([label, value]) => `<tr><th scope="row">${receiptHtmlEscape(label)}</th><td>${receiptHtmlEscape(value)}</td></tr>`).join('')}</tbody></table><p class="note">${receiptNote}</p><button type="button" onclick="window.print()">Print / save as PDF</button></main></body></html>`;
        res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
        res.set('X-Content-Type-Options', 'nosniff');
        res.type('html').send(content);
    } catch (error) { next(error); }
});

app.post('/api/payments/checkout', paymentRateLimiter, requireAuth, requireRole('student'), async (req, res, next) => {
    try {
        const month = currentMonthKey();
        const existingPaid = await Payment.findOne({ userId: req.user.userId, month, status: 'paid' }).lean();

        if (existingPaid) {
            return res.json({
                alreadyPaid: true,
                gateway: existingPaid.provider,
                bill: paymentBill(formatDoc(existingPaid), req.user.userId)
            });
        }

        const provider = hasRazorpayConfig() ? 'razorpay' : 'demo';
        let orderId = `demo_order_${crypto.randomBytes(10).toString('hex')}`;
        let order = {
            id: orderId,
            amount: MESS_MONTHLY_FEE * 100,
            currency: 'INR'
        };

        if (provider === 'razorpay') {
            order = await razorpayClient().orders.create({
                amount: MESS_MONTHLY_FEE * 100,
                currency: 'INR',
                receipt: `mess_${req.user.userId}_${month}`,
                notes: {
                    userId: req.user.userId,
                    month
                }
            });
            orderId = order.id;
        }

        const payment = await Payment.findOneAndUpdate(
            { userId: req.user.userId, month },
            {
                userId: req.user.userId,
                month,
                amount: MESS_MONTHLY_FEE,
                currency: 'INR',
                status: 'created',
                provider,
                orderId,
                createdAt: new Date()
            },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );

        res.json({
            gateway: provider,
            keyId: provider === 'razorpay' ? RAZORPAY_KEY_ID : null,
            order,
            bill: paymentBill(formatDoc(payment), req.user.userId)
        });
    } catch (error) {
        next(error);
    }
});

app.post('/api/payments/verify', paymentRateLimiter, requireAuth, requireRole('student'), async (req, res, next) => {
    try {
        const { paymentRecordId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const payment = await Payment.findOne({ _id: paymentRecordId, userId: req.user.userId });

        if (!payment) {
            return res.status(404).json({ message: 'Payment record not found.' });
        }

        if (payment.status === 'paid') {
            return res.json({ bill: paymentBill(formatDoc(payment), req.user.userId) });
        }

        if (payment.provider === 'razorpay') {
            if (!hasRazorpayConfig()) {
                return res.status(503).json({ message: 'Razorpay verification is not configured on this server.' });
            }
            if (typeof razorpay_signature !== 'string' || typeof razorpay_payment_id !== 'string') {
                return res.status(400).json({ message: 'Payment verification details are incomplete.' });
            }
            const expectedSignature = crypto
                .createHmac('sha256', RAZORPAY_KEY_SECRET)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest('hex');

            const expectedBuffer = Buffer.from(expectedSignature, 'hex');
            const actualBuffer = Buffer.from(razorpay_signature, 'hex');
            if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer) || payment.orderId !== razorpay_order_id) {
                payment.status = 'failed';
                await payment.save();
                return res.status(400).json({ message: 'Payment verification failed.' });
            }

            payment.paymentId = razorpay_payment_id;
            payment.signature = razorpay_signature;
        } else {
            payment.paymentId = `demo_pay_${crypto.randomBytes(10).toString('hex')}`;
            payment.signature = 'demo';
        }

        payment.status = 'paid';
        payment.paidAt = new Date();
        await payment.save();

        res.json({ bill: paymentBill(formatDoc(payment), req.user.userId) });
    } catch (error) {
        next(error);
    }
});

app.post('/api/payments/wallet', paymentRateLimiter, requireAuth, requireRole('student'), async (req, res, next) => {
    let debitedBalance;
    let debitedAmount;
    let transactionId;
    try {
        const month = currentMonthKey();
        const payment = await Payment.findOneAndUpdate(
            { userId: req.user.userId, month },
            { $setOnInsert: { userId: req.user.userId, month, amount: MESS_MONTHLY_FEE, currency: 'INR', status: 'created', provider: 'demo', orderId: `fee_${req.user.userId}_${month}` } },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        ).lean();
        if (payment.status === 'paid') return res.json({ bill: paymentBill(payment, req.user.userId) });

        const user = await User.findOneAndUpdate(
            { userId: req.user.userId, type: 'student', walletBalance: { $gte: payment.amount } },
            { $inc: { walletBalance: -payment.amount } },
            { returnDocument: 'after' }
        ).lean();
        if (!user) return res.status(409).json({ message: 'Your wallet balance is too low to pay this month’s fee.' });
        debitedBalance = user.walletBalance;
        debitedAmount = payment.amount;

        const reference = `fee-wallet-${payment._id}`;
        const ledger = await WalletTransaction.create({
            userId: req.user.userId,
            kind: 'fee_payment',
            amount: payment.amount,
            balanceAfter: user.walletBalance,
            note: `Mess fee for ${monthLabel(month)}`,
            actorId: req.user.userId,
            reference
        });
        transactionId = ledger._id;

        const paid = await Payment.findOneAndUpdate(
            { _id: payment._id, status: { $ne: 'paid' } },
            { $set: { status: 'paid', provider: 'wallet', orderId: `wallet_${payment._id}`, paymentId: reference, signature: 'internal-wallet-ledger', paidAt: new Date() } },
            { returnDocument: 'after' }
        ).lean();
        if (!paid) {
            await WalletTransaction.deleteOne({ _id: transactionId });
            transactionId = null;
            await User.updateOne({ userId: req.user.userId }, { $inc: { walletBalance: payment.amount } });
            debitedBalance = undefined;
            debitedAmount = undefined;
            const currentPayment = await Payment.findById(payment._id).lean();
            if (currentPayment?.status === 'paid') return res.json({ bill: paymentBill(currentPayment, req.user.userId) });
            return res.status(409).json({ message: 'The fee record changed while you were paying. Refresh and try again.' });
        }
        debitedBalance = undefined;
        debitedAmount = undefined;
        transactionId = null;
        res.json({ bill: paymentBill(paid, req.user.userId), walletBalance: user.walletBalance });
    } catch (error) {
        if (transactionId) await WalletTransaction.deleteOne({ _id: transactionId }).catch(() => {});
        if (Number.isFinite(debitedBalance) && Number.isFinite(debitedAmount)) await User.updateOne({ userId: req.user.userId }, { $inc: { walletBalance: debitedAmount } }).catch(() => {});
        next(error);
    }
});

app.get('/api/payments/admin', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        res.json(await paymentAdminSummary(req.query.month || currentMonthKey()));
    } catch (error) {
        next(error);
    }
});

app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ message: 'Server error. Please try again.' });
});

function formatDoc(doc) {
    const item = doc.toObject ? doc.toObject() : doc;
    return {
        ...item,
        id: item._id?.toString(),
        _id: undefined,
        __v: undefined
    };
}

function formatComplaintDoc(doc) {
    const item = doc.toObject ? doc.toObject() : { ...doc };
    delete item.attachmentData;
    return { ...formatDoc(item), hasAttachment: Boolean(item.hasAttachment && item.attachmentMimeType) };
}

mongoose.connect(MONGODB_URI)
    .then(seedDatabase)
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`MessMate listening on port ${PORT}`);
            console.log('MongoDB connected.');
        });
    })
    .catch(error => {
        console.error('MongoDB connection failed.');
        console.error('Check MONGODB_URI and ensure the database is reachable.');
        process.exit(1);
    });

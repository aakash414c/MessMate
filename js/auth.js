let currentLoginType = 'student';

function showLoginModal(type = 'student') {
    const modal = document.getElementById('loginModal');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    switchLoginType(type);
}

function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.getElementById('userId').value = '';
    document.getElementById('password').value = '';
}

function toggleMobileMenu(shouldOpen) {
    const navLinks = document.querySelector('.nav-links');
    const toggle = document.querySelector('.nav-toggle');

    if (!navLinks || !toggle) return;

    const isOpen = typeof shouldOpen === 'boolean' ? shouldOpen : !navLinks.classList.contains('is-open');
    navLinks.classList.toggle('is-open', isOpen);
    toggle.classList.toggle('is-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
}

document.querySelector('.nav-links')?.addEventListener('click', event => {
    if (event.target.closest('a')) toggleMobileMenu(false);
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.querySelector('.nav-links.is-open')) toggleMobileMenu(false);
});

window.onclick = function(event) {
    if (event.target === document.getElementById('loginModal')) closeLoginModal();
};

function switchLoginType(type) {
    currentLoginType = type;

    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });

    const hints = {
        student: 'Example: 240010130009',
        staff: 'Example: BH4256854',
        manager: 'Example: BH4256838',
        admin: 'Example: BH4256836'
    };
    document.getElementById('userIdHint').textContent = hints[type] || '';
}

async function handleLogin(event) {
    event.preventDefault();

    const userId = document.getElementById('userId').value.trim();
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberMe').checked;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, password, type: currentLoginType })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || 'Login failed.');
            return;
        }

        const userInfo = { ...data.user, loginTime: new Date().toISOString() };
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('userInfo', JSON.stringify(userInfo));

        if (currentLoginType === 'student') {
            window.location.href = 'student-dashboard.html';
        } else if (currentLoginType === 'manager') {
            window.location.href = 'manager-dashboard.html';
        } else if (currentLoginType === 'staff') {
            window.location.href = 'staff-dashboard.html';
        } else {
            window.location.href = 'admin-dashboard.html';
        }
    } catch (error) {
        alert('Backend is not running. Start the project with npm start.');
    }
}

async function handleSignup(event) {
    event.preventDefault();
    const userId = document.getElementById('signupStudentId').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const message = document.getElementById('signupMessage');
    const submit = document.getElementById('signupSubmit');
    if (password !== confirmPassword) {
        message.textContent = 'The passwords do not match.';
        return;
    }
    message.textContent = 'Creating your account…';
    submit.disabled = true;
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to create the account.');
        sessionStorage.setItem('userInfo', JSON.stringify({ ...data.user, loginTime: new Date().toISOString() }));
        message.textContent = 'Account created. Opening your student dashboard…';
        window.location.href = 'student-dashboard.html';
    } catch (error) {
        message.textContent = error.message || 'Unable to connect to MessMate.';
    } finally {
        submit.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    if (sessionStorage.getItem('openStudentLogin') === 'true') {
        sessionStorage.removeItem('openStudentLogin');
        showLoginModal('student');
    }
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));

            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }

            const navLinks = document.querySelector('.nav-links');
            const toggle = document.querySelector('.nav-toggle');
            if (navLinks && toggle) {
                navLinks.classList.remove('is-open');
                toggle.classList.remove('is-open');
                toggle.setAttribute('aria-expanded', 'false');
            }
        });
    });
});

const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const ADMIN_REQUESTED_WITH = 'grok2api-admin';

function sanitizeRedirect(raw) {
  const fallback = '/admin/token';
  const value = String(raw || '').trim();
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  return value || fallback;
}

function getRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  return sanitizeRedirect(params.get('redirect'));
}

async function checkSessionAndRedirect() {
  try {
    const response = await fetch('/api/v1/admin/session', {
      method: 'GET',
      credentials: 'include',
      headers: { 'X-Requested-With': ADMIN_REQUESTED_WITH },
    });
    if (response.ok) {
      window.location.href = getRedirectTarget();
    }
  } catch (e) {
    // ignore
  }
}

async function login() {
  const username = (usernameInput.value || '').trim();
  const password = (passwordInput.value || '').trim();
  if (!username || !password) return;

  try {
    const res = await fetch('/api/v1/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': ADMIN_REQUESTED_WITH,
      },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      window.location.href = getRedirectTarget();
    } else {
      showToast('用户名或密码错误', 'error');
    }
  } catch (e) {
    showToast('连接失败', 'error');
  }
}

usernameInput.addEventListener('keypress', function (e) {
  if (e.key === 'Enter') passwordInput.focus();
});

passwordInput.addEventListener('keypress', function (e) {
  if (e.key === 'Enter') login();
});

usernameInput.value = 'admin';
passwordInput.focus();
checkSessionAndRedirect();

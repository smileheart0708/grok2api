const ADMIN_REQUESTED_WITH = 'grok2api-admin';

function buildAuthHeaders() {
  return { 'X-Requested-With': ADMIN_REQUESTED_WITH };
}

async function getStoredAppKey() {
  return { username: '', password: '' };
}

async function storeAppKey() {
  return;
}

function clearStoredAppKey() {
  return;
}

function redirectToLogin() {
  window.location.href = '/login';
}

async function ensureApiKey() {
  try {
    const res = await fetch('/api/v1/admin/session', {
      method: 'GET',
      credentials: 'include',
      headers: buildAuthHeaders(),
      cache: 'no-store',
    });
    if (res.ok) return 'cookie-session';
    console.warn('[admin-auth] session check failed with status', res.status);
  } catch (e) {
    console.warn('[admin-auth] session check failed due to network error', e);
  }

  clearStoredAppKey();
  redirectToLogin();
  return null;
}

async function logout() {
  try {
    await fetch('/api/v1/admin/logout', {
      method: 'POST',
      credentials: 'include',
      headers: buildAuthHeaders(),
    });
  } catch (e) { }

  clearStoredAppKey();
  redirectToLogin();
}

async function fetchStorageType() {
  const apiKey = await ensureApiKey();
  if (apiKey === null) return null;

  try {
    const res = await fetch('/api/v1/admin/storage', {
      credentials: 'include',
      headers: buildAuthHeaders(apiKey),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data && data.type) ? String(data.type) : null;
  } catch (e) {
    return null;
  }
}

function formatStorageLabel(type) {
  if (!type) return '-';
  const normalized = type.toLowerCase();
  const map = {
    local: 'local',
    mysql: 'mysql',
    pgsql: 'pgsql',
    postgres: 'pgsql',
    postgresql: 'pgsql',
    d1: 'd1',
    redis: 'redis'
  };
  return map[normalized] || '-';
}

async function updateStorageModeButton() {
  const buttons = Array.from(document.querySelectorAll('#storage-mode-btn, [data-storage-mode-btn]'));
  if (!buttons.length) return;
  buttons.forEach((btn) => {
    btn.textContent = '...';
    btn.title = '存储模式';
    btn.classList.remove('storage-ready');
  });
  const storageType = await fetchStorageType();
  const label = formatStorageLabel(storageType);
  buttons.forEach((btn) => {
    btn.textContent = label === '-' ? label : label.toUpperCase();
    btn.title = '存储模式';
    if (label !== '-') btn.classList.add('storage-ready');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateStorageModeButton);
} else {
  updateStorageModeButton();
}

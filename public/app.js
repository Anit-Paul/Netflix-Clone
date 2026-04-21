const state = {
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null')
};

const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const userBar = document.getElementById('user-bar');
const welcome = document.getElementById('welcome');
const authMessage = document.getElementById('auth-message');
const moviesEl = document.getElementById('movies');
const watchlistEl = document.getElementById('watchlist');

function setLoggedInUi() {
  authSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  userBar.classList.remove('hidden');
  welcome.textContent = `Welcome, ${state.user?.name || 'User'}`;
}

function setLoggedOutUi() {
  authSection.classList.remove('hidden');
  appSection.classList.add('hidden');
  userBar.classList.add('hidden');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function saveAuth(user, token) {
  state.user = user;
  state.token = token;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function clearAuth() {
  state.user = null;
  state.token = '';
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

async function loadMovies(query = '') {
  const data = await api(`/api/movies${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  moviesEl.innerHTML = data.movies
    .map(
      (m) => `<div class="movie">
        <h3>${m.title}</h3>
        <p>${m.genre} • ${m.releaseYear}</p>
        <p>⭐ ${m.rating}</p>
        <button onclick="addToWatchlist(${m.id})">Add to Watchlist</button>
      </div>`
    )
    .join('');
}

async function loadWatchlist() {
  const data = await api('/api/watchlist');
  if (data.watchlist.length === 0) {
    watchlistEl.innerHTML = '<p>No movies in watchlist.</p>';
    return;
  }

  watchlistEl.innerHTML = data.watchlist
    .map(
      (m) => `<div class="movie">
        <h3>${m.title}</h3>
        <p>${m.genre} • ${m.releaseYear}</p>
        <button onclick="removeFromWatchlist(${m.id})">Remove</button>
      </div>`
    )
    .join('');
}

async function refreshApp() {
  await Promise.all([loadMovies(), loadWatchlist()]);
}

window.addToWatchlist = async (movieId) => {
  try {
    await api(`/api/watchlist/${movieId}`, { method: 'POST' });
    await loadWatchlist();
  } catch (error) {
    alert(error.message);
  }
};

window.removeFromWatchlist = async (movieId) => {
  try {
    await api(`/api/watchlist/${movieId}`, { method: 'DELETE' });
    await loadWatchlist();
  } catch (error) {
    alert(error.message);
  }
};

document.getElementById('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const mode = event.submitter?.dataset.mode || 'login';
  const payload = {
    email: document.getElementById('email').value,
    password: document.getElementById('password').value
  };

  if (mode === 'register') {
    payload.name = document.getElementById('name').value;
  }

  try {
    const data = await api(`/api/auth/${mode}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    saveAuth(data.user, data.token);
    authMessage.textContent = '';
    setLoggedInUi();
    await refreshApp();
  } catch (error) {
    authMessage.textContent = error.message;
  }
});

document.getElementById('logout').addEventListener('click', () => {
  clearAuth();
  setLoggedOutUi();
});

document.getElementById('search-btn').addEventListener('click', () => {
  loadMovies(document.getElementById('search').value).catch((error) => alert(error.message));
});

document.getElementById('reset-btn').addEventListener('click', () => {
  document.getElementById('search').value = '';
  loadMovies().catch((error) => alert(error.message));
});

(async function init() {
  if (!state.token || !state.user) {
    setLoggedOutUi();
    return;
  }

  try {
    await api('/api/auth/me');
    setLoggedInUi();
    await refreshApp();
  } catch (_error) {
    clearAuth();
    setLoggedOutUi();
  }
})();

const routes = {};
let notFoundHandler = () => { document.getElementById('app-root').innerHTML = '<p>Página não encontrada.</p>'; };

export function route(path, handler) {
  routes[path] = handler;
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

export function navigate(path) {
  window.location.hash = path;
}

async function render() {
  // Supabase's magic-link callback delivers the session as a URL hash
  // fragment (#access_token=...&refresh_token=...). That's not a route —
  // if we treat it as one and rewrite the hash, we destroy the token
  // before supabase-js gets a chance to read it. Let it be; main.js's
  // onAuthStateChange listener will navigate once the session is set.
  if (window.location.hash.includes('access_token=')) return;

  const path = window.location.hash.slice(1) || '/';
  const handler = routes[path];
  if (handler) {
    await handler();
  } else {
    notFoundHandler();
  }
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') render();
}

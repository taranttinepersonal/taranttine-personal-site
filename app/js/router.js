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

let initialRenderDone = false;

async function render() {
  // Supabase's magic-link callback delivers the session either as a URL
  // hash fragment (#access_token=...&refresh_token=..., implicit flow) or
  // as a query param (?code=..., PKCE flow — the default for this project).
  // Neither is a route — if we treat it as one and rewrite the hash/route
  // before supabase-js has read it, we can race the code exchange. Let it
  // be; main.js's onAuthStateChange listener will navigate once the
  // session is set.
  //
  // The ?code= check only applies to the very first render (page load).
  // supabase-js strips it from the URL once the exchange completes, but
  // timing isn't guaranteed — checking it on every render risked getting
  // stuck on a blank screen forever if the param lingered a moment too long.
  if (window.location.hash.includes('access_token=')) return;
  const isInitialRender = !initialRenderDone;
  initialRenderDone = true;
  if (isInitialRender && new URLSearchParams(window.location.search).has('code')) return;

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

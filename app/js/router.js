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

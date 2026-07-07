import { route, setNotFound, startRouter, navigate } from '../../app/js/router.js';
import { getSession, getProfile, onAuthStateChange, signOut } from '../../app/js/auth.js';
import { renderLogin } from '../../app/js/pages/login.js';
import { renderClients } from './pages/clients.js';
import { renderWorkoutEditor } from './pages/workoutEditor.js';
import { renderAnnouncements } from './pages/announcements.js';
import { renderDiet } from './pages/diet.js';

const NAV_ITEMS = [
  { path: '/clientes', label: 'Clientes' },
  { path: '/avisos', label: 'Avisos' },
];

function renderShell(activePath, contentHtmlOrRenderer) {
  const root = document.getElementById('app-root');
  root.innerHTML = `
    <div class="admin-shell">
      <div class="admin-nav">
        ${NAV_ITEMS.map(item => `<a href="#${item.path}" class="${activePath.startsWith(item.path) ? 'active' : ''}">${item.label}</a>`).join('')}
        <a href="#" id="admin-logout" style="flex:0 0 auto;padding:14px 16px;">Sair</a>
      </div>
      <div class="admin-main" id="admin-main"></div>
    </div>
  `;
  document.getElementById('admin-logout').addEventListener('click', (e) => { e.preventDefault(); signOut(); });
  return document.getElementById('admin-main');
}

async function requireTrainer() {
  const session = await getSession();
  if (!session) { navigate('/login'); return null; }
  const profile = await getProfile();
  if (!profile || profile.role !== 'trainer') {
    window.location.href = '/app/';
    return null;
  }
  return session;
}

route('/', async () => navigate('/clientes'));

route('/login', async () => {
  const session = await getSession();
  if (session) return navigate('/clientes');
  renderLogin();
});

route('/clientes', async () => {
  if (!(await requireTrainer())) return;
  const main = renderShell('/clientes');
  renderClients(main);
});

route('/avisos', async () => {
  if (!(await requireTrainer())) return;
  const main = renderShell('/avisos');
  renderAnnouncements(main);
});

// dynamic routes: /cliente/<id>/treino, /cliente/<id>/dieta — handled via setNotFound below,
// since router.js only dispatches exact static-path matches.
async function handleDynamicRoutes() {
  const hash = window.location.hash.slice(1) || '/';
  const treinoMatch = hash.match(/^\/cliente\/([^/]+)\/treino$/);
  const dietaMatch = hash.match(/^\/cliente\/([^/]+)\/dieta$/);
  if (treinoMatch) {
    if (!(await requireTrainer())) return;
    const main = renderShell('/clientes');
    renderWorkoutEditor(main, treinoMatch[1]);
  } else if (dietaMatch) {
    if (!(await requireTrainer())) return;
    const main = renderShell('/clientes');
    renderDiet(main, dietaMatch[1]);
  }
}

setNotFound(async () => {
  await handleDynamicRoutes();
});

onAuthStateChange((session) => {
  const hash = window.location.hash.slice(1) || '/';
  if (session && hash !== '/clientes' && !hash.startsWith('/cliente') && hash !== '/avisos') navigate('/clientes');
  if (!session && hash === '/clientes') navigate('/login');
});

startRouter();

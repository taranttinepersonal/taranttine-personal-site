import { route, setNotFound, startRouter, navigate } from './router.js';
import { getSession, getProfile, onAuthStateChange } from './auth.js';
import { renderLogin } from './pages/login.js';
import { renderWorkout } from './pages/workout.js';
import { renderProgress } from './pages/progresso.js';
import { renderReferrals } from './pages/indicacao.js';

// The trainer logs in through this same /app/ form (Supabase's redirect
// allow-list only reliably resolves to /app/, not /admin/, regardless of
// what emailRedirectTo requests) — so once a session exists, check the
// role and bounce trainers to the admin panel with a full navigation
// instead of assuming every logged-in user is a client.
async function goToClientOrAdmin() {
  const profile = await getProfile();
  if (profile?.role === 'trainer') {
    window.location.href = '/admin/';
    return;
  }
  navigate('/treino');
}

route('/', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  goToClientOrAdmin();
});

route('/login', async () => {
  const session = await getSession();
  if (session) return goToClientOrAdmin();
  renderLogin();
});

route('/treino', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  renderWorkout(session);
});

route('/progresso', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  renderProgress(session);
});

route('/indicacao', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  renderReferrals(session);
});

setNotFound(() => navigate('/'));

onAuthStateChange((session) => {
  const hash = window.location.hash.slice(1) || '/';
  if (session && (hash === '/login' || hash === '/')) goToClientOrAdmin();
  if (!session && hash !== '/login') navigate('/login');
});

startRouter();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app/sw.js').catch((err) => {
      console.error('sw registration failed', err);
    });
  });
}

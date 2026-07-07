import { route, setNotFound, startRouter, navigate } from './router.js';
import { getSession, onAuthStateChange } from './auth.js';
import { renderLogin } from './pages/login.js';
import { renderWorkout } from './pages/workout.js';

route('/', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  navigate('/treino');
});

route('/login', async () => {
  const session = await getSession();
  if (session) return navigate('/treino');
  renderLogin();
});

route('/treino', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  renderWorkout(session);
});

setNotFound(() => navigate('/'));

onAuthStateChange((session) => {
  const hash = window.location.hash.slice(1) || '/';
  if (session && (hash === '/login' || hash === '/')) navigate('/treino');
  if (!session && hash !== '/login') navigate('/login');
});

startRouter();

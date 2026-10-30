import { route, setNotFound, startRouter, navigate } from './router.js';
import { getSession, getProfile, onAuthStateChange } from './auth.js';
import { renderLogin } from './pages/login.js';
import { renderWorkout } from './pages/workout.js';
import { renderProgress } from './pages/progresso.js';
import { renderReferrals } from './pages/indicacao.js';
import { renderDiet } from './pages/dieta.js';
import { renderAnamnese } from './pages/anamnese.js';
import { renderNutricao } from './pages/nutricao.js';
import { renderAnamneseNutri } from './pages/anamneseNutri.js';
import { renderCheckin } from './pages/checkin.js';
import { renderTermo } from './pages/termo.js';
import { renderExames } from './pages/exames.js';
import { plano50Gate } from './lib/plano50.js';
import { renderPlano50Inicio, renderPlano50Hold, renderPlano50Expirado } from './pages/plano50.js';

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
  // Plano 50 Dias: questionário no primeiro acesso, triagem e fim do acesso.
  // Quem não é do plano (todos os alunos atuais) passa direto.
  const gate = await plano50Gate(session);
  if (gate.state === 'onboard') return navigate('/plano50-inicio');
  if (gate.state === 'hold') return renderPlano50Hold();
  if (gate.state === 'expired') return renderPlano50Expirado();
  renderWorkout(session);
});

route('/plano50-inicio', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  const gate = await plano50Gate(session);
  if (gate.state === 'ok') return navigate('/treino');
  if (gate.state === 'expired') return renderPlano50Expirado();
  if (gate.state === 'hold') return renderPlano50Hold();
  renderPlano50Inicio(session);
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

route('/dieta', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  renderDiet(session);
});

route('/anamnese', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  renderAnamnese(session);
});

route('/nutricao', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  renderNutricao(session);
});

route('/checkin', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  renderCheckin(session);
});

route('/anamnese-nutricional', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  renderAnamneseNutri(session);
});

route('/exames', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  renderExames(session);
});

route('/termo', async () => {
  const session = await getSession();
  if (!session) return navigate('/login');
  renderTermo(session);
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

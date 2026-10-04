// Análise postural por foto: detecção de 33 pontos (MediaPipe Pose, roda no
// navegador), cálculo de ângulos simples por vista e desenho no formato
// "clínico" (grade fina + planos nomeados + marcadores). Tudo é SUGESTÃO pro
// avaliador confirmar — são ângulos 2D de foto de celular, não diagnóstico.

const VISION_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task';

const TEAL = '#2a716c';
const GOLD = '#9c6a1f';

const IDX = {
  nose: 0, earL: 7, earR: 8, shL: 11, shR: 12, hipL: 23, hipR: 24,
  kneeL: 25, kneeR: 26, ankL: 27, ankR: 28,
};

let landmarkerPromise = null;

export function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import(`${VISION_BASE}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${VISION_BASE}/wasm`);
      const options = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'IMAGE',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
      });
      try {
        return await PoseLandmarker.createFromOptions(fileset, options('GPU'));
      } catch (err) {
        return PoseLandmarker.createFromOptions(fileset, options('CPU'));
      }
    })().catch((err) => { landmarkerPromise = null; throw err; });
  }
  return landmarkerPromise;
}

const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export async function detectLandmarks(bitmap) {
  const landmarker = await getLandmarker();
  const result = landmarker.detect(bitmap);
  const lm = result.landmarks?.[0];
  if (!lm) return null;
  return {
    w: bitmap.width,
    h: bitmap.height,
    points: lm.map((p) => [round(p.x), round(p.y), round(p.visibility ?? 1, 2)]),
  };
}

// ---------- métricas ----------

const deg = (r) => (r * 180) / Math.PI;
const round1 = (n) => Math.round(n * 10) / 10;

function pt(det, i) {
  const [x, y, v] = det.points[i];
  return { x: x * det.w, y: y * det.h, v };
}

// ângulo (graus) da reta entre dois pontos em relação à horizontal; positivo
// quando o lado direito da IMAGEM está mais baixo
function tiltDeg(a, b) {
  const [l, r] = a.x <= b.x ? [a, b] : [b, a];
  return deg(Math.atan2(r.y - l.y, r.x - l.x));
}

// desvio angular do joelho em relação ao eixo quadril–tornozelo; off > 0 =
// joelho à direita (na imagem) da reta
function kneeDeflection(hip, knee, ankle) {
  const t = (knee.y - hip.y) / (ankle.y - hip.y);
  const lineX = hip.x + t * (ankle.x - hip.x);
  const off = knee.x - lineX;
  const dUp = Math.max(1, knee.y - hip.y);
  const dLow = Math.max(1, ankle.y - knee.y);
  const angle = deg(Math.atan(Math.abs(off) / dUp)) + deg(Math.atan(Math.abs(off) / dLow));
  return { off, angle };
}

const SHOULDER_TOL = 1.5;
const PELVIS_TOL = 1.5;
const HEAD_TILT_TOL = 2;
const KNEE_TOL = 5;
const HEAD_FORWARD_TOL = 15;

export function computeMetrics(view, det) {
  const m = { view };
  if (view === 'anterior' || view === 'posterior') {
    const sh = [pt(det, IDX.shL), pt(det, IDX.shR)];
    const hip = [pt(det, IDX.hipL), pt(det, IDX.hipR)];
    const ear = [pt(det, IDX.earL), pt(det, IDX.earR)];

    const shoulderTilt = tiltDeg(sh[0], sh[1]);
    const pelvisTilt = tiltDeg(hip[0], hip[1]);
    // lado esquerdo da imagem = lado direito do avaliado na vista anterior
    const imgLeftIsRight = view === 'anterior';
    const higher = (tilt) => {
      const imgLeftHigher = tilt > 0;
      return imgLeftHigher === imgLeftIsRight ? 'direita' : 'esquerda';
    };

    m.shoulders = { tilt: round1(Math.abs(shoulderTilt)), higher: higher(shoulderTilt), flag: Math.abs(shoulderTilt) >= SHOULDER_TOL };
    m.pelvis = { tilt: round1(Math.abs(pelvisTilt)), higher: higher(pelvisTilt), flag: Math.abs(pelvisTilt) >= PELVIS_TOL };

    if (ear[0].v > 0.5 && ear[1].v > 0.5) {
      const t = tiltDeg(ear[0], ear[1]);
      m.head = { tilt: round1(Math.abs(t)), higher: higher(t), flag: Math.abs(t) >= HEAD_TILT_TOL };
    }

    const midX = (hip[0].x + hip[1].x) / 2;
    const knees = [];
    for (const [hi, ki, ai] of [[IDX.hipL, IDX.kneeL, IDX.ankL], [IDX.hipR, IDX.kneeR, IDX.ankR]]) {
      const h = pt(det, hi); const k = pt(det, ki); const a = pt(det, ai);
      const { off, angle } = kneeDeflection(h, k, a);
      const towardMid = Math.sign(midX - h.x);
      const type = off * towardMid > 0 ? 'valgo' : 'varo';
      knees.push({ angle: round1(angle), type, flag: angle >= KNEE_TOL, side: ki === IDX.kneeL ? 'esquerdo' : 'direito' });
    }
    m.knees = knees;

    const shMid = { x: (sh[0].x + sh[1].x) / 2, y: (sh[0].y + sh[1].y) / 2 };
    const hipMid = { x: midX, y: (hip[0].y + hip[1].y) / 2 };
    m.trunkLean = round1(deg(Math.atan2(shMid.x - hipMid.x, hipMid.y - shMid.y)));
  } else {
    const left = ['earL', 'shL', 'hipL', 'kneeL', 'ankL'].reduce((s, k) => s + pt(det, IDX[k]).v, 0);
    const right = ['earR', 'shR', 'hipR', 'kneeR', 'ankR'].reduce((s, k) => s + pt(det, IDX[k]).v, 0);
    const side = left >= right ? 'L' : 'R';
    const ear = pt(det, IDX['ear' + side]);
    const sh = pt(det, IDX['sh' + side]);
    const hip = pt(det, IDX['hip' + side]);
    const knee = pt(det, IDX['knee' + side]);
    const ank = pt(det, IDX['ank' + side]);
    const nose = pt(det, IDX.nose);
    const dir = Math.sign(nose.x - ear.x) || 1;

    const headForward = deg(Math.atan2((ear.x - sh.x) * dir, sh.y - ear.y));
    m.head = { forward: round1(headForward), flag: headForward >= HEAD_FORWARD_TOL };
    m.trunkLean = round1(deg(Math.atan2((sh.x - hip.x) * dir, hip.y - sh.y)));

    const { off, angle } = kneeDeflection(hip, knee, ank);
    const forward = off * dir;
    m.knee = {
      angle: round1(angle),
      type: forward < 0 ? 'hiperextendido' : 'semiflexionado',
      flag: forward < 0 ? angle >= 4 : angle >= KNEE_TOL,
    };

    const height = Math.max(1, ank.y - ear.y);
    const plumb = (p) => round1(((p.x - ank.x) * dir / height) * 100);
    m.plumb = { ear: plumb(ear), shoulder: plumb(sh), hip: plumb(hip), knee: plumb(knee) };
    m.facing = dir > 0 ? 'direita' : 'esquerda';
    m.side = side;
  }
  return m;
}

// Sugestões pro checklist (só o que dá pra inferir com segurança de ângulo 2D).
export function suggestChecklist(analysis) {
  const out = {};
  const ant = analysis.anterior?.metrics || analysis.posterior?.metrics;
  const headAngles = ['lateral_direita', 'lateral_esquerda']
    .map((v) => analysis[v]?.metrics?.head?.forward)
    .filter((n) => typeof n === 'number');

  if (headAngles.length) {
    const avg = headAngles.reduce((a, b) => a + b, 0) / headAngles.length;
    out.cabeca = avg >= HEAD_FORWARD_TOL ? 'Anteriorizada' : 'Neutra';
  }
  if (ant?.shoulders) {
    out.ombros = ant.shoulders.flag
      ? (ant.shoulders.higher === 'direita' ? 'Elevado à direita' : 'Elevado à esquerda')
      : 'Nivelados';
  }
  if (ant?.pelvis) out.quadril = ant.pelvis.flag ? 'Desnivelado' : 'Neutro';

  const kneeFlags = [];
  for (const view of ['anterior', 'posterior']) {
    (analysis[view]?.metrics?.knees || []).forEach((k) => { if (k.flag) kneeFlags.push(k.type); });
  }
  const hyper = ['lateral_direita', 'lateral_esquerda']
    .some((v) => analysis[v]?.metrics?.knee?.flag && analysis[v].metrics.knee.type === 'hiperextendido');
  if (hyper) out.joelhos = 'Hiperextendido';
  else if (kneeFlags.length) out.joelhos = kneeFlags.includes('valgo') ? 'Valgo' : 'Varo';
  else if (ant?.knees) out.joelhos = 'Neutro';
  return out;
}

const fmt = (n) => String(n).replace('.', ',');

// Linhas de texto (resumo humano) das métricas de uma vista.
export function describeMetrics(view, m) {
  const lines = [];
  if (view === 'anterior' || view === 'posterior') {
    lines.push(`Ombros: ${m.shoulders.flag ? `${fmt(m.shoulders.tilt)}° · mais alto à ${m.shoulders.higher}` : `nivelados (${fmt(m.shoulders.tilt)}°)`}`);
    lines.push(`Pelve: ${m.pelvis.flag ? `${fmt(m.pelvis.tilt)}° · mais alta à ${m.pelvis.higher}` : `nivelada (${fmt(m.pelvis.tilt)}°)`}`);
    if (m.head) lines.push(`Cabeça: ${m.head.flag ? `inclinada ${fmt(m.head.tilt)}°` : `alinhada (${fmt(m.head.tilt)}°)`}`);
    m.knees.forEach((k) => lines.push(`Joelho ${k.side}: ${k.flag ? `${k.type} ${fmt(k.angle)}°` : `alinhado (${fmt(k.angle)}°)`}`));
    lines.push(`Tronco: ${fmt(Math.abs(m.trunkLean))}° de inclinação lateral`);
  } else {
    lines.push(`Cabeça: ${m.head.flag ? `anteriorizada (${fmt(m.head.forward)}°)` : `alinhada (${fmt(m.head.forward)}°)`}`);
    lines.push(`Tronco: ${fmt(m.trunkLean)}° de inclinação anterior`);
    lines.push(`Joelho: ${m.knee.flag ? `${m.knee.type} (${fmt(m.knee.angle)}°)` : `alinhado (${fmt(m.knee.angle)}°)`}`);
    lines.push(`Prumo (% da altura): orelha ${fmt(m.plumb.ear)} · ombro ${fmt(m.plumb.shoulder)} · quadril ${fmt(m.plumb.hip)} · joelho ${fmt(m.plumb.knee)}`);
  }
  return lines;
}

// ---------- desenho ----------

const VIEW_TAG = {
  anterior: 'VISTA ANTERIOR',
  posterior: 'VISTA POSTERIOR',
  lateral_direita: 'PERFIL DIREITO',
  lateral_esquerda: 'PERFIL ESQUERDO',
};

export function drawAnnotated(canvas, source, view, det, metrics, { maxWidth = 900 } = {}) {
  const scale = Math.min(1, maxWidth / source.width);
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const s = W / 1125;
  const P = (i) => ({ x: det.points[i][0] * W, y: det.points[i][1] * H });
  const font = (px, weight = 600) => `${weight} ${Math.max(9, px * s)}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;

  ctx.drawImage(source, 0, 0, W, H);

  // grade fina
  const step = 44 * s;
  ctx.strokeStyle = 'rgba(33,95,92,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();

  // cantos
  const inset = 28 * s;
  const arm = 46 * s;
  ctx.strokeStyle = TEAL;
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.beginPath();
  [[inset, inset, 1, 1], [W - inset, inset, -1, 1], [inset, H - inset, 1, -1], [W - inset, H - inset, -1, -1]]
    .forEach(([x, y, dx, dy]) => {
      ctx.moveTo(x + dx * arm, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * arm);
    });
  ctx.stroke();

  // cabeçalho
  ctx.fillStyle = TEAL;
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(30, 700);
  ctx.fillText('ANÁLISE POSTURAL', 60 * s, 66 * s);
  ctx.font = font(19, 500);
  ctx.fillStyle = '#4a8a85';
  ctx.fillText('TARANTTINE PERSONAL', 60 * s, 94 * s);
  ctx.fillStyle = TEAL;
  ctx.textAlign = 'right';
  ctx.font = font(19, 600);
  ctx.fillText(VIEW_TAG[view] || view.toUpperCase(), W - 170 * s, 66 * s);
  ctx.textAlign = 'left';

  const color = (flag) => (flag ? GOLD : TEAL);
  const line = (x1, y1, x2, y2, c, dash) => {
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, s); ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
  };
  const marker = (p, c) => {
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.5, 2.2 * s);
    ctx.beginPath(); ctx.arc(p.x, p.y, 10 * s, 0, Math.PI * 2); ctx.stroke();
  };
  const labels = [];
  const label = (anchor, title, status, flag) => labels.push({ anchor, title, status, flag });
  const extend = (a, b, k) => {
    const dx = b.x - a.x; const dy = b.y - a.y;
    return [{ x: a.x - dx * k, y: a.y - dy * k }, { x: b.x + dx * k, y: b.y + dy * k }];
  };

  if (view === 'anterior' || view === 'posterior') {
    const sh = [P(IDX.shL), P(IDX.shR)];
    const hip = [P(IDX.hipL), P(IDX.hipR)];
    const midX = (P(IDX.ankL).x + P(IDX.ankR).x) / 2;
    line(midX, 90 * s, midX, H - 60 * s, TEAL, [6 * s, 5 * s]);

    const [s1, s2] = extend(sh[0], sh[1], 0.6);
    line(s1.x, s1.y, s2.x, s2.y, color(metrics.shoulders.flag));
    const [h1, h2] = extend(hip[0], hip[1], 0.6);
    line(h1.x, h1.y, h2.x, h2.y, color(metrics.pelvis.flag));
    if (metrics.head) {
      const ear = [P(IDX.earL), P(IDX.earR)];
      const [e1, e2] = extend(ear[0], ear[1], 1.2);
      line(e1.x, e1.y, e2.x, e2.y, color(metrics.head.flag));
      ear.forEach((p) => marker(p, color(metrics.head.flag)));
      label({ x: Math.min(ear[0].x, ear[1].x), y: (ear[0].y + ear[1].y) / 2 }, 'PLANO ÓTICO',
        metrics.head.flag ? `${fmt(metrics.head.tilt)}° · INCLINADO` : 'NIVELADO', metrics.head.flag);
    }
    sh.forEach((p) => marker(p, color(metrics.shoulders.flag)));
    hip.forEach((p) => marker(p, color(metrics.pelvis.flag)));
    label({ x: Math.min(sh[0].x, sh[1].x), y: (sh[0].y + sh[1].y) / 2 }, 'PLANO ACROMIAL',
      metrics.shoulders.flag ? `${fmt(metrics.shoulders.tilt)}° · ELEV. ${metrics.shoulders.higher.toUpperCase()}` : 'NIVELADO', metrics.shoulders.flag);
    label({ x: Math.min(hip[0].x, hip[1].x), y: (hip[0].y + hip[1].y) / 2 }, 'PLANO PÉLVICO',
      metrics.pelvis.flag ? `${fmt(metrics.pelvis.tilt)}° · ALTO ${metrics.pelvis.higher.toUpperCase()}` : 'NIVELADO', metrics.pelvis.flag);
    [IDX.kneeL, IDX.kneeR].forEach((ki, n) => marker(P(ki), color(metrics.knees[n].flag)));
    const kneeFlag = metrics.knees.some((k) => k.flag);
    const worst = metrics.knees.reduce((a, b) => (b.angle > a.angle ? b : a));
    const kx = Math.min(P(IDX.kneeL).x, P(IDX.kneeR).x);
    label({ x: kx, y: (P(IDX.kneeL).y + P(IDX.kneeR).y) / 2 }, 'JOELHOS',
      kneeFlag ? `${worst.type.toUpperCase()} ${fmt(worst.angle)}°` : 'ALINHADOS', kneeFlag);
  } else {
    const side = metrics.side;
    const ear = P(IDX['ear' + side]); const sh = P(IDX['sh' + side]); const hip = P(IDX['hip' + side]);
    const knee = P(IDX['knee' + side]); const ank = P(IDX['ank' + side]);
    line(ank.x, 90 * s, ank.x, H - 60 * s, TEAL, [6 * s, 5 * s]);
    line(sh.x - 180 * s, sh.y, sh.x + 180 * s, sh.y, TEAL);
    line(hip.x - 180 * s, hip.y, hip.x + 180 * s, hip.y, TEAL);
    marker(ear, color(metrics.head.flag));
    marker(sh, TEAL); marker(hip, TEAL);
    marker(knee, color(metrics.knee.flag)); marker(ank, TEAL);
    const leftSide = Math.min(ear.x, sh.x, hip.x, knee.x, ank.x);
    label({ x: leftSide, y: ear.y }, 'CABEÇA',
      metrics.head.flag ? `ANTERIORIZADA ${fmt(metrics.head.forward)}°` : 'ALINHADA', metrics.head.flag);
    label({ x: leftSide, y: sh.y }, 'PLANO ACROMIAL', `TRONCO ${fmt(metrics.trunkLean)}°`, false);
    label({ x: leftSide, y: hip.y }, 'PLANO DO QUADRIL', 'REFERÊNCIA', false);
    label({ x: leftSide, y: knee.y }, 'JOELHO',
      metrics.knee.flag ? `${metrics.knee.type.toUpperCase()} ${fmt(metrics.knee.angle)}°` : 'ALINHADO', metrics.knee.flag);
    label({ x: ank.x, y: ank.y }, 'LINHA DE PRUMO', 'TORNOZELO', false);
  }

  // rótulos na coluna esquerda, com conector fino até o ponto
  const colX = 60 * s;
  let lastY = -Infinity;
  labels.sort((a, b) => a.anchor.y - b.anchor.y).forEach((l) => {
    const y = Math.max(l.anchor.y, lastY + 66 * s);
    lastY = y;
    const c = color(l.flag);
    ctx.fillStyle = c;
    ctx.font = font(25, 700);
    ctx.fillText(l.title, colX, y - 4 * s);
    ctx.font = font(22, 600);
    ctx.fillText(l.status, colX, y + 22 * s);
    const textW = Math.max(ctx.measureText(l.title).width, ctx.measureText(l.status).width);
    line(colX + textW + 8 * s, y, l.anchor.x - 14 * s, l.anchor.y, c);
  });

  return canvas;
}

export async function bitmapFromBlob(blob) {
  return createImageBitmap(blob);
}

// Gera uma imagem (data URL) já anotada a partir de um Blob/URL da foto e da
// análise salva — usado no relatório.
export async function renderAnnotatedDataUrl(blob, view, viewAnalysis, maxWidth = 900) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  drawAnnotated(canvas, bitmap, view, viewAnalysis, viewAnalysis.metrics, { maxWidth });
  return canvas.toDataURL('image/jpeg', 0.9);
}

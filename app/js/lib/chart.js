// Núcleo genérico de gráfico de linha (uma ou mais séries), sem opinião de
// estilo — cada página envolve o SVG retornado com sua própria marcação/CSS.
export function buildTrendChart(seriesList) {
  const usable = seriesList.filter(s => s.points && s.points.length >= 2);
  if (!usable.length) return null;

  const allValues = usable.flatMap(s => s.points.map(p => p.value));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = (max - min) || 1;

  const allDates = usable.flatMap(s => s.points.map(p => p.date)).sort();
  const minDate = new Date(allDates[0] + 'T00:00:00').getTime();
  const maxDate = new Date(allDates[allDates.length - 1] + 'T00:00:00').getTime();
  const sameDay = maxDate === minDate;
  const dateRange = (maxDate - minDate) || 1;

  const w = 600;
  const h = 140;
  const pad = 6;
  // registros todos no mesmo dia: espalha por ordem em vez de empilhar na borda
  const x = (p, i, n) => pad + (sameDay
    ? (n > 1 ? i / (n - 1) : 0.5)
    : (new Date(p.date + 'T00:00:00').getTime() - minDate) / dateRange) * (w - 2 * pad);
  const y = (v) => h - ((v - min) / range) * (h - 30) - 15;

  const lines = usable.map(s => {
    const n = s.points.length;
    const pts = s.points.map((p, i) => `${x(p, i, n)},${y(p.value)}`).join(' ');
    const dots = s.points.map((p, i) => `<circle cx="${x(p, i, n)}" cy="${y(p.value)}" r="3" fill="${s.color}"/>`).join('');
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2"/>${dots}`;
  }).join('');

  return {
    svg: `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:140px;">${lines}</svg>`,
    firstDate: allDates[0],
    lastDate: allDates[allDates.length - 1],
    legend: usable.length > 1 ? usable.map(s => ({ label: s.label, color: s.color })) : null,
  };
}

// Radar/spider chart — usado pro perfil de força relativa (supino, agachamento,
// terra, leg press) na Avaliação. axes: [{label, value}], value na escala 0..max.
export function buildRadarChart(axes, { max = 4, size = 220, color = 'var(--report-accent, #00b894)', gridColor = 'var(--report-border, #ddd)', labelColor = 'var(--report-muted, #666)' } = {}) {
  const usable = axes.filter(a => a.value != null);
  if (usable.length < 3) return null;

  const n = usable.length;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 34;
  const angleFor = (i) => (Math.PI * 2 * i / n) - Math.PI / 2;
  const pointFor = (i, value) => {
    const a = angleFor(i);
    const rad = (Math.min(value, max) / max) * r;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };

  const rings = [0.25, 0.5, 0.75, 1].map(f => {
    const pts = usable.map((_, i) => pointFor(i, max * f).join(',')).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="${gridColor}" stroke-width="1" opacity="0.5"/>`;
  }).join('');

  const axisLines = usable.map((_, i) => {
    const [x, y] = pointFor(i, max);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${gridColor}" stroke-width="1" opacity="0.5"/>`;
  }).join('');

  const valuePts = usable.map((a, i) => pointFor(i, a.value).join(',')).join(' ');
  const valueDots = usable.map((a, i) => {
    const [x, y] = pointFor(i, a.value);
    return `<circle cx="${x}" cy="${y}" r="3" fill="${color}"/>`;
  }).join('');

  const labels = usable.map((a, i) => {
    const [x, y] = pointFor(i, max * 1.2);
    const anchor = Math.abs(x - cx) < 4 ? 'middle' : (x > cx ? 'start' : 'end');
    return `<text x="${x}" y="${y}" font-size="11" text-anchor="${anchor}" dominant-baseline="middle" fill="${labelColor}">${a.label}</text>`;
  }).join('');

  return {
    svg: `<svg viewBox="-70 -8 ${size + 140} ${size + 16}" style="width:100%;max-width:360px;height:auto;display:block;margin:0 auto;">
      ${rings}${axisLines}
      <polygon points="${valuePts}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2"/>
      ${valueDots}${labels}
    </svg>`,
  };
}

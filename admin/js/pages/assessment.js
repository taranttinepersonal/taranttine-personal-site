import { supabase } from '../../../app/js/supabaseClient.js';
import { SKINFOLD_SITES, sumSkinfolds, calcBodyFat } from '../../../app/js/lib/skinfold.js';

const POSTURAL_CHECKLIST = [
  { key: 'cabeca', label: 'Cabeça', hint: 'ex: anteriorizada, neutra' },
  { key: 'ombros', label: 'Ombros', hint: 'ex: elevado à direita, nivelados' },
  { key: 'escapulas', label: 'Escápulas', hint: 'ex: aladas, neutras' },
  { key: 'coluna', label: 'Coluna', hint: 'ex: hipercifose, hiperlordose, escoliose' },
  { key: 'quadril', label: 'Quadril', hint: 'ex: anteversão, retroversão, desnivelado, rotação de sacro' },
  { key: 'joelhos', label: 'Joelhos', hint: 'ex: valgo, varo, hiperextendido, neutro' },
  { key: 'pes', label: 'Pés', hint: 'ex: plano, cavo, pronado, supinado' },
];

const POSTURAL_ANGLES = [
  { key: 'lateral_direita', label: 'Lateral Direita', column: 'foto_lateral_direita' },
  { key: 'lateral_esquerda', label: 'Lateral Esquerda', column: 'foto_lateral_esquerda' },
  { key: 'posterior', label: 'Posterior', column: 'foto_posterior' },
  { key: 'anterior', label: 'Anterior', column: 'foto_anterior' },
];

export async function renderAssessment(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const [{ data: profile }, { data: skinfoldHistory }, { data: posturalHistory }] = await Promise.all([
    supabase.from('profiles').select('full_name, birth_date, sexo').eq('id', clientId).single(),
    supabase.from('skinfold_assessments').select('*').eq('client_id', clientId).order('recorded_at', { ascending: false }),
    supabase.from('postural_assessments')
      .select('id, recorded_at, notes, general_note, foto_anterior, foto_posterior, foto_lateral_direita, foto_lateral_esquerda')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }),
  ]);

  const age = calcAge(profile?.birth_date);

  main.innerHTML = `
    <div class="admin-header">
      <div class="admin-title">${escapeHtml(profile?.full_name || '')} · Avaliação</div>
      <div style="display:flex;gap:8px;">
        <a href="#/clientes" class="admin-btn">← Voltar</a>
        <a href="#/cliente/${clientId}/relatorio" class="admin-btn primary">Ver Relatório</a>
      </div>
    </div>

    <div class="tabs" style="margin-bottom:16px;border-radius:10px;overflow:hidden;">
      <button class="tab-btn active" data-tab="dobras">Dobras Cutâneas</button>
      <button class="tab-btn" data-tab="postural">Avaliação Postural</button>
    </div>

    <div class="tab-content active" id="tab-dobras">
      <div class="admin-card admin-form">
        ${!age ? `<div class="admin-msg error" style="margin-bottom:10px;">Cadastre a data de nascimento em "Dados" pra calcular o %gordura corretamente.</div>` : ''}
        <label>Data da avaliação</label>
        <input type="date" id="sf-date" value="${new Date().toISOString().slice(0, 10)}">
        <label>Sexo</label>
        <select id="sf-sexo">
          <option value="M" ${profile?.sexo === 'M' ? 'selected' : ''}>Masculino</option>
          <option value="F" ${profile?.sexo === 'F' ? 'selected' : ''}>Feminino</option>
        </select>
        <div class="field-row">
          ${SKINFOLD_SITES.map(s => `
            <div>
              <label>${s.label} (mm)</label>
              <input type="number" step="0.1" id="sf-${s.key}" class="sf-input">
            </div>
          `).join('')}
        </div>
        <label>Observação geral</label>
        <textarea id="sf-general" rows="2" placeholder="Outras observações relevantes"></textarea>

        <div class="admin-card" style="background:var(--black3);margin-top:14px;">
          <div class="report-bar-label"><span>Soma das dobras</span><span class="report-bar-value" id="sf-sum">0 mm</span></div>
          <div class="report-bar-label" style="margin-top:6px;"><span>% Gordura estimado</span><span class="report-bar-value" id="sf-bf">—</span></div>
        </div>

        <button class="admin-btn primary" id="sf-save" style="margin-top:12px;">Salvar avaliação</button>
        <div class="admin-msg" id="sf-msg"></div>
      </div>

      <div class="admin-section-title">Histórico</div>
      ${skinfoldHistory && skinfoldHistory.length ? `
        <div class="admin-card">
          ${skinfoldHistory.map(h => {
            const sum = sumSkinfolds(h);
            const result = calcBodyFat({ sexo: h.sexo, age, sum });
            return `
              <div class="admin-row">
                <div>
                  <div class="admin-row-name">${formatDate(h.recorded_at)}</div>
                  <div class="admin-row-sub">Soma: ${round1(sum)}mm${result ? ` · %Gordura: ${round1(result.bodyFatPct)}%` : ''}</div>
                  ${h.general_note ? `<div class="admin-row-sub" style="margin-top:4px;">💬 ${escapeHtml(h.general_note)}</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `<div class="admin-empty">Nenhuma avaliação de dobras registrada ainda.</div>`}
    </div>

    <div class="tab-content" id="tab-postural">
      <div class="admin-card admin-form">
        <label>Data da avaliação</label>
        <input type="date" id="post-date" value="${new Date().toISOString().slice(0, 10)}">

        <label>Fotos (simetrógrafo) — grade de alinhamento aplicada automaticamente</label>
        <div class="postural-photo-grid">
          ${POSTURAL_ANGLES.map(a => `
            <div class="postural-photo-slot">
              <div class="postural-photo-label">${a.label}</div>
              <input type="file" accept="image/*" id="post-photo-${a.key}">
            </div>
          `).join('')}
        </div>

        ${POSTURAL_CHECKLIST.map(item => `
          <label>${item.label}</label>
          <input type="text" id="post-${item.key}" placeholder="${item.hint}">
        `).join('')}
        <label>Observação geral</label>
        <textarea id="post-general" rows="3" placeholder="Outras observações relevantes"></textarea>
        <button class="admin-btn primary" id="post-save" style="margin-top:12px;">Salvar avaliação</button>
        <div class="admin-msg" id="post-msg"></div>
      </div>

      <div class="admin-section-title">Histórico</div>
      ${posturalHistory && posturalHistory.length ? `
        <div class="admin-card">
          ${posturalHistory.map(h => `
            <div class="admin-row">
              <div>
                <div class="admin-row-name">${formatDate(h.recorded_at)}</div>
                <div class="admin-row-sub">${posturalSummary(h.notes)}</div>
                ${h.general_note ? `<div class="admin-row-sub" style="margin-top:4px;">💬 ${escapeHtml(h.general_note)}</div>` : ''}
                ${POSTURAL_ANGLES.some(a => h[a.column]) ? `<div class="admin-row-sub" style="margin-top:4px;">📷 ${POSTURAL_ANGLES.filter(a => h[a.column]).map(a => a.label).join(', ')}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<div class="admin-empty">Nenhuma avaliação postural registrada ainda.</div>`}
    </div>
  `;

  // tabs
  main.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      main.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      main.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // dobras — live preview
  function updatePreview() {
    const values = {};
    for (const s of SKINFOLD_SITES) values[s.key] = document.getElementById(`sf-${s.key}`).value;
    const sum = sumSkinfolds(values);
    document.getElementById('sf-sum').textContent = `${round1(sum)} mm`;
    const sexo = document.getElementById('sf-sexo').value;
    const result = calcBodyFat({ sexo, age, sum });
    document.getElementById('sf-bf').textContent = result ? `${round1(result.bodyFatPct)}%` : (age ? '—' : 'sem data de nascimento');
  }
  main.querySelectorAll('.sf-input').forEach(input => input.addEventListener('input', updatePreview));
  document.getElementById('sf-sexo').addEventListener('change', updatePreview);

  document.getElementById('sf-save').addEventListener('click', async () => {
    const msg = document.getElementById('sf-msg');
    const btn = document.getElementById('sf-save');
    btn.disabled = true;
    msg.textContent = '';
    try {
      const payload = {
        client_id: clientId,
        recorded_at: document.getElementById('sf-date').value,
        sexo: document.getElementById('sf-sexo').value,
        general_note: document.getElementById('sf-general').value.trim() || null,
      };
      for (const s of SKINFOLD_SITES) {
        const val = document.getElementById(`sf-${s.key}`).value;
        payload[s.key] = val ? Number(val) : null;
      }
      // keep profile.sexo in sync so future assessments default correctly
      await supabase.from('profiles').update({ sexo: payload.sexo }).eq('id', clientId);
      const { error } = await supabase.from('skinfold_assessments').insert([payload]);
      if (error) throw error;
      renderAssessment(main, clientId);
    } catch (err) {
      msg.textContent = 'Erro ao salvar: ' + err.message;
      msg.classList.add('error');
      btn.disabled = false;
    }
  });

  // postural
  document.getElementById('post-save').addEventListener('click', async () => {
    const msg = document.getElementById('post-msg');
    const btn = document.getElementById('post-save');
    btn.disabled = true;
    msg.textContent = '';
    try {
      const notes = {};
      for (const item of POSTURAL_CHECKLIST) {
        const val = document.getElementById(`post-${item.key}`).value.trim();
        if (val) notes[item.key] = val;
      }
      const recordedAt = document.getElementById('post-date').value;

      const photoPaths = {};
      for (const a of POSTURAL_ANGLES) {
        const file = document.getElementById(`post-photo-${a.key}`).files[0];
        if (!file) continue;
        const ext = file.name.split('.').pop();
        const path = `${clientId}/postural/${Date.now()}-${a.key}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('progress-photos').upload(path, file);
        if (uploadError) throw uploadError;
        photoPaths[a.column] = path;
      }

      const payload = {
        client_id: clientId,
        recorded_at: recordedAt,
        notes: Object.keys(notes).length ? notes : null,
        general_note: document.getElementById('post-general').value.trim() || null,
        ...photoPaths,
      };
      const { error } = await supabase.from('postural_assessments').insert([payload]);
      if (error) throw error;
      renderAssessment(main, clientId);
    } catch (err) {
      msg.textContent = 'Erro ao salvar: ' + err.message;
      msg.classList.add('error');
      btn.disabled = false;
    }
  });
}

function posturalSummary(notes) {
  if (!notes) return '—';
  return POSTURAL_CHECKLIST
    .filter(item => notes[item.key])
    .map(item => `${item.label}: ${notes[item.key]}`)
    .join(' · ') || '—';
}

function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate + 'T00:00:00');
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function formatDate(isoDate) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

import { supabase } from '../../../app/js/supabaseClient.js';

const CHECKLIST = [
  { key: 'cabeca', label: 'Cabeça', hint: 'ex: anteriorizada, neutra' },
  { key: 'ombros', label: 'Ombros', hint: 'ex: elevado à direita, nivelados' },
  { key: 'escapulas', label: 'Escápulas', hint: 'ex: aladas, neutras' },
  { key: 'coluna', label: 'Coluna', hint: 'ex: hipercifose, hiperlordose, escoliose' },
  { key: 'quadril', label: 'Quadril', hint: 'ex: anteversão, retroversão, desnivelado, rotação de sacro' },
  { key: 'joelhos', label: 'Joelhos', hint: 'ex: valgo, varo, hiperextendido, neutro' },
  { key: 'pes', label: 'Pés', hint: 'ex: plano, cavo, pronado, supinado' },
];

const ANGLES = [
  { key: 'lateral_direita', label: 'Lateral Direita', column: 'foto_lateral_direita' },
  { key: 'lateral_esquerda', label: 'Lateral Esquerda', column: 'foto_lateral_esquerda' },
  { key: 'posterior', label: 'Posterior', column: 'foto_posterior' },
  { key: 'anterior', label: 'Anterior', column: 'foto_anterior' },
];

export async function renderPosturalAssessment(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', clientId).single();
  const { data: history } = await supabase
    .from('postural_assessments')
    .select('id, recorded_at, notes, general_note, foto_anterior, foto_posterior, foto_lateral_direita, foto_lateral_esquerda')
    .eq('client_id', clientId)
    .order('recorded_at', { ascending: false });

  main.innerHTML = `
    <div class="admin-header">
      <div class="admin-title">${escapeHtml(profile?.full_name || '')} · Avaliação Postural</div>
      <a href="#/clientes" class="admin-btn">← Voltar</a>
    </div>

    <div class="admin-card admin-form">
      <label>Data da avaliação</label>
      <input type="date" id="post-date" value="${new Date().toISOString().slice(0, 10)}">

      <label>Fotos (simetrógrafo) — grade de alinhamento aplicada automaticamente</label>
      <div class="postural-photo-grid">
        ${ANGLES.map(a => `
          <div class="postural-photo-slot">
            <div class="postural-photo-label">${a.label}</div>
            <input type="file" accept="image/*" id="post-photo-${a.key}">
          </div>
        `).join('')}
      </div>

      ${CHECKLIST.map(item => `
        <label>${item.label}</label>
        <input type="text" id="post-${item.key}" placeholder="${item.hint}">
      `).join('')}
      <label>Observação geral</label>
      <textarea id="post-general" rows="3" placeholder="Outras observações relevantes"></textarea>
      <button class="admin-btn primary" id="post-save" style="margin-top:12px;">Salvar avaliação</button>
      <div class="admin-msg" id="post-msg"></div>
    </div>

    <div class="admin-section-title">Histórico</div>
    ${history && history.length ? `
      <div class="admin-card">
        ${history.map(h => `
          <div class="admin-row">
            <div>
              <div class="admin-row-name">${formatDate(h.recorded_at)}</div>
              <div class="admin-row-sub">${historySummary(h.notes)}</div>
              ${h.general_note ? `<div class="admin-row-sub" style="margin-top:4px;">💬 ${escapeHtml(h.general_note)}</div>` : ''}
              ${ANGLES.some(a => h[a.column]) ? `<div class="admin-row-sub" style="margin-top:4px;">📷 ${ANGLES.filter(a => h[a.column]).map(a => a.label).join(', ')}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    ` : `<div class="admin-empty">Nenhuma avaliação registrada ainda.</div>`}
  `;

  document.getElementById('post-save').addEventListener('click', async () => {
    const msg = document.getElementById('post-msg');
    const btn = document.getElementById('post-save');
    btn.disabled = true;
    msg.textContent = '';
    try {
      const notes = {};
      for (const item of CHECKLIST) {
        const val = document.getElementById(`post-${item.key}`).value.trim();
        if (val) notes[item.key] = val;
      }
      const recordedAt = document.getElementById('post-date').value;

      const photoPaths = {};
      for (const a of ANGLES) {
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
      renderPosturalAssessment(main, clientId);
    } catch (err) {
      msg.textContent = 'Erro ao salvar: ' + err.message;
      msg.classList.add('error');
      btn.disabled = false;
    }
  });
}

function historySummary(notes) {
  if (!notes) return '—';
  return CHECKLIST
    .filter(item => notes[item.key])
    .map(item => `${item.label}: ${notes[item.key]}`)
    .join(' · ') || '—';
}

function formatDate(isoDate) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

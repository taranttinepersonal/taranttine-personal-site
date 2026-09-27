import { supabase } from '../../../app/js/supabaseClient.js';
import { SKINFOLD_SITES, sumSkinfolds, calcBodyFat } from '../../../app/js/lib/skinfold.js';
import {
  FORCA_EXERCICIOS, scoreForcaRelativa, computeTemporalScores, average, classificar,
} from '../../../app/js/lib/trainingLevel.js';
import { fetchEntries, saveEntry, uploadPhoto, MEASUREMENT_FIELDS } from '../../../app/js/lib/progress.js';

const TECNICA_EXERCICIOS = [
  { key: 'supino', label: 'Supino (empurrar)' },
  { key: 'puxada', label: 'Puxada/Barra Fixa (puxar)' },
  { key: 'agachamento', label: 'Agachamento' },
  { key: 'terra', label: 'Levantamento Terra (estender quadril)' },
];

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

const BIOIMPEDANCE_FIELDS = [
  { key: 'peso', label: 'Peso (kg)', step: '0.1' },
  { key: 'percentual_gordura', label: '% Gordura (PGC)', step: '0.1' },
  { key: 'massa_muscular_esqueletica', label: 'Massa Muscular Esquelética (kg)', step: '0.1' },
  { key: 'massa_gordura', label: 'Massa de Gordura (kg)', step: '0.1' },
  { key: 'gordura_visceral', label: 'Gordura Visceral (nível)', step: '1' },
  { key: 'relacao_cintura_quadril', label: 'Relação Cintura-Quadril', step: '0.01' },
  { key: 'taxa_metabolica_basal', label: 'Taxa Metabólica Basal (kcal)', step: '1' },
];

const ANAMNESE_FIELDS = [
  { key: 'Descreva sua meta em detalhes', label: 'Meta em detalhes', type: 'textarea' },
  { key: 'Objetivo principal', label: 'Objetivo principal' },
  { key: 'Medicamentos em uso', label: 'Medicamentos em uso' },
  { key: 'Cirurgias ou acidentes relevantes', label: 'Cirurgias ou acidentes relevantes' },
  { key: 'Doenças diagnosticadas', label: 'Doenças diagnosticadas' },
  { key: 'Regiões com lesão ou dor', label: 'Regiões com lesão ou dor' },
  { key: 'Intensidade da dor (0 = sem dor · 10 = máxima)', label: 'Intensidade da dor (0-10)' },
  { key: 'Nível de estresse (1 = tranquilo · 10 = muito estressado)', label: 'Nível de estresse (1-10)' },
  { key: 'Experiência com atividade física', label: 'Experiência com atividade física' },
  { key: 'Disponibilidade semanal', label: 'Disponibilidade semanal' },
  { key: 'Tempo disponível por sessão', label: 'Tempo disponível por sessão' },
  { key: 'Pirâmide de prioridades — o que você mais quer desenvolver? (em ordem)', label: 'Prioridades (em ordem)' },
  { key: 'O que já tentou e não funcionou?', label: 'O que já tentou e não funcionou', type: 'textarea' },
  { key: 'Informações adicionais', label: 'Informações adicionais', type: 'textarea' },
];

export async function renderAssessment(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const [{ data: profile }, { data: skinfoldHistory }, { data: posturalHistory }, { data: bioimpedanceHistory }, { data: levelHistory }, { data: anamneseHistory }, { data: unlinked }, measurementHistory] = await Promise.all([
    supabase.from('profiles').select('full_name, birth_date, sexo, phone').eq('id', clientId).single(),
    supabase.from('skinfold_assessments').select('*').eq('client_id', clientId).order('recorded_at', { ascending: false }),
    supabase.from('postural_assessments')
      .select('id, recorded_at, notes, general_note, foto_anterior, foto_posterior, foto_lateral_direita, foto_lateral_esquerda')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }),
    supabase.from('bioimpedance_assessments').select('*').eq('client_id', clientId).order('recorded_at', { ascending: false }),
    supabase.from('training_level_assessments').select('*').eq('client_id', clientId).order('recorded_at', { ascending: false }),
    supabase.from('anamneses').select('id, source, recorded_at, respostas').eq('client_id', clientId).order('recorded_at', { ascending: false }),
    supabase.from('anamneses').select('id, full_name, phone, recorded_at').is('client_id', null),
    fetchEntries(clientId),
  ]);

  const profilePhoneDigits = (profile?.phone || '').replace(/\D/g, '');
  const unlinkedMatches = (unlinked || []).filter(u => {
    const digits = (u.phone || '').replace(/\D/g, '');
    return digits && profilePhoneDigits && digits.slice(-8) === profilePhoneDigits.slice(-8);
  });

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
      <button class="tab-btn active" data-tab="anamnese">Anamnese</button>
      <button class="tab-btn" data-tab="dobras">Dobras Cutâneas</button>
      <button class="tab-btn" data-tab="medidas">Medidas Métricas</button>
      <button class="tab-btn" data-tab="postural">Avaliação Postural</button>
      <button class="tab-btn" data-tab="bioimpedancia">Bioimpedância</button>
      <button class="tab-btn" data-tab="nivel">Nível de Treinamento</button>
    </div>

    <div class="tab-content active" id="tab-anamnese">
      ${unlinkedMatches.length ? `
        <div class="admin-card" style="background:var(--black3);margin-bottom:14px;">
          <div class="admin-section-title" style="margin-top:0;">Anamnese online não vinculada</div>
          ${unlinkedMatches.map(u => `
            <div class="admin-row">
              <div>
                <div class="admin-row-name">${escapeHtml(u.full_name || 'Sem nome')}</div>
                <div class="admin-row-sub">Enviada em ${formatDate(u.recorded_at)} · telefone bate com o cadastro</div>
              </div>
              <button class="admin-btn primary anam-link-btn" data-id="${u.id}">Vincular</button>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="admin-card admin-form">
        <div class="admin-section-title" style="margin-top:0;">Nova avaliação presencial</div>
        <label>Data da avaliação</label>
        <input type="date" id="an-date" value="${new Date().toISOString().slice(0, 10)}">
        ${ANAMNESE_FIELDS.map(f => `
          <label>${f.label}</label>
          ${f.type === 'textarea'
            ? `<textarea id="an-${cssKey(f.key)}" rows="2"></textarea>`
            : `<input type="text" id="an-${cssKey(f.key)}">`}
        `).join('')}
        <button class="admin-btn primary" id="an-save" style="margin-top:12px;">Salvar anamnese presencial</button>
        <div class="admin-msg" id="an-msg"></div>
      </div>

      <div class="admin-section-title">Histórico</div>
      ${anamneseHistory && anamneseHistory.length ? `
        <div class="admin-card">
          ${anamneseHistory.map(h => `
            <div class="admin-row">
              <div>
                <div class="admin-row-name">${formatDate(h.recorded_at)} · ${h.source === 'presencial' ? 'Presencial' : 'Online'}</div>
                <div class="admin-row-sub">${escapeHtml(h.respostas?.['Objetivo principal'] || h.respostas?.['Descreva sua meta em detalhes'] || '—')}</div>
              </div>
              <a href="#/cliente/${clientId}/anamnese/${h.id}" class="admin-btn">Ver / PDF</a>
            </div>
          `).join('')}
        </div>
      ` : `<div class="admin-empty">Nenhuma anamnese registrada ainda.</div>`}
    </div>

    <div class="tab-content" id="tab-dobras">
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

    <div class="tab-content" id="tab-medidas">
      <div class="admin-card admin-form">
        <label>Data da medição</label>
        <input type="date" id="md-date" value="${new Date().toISOString().slice(0, 10)}">
        <div class="field-row">
          <div>
            <label>Peso (kg)</label>
            <input type="number" step="0.1" id="md-weight">
          </div>
          <div>
            <label>% Gordura</label>
            <input type="number" step="0.1" id="md-bodyfat">
          </div>
        </div>
        <div class="field-row">
          ${MEASUREMENT_FIELDS.map(f => `
            <div>
              <label>${f.label}</label>
              <input type="number" step="0.1" id="md-${f.key}">
            </div>
          `).join('')}
        </div>
        <label>Foto (opcional — aparece no relatório para o cliente)</label>
        <input type="file" accept="image/*" id="md-photo">
        <label>Observação</label>
        <textarea id="md-general" rows="2" placeholder="Outras observações relevantes"></textarea>
        <button class="admin-btn primary" id="md-save" style="margin-top:12px;">Salvar medidas</button>
        <div class="admin-msg" id="md-msg"></div>
      </div>

      <div class="admin-section-title">Histórico</div>
      ${measurementHistory && measurementHistory.length ? `
        <div class="admin-card">
          ${measurementHistory.map(h => `
            <div class="admin-row">
              <div>
                <div class="admin-row-name">${formatDate(h.recorded_at)}</div>
                <div class="admin-row-sub">${measurementSummary(h)}</div>
                ${h.note ? `<div class="admin-row-sub" style="margin-top:4px;">💬 ${escapeHtml(h.note)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<div class="admin-empty">Nenhuma medida registrada ainda.</div>`}
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

    <div class="tab-content" id="tab-bioimpedancia">
      <div class="admin-card admin-form">
        <div class="admin-msg" style="margin-bottom:10px;background:var(--black3);color:var(--muted);">Feita numa clínica parceira (ex: InBody). Roda em paralelo às dobras cutâneas — os dois métodos não são comparáveis entre si.</div>
        <label>Data da avaliação</label>
        <input type="date" id="bio-date" value="${new Date().toISOString().slice(0, 10)}">
        <div class="field-row">
          ${BIOIMPEDANCE_FIELDS.map(f => `
            <div>
              <label>${f.label}</label>
              <input type="number" step="${f.step}" id="bio-${f.key}">
            </div>
          `).join('')}
        </div>
        <label>Laudo completo (foto ou PDF)</label>
        <div class="postural-photo-grid" style="grid-template-columns:1fr;">
          <div class="postural-photo-slot">
            <div class="postural-photo-label">Anexo (dados segmentares, pontuação InBody etc.)</div>
            <input type="file" accept="image/*,.pdf" id="bio-attachment">
          </div>
        </div>
        <label>Observação geral</label>
        <textarea id="bio-general" rows="2" placeholder="Outras observações relevantes"></textarea>
        <button class="admin-btn primary" id="bio-save" style="margin-top:12px;">Salvar avaliação</button>
        <div class="admin-msg" id="bio-msg"></div>
      </div>

      <div class="admin-section-title">Histórico</div>
      ${bioimpedanceHistory && bioimpedanceHistory.length ? `
        <div class="admin-card">
          ${bioimpedanceHistory.map(h => `
            <div class="admin-row">
              <div>
                <div class="admin-row-name">${formatDate(h.recorded_at)}</div>
                <div class="admin-row-sub">${bioimpedanceSummary(h)}</div>
                ${h.general_note ? `<div class="admin-row-sub" style="margin-top:4px;">💬 ${escapeHtml(h.general_note)}</div>` : ''}
                ${h.attachment_path ? `<div class="admin-row-sub" style="margin-top:4px;">📎 Laudo anexado</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<div class="admin-empty">Nenhuma avaliação de bioimpedância registrada ainda.</div>`}
    </div>

    <div class="tab-content" id="tab-nivel">
      <div class="admin-card admin-form">
        <div class="admin-msg" style="margin-bottom:10px;background:var(--black3);color:var(--muted);">Modelo De Salles (2025) — 5 parâmetros pontuados de 1 a 4. A média final classifica o nível: objetivo, não achismo.</div>
        <label>Data da avaliação</label>
        <input type="date" id="nv-date" value="${new Date().toISOString().slice(0, 10)}">

        <label>Sexo</label>
        <select id="nv-sexo">
          <option value="M" ${profile?.sexo === 'M' ? 'selected' : ''}>Masculino</option>
          <option value="F" ${profile?.sexo === 'F' ? 'selected' : ''}>Feminino</option>
        </select>

        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="nv-training" checked style="width:auto;">
          Está treinando atualmente (sem interrupção)
        </label>

        <div id="nv-training-fields">
          <label>Há quantos meses treina ininterruptamente?</label>
          <input type="number" step="0.5" id="nv-meses-atual" placeholder="ex: 8">
        </div>
        <div id="nv-destreino-fields" style="display:none;">
          <label>Há quantos meses está parado?</label>
          <input type="number" step="0.5" id="nv-meses-destreino" placeholder="ex: 3">
          <label>Experiência prévia total antes de parar (anos)</label>
          <input type="number" step="0.5" id="nv-anos-experiencia" placeholder="ex: 2">
        </div>

        <div class="admin-section-title" style="margin-top:16px;">Técnica de execução (1-4, opcional)</div>
        <div class="field-row">
          ${TECNICA_EXERCICIOS.map(ex => `
            <div>
              <label>${ex.label}</label>
              <select id="nv-tec-${ex.key}">
                <option value="">— não avaliado —</option>
                <option value="1">1 · Ruim</option>
                <option value="2">2 · Moderada</option>
                <option value="3">3 · Boa</option>
                <option value="4">4 · Excelente</option>
              </select>
            </div>
          `).join('')}
        </div>

        <div class="admin-section-title" style="margin-top:16px;">Força relativa (opcional — carga ÷ peso corporal)</div>
        <label>Peso corporal (kg)</label>
        <input type="number" step="0.1" id="nv-peso-corporal" placeholder="ex: 75">
        ${FORCA_EXERCICIOS.map(ex => `
          <div class="field-row" style="margin-top:6px;">
            <div>
              <label>${ex.label} — carga (kg)</label>
              <input type="number" step="0.5" id="nv-carga-${ex.key}" class="nv-forca-input">
            </div>
            <div>
              <label>Repetições até a falha</label>
              <input type="number" step="1" id="nv-reps-${ex.key}" class="nv-forca-input" placeholder="1 = carga máxima real">
            </div>
          </div>
        `).join('')}

        <div class="admin-card" style="background:var(--black3);margin-top:14px;">
          <div class="report-bar-label"><span>Tempo sem interrupção</span><span class="report-bar-value" id="nv-score-p1">—</span></div>
          <div class="report-bar-label" style="margin-top:6px;"><span>Destreino</span><span class="report-bar-value" id="nv-score-p2">—</span></div>
          <div class="report-bar-label" style="margin-top:6px;"><span>Experiência prévia</span><span class="report-bar-value" id="nv-score-p3">—</span></div>
          <div class="report-bar-label" style="margin-top:6px;"><span>Técnica (média)</span><span class="report-bar-value" id="nv-score-p4">—</span></div>
          <div class="report-bar-label" style="margin-top:6px;"><span>Força relativa (média)</span><span class="report-bar-value" id="nv-score-p5">—</span></div>
          <div class="report-bar-label" style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px;"><span><b>Classificação final</b></span><span class="report-bar-value" id="nv-final" style="font-size:1.1em;">—</span></div>
        </div>

        <label>Observação geral</label>
        <textarea id="nv-general" rows="2" placeholder="Pontos deficitários, direcionamento sugerido..."></textarea>
        <button class="admin-btn primary" id="nv-save" style="margin-top:12px;">Salvar avaliação</button>
        <div class="admin-msg" id="nv-msg"></div>
      </div>

      <div class="admin-section-title">Histórico</div>
      ${levelHistory && levelHistory.length ? `
        <div class="admin-card">
          ${levelHistory.map(h => `
            <div class="admin-row">
              <div>
                <div class="admin-row-name">${formatDate(h.recorded_at)} · ${levelLabel(h.nivel_final)}</div>
                <div class="admin-row-sub">Score: ${h.score_final != null ? round1(h.score_final) : '—'}</div>
                ${h.general_note ? `<div class="admin-row-sub" style="margin-top:4px;">💬 ${escapeHtml(h.general_note)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<div class="admin-empty">Nenhuma avaliação de nível registrada ainda.</div>`}
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
      msg.textContent = '✅ Avaliação salva!';
      setTimeout(() => renderAssessment(main, clientId), 900);
    } catch (err) {
      msg.textContent = 'Erro ao salvar: ' + err.message;
      msg.classList.add('error');
      btn.disabled = false;
    }
  });

  // medidas métricas
  document.getElementById('md-save').addEventListener('click', async () => {
    const msg = document.getElementById('md-msg');
    const btn = document.getElementById('md-save');
    btn.disabled = true;
    msg.textContent = '';
    try {
      const recordedAt = document.getElementById('md-date').value;
      const measurements = {};
      for (const f of MEASUREMENT_FIELDS) {
        const val = document.getElementById(`md-${f.key}`).value;
        if (val) measurements[f.key] = Number(val);
      }
      await saveEntry(clientId, {
        recordedAt,
        weightKg: document.getElementById('md-weight').value || null,
        bodyFatPct: document.getElementById('md-bodyfat').value || null,
        measurements: Object.keys(measurements).length ? measurements : null,
        note: document.getElementById('md-general').value.trim() || null,
      });
      const photoFile = document.getElementById('md-photo').files[0];
      if (photoFile) await uploadPhoto(clientId, photoFile, recordedAt);
      msg.textContent = '✅ Medidas salvas!';
      setTimeout(() => renderAssessment(main, clientId), 900);
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
      msg.textContent = '✅ Avaliação salva!';
      setTimeout(() => renderAssessment(main, clientId), 900);
    } catch (err) {
      msg.textContent = 'Erro ao salvar: ' + err.message;
      msg.classList.add('error');
      btn.disabled = false;
    }
  });

  // bioimpedância
  document.getElementById('bio-save').addEventListener('click', async () => {
    const msg = document.getElementById('bio-msg');
    const btn = document.getElementById('bio-save');
    btn.disabled = true;
    msg.textContent = '';
    try {
      const payload = {
        client_id: clientId,
        recorded_at: document.getElementById('bio-date').value,
        general_note: document.getElementById('bio-general').value.trim() || null,
      };
      for (const f of BIOIMPEDANCE_FIELDS) {
        const val = document.getElementById(`bio-${f.key}`).value;
        payload[f.key] = val ? Number(val) : null;
      }

      const file = document.getElementById('bio-attachment').files[0];
      if (file) {
        const ext = file.name.split('.').pop();
        const path = `${clientId}/bioimpedancia/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('progress-photos').upload(path, file);
        if (uploadError) throw uploadError;
        payload.attachment_path = path;
      }

      const { error } = await supabase.from('bioimpedance_assessments').insert([payload]);
      if (error) throw error;
      msg.textContent = '✅ Avaliação salva!';
      setTimeout(() => renderAssessment(main, clientId), 900);
    } catch (err) {
      msg.textContent = 'Erro ao salvar: ' + err.message;
      msg.classList.add('error');
      btn.disabled = false;
    }
  });

  // nível de treinamento
  const nvTrainingCheck = document.getElementById('nv-training');
  nvTrainingCheck.addEventListener('change', () => {
    document.getElementById('nv-training-fields').style.display = nvTrainingCheck.checked ? '' : 'none';
    document.getElementById('nv-destreino-fields').style.display = nvTrainingCheck.checked ? 'none' : '';
    updateLevelPreview();
  });

  function readLevelInputs() {
    const sexo = document.getElementById('nv-sexo').value;
    const currentlyTraining = nvTrainingCheck.checked;
    const temporal = computeTemporalScores({
      currentlyTraining,
      mesesTreinoAtual: document.getElementById('nv-meses-atual').value,
      mesesDestreino: document.getElementById('nv-meses-destreino').value,
      anosExperienciaPrevia: document.getElementById('nv-anos-experiencia').value,
    });

    const tecnica = {};
    for (const ex of TECNICA_EXERCICIOS) {
      const v = document.getElementById(`nv-tec-${ex.key}`).value;
      if (v) tecnica[ex.key] = Number(v);
    }
    const tecnicaScore = average(Object.values(tecnica));

    const pesoCorporal = document.getElementById('nv-peso-corporal').value;
    const forca = {};
    const forcaScores = [];
    for (const ex of FORCA_EXERCICIOS) {
      const cargaKg = document.getElementById(`nv-carga-${ex.key}`).value;
      const reps = document.getElementById(`nv-reps-${ex.key}`).value;
      if (!cargaKg) continue;
      forca[ex.key] = { carga: Number(cargaKg), reps: reps ? Number(reps) : 1, peso_corporal: pesoCorporal ? Number(pesoCorporal) : null };
      const result = scoreForcaRelativa({ exercicio: ex.key, sexo, cargaKg: Number(cargaKg), reps, pesoCorporalKg: Number(pesoCorporal) });
      if (result) forcaScores.push(result.score);
    }
    const forcaScore = average(forcaScores);

    const scoreFinal = average([temporal.param1, temporal.param2, temporal.param3, tecnicaScore, forcaScore]);
    return { sexo, currentlyTraining, temporal, tecnica, tecnicaScore, forca, forcaScore, scoreFinal };
  }

  function updateLevelPreview() {
    const { temporal, tecnicaScore, forcaScore, scoreFinal } = readLevelInputs();
    document.getElementById('nv-score-p1').textContent = temporal.param1 ?? '—';
    document.getElementById('nv-score-p2').textContent = temporal.param2 ?? '—';
    document.getElementById('nv-score-p3').textContent = temporal.param3 ?? '—';
    document.getElementById('nv-score-p4').textContent = tecnicaScore != null ? round1(tecnicaScore) : '—';
    document.getElementById('nv-score-p5').textContent = forcaScore != null ? round1(forcaScore) : '—';
    const cls = classificar(scoreFinal);
    document.getElementById('nv-final').textContent = cls ? `${cls.label} (${round1(scoreFinal)})` : '—';
  }
  main.querySelectorAll('#tab-nivel input, #tab-nivel select').forEach(el => {
    el.addEventListener('input', updateLevelPreview);
    el.addEventListener('change', updateLevelPreview);
  });
  updateLevelPreview();

  document.getElementById('nv-save').addEventListener('click', async () => {
    const msg = document.getElementById('nv-msg');
    const btn = document.getElementById('nv-save');
    btn.disabled = true;
    msg.textContent = '';
    try {
      const { sexo, currentlyTraining, temporal, tecnica, forca, scoreFinal } = readLevelInputs();
      const cls = classificar(scoreFinal);
      await supabase.from('profiles').update({ sexo }).eq('id', clientId);
      const payload = {
        client_id: clientId,
        recorded_at: document.getElementById('nv-date').value,
        currently_training: currentlyTraining,
        meses_treino_atual: currentlyTraining ? (Number(document.getElementById('nv-meses-atual').value) || null) : null,
        meses_destreino: !currentlyTraining ? (Number(document.getElementById('nv-meses-destreino').value) || null) : null,
        anos_experiencia_previa: !currentlyTraining ? (Number(document.getElementById('nv-anos-experiencia').value) || null) : null,
        tecnica: Object.keys(tecnica).length ? tecnica : null,
        forca: Object.keys(forca).length ? forca : null,
        score_final: scoreFinal,
        nivel_final: cls ? cls.key : null,
        general_note: document.getElementById('nv-general').value.trim() || null,
      };
      const { error } = await supabase.from('training_level_assessments').insert([payload]);
      if (error) throw error;
      msg.textContent = '✅ Avaliação salva!';
      setTimeout(() => renderAssessment(main, clientId), 900);
    } catch (err) {
      msg.textContent = 'Erro ao salvar: ' + err.message;
      msg.classList.add('error');
      btn.disabled = false;
    }
  });

  // anamnese — vincular submissão online não vinculada
  main.querySelectorAll('.anam-link-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error } = await supabase.from('anamneses').update({ client_id: clientId }).eq('id', btn.dataset.id);
      if (error) { alert('Erro ao vincular: ' + error.message); btn.disabled = false; return; }
      renderAssessment(main, clientId);
    });
  });

  // anamnese — nova avaliação presencial
  document.getElementById('an-save').addEventListener('click', async () => {
    const msg = document.getElementById('an-msg');
    const btn = document.getElementById('an-save');
    btn.disabled = true;
    msg.textContent = '';
    try {
      const respostas = {};
      for (const f of ANAMNESE_FIELDS) {
        const val = document.getElementById(`an-${cssKey(f.key)}`).value.trim();
        if (val) respostas[f.key] = val;
      }
      const payload = {
        client_id: clientId,
        source: 'presencial',
        full_name: profile?.full_name || null,
        recorded_at: document.getElementById('an-date').value,
        respostas,
      };
      const { error } = await supabase.from('anamneses').insert([payload]);
      if (error) throw error;
      msg.textContent = '✅ Anamnese salva!';
      setTimeout(() => renderAssessment(main, clientId), 900);
    } catch (err) {
      msg.textContent = 'Erro ao salvar: ' + err.message;
      msg.classList.add('error');
      btn.disabled = false;
    }
  });
}

function cssKey(str) {
  return str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function levelLabel(key) {
  return {
    iniciante: 'Iniciante',
    intermediario: 'Intermediário',
    avancado: 'Avançado',
    extremamente_avancado: 'Extremamente Avançado',
  }[key] || '—';
}

function measurementSummary(h) {
  const parts = [];
  if (h.weight_kg != null) parts.push(`Peso: ${h.weight_kg}kg`);
  if (h.body_fat_pct != null) parts.push(`%Gordura: ${h.body_fat_pct}%`);
  for (const f of MEASUREMENT_FIELDS) {
    const val = h.measurements?.[f.key];
    if (val != null) parts.push(`${f.label.replace(' (cm)', '')}: ${val}cm`);
  }
  return parts.join(' · ') || '—';
}

function bioimpedanceSummary(h) {
  const parts = [];
  if (h.peso != null) parts.push(`Peso: ${h.peso}kg`);
  if (h.percentual_gordura != null) parts.push(`%Gordura: ${h.percentual_gordura}%`);
  if (h.massa_muscular_esqueletica != null) parts.push(`Massa Muscular: ${h.massa_muscular_esqueletica}kg`);
  if (h.gordura_visceral != null) parts.push(`Gordura Visceral: ${h.gordura_visceral}`);
  return parts.join(' · ') || '—';
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

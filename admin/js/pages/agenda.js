import * as A from '../../../app/js/lib/agenda.js';
import * as D from '../lib/agendaData.js';

const MIGRATION_MSG = `<div class="admin-empty">Falta rodar a migração <b>0043</b> (agenda) no Supabase (SQL Editor) pra liberar a agenda.</div>`;
const REMIND_OPTIONS = [['', 'Aviso padrão (30 min antes; lembrete na hora)'], ['-1', 'Sem aviso'], ['0', 'Na hora'], ['10', '10 min antes'], ['30', '30 min antes'], ['60', '1 h antes'], ['120', '2 h antes'], ['1440', '1 dia antes']];

export async function renderAgenda(main) {
  main.closest('.admin-shell')?.classList.add('wide');
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;
  const ui = { view: 'dia', date: D.todayIso(), events: [], clients: [], byId: {}, slots: [], credits: [], unmarked: [] };

  const nowHm = () => { const n = new Date(); return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; };
  const nameOf = (id) => ui.byId[id]?.full_name || '';

  async function load() {
    try {
      const days = A.weekDays(ui.date);
      const [events, clients, slots, creditEvents, unmarked] = await Promise.all([
        D.loadRange(days[0], days[6]), ui.clients.length ? ui.clients : D.loadClients(), D.loadSlots(), D.loadCreditEvents(), D.loadUnmarked(D.todayIso()),
      ]);
      ui.events = events; ui.clients = clients; ui.slots = slots;
      ui.byId = Object.fromEntries(clients.map(c => [c.id, c]));
      ui.credits = A.pendingCredits(creditEvents);
      ui.unmarked = unmarked.filter(e => A.needsMark(e, D.todayIso(), nowHm()));
      return true;
    } catch (e) {
      console.error(e);
      main.innerHTML = D.isMissingAgenda(e) ? MIGRATION_MSG : `<div class="admin-empty">Erro ao carregar a agenda.</div>`;
      return false;
    }
  }
  const paint = () => { const y = window.scrollY; main.innerHTML = pageHtml(ui, nameOf); window.scrollTo(0, y); };
  const refresh = async () => { if (await load()) paint(); };
  const toast = (t) => { const el = main.querySelector('#ag-toast'); if (!el) return; el.textContent = t; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); };

  if (!(await load())) return;
  paint();

  // ----- modal simples -----
  function openModal(html, onReady) {
    const m = document.createElement('div');
    m.className = 'pc-modal';
    m.innerHTML = `<div class="pc-modal-card admin-form ag-modal">${html}</div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) close(); });
    onReady?.(m, close);
    return { m, close };
  }
  const clientOptions = (selected) => `<option value="">— escolha —</option>${[...ui.clients].filter(c => c.active).sort((a, b) => (b.modalidade === 'presencial') - (a.modalidade === 'presencial') || a.full_name.localeCompare(b.full_name))
    .map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.full_name)}${c.modalidade === 'presencial' ? '' : ' (online)'}</option>`).join('')}`;
  const waBtn = (ev, type, label = 'Enviar WhatsApp') => {
    const c = ui.byId[ev.client_id];
    return `<a class="admin-btn primary" target="_blank" rel="noopener" href="${A.waLink(c?.phone, A.waMessage(type, ev, c?.full_name || ''))}">${label}</a>`;
  };

  // ----- formulário de compromisso novo / reposição -----
  function openEventForm({ kind = 'treino', clientId = '', date = ui.date, makeupFor = null, lockKind = false } = {}) {
    const kinds = Object.entries(A.KINDS).map(([k, v]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${k === 'treino' ? 'Treino' : v.label}</option>`).join('');
    openModal(`
      <div class="pc-sum-title">${makeupFor ? 'Marcar reposição' : 'Novo compromisso'}</div>
      <label>Tipo<select id="f-kind" ${lockKind ? 'disabled' : ''}>${kinds}</select></label>
      <label id="w-client">Aluno<select id="f-client">${clientOptions(clientId)}</select></label>
      <label id="w-title">Título<input id="f-title" placeholder="Ex.: Almoço, Viagem, Ligar pro Renan"></label>
      <div id="w-fixed" class="ag-fixedbox">
        <label class="pc-radio"><input type="checkbox" id="f-fixed"> 🔁 Aluno fixo: repetir toda semana</label>
        <div id="w-days" style="display:none"><div class="admin-row-sub">Dias da semana (o horário vale a partir do dia escolhido abaixo)</div>
          <div class="ag-days">${[1, 2, 3, 4, 5, 6, 0].map(w => `<label class="ag-day"><input type="checkbox" value="${w}"><span>${A.DOW_SHORT[w]}</span></label>`).join('')}</div></div>
      </div>
      <div class="ag-row3">
        <label><span id="l-date">Dia</span><input type="date" id="f-date" value="${date}"></label>
        <label>Hora<input type="time" id="f-time" value="07:00"></label>
        <label id="w-dur">Duração (min)<input type="number" id="f-dur" min="10" step="5" value="60"></label>
      </div>
      <label>Aviso no celular<select id="f-remind">${REMIND_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <label>Observação<textarea id="f-note" placeholder="Opcional"></textarea></label>
      <div class="admin-msg" id="f-msg"></div>
      <div class="pc-modal-actions"><button class="admin-btn" data-close>Cancelar</button><button class="admin-btn primary" id="f-save">Salvar</button></div>`,
    (m, close) => {
      const q = (s) => m.querySelector(s);
      const sync = () => {
        const k = q('#f-kind').value, meta = A.KINDS[k];
        q('#w-client').style.display = meta.needsClient || k === 'consulta' ? '' : 'none';
        q('#w-title').style.display = meta.needsClient && k !== 'consulta' && k !== 'avaliacao' ? 'none' : '';
        q('#w-dur').style.display = k === 'lembrete' ? 'none' : '';
        q('#w-fixed').style.display = k === 'treino' && !makeupFor ? '' : 'none';
        if (k !== 'treino') q('#f-fixed').checked = false;
        syncFixed();
        if (k === 'lembrete') q('#f-dur').value = 0; else if (+q('#f-dur').value === 0) q('#f-dur').value = k === 'avaliacao' ? 90 : 60;
        if (k === 'avaliacao' && +q('#f-dur').value === 60) q('#f-dur').value = 90;
      };
      let daysTouched = false;
      const syncFixed = () => {
        const on = q('#f-fixed').checked;
        q('#w-days').style.display = on ? '' : 'none';
        q('#l-date').textContent = on ? 'Vale a partir de' : 'Dia';
        q('#f-save').textContent = on ? 'Criar horário fixo' : 'Salvar';
        if (on && !daysTouched) { const d = A.dowOf(q('#f-date').value || date); m.querySelectorAll('#w-days input').forEach(i => { i.checked = Number(i.value) === d; }); }
      };
      q('#f-fixed').addEventListener('change', syncFixed);
      q('#f-date').addEventListener('change', syncFixed);
      q('#w-days').addEventListener('change', () => { daysTouched = true; });
      q('#f-kind').addEventListener('change', sync); sync();
      q('#f-save').addEventListener('click', async () => {
        const k = q('#f-kind').value, meta = A.KINDS[k];
        const row = {
          kind: k, client_id: q('#f-client').value || null, title: q('#f-title').value.trim() || null, on_date: q('#f-date').value, start_time: q('#f-time').value,
          duration_min: Number(q('#f-dur').value) || 0, note: q('#f-note').value.trim() || null, remind_before_min: q('#f-remind').value === '' ? null : Number(q('#f-remind').value),
        };
        const err = (t) => { q('#f-msg').textContent = t; q('#f-msg').classList.add('error'); };
        if (!row.on_date || !row.start_time) return err('Informe o dia e a hora.');
        if (meta.needsClient && !row.client_id) return err('Escolha o aluno.');
        if (!meta.needsClient) { row.client_id = null; if (!row.title) return err('Dê um título.'); }
        if (k !== 'lembrete' && row.duration_min < 10) return err('Duração mínima: 10 min.');
        if (makeupFor) row.makeup_for = makeupFor;
        const btn = q('#f-save'); btn.disabled = true;
        if (k === 'treino' && q('#f-fixed').checked) {
          const days = [...m.querySelectorAll('#w-days input:checked')].map(i => Number(i.value));
          if (!days.length) { btn.disabled = false; return err('Marque pelo menos um dia da semana.'); }
          try {
            // avisa se a primeira vez de cada dia bate com outro compromisso
            const clashes = [];
            for (const w of days) {
              let d = row.on_date; while (A.dowOf(d) !== w) d = A.addDays(d, 1);
              const day = await D.loadRange(d, d);
              for (const c of A.conflictsWith({ ...row, on_date: d, start_time: row.start_time, id: 'new' }, day)) clashes.push(`${A.fmtDay(d)} ${A.hm(c.start_time)} ${c.client_id ? nameOf(c.client_id) : c.title}`);
            }
            if (clashes.length && !confirm(`Conflita com: ${clashes.join(', ')}. Criar mesmo assim?`)) { btn.disabled = false; return; }
            await D.createSlots(row.client_id, days, row.start_time, row.duration_min, row.on_date, row.note, { kind: 'treino' });
            close(); ui.date = row.on_date; await refresh();
            toast(`${nameOf(row.client_id).split(' ')[0]} agora é fixo: ${days.map(w => A.DOW_SHORT[w]).join(', ')} às ${row.start_time}.`);
          } catch (e) { console.error(e); err('Erro ao salvar: ' + (e.message || e)); btn.disabled = false; }
          return;
        }
        try {
          if (k !== 'lembrete') {
            const day = await D.loadRange(row.on_date, row.on_date);
            const clash = A.conflictsWith({ ...row, id: 'new' }, day);
            if (clash.length && !confirm(`Conflita com: ${clash.map(e => `${A.hm(e.start_time)} ${e.client_id ? nameOf(e.client_id) : e.title}`).join(', ')}. Marcar mesmo assim?`)) { btn.disabled = false; return; }
          }
          const ev = await D.createEvent(row);
          close();
          ui.date = row.on_date;
          await refresh();
          toast('Compromisso salvo.');
          if (ev.client_id && ['reposicao', 'treino', 'avaliacao', 'consulta'].includes(ev.kind)) offerWhatsApp(ev, ev.kind === 'reposicao' ? 'reposicao' : 'confirmar', 'Compromisso salvo');
        } catch (e) { console.error(e); err('Erro ao salvar: ' + (e.message || e)); btn.disabled = false; }
      });
    });
  }
  function offerWhatsApp(ev, type, heading) {
    if (!ev.client_id) return;
    openModal(`<div class="pc-sum-title">${esc(heading)}</div><div class="admin-row-sub">${esc(nameOf(ev.client_id))} · ${A.fmtDay(ev.on_date)} às ${A.hm(ev.start_time)}. Avisar o aluno?</div>
      <div class="pc-modal-actions"><button class="admin-btn" data-close>Agora não</button>${waBtn(ev, type)}</div>`);
  }

  // ----- mover só esta ocorrência -----
  function openMove(ev) {
    openModal(`<div class="pc-sum-title">Mover ${esc(ev.client_id ? nameOf(ev.client_id) : ev.title || '')}</div>
      <div class="admin-row-sub">Hoje: ${A.fmtDay(ev.on_date)} às ${A.hm(ev.start_time)}. Só esta ocorrência muda; o horário fixo continua igual.</div>
      <div class="ag-row3"><label>Novo dia<input type="date" id="m-date" value="${ev.on_date}"></label><label>Nova hora<input type="time" id="m-time" value="${A.hm(ev.start_time)}"></label></div>
      <div class="admin-msg" id="m-msg"></div>
      <div class="pc-modal-actions"><button class="admin-btn" data-close>Cancelar</button><button class="admin-btn primary" id="m-save">Mover</button></div>`,
    (m, close) => m.querySelector('#m-save').addEventListener('click', async () => {
      const date = m.querySelector('#m-date').value, time = m.querySelector('#m-time').value;
      if (!date || !time) { m.querySelector('#m-msg').textContent = 'Informe o novo dia e hora.'; m.querySelector('#m-msg').classList.add('error'); return; }
      try {
        if (ev.kind !== 'lembrete') {
          const day = await D.loadRange(date, date);
          const clash = A.conflictsWith({ ...ev, on_date: date, start_time: time }, day);
          if (clash.length && !confirm(`Conflita com: ${clash.map(e => `${A.hm(e.start_time)} ${e.client_id ? nameOf(e.client_id) : e.title}`).join(', ')}. Mover mesmo assim?`)) return;
        }
        await D.moveEvent(ev, date, time);
        close(); ui.date = date; await refresh(); toast('Movido.');
        const moved = ui.events.find(e => e.id === ev.id) || { ...ev, on_date: date, start_time: time, orig_date: ev.orig_date || ev.on_date, orig_time: ev.orig_time || ev.start_time };
        offerWhatsApp(moved, 'remarcado', 'Horário alterado');
      } catch (e) { console.error(e); alert('Erro ao mover: ' + (e.message || e)); }
    }));
  }

  // ----- falta / desmarcou / cancelado -----
  function openAbsence(ev, status) {
    const label = { faltou: 'Faltou (sem avisar)', desmarcou: 'Desmarcou (avisou)', cancelado: 'Cancelei' }[status];
    openModal(`<div class="pc-sum-title">${label}</div>
      <div class="admin-row-sub">${esc(nameOf(ev.client_id) || ev.title || '')} · ${A.fmtDay(ev.on_date)} às ${A.hm(ev.start_time)}</div>
      <label class="pc-radio"><input type="checkbox" id="a-credit" ${status === 'faltou' ? '' : 'checked'}> Gera crédito de reposição</label>
      <label>Observação<textarea id="a-note" placeholder="Motivo (opcional)">${esc(ev.note || '')}</textarea></label>
      <div class="pc-modal-actions"><button class="admin-btn" data-close>Cancelar</button><button class="admin-btn" id="a-save">Salvar</button>${ev.client_id ? '<button class="admin-btn primary" id="a-repo">Salvar e repor</button>' : ''}</div>`,
    (m, close) => {
      const save = async (thenRepo) => {
        try {
          await D.setStatus(ev.id, status, { credit: m.querySelector('#a-credit').checked, note: m.querySelector('#a-note').value.trim() });
          close(); await refresh(); toast(label + '.');
          if (thenRepo) openEventForm({ kind: 'reposicao', clientId: ev.client_id, makeupFor: ev.id, lockKind: true, date: A.addDays(ev.on_date, 1) });
        } catch (e) { console.error(e); alert('Erro: ' + (e.message || e)); }
      };
      m.querySelector('#a-save').addEventListener('click', () => save(false));
      m.querySelector('#a-repo')?.addEventListener('click', () => { m.querySelector('#a-credit').checked = true; save(true); });
    });
  }

  // ----- viagem: aluno avisou que não vem (vários dias de uma vez) -----
  function openTrip(ev, { thisWeek = false } = {}) {
    const name = nameOf(ev.client_id);
    const week = A.weekDays(ev.on_date);
    // "esta semana": do que ainda falta (hoje em diante) até domingo; senão do dia tocado
    const fromDefault = thisWeek ? (() => { const f = [week[0], D.todayIso()].sort().pop(); return f > week[6] ? ev.on_date : f; })() : ev.on_date;
    openModal(`<div class="pc-sum-title">✈ ${esc(name)} não vem</div>
      <div class="admin-row-sub">Marca os atendimentos dele(a) no período como "desmarcou (avisou)", em vermelho na agenda. O horário fixo continua pras outras semanas.</div>
      <div class="ag-row3"><label>De<input type="date" id="t-from" value="${fromDefault}"></label><label>Até<input type="date" id="t-to" value="${week[6]}"></label></div>
      <label>Observação<input id="t-note" value="${A.TRIP_NOTE}"></label>
      <label class="pc-radio"><input type="checkbox" id="t-credit"> Gera crédito de reposição</label>
      <div class="admin-row-sub" id="t-preview">Calculando...</div>
      <div class="admin-msg" id="t-msg"></div>
      <div class="pc-modal-actions"><button class="admin-btn" data-close>Cancelar</button><button class="admin-btn primary" id="t-save">Marcar</button></div>`,
    (m, close) => {
      const q = (x) => m.querySelector(x);
      let targets = [];
      const preview = async () => {
        const from = q('#t-from').value, to = q('#t-to').value;
        if (!from || !to || to < from) { targets = []; q('#t-preview').textContent = 'Confira as datas.'; return; }
        try {
          const evs = await D.loadRange(from, to);
          targets = A.tripTargets(evs, ev.client_id, from, to);
          q('#t-preview').innerHTML = targets.length ? `<b>${targets.length}</b> atendimento(s): ${targets.map(t => `${A.fmtDay(t.on_date)} ${A.hm(t.start_time)}`).join(' · ')}` : 'Nenhum atendimento agendado neste período.';
        } catch (e) { console.error(e); q('#t-preview').textContent = 'Erro ao calcular.'; }
      };
      q('#t-from').addEventListener('change', preview); q('#t-to').addEventListener('change', preview); preview();
      q('#t-save').addEventListener('click', async () => {
        if (!targets.length) { q('#t-msg').textContent = 'Nada para marcar neste período.'; q('#t-msg').classList.add('error'); return; }
        try {
          await D.markAway(targets.map(t => t.id), { credit: q('#t-credit').checked, note: q('#t-note').value.trim() || A.TRIP_NOTE });
          close(); await refresh(); toast(`${targets.length} atendimento(s) de ${name.split(' ')[0]} marcados como viagem.`);
        } catch (e) { console.error(e); alert('Erro: ' + (e.message || e)); }
      });
    });
  }

  // ----- trocar de lugar (arrastar ou ↑↓) -----
  async function doSwap(a, b) {
    const clash = A.swapConflicts(a, b, ui.events);
    if (clash.length && !confirm(`Depois da troca bate com: ${clash.map(e => `${A.hm(e.start_time)} ${titleOf(e, nameOf)}`).join(', ')}. Trocar mesmo assim?`)) return;
    try { await D.swapEvents(a, b); await refresh(); toast(`${nameOf(a.client_id)} ↔ ${nameOf(b.client_id)}: horários trocados.`); }
    catch (e) { console.error(e); alert('Erro ao trocar: ' + (e.message || e)); }
  }
  async function doMoveToDay(ev, date) {
    if (date === ev.on_date) return;
    const clash = A.conflictsWith({ ...ev, on_date: date }, ui.events);
    if (clash.length && !confirm(`Conflita com: ${clash.map(e => `${A.hm(e.start_time)} ${titleOf(e, nameOf)}`).join(', ')}. Mover mesmo assim?`)) return;
    try { await D.moveEvent(ev, date, A.hm(ev.start_time)); await refresh(); toast(`${nameOf(ev.client_id)} movido pra ${A.fmtDay(date)}.`); }
    catch (e) { console.error(e); alert('Erro ao mover: ' + (e.message || e)); }
  }

  // ----- horários fixos -----
  function openSlotForm() {
    openModal(`<div class="pc-sum-title">Novo horário fixo</div>
      <label>Tipo<select id="s-kind"><option value="treino">Horário de aluno</option><option value="bloqueio">Bloqueio fixo (almoço, escola das crianças...)</option></select></label>
      <label id="sw-client">Aluno<select id="s-client">${clientOptions('')}</select></label>
      <label id="sw-title" style="display:none">Título<input id="s-title" placeholder="Ex.: Almoço / buscar as crianças"></label>
      <div class="admin-row-sub">Dias da semana</div>
      <div class="ag-days">${[1, 2, 3, 4, 5, 6, 0].map(w => `<label class="ag-day"><input type="checkbox" value="${w}"><span>${A.DOW_SHORT[w]}</span></label>`).join('')}</div>
      <div class="ag-row3"><label>Hora<input type="time" id="s-time" value="07:00"></label><label>Duração (min)<input type="number" id="s-dur" min="10" step="5" value="60"></label><label>Vale a partir de<input type="date" id="s-from" value="${D.todayIso()}"></label></div>
      <label>Observação<input id="s-note" placeholder="Opcional"></label>
      <div class="admin-msg" id="s-msg"></div>
      <div class="pc-modal-actions"><button class="admin-btn" data-close>Cancelar</button><button class="admin-btn primary" id="s-save">Criar</button></div>`,
    (m, close) => {
      m.querySelector('#s-kind').addEventListener('change', (e) => {
        const block = e.target.value === 'bloqueio';
        m.querySelector('#sw-client').style.display = block ? 'none' : '';
        m.querySelector('#sw-title').style.display = block ? '' : 'none';
      });
      m.querySelector('#s-save').addEventListener('click', async () => {
      const days = [...m.querySelectorAll('.ag-day input:checked')].map(i => Number(i.value));
      const client = m.querySelector('#s-client').value;
      const kind = m.querySelector('#s-kind').value, title = m.querySelector('#s-title').value.trim();
      const err = (t) => { m.querySelector('#s-msg').textContent = t; m.querySelector('#s-msg').classList.add('error'); };
      if (kind === 'treino' && !client) return err('Escolha o aluno.');
      if (kind === 'bloqueio' && !title) return err('Dê um título ao bloqueio.');
      if (!days.length) return err('Marque pelo menos um dia da semana.');
      try {
        await D.createSlots(client, days, m.querySelector('#s-time').value, Number(m.querySelector('#s-dur').value) || 60, m.querySelector('#s-from').value, m.querySelector('#s-note').value.trim(), { kind, title });
        close(); await refresh(); toast('Horário fixo criado. Ele aparece na agenda.');
      } catch (e) { console.error(e); err('Erro: ' + (e.message || e)); }
    }); });
  }
  function openSlotChange(slot) {
    openModal(`<div class="pc-sum-title">Mudar horário de ${esc(slotName(slot, nameOf))}</div>
      <div class="admin-row-sub">Hoje: ${A.slotLabel(slot)} (${slot.duration_min} min). Os treinos anteriores ficam como estão.</div>
      <label>Mudar a partir de<input type="date" id="c-from" value="${D.todayIso()}"></label>
      <div class="ag-row3"><label>Dia<select id="c-dow">${[1, 2, 3, 4, 5, 6, 0].map(w => `<option value="${w}" ${w === slot.weekday ? 'selected' : ''}>${A.DOW_LONG[w]}</option>`).join('')}</select></label>
        <label>Hora<input type="time" id="c-time" value="${A.hm(slot.start_time)}"></label><label>Duração<input type="number" id="c-dur" min="10" step="5" value="${slot.duration_min}"></label></div>
      <div class="pc-modal-actions"><button class="admin-btn" data-close>Cancelar</button><button class="admin-btn primary" id="c-save">Mudar</button></div>`,
    (m, close) => m.querySelector('#c-save').addEventListener('click', async () => {
      try {
        await D.changeSlotFrom(slot, m.querySelector('#c-from').value, { weekday: Number(m.querySelector('#c-dow').value), start_time: m.querySelector('#c-time').value, duration_min: Number(m.querySelector('#c-dur').value) || 60 });
        close(); await refresh(); toast('Horário fixo alterado.');
      } catch (e) { console.error(e); alert('Erro: ' + (e.message || e)); }
    }));
  }
  function openSlotEnd(slot) {
    openModal(`<div class="pc-sum-title">Encerrar ${esc(slotName(slot, nameOf))} · ${A.slotLabel(slot)}</div>
      <div class="admin-row-sub">Os treinos a partir desta data, ainda sem registro, saem da agenda. Faltas e treinos já marcados ficam.</div>
      <label>Encerrar a partir de<input type="date" id="e-from" value="${D.todayIso()}"></label>
      <div class="pc-modal-actions"><button class="admin-btn" data-close>Cancelar</button><button class="admin-btn primary" id="e-save">Encerrar</button></div>`,
    (m, close) => m.querySelector('#e-save').addEventListener('click', async () => {
      try { await D.endSlot(slot, m.querySelector('#e-from').value); close(); await refresh(); toast('Horário encerrado.'); }
      catch (e) { console.error(e); alert('Erro: ' + (e.message || e)); }
    }));
  }

  // ----- ações de um atendimento (usadas pelos botões do card e pelo menu rápido da semana) -----
  async function runAct(act, e) {
    try {
      if (act === 'done') { await D.setStatus(e.id, 'feito'); await refresh(); toast('Compareceu.'); }
      else if (act === 'undo') { await D.setStatus(e.id, 'agendado'); await refresh(); toast('Voltou pra agendado.'); }
      else if (['faltou', 'desmarcou', 'cancelado'].includes(act)) openAbsence(e, act);
      else if (act === 'move') openMove(e);
      else if (act === 'trip') openTrip(e);
      else if (act === 'up' || act === 'down') {
        const nb = A.neighbor(ui.events.filter(x => x.on_date === e.on_date), e, act === 'up' ? -1 : 1);
        if (!nb) toast(act === 'up' ? 'Já é o primeiro do dia.' : 'Já é o último do dia.'); else await doSwap(e, nb);
      }
      else if (act === 'repo') openEventForm({ kind: 'reposicao', clientId: e.client_id, makeupFor: e.id, lockKind: true, date: A.addDays(e.on_date, 1) });
      else if (act === 'del') { if (confirm('Apagar este compromisso?')) { await D.deleteEvent(e.id); await refresh(); toast('Apagado.'); } }
      else if (act === 'cancel-one') { if (confirm('Só este dia? O horário fixo continua nos outros dias.')) { await D.setStatus(e.id, 'cancelado'); await refresh(); toast('Cancelado.'); } }
    } catch (err) { console.error(err); alert('Erro: ' + (err.message || err)); }
  }

  // ----- menu rápido (toque num nome na aba Semana) -----
  function openQuick(ev) {
    const isClient = !!ev.client_id, attend = A.canReorder(ev);
    const b = (act, label, cls = '') => `<button class="admin-btn ${cls}" data-q="${act}">${label}</button>`;
    const items = [];
    if (attend && isClient) items.push(b('week', '✈ Avisou que não vem esta semana', 'primary'));
    if (attend) items.push(b('done', '✓ Veio', ''), b('faltou', 'Faltou'), b('desmarcou', 'Desmarcou só este dia'), b('move', 'Mover'));
    if (!attend && ev.status !== 'agendado') items.push(b('undo', 'Desfazer'));
    if (ev.status === 'agendado' && ev.slot_id && ev.kind === 'bloqueio') items.push(b('cancel-one', 'Liberar este dia'));
    items.push(b('day', 'Ver o dia'));
    openModal(`<div class="pc-sum-title">${esc(titleOf(ev, nameOf))}</div>
      <div class="admin-row-sub">${A.fmtDay(ev.on_date)} às ${A.hm(ev.start_time)}${A.isTrip(ev) ? ' · ✈ avisou que não vem' : ev.status !== 'agendado' ? ` · ${A.STATUS[ev.status].label}` : ''}</div>
      <div class="ag-quick">${items.join('')}</div>
      <div class="pc-modal-actions"><button class="admin-btn" data-close>Fechar</button></div>`,
    (m, close) => m.addEventListener('click', async (c) => {
      const q = c.target.closest('[data-q]');
      if (!q) return;
      close();
      const act = q.dataset.q;
      if (act === 'day') { ui.date = ev.on_date; ui.view = 'dia'; await refresh(); return; }
      if (act === 'week') { openTrip(ev, { thisWeek: true }); return; }
      await runAct(act, ev);
    }));
  }

  // ----- cliques -----
  main.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-v],[data-nav],[data-day],[data-act],[data-quick],[data-new],[data-slot-new],[data-slot-act],[data-credit]');
    if (!t) return;
    if (t.dataset.v) { ui.view = t.dataset.v; paint(); return; }
    if (t.dataset.nav) {
      const step = t.dataset.nav;
      const newDate = step === 'today' ? D.todayIso() : A.addDays(ui.date, (ui.view === 'semana' ? 7 : 1) * Number(step));
      const sameWeek = A.weekStart(newDate) === A.weekStart(ui.date);
      ui.date = newDate;
      if (sameWeek) paint(); else await refresh();
      return;
    }
    if (t.dataset.day) { ui.date = t.dataset.day; ui.view = 'dia'; if (A.weekStart(ui.date) === A.weekStart(ui.events[0]?.on_date || ui.date)) paint(); else await refresh(); return; }
    if (t.hasAttribute('data-new')) { openEventForm(); return; }
    if (t.hasAttribute('data-slot-new')) { openSlotForm(); return; }
    if (t.dataset.slotAct) {
      const slot = ui.slots.find(s => s.id === t.dataset.id);
      if (!slot) return;
      if (t.dataset.slotAct === 'change') openSlotChange(slot); else openSlotEnd(slot);
      return;
    }
    if (t.dataset.credit) {
      const abs = ui.credits.find(c => c.id === t.dataset.id);
      if (!abs) return;
      if (t.dataset.credit === 'repo') openEventForm({ kind: 'reposicao', clientId: abs.client_id, makeupFor: abs.id, lockKind: true, date: A.addDays(abs.on_date, 1) });
      else if (confirm('Dispensar este crédito de reposição? A falta continua registrada.')) { await D.updateEvent(abs.id, { generates_credit: false }); await refresh(); toast('Crédito dispensado.'); }
      return;
    }
    if (t.dataset.quick) { const q = ui.events.find(x => x.id === t.dataset.quick); if (q) openQuick(q); return; }
    if (t.dataset.act) {
      const e = ui.events.find(x => x.id === t.dataset.id);
      if (!e) return;
      await runAct(t.dataset.act, e);
    }
  });

  // ----- arrastar pra trocar de lugar -----
  // Dia: segure a alça ⠿ e solte sobre outro atendimento (os dois trocam de horário).
  // Semana (mouse): arraste o nome pra outro nome (troca) ou pra outro dia (mesma hora).
  let drag = null, suppressClick = false, scrollRaf = 0;
  main.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  main.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('[data-drag]');
    const mini = !grip && e.button === 0 ? e.target.closest('.ag-mini[data-ev]') : null;
    const src = grip || mini;
    if (!src) return;
    const ev = ui.events.find(x => x.id === (grip ? grip.dataset.drag : mini.dataset.ev));
    if (!ev || !A.canReorder(ev)) return;
    const touch = e.pointerType !== 'mouse';
    drag = { ev, kind: grip ? 'grip' : 'mini', src: grip ? grip.closest('.ag-card') : mini, x0: e.clientX, y0: e.clientY, started: false, ghost: null, target: null, id: e.pointerId, x: e.clientX, y: e.clientY, armed: !(touch && mini), timer: 0 };
    if (grip) e.preventDefault();
    // dedo na semana: segura ~0,3s pra "pegar" o nome (antes disso é rolagem normal da página)
    if (touch && mini) drag.timer = setTimeout(() => { if (drag && drag.id === e.pointerId) { drag.armed = true; drag.src.classList.add('ag-armed'); navigator.vibrate?.(15); } }, 320);
  });
  const findTarget = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const sel = drag.kind === 'grip' ? '.ag-card[data-ev]' : '.ag-mini[data-ev], .ag-col[data-date]';
    const t = el.closest(sel);
    if (!t || t === drag.src || !main.contains(t)) return null;
    if (t.dataset.ev) { const o = ui.events.find(x => x.id === t.dataset.ev); return o && A.canReorder(o) ? t : null; }
    return t;
  };
  const clearTarget = () => { main.querySelectorAll('.ag-drop').forEach(n => n.classList.remove('ag-drop')); };
  const autoscroll = () => {
    cancelAnimationFrame(scrollRaf);
    if (!drag?.started) return;
    const edge = 70, h = window.innerHeight;
    const dy = drag.y < edge ? -14 : drag.y > h - edge ? 14 : 0;
    if (dy) window.scrollBy(0, dy);
    scrollRaf = requestAnimationFrame(autoscroll);
  };
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.started) {
      const moved = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
      if (!drag.armed) { if (moved > 9) { clearTimeout(drag.timer); drag = null; } return; } // mexeu antes de segurar: é rolagem
      if (moved < 6) return;
      drag.started = true;
      const r = drag.src.getBoundingClientRect();
      drag.dx = drag.x0 - r.left; drag.dy = drag.y0 - r.top;
      const g = drag.src.cloneNode(true);
      g.classList.add('ag-ghost'); g.style.width = r.width + 'px'; g.removeAttribute('data-ev');
      document.body.appendChild(g); drag.ghost = g; drag.src.classList.add('ag-dragging');
      scrollRaf = requestAnimationFrame(autoscroll);
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
    const t = findTarget(e.clientX, e.clientY);
    if (t !== drag.target) { clearTarget(); drag.target = t; t?.classList.add('ag-drop'); }
    e.preventDefault();
  }, { passive: false });
  const endDrag = async (e, cancelled) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    cancelAnimationFrame(scrollRaf); clearTimeout(d.timer); clearTarget(); d.ghost?.remove(); d.src?.classList.remove('ag-dragging', 'ag-armed');
    if (!d.started) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    if (cancelled || !d.target) return;
    if (d.target.dataset.ev) { const other = ui.events.find(x => x.id === d.target.dataset.ev); if (other) await doSwap(d.ev, other); }
    else if (d.target.dataset.date) await doMoveToDay(d.ev, d.target.dataset.date);
  };
  // com o nome "pego" na ponta do dedo, a página não rola junto
  window.addEventListener('touchmove', (e) => { if (drag?.armed && e.cancelable) e.preventDefault(); }, { passive: false });
  main.addEventListener('contextmenu', (e) => { if (e.target.closest('.ag-mini.drag')) e.preventDefault(); });
  window.addEventListener('pointerup', (e) => endDrag(e, false));
  window.addEventListener('pointercancel', (e) => endDrag(e, true));
}

// ---------- HTML ----------

function slotName(slot, nameOf) { return slot.client_id ? nameOf(slot.client_id) : (slot.title || 'Bloqueio'); }
function titleOf(ev, nameOf) { return ev.client_id ? nameOf(ev.client_id) + (ev.title ? ` · ${ev.title}` : '') : (ev.title || A.KINDS[ev.kind].label); }
function waType(ev) {
  if (ev.status === 'faltou') return 'falta';
  if (ev.status === 'cancelado') return 'cancelado';
  if (ev.kind === 'reposicao') return 'reposicao';
  return ev.orig_date ? 'remarcado' : 'confirmar';
}

function pageHtml(ui, nameOf) {
  const today = D.todayIso();
  const tabs = [['dia', 'Dia'], ['semana', 'Semana'], ['fixos', 'Fixos'], ['repos', `Reposições${ui.credits.length ? ` (${ui.credits.length})` : ''}`]];
  return `
    <div class="admin-header"><div class="admin-title">Agenda</div><button class="admin-btn primary" data-new>+ Novo</button></div>
    <div class="pc-tabs">${tabs.map(([k, l]) => `<button class="pc-tab ${ui.view === k ? 'active' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
    ${ui.view === 'dia' ? dayHtml(ui, nameOf, today) : ui.view === 'semana' ? weekHtml(ui, nameOf, today) : ui.view === 'fixos' ? slotsHtml(ui, nameOf) : creditsHtml(ui, nameOf)}
    <div class="pc-toast" id="ag-toast"></div>`;
}

function navHtml(ui, label) {
  return `<div class="ag-nav"><button class="admin-btn" data-nav="-1">‹</button><button class="admin-btn" data-nav="today">Hoje</button><button class="admin-btn" data-nav="1">›</button><div class="ag-nav-label">${label}</div></div>`;
}

function dayPills(ui, today) {
  const days = A.weekDays(ui.date);
  return `<div class="ag-pills">${days.map(d => {
    const evs = ui.events.filter(e => e.on_date === d && A.ABSENCES.indexOf(e.status) < 0 && e.kind !== 'bloqueio');
    const miss = ui.unmarked.some(e => e.on_date === d);
    return `<button class="ag-pill ${d === ui.date ? 'active' : ''} ${d === today ? 'today' : ''}" data-day="${d}"><span>${A.DOW_SHORT[A.dowOf(d)]}</span><b>${d.slice(8)}</b><small>${evs.length || ''}${miss ? ' <i class="ag-dot" title="Sem registro"></i>' : ''}</small></button>`;
  }).join('')}</div>`;
}

function dayHtml(ui, nameOf, today) {
  const evs = ui.events.filter(e => e.on_date === ui.date).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const att = evs.filter(e => ['treino', 'reposicao', 'avaliacao', 'consulta'].includes(e.kind));
  const c = (s) => att.filter(e => e.status === s).length;
  const oldest = ui.unmarked[0];
  return `
    ${navHtml(ui, A.fmtDayLong(ui.date) + (ui.date === today ? ' · hoje' : ''))}
    ${dayPills(ui, today)}
    ${ui.unmarked.length ? `<div class="pc-note warn">⚠ ${ui.unmarked.length} atendimento(s) passado(s) sem registro de presença. <button class="pc-link" data-day="${oldest.on_date}">Ver o mais antigo (${A.fmtDay(oldest.on_date)})</button></div>` : ''}
    ${att.length ? `<div class="admin-row-sub ag-sum">${att.length} atendimento(s)${c('feito') ? ` · ${c('feito')} compareceram` : ''}${c('faltou') + c('desmarcou') ? ` · ${c('faltou') + c('desmarcou')} falta(s)` : ''}${c('cancelado') ? ` · ${c('cancelado')} cancelado(s)` : ''}</div>` : ''}
    <div class="ag-list">${evs.map(e => cardHtml(e, ui, nameOf, today)).join('') || `<div class="admin-empty">Nada marcado pra este dia.<br>Use <b>+ Novo</b> ou cadastre os horários fixos dos alunos.</div>`}</div>`;
}

function cardHtml(ev, ui, nameOf, today) {
  const st = A.STATUS[ev.status];
  const isClient = !!ev.client_id;
  const needs = A.needsMark(ev, today, (() => { const n = new Date(); return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; })());
  const attend = ['treino', 'reposicao', 'avaliacao', 'consulta'].includes(ev.kind);
  const btn = (act, label, cls = '') => `<button class="ag-btn ${cls}" data-act="${act}" data-id="${ev.id}">${label}</button>`;
  const actions = [];
  if (ev.status === 'agendado') {
    if (attend) actions.push(btn('done', '✓ Veio', 'ok'), btn('faltou', 'Faltou'), btn('desmarcou', 'Desmarcou'), btn('cancelado', 'Cancelei'));
    if (attend && isClient) actions.push(btn('trip', '✈ Viaja'));
    if (ev.kind === 'lembrete') actions.push(btn('done', '✓ Feito', 'ok'));
    actions.push(btn('move', 'Mover'));
    if (ev.slot_id && ev.kind === 'treino') actions.push(btn('cancel-one', 'Sem treino neste dia'));
    if (ev.slot_id && ev.kind === 'bloqueio') actions.push(btn('cancel-one', 'Liberar este dia'));
  } else {
    actions.push(btn('undo', 'Desfazer'));
    if (ev.generates_credit && A.ABSENCES.includes(ev.status) && ui.credits.some(c => c.id === ev.id)) actions.push(btn('repo', 'Marcar reposição', 'ok'));
  }
  if (!ev.slot_id) actions.push(btn('del', 'Apagar'));
  const phone = ui.byId[ev.client_id]?.phone;
  const c = ui.byId[ev.client_id];
  const wa = isClient && attend ? `<a class="ag-btn" target="_blank" rel="noopener" href="${A.waLink(phone, A.waMessage(waType(ev), ev, c?.full_name || ''))}">WhatsApp</a>` : '';
  const movable = A.canReorder(ev);
  const dayEvs = ui.events.filter(x => x.on_date === ev.on_date);
  const hasUp = movable && !!A.neighbor(dayEvs, ev, -1), hasDown = movable && !!A.neighbor(dayEvs, ev, 1);
  const move = movable ? `<div class="ag-move"><button class="ag-grip" data-drag="${ev.id}" title="Segure e arraste sobre outro nome pra trocar de horário" aria-label="Arrastar">⠿</button><button class="ag-arrow" data-act="up" data-id="${ev.id}" ${hasUp ? '' : 'disabled'} aria-label="Subir">↑</button><button class="ag-arrow" data-act="down" data-id="${ev.id}" ${hasDown ? '' : 'disabled'} aria-label="Descer">↓</button></div>` : '';
  return `<div class="ag-card k-${ev.kind} s-${ev.status} ${A.isTrip(ev) ? 'trip' : ''} ${needs ? 'needs' : ''} ${movable ? 'has-move' : ''}" data-ev="${ev.id}">
    <div class="ag-time"><b>${A.hm(ev.start_time)}</b><span>${ev.duration_min ? A.endTime(ev.start_time, ev.duration_min) : ''}</span></div>
    <div class="ag-body">
      <div class="ag-title">${esc(titleOf(ev, nameOf))}</div>
      <div class="ag-badges">
        ${ev.kind !== 'treino' ? `<span class="pc-badge phase">${A.KINDS[ev.kind].label}</span>` : ''}
        ${(attend || ev.kind === 'lembrete') && !(ev.kind === 'lembrete' && ev.status === 'agendado') && !A.isTrip(ev) ? `<span class="pc-badge ${st.cls}">${ev.kind === 'lembrete' && ev.status === 'feito' ? 'Feito' : st.label}</span>` : ''}
        ${ev.orig_date ? `<span class="pc-badge deload">remarcado · era ${A.fmtDay(ev.orig_date)} ${A.hm(ev.orig_time)}</span>` : ''}
        ${A.isTrip(ev) ? `<span class="pc-badge down">✈ Viagem · não vem</span>` : ''}
        ${ev.generates_credit && A.ABSENCES.includes(ev.status) ? `<span class="pc-badge warn">gera reposição</span>` : ''}
        ${ev.makeup_for ? `<span class="pc-badge phase">reposição</span>` : ''}
        ${ev.kind === 'bloqueio' && ev.status === 'cancelado' ? `<span class="pc-badge up">liberado neste dia</span>` : ''}
        ${needs ? `<span class="pc-badge warn">marque se veio</span>` : ''}
      </div>
      ${ev.note ? `<div class="ag-note">${esc(ev.note)}</div>` : ''}
      <div class="ag-actions">${actions.join('')}${wa}</div>
    </div>
    ${move}
  </div>`;
}

function weekHtml(ui, nameOf, today) {
  const days = A.weekDays(ui.date);
  return `
    ${navHtml(ui, `${A.fmtDay(days[0])} a ${A.fmtDay(days[6])}`)}
    <div class="admin-row-sub ag-hint">Segure um nome e arraste: pra outro nome (troca os horários) ou pra outro dia (mantém a hora). Toque num nome pra ver as opções. <span class="ag-leg red"></span> avisou que não vem</div>
    <div class="ag-week">${days.map(d => {
      const evs = ui.events.filter(e => e.on_date === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
      return `<div class="ag-col ${d === today ? 'today' : ''}" data-date="${d}"><button class="ag-colhead" data-day="${d}">${A.fmtDay(d)}</button>
        ${evs.map(e => `<button class="ag-mini k-${e.kind} s-${e.status} ${A.isTrip(e) ? 'trip' : ''} ${A.canReorder(e) ? 'drag' : ''}" data-quick="${e.id}" data-ev="${e.id}"><b>${A.hm(e.start_time)}</b> ${esc(titleOf(e, nameOf).split(' ').slice(0, 2).join(' '))}${A.isTrip(e) ? ' <small>✈ Viagem</small>' : e.status !== 'agendado' && e.kind !== 'bloqueio' ? ` <small>${A.STATUS[e.status].label}</small>` : ''}</button>`).join('') || '<div class="ag-empty">—</div>'}</div>`;
    }).join('')}</div>`;
}

function slotsHtml(ui, nameOf) {
  const today = D.todayIso();
  const live = ui.slots.filter(s => s.active && (!s.valid_until || s.valid_until >= today));
  const ended = ui.slots.filter(s => !live.includes(s));
  const byClient = {};
  for (const s of live) (byClient[s.client_id ? s.client_id : `b:${s.title}`] ||= []).push(s);
  const keyName = (k) => k.startsWith('b:') ? k.slice(2) : nameOf(k);
  const rows = Object.entries(byClient).sort((a, b) => (a[0].startsWith('b:') - b[0].startsWith('b:')) || keyName(a[0]).localeCompare(keyName(b[0])));
  return `
    <div class="ag-fixhead"><div class="admin-row-sub">Os atendimentos e bloqueios da semana são criados sozinhos a partir destes horários.</div><button class="admin-btn primary" data-slot-new>+ Horário fixo</button></div>
    <div class="ag-list">${rows.map(([key, slots]) => `<div class="admin-card ag-fix">
      <div class="admin-row-name">${esc(keyName(key))}${key.startsWith('b:') ? ' <span class="pc-badge phase">Bloqueio</span>' : ''}</div>
      ${slots.map(s => `<div class="ag-slot"><span><b>${A.slotLabel(s)}</b> · ${s.duration_min} min${s.valid_until ? ` · até ${A.fmtDay(s.valid_until)}` : ''}${s.valid_from > today ? ` · a partir de ${A.fmtDay(s.valid_from)}` : ''}</span>
        <span><button class="ag-btn" data-slot-act="change" data-id="${s.id}">Mudar horário</button><button class="ag-btn" data-slot-act="end" data-id="${s.id}">Encerrar</button></span></div>`).join('')}
    </div>`).join('') || `<div class="admin-empty">Nenhum horário fixo ainda.<br>Cadastre os dias e horários de cada aluno com <b>+ Horário fixo</b>.</div>`}</div>
    ${ended.length ? `<details class="admin-card"><summary>Encerrados (${ended.length})</summary>${ended.map(s => `<div class="admin-row-sub">${esc(slotName(s, nameOf))} · ${A.slotLabel(s)} · ${A.fmtDay(s.valid_from)}${s.valid_until ? ` a ${A.fmtDay(s.valid_until)}` : ''}</div>`).join('')}</details>` : ''}`;
}

function creditsHtml(ui, nameOf) {
  return `<div class="admin-row-sub">Faltas marcadas como "gera reposição" que ainda não foram repostas.</div>
    <div class="ag-list">${ui.credits.map(c => `<div class="admin-card ag-fix">
      <div class="admin-row-name">${esc(nameOf(c.client_id))}</div>
      <div class="admin-row-sub">${A.STATUS[c.status].label} em ${A.fmtDay(c.on_date)} às ${A.hm(c.start_time)}${c.note ? ` · ${esc(c.note)}` : ''}</div>
      <div class="ag-actions"><button class="ag-btn ok" data-credit="repo" data-id="${c.id}">Marcar reposição</button><button class="ag-btn" data-credit="drop" data-id="${c.id}">Dispensar crédito</button></div>
    </div>`).join('') || `<div class="admin-empty">Nenhuma reposição pendente. 🎉</div>`}</div>`;
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

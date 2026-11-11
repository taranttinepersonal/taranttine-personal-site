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
    const kinds = Object.entries(A.KINDS).map(([k, v]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${k === 'treino' ? 'Treino avulso' : v.label}</option>`).join('');
    openModal(`
      <div class="pc-sum-title">${makeupFor ? 'Marcar reposição' : 'Novo compromisso'}</div>
      <label>Tipo<select id="f-kind" ${lockKind ? 'disabled' : ''}>${kinds}</select></label>
      <label id="w-client">Aluno<select id="f-client">${clientOptions(clientId)}</select></label>
      <label id="w-title">Título<input id="f-title" placeholder="Ex.: Almoço, Viagem, Ligar pro Renan"></label>
      <div class="ag-row3">
        <label>Dia<input type="date" id="f-date" value="${date}"></label>
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
        if (k === 'lembrete') q('#f-dur').value = 0; else if (+q('#f-dur').value === 0) q('#f-dur').value = k === 'avaliacao' ? 90 : 60;
        if (k === 'avaliacao' && +q('#f-dur').value === 60) q('#f-dur').value = 90;
      };
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

  // ----- cliques -----
  main.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-v],[data-nav],[data-day],[data-act],[data-new],[data-slot-new],[data-slot-act],[data-credit]');
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
    if (t.dataset.act) {
      const e = ui.events.find(x => x.id === t.dataset.id);
      if (!e) return;
      const act = t.dataset.act;
      try {
        if (act === 'done') { await D.setStatus(e.id, 'feito'); await refresh(); toast('Compareceu.'); }
        else if (act === 'undo') { await D.setStatus(e.id, 'agendado'); await refresh(); toast('Voltou pra agendado.'); }
        else if (['faltou', 'desmarcou', 'cancelado'].includes(act)) openAbsence(e, act);
        else if (act === 'move') openMove(e);
        else if (act === 'repo') openEventForm({ kind: 'reposicao', clientId: e.client_id, makeupFor: e.id, lockKind: true, date: A.addDays(e.on_date, 1) });
        else if (act === 'del') { if (confirm('Apagar este compromisso?')) { await D.deleteEvent(e.id); await refresh(); toast('Apagado.'); } }
        else if (act === 'cancel-one') { if (confirm('Só este dia? O horário fixo continua nos outros dias.')) { await D.setStatus(e.id, 'cancelado'); await refresh(); toast('Cancelado.'); } }
      } catch (err) { console.error(err); alert('Erro: ' + (err.message || err)); }
    }
  });
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
  return `<div class="ag-card k-${ev.kind} s-${ev.status} ${needs ? 'needs' : ''}">
    <div class="ag-time"><b>${A.hm(ev.start_time)}</b><span>${ev.duration_min ? A.endTime(ev.start_time, ev.duration_min) : ''}</span></div>
    <div class="ag-body">
      <div class="ag-title">${esc(titleOf(ev, nameOf))}</div>
      <div class="ag-badges">
        ${ev.kind !== 'treino' ? `<span class="pc-badge phase">${A.KINDS[ev.kind].label}</span>` : ''}
        ${(attend || ev.kind === 'lembrete') && !(ev.kind === 'lembrete' && ev.status === 'agendado') ? `<span class="pc-badge ${st.cls}">${ev.kind === 'lembrete' && ev.status === 'feito' ? 'Feito' : st.label}</span>` : ''}
        ${ev.orig_date ? `<span class="pc-badge deload">remarcado · era ${A.fmtDay(ev.orig_date)} ${A.hm(ev.orig_time)}</span>` : ''}
        ${ev.generates_credit && A.ABSENCES.includes(ev.status) ? `<span class="pc-badge warn">gera reposição</span>` : ''}
        ${ev.makeup_for ? `<span class="pc-badge phase">reposição</span>` : ''}
        ${ev.kind === 'bloqueio' && ev.status === 'cancelado' ? `<span class="pc-badge up">liberado neste dia</span>` : ''}
        ${needs ? `<span class="pc-badge warn">marque se veio</span>` : ''}
      </div>
      ${ev.note ? `<div class="ag-note">${esc(ev.note)}</div>` : ''}
      <div class="ag-actions">${actions.join('')}${wa}</div>
    </div>
  </div>`;
}

function weekHtml(ui, nameOf, today) {
  const days = A.weekDays(ui.date);
  return `
    ${navHtml(ui, `${A.fmtDay(days[0])} a ${A.fmtDay(days[6])}`)}
    <div class="ag-week">${days.map(d => {
      const evs = ui.events.filter(e => e.on_date === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
      return `<div class="ag-col ${d === today ? 'today' : ''}"><button class="ag-colhead" data-day="${d}">${A.fmtDay(d)}</button>
        ${evs.map(e => `<button class="ag-mini k-${e.kind} s-${e.status}" data-day="${d}"><b>${A.hm(e.start_time)}</b> ${esc(titleOf(e, nameOf).split(' ').slice(0, 2).join(' '))}${e.status !== 'agendado' && e.kind !== 'bloqueio' ? ` <small>${A.STATUS[e.status].label}</small>` : ''}</button>`).join('') || '<div class="ag-empty">—</div>'}</div>`;
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

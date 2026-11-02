const $ = (id) => document.getElementById(id);
const ACTION_LABELS = {ask_expert: 'Ask the expert', accept: 'Accept the order', reject: 'Reject the order', request_evidence: 'Request missing information', escalate: 'Ask for a review', report_permission_issue: 'Report missing access'};
const CATEGORY_LABELS = {knowledge: 'Advice from the expert', permission: 'Missing access', missing_case_data: 'Missing order information', tool_failure: 'A tool is not working', ambiguous_task: 'The task is unclear', unknown: 'Needs a closer look'};
const FIELD_LABELS = {supplier: 'Supplier', certificate: 'Certificate', quantity: 'Quantity', machine_revision: 'Machine version', ordered_part: 'Part requested', offered_part: 'Part offered', documents_complete: 'All documents present', part_matches: 'Part matches the order', access: 'System access', replacement_reference: 'Replacement reference', original_status: 'Original order status', order_kind: 'Order type', first_batch_units: 'Units in the first delivery', minimum_start_units: 'Units needed to start', remaining_delivery_before_deadline: 'Rest arrives before the deadline', delivery_mode: 'Delivery type'};
const SOURCE_LABELS = {'case-facts': 'Order details', 'handbook-v1': 'Handbook', 'approved-guidance': 'Approved handover note'};
const STATUS_LABELS = {not_started: 'Not started', investigating: 'Reading the order', needs_help: 'Waiting for help', submitted: 'Decision saved'};
const SPLIT_LABELS = {discovery: 'First order', transfer: 'New order', boundary: 'Harder order', control: 'Everyday order'};
const actionLabel = value => ACTION_LABELS[value] || value.replaceAll('_', ' ');
const fieldLabel = value => FIELD_LABELS[value] || value.replaceAll('_', ' ');
const factValue = value => value === null ? 'Not provided' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
const evidenceLabel = item => SOURCE_LABELS[item.id] || item.title;

function stored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function remember(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

let sid = stored('mm-session');
let state;
let active;
let selectedId = stored('mm-active');
let pending = null;
let working = false;

const draftsKey = () => `mm-draft:${sid}:${active?.id}`;

function draft() {
  try { return JSON.parse(stored(draftsKey()) || '{}'); } catch { return {}; }
}

function saveDraft() {
  if (!active || active.result) return;
  const data = {
    reason: $('reason').value,
    action: $('action').value,
    category: $('category').value,
    refs: [...$('citations').querySelectorAll('input:checked')].map((box) => box.value),
    pending,
    expert: $('expert-answer').value,
  };
  const saved = remember(draftsKey(), JSON.stringify(data));
  $('draft-status').textContent = saved
    ? 'Draft saved on this device.'
    : 'Draft could not be saved on this device. Keep this tab open.';
}

function categoryVisibility() {
  const show = ['ask_expert', 'escalate'].includes($('action').value);
  $('category').hidden = !show;
  $('category-label').hidden = !show;
}

function error(err) {
  const node = $('error');
  node.textContent = err.message;
  node.hidden = false;
  node.focus();
}

function toast(message) {
  const host = $('toasts');
  host.replaceChildren();
  const node = document.createElement('p');
  node.className = 'toast';
  node.textContent = message;
  host.append(node);
  window.setTimeout(() => { if (node.isConnected) node.remove(); }, 3200);
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {'Content-Type': 'application/json', ...(sid ? {'X-Session-ID': sid} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = response.status;
    throw err;
  }
  return data;
}

function text(tag, value) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function lock(disabled) {
  document.querySelectorAll('button, select, textarea, input').forEach((node) => {
    if (!disabled && node.dataset.keepDisabled === 'true') return;
    node.disabled = disabled;
  });
}

async function refresh() {
  state = await api('/api/state');
  render();
}

async function busy(button, fn) {
  if (working) return;
  working = true;
  document.body.classList.add('is-working');
  document.body.setAttribute('aria-busy', 'true');
  lock(true);
  $('error').hidden = true;
  $('error').textContent = '';
  const note = $('model-note');
  const previous = note ? note.textContent : '';
  const slow = button && ['diagnose', 'suggest', 'draft', 'attack'].includes(button.id);
  const providerLabel = state?.provider === 'meta' ? 'Meta' : 'Baseten';
  const workingNote = `${providerLabel} is working. This can take a few seconds.`;
  if (slow && note) note.textContent = workingNote;
  try {
    await fn();
  } catch (err) {
    error(err);
    if (note) note.textContent = previous;
  } finally {
    working = false;
    document.body.classList.remove('is-working');
    document.body.removeAttribute('aria-busy');
    if (slow && note && note.textContent === workingNote) note.textContent = previous;
    lock(false);
  }
}

function clean() {
  for (const input of $('citations').querySelectorAll('input')) input.checked = false;
  pending = null;
  $('reason').value = '';
  $('document').hidden = true;
}

function fillCases(selected) {
  const groups = [];
  for (const item of state.cases) {
    let group = groups.find((entry) => entry.family === item.family);
    if (!group) {
      group = {family: item.family, cases: []};
      groups.push(group);
    }
    group.cases.push(item);
  }
  $('case').replaceChildren(...groups.map((group) => {
    const label = document.createElement('optgroup');
    label.label = state.family_labels[group.family] || group.family;
    label.append(...group.cases.map((item) => {
      const option = text('option', item.label.replace(/Rehearsal/gi, 'First order').replace(/Fresh case/gi, 'New order').replace(/Boundary case/gi, 'Harder order'));
      option.value = item.id;
      return option;
    }));
    return label;
  }));
  if (selected) $('case').value = selected;
}

function stageFor(attempt) {
  if (state?.summary?.pending_attack) return 'attack';
  if (!attempt) return 'rehearse';
  if (attempt.case.split === 'transfer' || attempt.case.split === 'boundary') return 'retest';
  if (attempt.gaps.some((gap) => gap.status === 'open' && (gap.category === 'knowledge' || gap.category === 'unknown'))) return 'capture';
  return 'rehearse';
}

function markStages(stage) {
  const done = {
    rehearse: state.summary.attempts > 0,
    capture: state.summary.approved_guidance > 0,
    retest: state.attempts.some((item) => (item.case.split === 'transfer' || item.case.split === 'boundary') && item.result),
    attack: state.attacks.length > 0 && !state.summary.pending_attack,
  };
  document.body.dataset.stage = stage;
  for (const item of $('stages').querySelectorAll('[data-stage]')) {
    const name = item.dataset.stage;
    const current = name === stage;
    item.classList.toggle('current', current);
    item.classList.toggle('done', Boolean(done[name]) && !current);
    if (current) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  }
}

function paintSpend() {
  const spent = Number(state.spend.spent_usd);
  const budget = Number(state.spend.budget_usd) || 0;
  const pct = budget ? Math.min(100, Math.max(0, (spent / budget) * 100)) : 0;
  const bucket = Math.round(pct / 5) * 5;
  $('spend-fill').className = `spend-fill p${bucket}${pct >= 80 ? ' is-hot' : ''}`;
  $('spend-label').textContent = `$${spent.toFixed(2)} of $${budget.toFixed(0)}`;
  const meter = $('spend-meter');
  meter.setAttribute('aria-valuenow', spent.toFixed(4));
  meter.setAttribute('aria-valuemax', String(budget));
  meter.setAttribute('aria-valuetext', `$${spent.toFixed(4)} of $${budget.toFixed(2)} used`);
}

function paintSummary() {
  const submitted = state.attempts.filter((item) => item.result);
  const incorrect = submitted.filter((item) => !item.result.correct_action).length;
  const safePauses = submitted.filter((item) => item.result.paused && item.result.safe_handling).length;
  const rows = [
    ['Completed without the expert', String(state.summary.independent), `of ${state.summary.completed} submitted`],
    ['Incorrect decisions', String(incorrect), 'of submitted decisions'],
    ['Times the expert was needed', String(state.summary.expert_contacts), 'direct requests in this session'],
    ['Open requests', String(state.summary.open_gaps), 'still unanswered'],
    ['Approved notes', String(state.summary.approved_guidance), 'available to later cases'],
    ['Paused for help', String(safePauses), 'requests for information, access or review'],
    ['Harder orders handled correctly', String(state.summary.attacks_held), state.summary.attacks ? `of ${state.summary.attacks} generated orders` : 'not run yet'],
  ];
  $('summary').replaceChildren(...rows.map(([label, value, hint]) => {
    const card = document.createElement('div');
    card.className = 'metric';
    card.append(text('strong', value), text('span', label), text('small', hint));
    return card;
  }));
  const transferDone = state.attempts.some((item) => (item.case.split === 'transfer' || item.case.split === 'boundary') && item.result);
  $('summary-note').textContent = transferDone
    ? 'These are results from this practice session, not a prediction of how a real team will perform.'
    : 'No new orders checked yet.';
}

function paintHistory() {
  if (!state.attempts.length) {
    $('history').replaceChildren(text('p', 'No saved orders yet. Start an order above.'));
  } else {
    $('history').replaceChildren(...[...state.attempts].reverse().map((item) => {
      const count = item.actions.length;
      const button = text('button', `${item.case.case_id} · ${STATUS_LABELS[item.status] || item.status} · ${count} ${count === 1 ? 'step' : 'steps'}`);
      button.type = 'button';
      button.className = 'secondary';
      button.setAttribute('aria-pressed', String(item.id === selectedId));
      button.onclick = () => {
        selectedId = item.id;
        clean();
        render();
      };
      return button;
    }));
  }
  $('timeline').replaceChildren();
  if (!active) return;
  $('timeline').append(text('h3', `Recorded steps · ${active.case.case_id}`));
  if (!active.actions.length) {
    $('timeline').append(text('p', 'No decision recorded yet.'));
    return;
  }
  for (const action of active.actions) {
    const card = document.createElement('div');
    card.className = 'trail';
    const sources = action.evidence_refs.map(id => SOURCE_LABELS[id] || id).join(', ') || 'None recorded (earlier attempt)';
    card.append(
      text('strong', actionLabel(action.action)),
      text('p', action.reason),
      text('small', `${new Date(action.created).toLocaleString()} · Sources: ${sources}`),
    );
    $('timeline').append(card);
  }
}

function paintAttacks() {
  const pending = Boolean(state.summary.pending_attack);
  const ready = state.summary.approved_guidance > 0;
  $('attack').dataset.keepDisabled = ready && !pending ? 'false' : 'true';
  $('attack').disabled = working || $('attack').dataset.keepDisabled === 'true';
  const host = state.attempts.find((item) => item.gaps.some((gap) => gap.status === 'open' && gap.question.startsWith('Attack:')));
  $('attack-note').textContent = pending
    ? 'The advice fell short. Ask the expert to clarify it, then approve the revised note. The earlier note stays in use until then.'
    : ready
      ? 'The AI will try harder orders using the approved note. Each answer is checked against the exercise’s answer key, which the AI cannot see.'
      : 'Approve an expert’s note about a replacement part first. Then test it with harder orders.';
  const labels = {held: 'Correct next step', too_vague: 'Needed more help', wrong: 'Incorrect next step'};
  const conditions = {
    wrong_certificate: 'Wrong certificate',
    missing_certificate: 'Missing certificate',
    lookalike_revision: 'Similar machine version',
  };
  const cards = state.attacks.map((item) => {
    const card = document.createElement('article');
    card.className = `attack-card ${item.verdict}`;
    const facts = Object.entries(item.facts).map(([key, value]) => `${fieldLabel(key)}: ${value === null ? 'missing' : value}`).join(' · ');
    card.append(
      text('strong', `${conditions[item.condition] || item.condition} · ${labels[item.verdict] || item.verdict}`),
      text('p', item.note),
      text('p', facts),
      text('small', `AI suggested ${actionLabel(item.suggested_action)}. Expected next step: ${actionLabel(item.graded_action)}.`),
    );
    return card;
  });
  if (host && host.id !== active?.id) {
    const jump = text('button', `Open ${host.case.case_id} to clarify the note`);
    jump.type = 'button';
    jump.className = 'secondary';
    jump.onclick = () => {
      selectedId = host.id;
      render();
      $('capture').scrollIntoView({block: 'center'});
    };
    cards.unshift(jump);
  }
  $('attacks').replaceChildren(...(cards.length ? cards : [text('p', 'No harder orders tested yet.')]));
}

function render() {
  const choice = $('case').value;
  fillCases(choice);
  $('handbook').replaceChildren(...state.handbook.map((line) => text('li', line)));
  $('model-note').textContent = state.model_status === 'ready'
    ? `${state.provider === 'baseten' ? 'Baseten' : 'Meta'} · ${state.model_name}. $${Number(state.spend.spent_usd).toFixed(4)} of $${Number(state.spend.budget_usd).toFixed(0)} used.`
    : state.setup_message;
  paintSpend();
  $('guidance-count').textContent = state.summary.approved_guidance
    ? `${state.summary.approved_guidance} approved note${state.summary.approved_guidance === 1 ? '' : 's'} saved in this practice session.`
    : 'No approved handover notes yet.';
  active = state.attempts.find((item) => item.id === selectedId) || state.attempts.at(-1);
  selectedId = active ? active.id : null;
  remember('mm-active', selectedId || '');
  const savedDraft = active ? draft() : {};
  pending = savedDraft.pending || null;
  const checked = new Set(savedDraft.refs || []);
  $('reason').value = savedDraft.reason || '';
  $('expert-answer').value = savedDraft.expert || '';
  $('action').value = savedDraft.action || 'ask_expert';
  $('category').value = savedDraft.category || 'knowledge';
  categoryVisibility();
  $('draft-status').textContent = savedDraft.reason ? 'Draft restored from this device.' : '';
  $('boot').hidden = true;
  $('empty').hidden = Boolean(active);
  $('empty').textContent = 'Start an order above. Read the details, then decide what you can do or what help you need.';
  $('mission').hidden = !active;
  // Workbench steps: step 1 (evidence) lives outside #decision, so hide it explicitly when empty
  for (const step of document.querySelectorAll('#workbench .wb-step')) step.hidden = !active;
  $('facts').replaceChildren();
  $('evidence-list').replaceChildren();
  $('result').replaceChildren();
  $('result').className = '';
  $('decision').hidden = !active || Boolean(active.result);
  // When decision is hidden, its inner wb-steps are also hidden via the form — keep step-heads from showing orphaned
  for (const step of document.querySelectorAll('#decision .wb-step')) step.hidden = $('decision').hidden;
  $('gap-panel').hidden = !active?.gaps.length;
  $('gaps').replaceChildren();
  $('capture').hidden = true;
  $('fresh').hidden = true;
  $('fresh').classList.remove('is-boundary');
  $('case-title').hidden = !active;
  $('citations').replaceChildren(text('legend', 'Which information supports your answer?'));
  markStages(stageFor(active));
  document.body.classList.toggle('has-attempt', Boolean(active));
  document.body.classList.toggle('has-approved', state.summary.approved_guidance > 0);
  const hasOpenExpert = Boolean(active && active.gaps.some(g => g.status === 'open' && (g.category === 'knowledge' || g.category === 'unknown')));
  document.body.classList.toggle('is-morgan', hasOpenExpert);
  // Scene: when Morgan question open, hide Alex form visually but keep in DOM for later reveal
  if (hasOpenExpert) {
    $('decision').hidden = true;
    for (const step of document.querySelectorAll('#decision .wb-step')) step.hidden = true;
  } else if (active && !active.result) {
    $('decision').hidden = false;
    for (const step of document.querySelectorAll('#decision .wb-step')) step.hidden = false;
  }
  $('title').textContent = active
    ? `${SPLIT_LABELS[active.case.split] || 'Order'} ${active.case.case_id}`
    : 'Ready for Monday?';
  if (!active) $('diagnosis').hidden = true;
  if (active) {
    $('mission').textContent = active.case.split === 'discovery'
      ? 'Read the order and handbook. If you cannot decide, ask the AI to help you find what’s missing.'
      : 'Read the order and the available advice. Choose your next step and explain why.';
    $('case-title').textContent = `${state.family_labels[active.case.family] || active.case.family} · ${active.case.title}`;
    if (active.case.split === 'transfer' || active.case.split === 'boundary') {
      $('fresh').hidden = false;
      $('fresh').classList.toggle('is-boundary', active.case.split === 'boundary');
      $('fresh').textContent = active.case.split === 'transfer'
        ? 'A new order, without the expert’s help. Use the handbook and approved handover note to decide what to do.'
        : 'This order tests the limits of the advice. Check the details carefully before accepting it.';
    }
    for (const [key, value] of Object.entries(active.case.facts)) {
      $('facts').append(text('dt', fieldLabel(key)), text('dd', factValue(value)));
    }
    // Step heading now in HTML (.wb-step-head); no JS-injected h3 needed
    for (const item of active.evidence) {
      const viewed = active.inspected.includes(item.id);
      const button = text('button', `${viewed ? '✓ Opened' : 'Open'} · ${evidenceLabel(item)}`);
      button.type = 'button';
      button.className = viewed ? 'evidence-button secondary is-open' : 'evidence-button secondary';
      button.setAttribute('aria-pressed', String(viewed));
      button.onclick = () => busy(button, async () => {
        const doc = await api('/api/inspect', {attempt_id: active.id, evidence_id: item.id});
        await refresh();
        $('document-title').textContent = evidenceLabel(item);
        $('document-content').replaceChildren(...doc.content.map((line) => text('li', line)));
        $('document').hidden = false;
      });
      $('evidence-list').append(button);
      if (viewed) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = item.id;
        input.checked = checked.has(item.id);
        label.append(input, document.createTextNode(evidenceLabel(item)));
        $('citations').append(label);
      }
    }
    $('checkpoint').textContent = active.inspected.length
      ? 'Choose an AI helper below, or write your own answer. Tick the information you used before saving.'
      : 'First, open the order details and handbook above. Then ask for help or write your next step.';
    if (active.result) {
      const outcome = active.result;
      const fresh = active.case.split === 'transfer' || active.case.split === 'boundary';
      const decision = active.actions.find((item) => item.action !== 'ask_expert');
      const boundaryStop = outcome.correct_action && active.case.split === 'boundary' && decision && decision.action === 'reject';
      const line = boundaryStop
        ? 'Correct: this order was rejected. Its details do not meet the exercise’s rule.'
        : outcome.independent_completion && fresh
          ? 'Correct decision on a new order. No expert was asked for help on this attempt.'
          : outcome.independent_completion
            ? 'Correct decision. No expert was asked for help on this attempt.'
            : outcome.correct_action
              ? 'Correct next step. This order still needed information, access or help.'
              : outcome.safe_handling
                ? 'You paused the task. It remains unresolved.'
                : outcome.paused
                  ? 'The exercise calls for a different next step. Check the information available.'
                  : 'This decision does not match the exercise’s answer. Check the order and the limits of the advice before trying again.';
      const verdict = boundaryStop || (outcome.independent_completion && fresh)
        ? 'verdict-pass'
        : outcome.correct_action || outcome.safe_handling
          ? 'verdict-hold'
          : 'verdict-miss';
      $('result').className = verdict;
      $('result').append(text('strong', fresh ? 'Handover check' : 'Order result'), text('p', line));
      if (outcome.independent_completion && !boundaryStop) $('result').append(text('p', 'This result applies to this practice order.'));
      const last = active.actions.at(-1);
      $('result').append(text('p', `Your decision: ${actionLabel(last.action)}. Reason: ${last.reason}`));
    }
    for (const gap of active.gaps) {
      const card = document.createElement('div');
      card.className = 'gap';
      const label = {open: 'Open', approved: 'Approved for later cases', rejected: 'Rejected'}[gap.status] || gap.status;
      card.append(text('strong', CATEGORY_LABELS[gap.category] || gap.category), text('p', gap.question), text('small', label));
      $('gaps').append(card);
    }
    const openGap = active.gaps.find((gap) => gap.status === 'open' && (gap.category === 'knowledge' || gap.category === 'unknown'));
    if (openGap) {
      $('capture').hidden = false;
      $('capture-question').textContent = openGap.question;
      const ca = $('capture-attempt');
      if (ca) {
        ca.replaceChildren();
        const dl = document.createElement('dl');
        for (const [k,v] of Object.entries(active.case.facts)) {
          const dt = document.createElement('dt');
          dt.textContent = fieldLabel(k);
          const dd = document.createElement('dd');
          dd.textContent = factValue(v);
          dl.append(dt, dd);
        }
        const hdr = document.createElement('p');
        hdr.textContent = `${SPLIT_LABELS[active.case.split] || 'Order'} ${active.case.case_id} · ${state.family_labels[active.case.family] || active.case.family}`;
        hdr.className = 'capture-attempt-hdr';


        ca.append(hdr, dl);
      }
    }
    const diagnosis = active.diagnosis;
    $('diagnosis').hidden = !diagnosis;
    if (diagnosis) {
      $('diagnosis').replaceChildren(
        text('strong', `What is missing: ${CATEGORY_LABELS[diagnosis.category] || diagnosis.category}`),
        text('p', diagnosis.missing_distinction),
        text('p', diagnosis.expert_question),
        text('small', `Suggested next step: ${actionLabel(diagnosis.suggested_action)}. ${diagnosis.uncertainties.join(' ')}`),
      );
    }
  }
  const nextId = active?.case.case_id === 'S01' && active.gaps.some(gap => gap.status === 'approved')
    ? 'S02' : active?.case.case_id === 'S02' && active.result ? 'S05' : '';
  $('next-order').hidden = !nextId;
  $('next-order-button').dataset.caseId = nextId;
  $('next-order-button').textContent = nextId === 'S02' ? 'Try a new order · S02' : 'Check a harder order · S05';
  $('next-order-note').textContent = nextId === 'S02'
    ? 'The expert’s note is approved. Now check whether it helps with a new order.'
    : 'Next, check an order that may fall outside the advice.';
  paintSummary();
  paintAttacks();
  paintHistory();
  if (working) lock(true);
  else {
    $('start').disabled = false;
    $('new').disabled = false;
  }
}

async function startCase(caseId) {
  selectedId = (await api('/api/attempts', {case_id: caseId})).attempt_id;
  $('case').value = caseId;
  clean();
  await refresh();
  $('workbench').scrollIntoView({block: 'start'});
}
$('start').onclick = () => busy($('start'), () => startCase($('case').value));

$('next-order-button').onclick = () => busy($('next-order-button'), () => startCase($('next-order-button').dataset.caseId));

$('new').onclick = () => busy($('new'), async () => {
  if (!confirm('Start a new session? Existing attempts remain saved locally.')) return;
  sid = (await api('/api/sessions', {})).session_id;
  if (!remember('mm-session', sid)) toast('This browser could not store the session. Keep this tab open.');
  selectedId = null;
  clean();
  await refresh();
  toast('New session ready. Earlier sessions stay in the local database.');
});

$('decision').onsubmit = (event) => {
  event.preventDefault();
  busy($('save'), async () => {
    const refs = [...$('citations').querySelectorAll('input:checked')].map((box) => box.value);
    if (!refs.length) throw new Error('Open and select at least one source before saving.');
    const payload = {
      attempt_id: active.id,
      action: $('action').value,
      reason: $('reason').value,
      evidence_refs: refs,
      category: $('category').value,
    };
    const signature = JSON.stringify(payload);
    if (!pending || pending.signature !== signature) pending = {signature, id: crypto.randomUUID()};
    saveDraft();
    await api('/api/actions', {...payload, id: pending.id});
    pending = null;
    remember(draftsKey(), '{}');
    await refresh();
    $('reason').value = '';
    toast('Next step saved in this session.');
    if (!$('capture').hidden) $('capture').scrollIntoView({block: 'center'});
  });
};

$('decision').addEventListener('input', saveDraft);
$('decision').addEventListener('change', () => { categoryVisibility(); saveDraft(); });

async function review(decision, answer = $('expert-answer').value) {
  if (!active) return;
  const data = await api('/api/guidance', {attempt_id: active.id, answer, decision});
  if (data.needs_review) {
    $('review-note').textContent = data.message;
    return;
  }
  $('review-note').textContent = data.abstained
    ? 'No note was shared. Your “I don’t know” answer was saved.'
    : data.premise
      ? 'Your feedback was saved. No handover note was shared.'
      : '';
  if (data.published) {
    toast('Approved. You can now try a new order with this note.');
    const hb = document.querySelector('.handbook');
    if (hb) {
      hb.classList.add('highlight');
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      try { hb.scrollIntoView({behavior: prefersReduced ? 'auto' : 'smooth', block: 'center'}); } catch {}
      // Focus for a11y without scrolling again
      const gc = $('guidance-count');
      if (gc) gc.setAttribute('tabindex','-1');
      // Remove highlight after a moment - respects reduced motion by using no animation if needed
      window.setTimeout(() => hb.classList.remove('highlight'), 1400);
    }
  }
  else if (!data.abstained && !data.premise) toast('Rejected. Nothing was published.');
  $('expert-answer').value = '';
  saveDraft();
  await refresh();
}

function selectSuggestedSources(refs) {
  const selected = new Set(refs || []);
  for (const input of $('citations').querySelectorAll('input')) input.checked = selected.has(input.value);
}

$('diagnose').onclick = () => busy($('diagnose'), async () => {
  if (!active) return;
  const data = await api('/api/diagnose', {attempt_id: active.id});
  selectSuggestedSources(data.evidence_refs);
  $('reason').value = data.expert_question;
  $('action').value = data.suggested_action;
  if ([...$('category').options].some((option) => option.value === data.category)) $('category').value = data.category;
  categoryVisibility();
  saveDraft();
  await refresh();
  toast('Question ready. Check it and the selected information, then save your next step.');
});

$('suggest').onclick = () => busy($('suggest'), async () => {
  if (!active) return;
  const data = await api('/api/suggest', {attempt_id: active.id});
  selectSuggestedSources(data.evidence_refs);
  $('reason').value = data.reason;
  $('action').value = data.action;
  categoryVisibility();
  saveDraft();
  await refresh();
  toast('Suggestion ready. Check the action, explanation and selected information before saving.');
});

$('draft').onclick = () => busy($('draft'), async () => {
  if (!active) return;
  const data = await api('/api/draft', {attempt_id: active.id, answer: $('expert-answer').value});
  $('expert-answer').value = data.card;
  saveDraft();
  await refresh();
  toast('Note ready. Read it carefully, then approve it if it matches the expert’s advice.');
});

$('attack').onclick = () => busy($('attack'), async () => {
  const data = await api('/api/attack', {});
  if (data.draft_created) selectedId = data.attempt_id;
  await refresh();
  (data.draft_created ? $('capture') : $('attack-panel')).scrollIntoView({block: 'center'});
  toast(data.draft_created
    ? 'The advice fell short on a harder order. Ask the expert to clarify the note and approve the change.'
    : 'The AI handled these harder orders correctly.');
});

$('approve').onclick = () => busy($('approve'), () => review('approve'));
$('reject').onclick = () => busy($('reject'), () => review('reject'));
$('unknown').onclick = () => busy($('unknown'), () => review('abstain', "I don't know"));
$('premise').onclick = () => busy($('premise'), () => review('premise', $('expert-answer').value.trim() || 'This scenario is unrealistic.'));
$('expert-answer').addEventListener('input', saveDraft);

(async () => {
  try {
    if (!sid) {
      sid = (await api('/api/sessions', {})).session_id;
      if (!remember('mm-session', sid)) toast('This browser could not store the session. Keep this tab open.');
    }
    try {
      await refresh();
    } catch (err) {
      if (err.status !== 404) throw err;
      sid = (await api('/api/sessions', {})).session_id;
      remember('mm-session', sid);
      selectedId = null;
      await refresh();
      error(new Error('The previous session is no longer available in this database. A new session is ready.'));
    }
  } catch (err) {
    $('boot').hidden = true;
    error(err);
  }
})();

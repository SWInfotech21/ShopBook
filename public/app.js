const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// --- i18n setup (Phase 1) ---
const i18n = {
  EN: {
    'tabs.transactions': 'Transactions',
    'tabs.accounts': 'Accounts',
    'tabs.reports': 'Reports',
    'tabs.admin': 'Users',
    'titles.transactions': 'Transactions',
    'titles.accounts': 'Accounts',
    'titles.reports': 'Reports',
    'titles.admin': 'Users',
    'titles.password': 'Change My Password',
    'titles.faq': 'Frequently Asked Questions (FAQs)'
  },
  BEN: {
    'tabs.transactions': 'লেনদেন',
    'tabs.accounts': 'হিসাব',
    'tabs.reports': 'রিপোর্ট',
    'tabs.admin': 'ব্যবহারকারী',
    'titles.transactions': 'লেনদেন',
    'titles.accounts': 'হিসাব',
    'titles.reports': 'রিপোর্ট',
    'titles.admin': 'ব্যবহারকারী',
    'titles.password': 'আমার পাসওয়ার্ড পরিবর্তন করুন',
    'titles.faq': 'প্রায়শই জিজ্ঞাসিত প্রশ্ন (FAQs)'
  },
  HIN: {
    'tabs.transactions': 'लेनदेन',
    'tabs.accounts': 'खाते',
    'tabs.reports': 'रिपोर्ट',
    'tabs.admin': 'उपयोगकर्ता',
    'titles.transactions': 'लेनदेन',
    'titles.accounts': 'खाते',
    'titles.reports': 'रिपोर्ट',
    'titles.admin': 'उपयोगकर्ता',
    'titles.password': 'मेरा पासवर्ड बदलें',
    'titles.faq': 'अक्सर पूछे जाने वाले प्रश्न (FAQs)'
  }
};

async function accountStatementLoad(accountId, accountName, currentBalance, displayIndex = 0) {
  try {
    const pane = document.getElementById('account-statement');
    const title = document.getElementById('acct-stmt-title');
    if (title) title.textContent = `Account Statement — ${accountName} (#${displayIndex || accountId})`;
    setHidden(pane, false);
    // initialize pager state
    acctStmtPager.accountId = accountId;
    acctStmtPager.accountName = accountName;
    acctStmtPager.displayIndex = displayIndex || accountId;
    acctStmtPager.currentBalance = Number(currentBalance || 0);
    const today = todayInTimeZone('Asia/Kolkata');
    const fromEl = document.getElementById('acct-stmt-from');
    const toEl = document.getElementById('acct-stmt-to');
    if (fromEl && !fromEl.value) fromEl.value = today;
    if (toEl && !toEl.value) toEl.value = today;
    acctStmtPager.from = fromEl ? fromEl.value : today;
    acctStmtPager.to = toEl ? toEl.value : today;
    // fetch and render
    await acctStmtFetch();
    acctStmtApplyFilters();
    acctStmtRender();
    // Close button
    const closeBtn = document.getElementById('acct-stmt-close');
    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.addEventListener('click', () => setHidden('account-statement', true));
      closeBtn.dataset.bound = '1';
    }
  } catch (e) {
    showAlert('acc-alert', 'error', e.message || 'Failed to load account statement');
  }
}

async function acctStmtFetch() {
  const params = new URLSearchParams({
    account_id: String(acctStmtPager.accountId),
    from: acctStmtPager.from || '1970-01-01',
    to: acctStmtPager.to || todayInTimeZone('Asia/Kolkata'),
    limit: '1000',
    offset: '0',
  });
  const res = await api(`/rehan/api/reports/ledger?${params.toString()}`);
  acctStmtPager.baseRows = Array.isArray(res?.data) ? res.data : [];
}

function acctStmtApplyFilters() {
  const mode = (document.getElementById('acct-stmt-mode')?.value || 'all');
  const q = (document.getElementById('acct-stmt-search')?.value || '').trim().toLowerCase();
  acctStmtPager.mode = mode;
  acctStmtPager.q = q;
  // Compute opening/closing from current balance across baseRows (DESC)
  let closing = Number(acctStmtPager.currentBalance || 0);
  const computed = [];
  for (const r of acctStmtPager.baseRows) {
    const amount = Number(r.amount || 0);
    const isCredit = (r.direction === 'credit');
    const credit = isCredit ? amount : 0;
    const debit = !isCredit ? amount : 0;
    const opening = closing - (isCredit ? credit : -debit);
    const row = { ...r, opening, credit, debit, closing };
    computed.push(row);
    closing = opening;
  }
  // Filter by mode and search (ref or notes)
  let filt = computed;
  if (mode && mode !== 'all') filt = filt.filter(r => String(r.type || '').toUpperCase() === mode.toUpperCase());
  if (q) filt = filt.filter(r => String(r.transaction_ref || '').toLowerCase().includes(q) || String(r.notes || '').toLowerCase().includes(q));
  acctStmtPager.rows = filt;
  // Reset offset if out of range
  if (acctStmtPager.offset >= acctStmtPager.rows.length) acctStmtPager.offset = 0;
}

function acctStmtRender() {
  const tbody = document.querySelector('#acct-stmt-table tbody');
  if (tbody) tbody.innerHTML = '';
  const pageSizeEl = document.getElementById('acct-stmt-page-size');
  acctStmtPager.limit = pageSizeEl ? parseInt(pageSizeEl.value || '10', 10) : 10;
  const start = acctStmtPager.offset;
  const end = Math.min(acctStmtPager.rows.length, start + acctStmtPager.limit);
  const pageRows = acctStmtPager.rows.slice(start, end);
  // Render rows
  for (const r of pageRows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.transaction_ref ?? '-'}</td>
      <td>${r.type ?? ''}</td>
      <td>${Number(r.opening || 0).toFixed(2)}</td>
      <td>${r.credit ? Number(r.credit).toFixed(2) : ''}</td>
      <td>${r.debit ? Number(r.debit).toFixed(2) : ''}</td>
      <td>${Number(r.closing || 0).toFixed(2)}</td>
      <td>${r.created_at ?? ''}</td>
      <td>${r.tr_by ?? ''}</td>
      <td>${r.notes ?? ''}</td>`;
    if (tbody) tbody.appendChild(tr);
  }
  // Pager info and buttons
  const pagerEl = document.getElementById('acct-stmt-pager-info');
  const total = acctStmtPager.rows.length;
  const totalPages = acctStmtPager.limit > 0 ? Math.max(1, Math.ceil(total / acctStmtPager.limit)) : 1;
  const page = Math.floor(acctStmtPager.offset / acctStmtPager.limit) + 1;
  if (pagerEl) pagerEl.textContent = `Page ${page} of ${totalPages} (${total} records)`;
  const prev = document.getElementById('acct-stmt-prev');
  const next = document.getElementById('acct-stmt-next');
  if (prev) prev.disabled = acctStmtPager.offset <= 0;
  if (next) next.disabled = acctStmtPager.offset + acctStmtPager.limit >= total;
  // Totals across filtered rows
  let totOpening = 0, totCredit = 0, totDebit = 0, totClosing = 0;
  for (const r of acctStmtPager.rows) {
    totOpening += Number(r.opening || 0);
    totCredit += Number(r.credit || 0);
    totDebit += Number(r.debit || 0);
    totClosing += Number(r.closing || 0);
  }
  const totalsEl = document.getElementById('acct-stmt-totals');
  if (totalsEl) totalsEl.textContent = `Transactions: ${total} | Total Opening: ${totOpening.toFixed(2)} | Total Credit: ${totCredit.toFixed(2)} | Total Debit: ${totDebit.toFixed(2)} | Total Closing: ${totClosing.toFixed(2)}`;
}
;

function getLanguage() {
  try { return localStorage.getItem('lang') || 'EN'; } catch { return 'EN'; }
}

function setLanguage(lang = 'EN') {
  const dict = i18n[lang] || i18n.EN;
  try { localStorage.setItem('lang', lang); } catch {}
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });
}

let session = {
  user: null,
};
let adminEditId = null;
let txPager = { limit: 10, offset: 0, total: 0, q: '', from: null, to: null };
let loansPager = { limit: 10, offset: 0, total: 0, q: '', from: null, to: null, status: 'all', total_amount: 0 };
let ledgerPager = { limit: 25, offset: 0, total: 0 };
let acctStmtPager = {
  accountId: 0,
  accountName: '',
  displayIndex: 0,
  currentBalance: 0,
  from: null,
  to: null,
  mode: 'all',
  q: '',
  limit: 10,
  offset: 0,
  baseRows: [], // raw rows from API
  rows: [], // rows with computed opening/closing
};

function setHidden(id, hidden) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (!el) return;
  el.classList.toggle('hidden', hidden);
}

// Reintroduced: load accounts list and populate selects
async function loadAccounts() {
  const btn = document.getElementById('refresh-accounts');
  if (btn) setLoading(btn, true, 'Refreshing...');
  try {
    const accounts = await api('/rehan/api/accounts');
    const tbody = document.querySelector('#accounts-table tbody');
    if (tbody) {
      tbody.innerHTML = '';
      if (Array.isArray(accounts) && accounts.length) {
        const list = [...accounts].sort((a, b) => (b.id || 0) - (a.id || 0));
        let idx = 1;
        for (const a of list) {
          const tr = document.createElement('tr');
          const displayIdx = idx++;
          tr.innerHTML = `<td>${displayIdx}</td><td class="acct-link" style="cursor:pointer; text-decoration:underline" data-idx="${displayIdx}" data-id="${a.id}" data-name="${a.name}" data-current="${a.current_balance}">${a.name}</td><td>${a.type}</td><td>${a.opening_balance}</td><td>${a.current_balance}</td><td>${a.notes ?? ''}</td>`;
          tbody.appendChild(tr);
        }
        // bind clicks to open statement
        tbody.querySelectorAll('.acct-link').forEach(el => {
          el.addEventListener('click', () => {
            const id = parseInt(el.getAttribute('data-id'), 10);
            const name = el.getAttribute('data-name') || '';
            const curr = parseFloat(el.getAttribute('data-current') || '0');
            const disp = parseInt(el.getAttribute('data-idx') || '0', 10) || 0;
            if (Number.isFinite(id)) {
              accountStatementLoad(id, name, curr, disp);
            }
          });
        });
      } else {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="6">No records found</td>`;
        tbody.appendChild(tr);
      }
    }
    // Populate selects used elsewhere
    const selects = ['#tx-commission-account', '#tx-received', '#tx-debit', '#rep-ledger-account', '#tx1-account', '#tx1-commission-account'];
    const sortedForSelects = Array.isArray(accounts) ? [...accounts].sort((a, b) => (b.id || 0) - (a.id || 0)) : [];
    const ascByName = Array.isArray(accounts) ? [...accounts].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })) : [];
    const cash = Array.isArray(accounts) ? accounts.find(a => String(a.name || '').toLowerCase() === 'cash') : null;
    const cashId = cash ? String(cash.id) : '';
    for (const sel of selects) {
      const el = document.querySelector(sel);
      if (!el) continue;
      // preserve previous selection if rebuilding
      const previous = el.value || '';
      el.innerHTML = '';
      // For ledger account selector, add an 'All Accounts' option
      if (sel === '#rep-ledger-account') {
        const allOpt = document.createElement('option');
        allOpt.value = '0';
        allOpt.textContent = 'All Accounts';
        el.appendChild(allOpt);
      } else {
        // For form selects, add a non-select placeholder so 'Cash' isn't auto-selected
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = '-- Select Account --';
        el.appendChild(ph);
      }
      const source = (sel === '#tx1-account' || sel === '#tx1-commission-account') ? ascByName : sortedForSelects;
      for (const a of source || []) {
        const opt = document.createElement('option');
        opt.value = a.id;
        // Always show only the name (e.g., 'Cash'), do not prefix with ID
        opt.textContent = `${a.name}`;
        el.appendChild(opt);
      }
      // restore previous selection if still present; otherwise keep placeholder
      let restored = false;
      if (previous) {
        const exists = Array.from(el.options).some(o => String(o.value) === String(previous));
        if (exists) { el.value = previous; restored = true; }
      }
      // default to Cash if available and not the reports selector
      if (!restored && sel !== '#rep-ledger-account' && cashId) {
        const hasCash = Array.from(el.options).some(o => String(o.value) === cashId);
        if (hasCash) el.value = cashId;
      }
    }
  } catch (e) {
    // show error on login alert to surface
    showAlert('login-alert', 'error', e.message || 'Failed to load accounts');
  } finally {
    if (btn) setLoading(btn, false);
  }
}

// Minimal admin users loader to avoid runtime errors and show users
async function adminLoadUsers() {
  try {
    const data = await api('/rehan/api/users');
    const tbody = document.querySelector('#admin-users-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (Array.isArray(data) && data.length) {
      for (const u of data) {
        const canDelete = (u.role !== 'admin') && (!session.user || u.id !== session.user.id);
        const tr = document.createElement('tr');
        const isActive = (String(u.active) === '1' || u.active === 1 || u.active === true);
        const activeBadge = isActive ? '<span class="badge badge-pill badge-success">Active</span>' : '<span class="badge badge-pill badge-danger">Inactive</span>';
        tr.innerHTML = `
          <td>${u.id}</td>
          <td>${u.username}</td>
          <td>${u.role}</td>
          <td>${activeBadge}</td>
          <td>${u.allowed_time_start ?? ''}</td>
          <td>${u.allowed_time_end ?? ''}</td>
          <td>${u.email ?? ''}</td>
          <td>${u.created_at ?? ''}</td>
          <td>
            <button class="edit-user" title="Edit user"
              data-id="${u.id}"
              data-username="${u.username}"
              data-role="${u.role}"
              data-active="${u.active}"
              data-start="${u.allowed_time_start ?? ''}"
              data-end="${u.allowed_time_end ?? ''}"
              data-email="${u.email ?? ''}"
              style="background:none;border:none;cursor:pointer;padding:4px" aria-label="Edit">
              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="skyblue" fill="skyblue"></path>
                <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="skyblue"></path>
              </svg>
            </button>
            ${canDelete ? `
            <button class="delete-user" data-id="${u.id}" title="Delete user"
              style="background:none;border:none;cursor:pointer;padding:4px" aria-label="Delete">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6h18" stroke="#d9534f" stroke-width="2"/>
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#d9534f" stroke-width="2"/>
                <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" stroke="#d9534f" stroke-width="2"/>
                <path d="M10 11v6M14 11v6" stroke="#d9534f" stroke-width="2"/>
              </svg>
            </button>` : ''}
          </td>`;
        tbody.appendChild(tr);
      }
      // Delegate actions
      tbody.onclick = async (ev) => {
        const t = ev.target.closest('button');
        if (!t) return;
        if (t.classList.contains('edit-user')) {
          startAdminEditFromBtn(t);
        } else if (t.classList.contains('delete-user')) {
          const id = parseInt(t.dataset.id, 10);
          if (Number.isFinite(id)) {
            const ok = window.confirm('Are you sure you want to delete this user?');
            if (ok) {
              try {
                await api(`/rehan/api/users/${id}`, { method: 'DELETE' });
                await adminLoadUsers();
              } catch (e) {
                showAlert('admin-create-alert', 'error', e.message || 'Delete failed');
              }
            }
          }
        }
      };
    } else {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="9">No users</td>`;
      tbody.appendChild(tr);
    }
  } catch (e) {
    const tbody = document.querySelector('#admin-users-table tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9">${e.message}</td></tr>`;
  }
}

function startAdminEditFromBtn(btn) {
  adminEditId = parseInt(btn.dataset.id, 10);
  const uEl = document.getElementById('admin-new-username'); if (uEl) uEl.value = btn.dataset.username || '';
  const pEl = document.getElementById('admin-new-password'); if (pEl) pEl.value = '';
  const rEl = document.getElementById('admin-new-role'); if (rEl) rEl.value = btn.dataset.role || 'user';
  const aEl = document.getElementById('admin-new-active'); if (aEl) aEl.value = String(btn.dataset.active || '1');
  const sEl = document.getElementById('admin-new-start'); if (sEl) sEl.value = btn.dataset.start || '';
  const eEl = document.getElementById('admin-new-end'); if (eEl) eEl.value = btn.dataset.end || '';
  const emEl = document.getElementById('admin-new-email'); if (emEl) emEl.value = btn.dataset.email || '';
  const createBtn = document.getElementById('admin-create-btn');
  if (createBtn) createBtn.textContent = 'Update';
  const titleEl = document.getElementById('admin-form-title');
  if (titleEl) titleEl.textContent = 'Update User';
  const cancelBtn = document.getElementById('admin-cancel-edit');
  if (cancelBtn) cancelBtn.classList.remove('hidden');
}

function resetAdminCreateForm() {
  const u = document.getElementById('admin-new-username'); if (u) u.value = '';
  const p = document.getElementById('admin-new-password'); if (p) p.value = '';
  const r = document.getElementById('admin-new-role'); if (r) r.value = 'user';
  const a = document.getElementById('admin-new-active'); if (a) a.value = '1';
  const s = document.getElementById('admin-new-start'); if (s) s.value = '';
  const e = document.getElementById('admin-new-end'); if (e) e.value = '';
  const em = document.getElementById('admin-new-email'); if (em) em.value = '';
}

function exitAdminEditMode() {
  adminEditId = null;
  resetAdminCreateForm();
  const createBtn = document.getElementById('admin-create-btn');
  if (createBtn) createBtn.textContent = 'Add';
  const titleEl = document.getElementById('admin-form-title');
  if (titleEl) titleEl.textContent = 'Create User';
  const cancelBtn = document.getElementById('admin-cancel-edit');
  if (cancelBtn) cancelBtn.classList.add('hidden');
}

async function adminCreateUser() {
  const username = document.getElementById('admin-new-username')?.value.trim() || '';
  const password = document.getElementById('admin-new-password')?.value || '';
  const role = document.getElementById('admin-new-role')?.value || 'user';
  const active = parseInt(document.getElementById('admin-new-active')?.value || '1', 10);
  const allowed_time_start = document.getElementById('admin-new-start')?.value || null;
  const allowed_time_end = document.getElementById('admin-new-end')?.value || null;
  const email = document.getElementById('admin-new-email')?.value.trim() || null;
  setText('admin-create-result', '');
  clearAlert('admin-create-alert');
  const btn = document.getElementById('admin-create-btn');
  setLoading(btn, true, adminEditId ? 'Updating...' : 'Creating...');
  try {
    if (adminEditId) {
      await api(`/rehan/api/users/${adminEditId}`, { method: 'PUT', body: { role, active, allowed_time_start, allowed_time_end } });
      setText('admin-create-result', 'User updated.');
      showAlert('admin-create-alert', 'success', 'User updated successfully');
      exitAdminEditMode();
      await adminLoadUsers();
    } else {
      await api('/rehan/api/users', { method: 'POST', body: { username, password, role, active, allowed_time_start, allowed_time_end, email } });
      setText('admin-create-result', 'User created.');
      showAlert('admin-create-alert', 'success', 'User created successfully');
      resetAdminCreateForm();
      await adminLoadUsers();
    }
  } catch (e) {
    setText('admin-create-result', e.message);
    showAlert('admin-create-alert', 'error', e.message || 'Operation failed');
  } finally {
    setLoading(btn, false);
  }
}

async function submitOneWay() {
  const amount = parseFloat(document.getElementById('tx1-amount')?.value || '0');
  const account_id = parseInt(document.getElementById('tx1-account')?.value || '0', 10);
  const type = document.getElementById('tx1-type')?.value || 'Credit';
  const tx_mode = document.getElementById('tx1-mode')?.value || 'MT';
  const option_pay_later = document.getElementById('tx1-paylater')?.checked ? 1 : 0;
  const commission_amount = parseFloat(document.getElementById('tx1-commission')?.value || '0');
  const commission_account_id_val = document.getElementById('tx1-commission-account')?.value;
  const commission_account_id = commission_account_id_val ? parseInt(commission_account_id_val, 10) : null;
  const remarks = document.getElementById('tx1-remarks')?.value.trim() || null;
  setText('tx-result', '');
  clearAlert('tx1-alert');
  const btn = document.getElementById('tx1-submit');
  setLoading(btn, true, 'Submitting...');
  try {
    const body = { type, tx_mode, option_pay_later, amount, account_id, commission_amount, commission_account_id, remarks };
    const res = await api('/rehan/api/transactions/oneway', { method: 'POST', body });
    const newId = res && (res.transaction_id ?? res.id ?? null);
    const newRef = res && (res.transaction_ref ?? null);
    if (!newId && !newRef) {
      throw new Error(res && res.error ? res.error : 'No transaction_id returned');
    }
    const display = newRef ? `Ref ${newRef}` : `ID ${newId}`;
    setText('tx-result', `One Way submitted: ${display}`);
    showAlert('tx1-alert', 'success', `One Way transaction submitted (${display})`);
    await loadRecentTransactions();
    try { await loadLoans(); } catch (e) { console.error('loadLoans failed', e); }
    await fetchDaySummary();
    await fetchCommissions();
    if (document.getElementById('rep-ledger-account')?.value !== undefined) {
      await fetchLedger();
    }
    // reset inputs
    const amtEl = document.getElementById('tx1-amount'); if (amtEl) amtEl.value = '0';
    const remEl = document.getElementById('tx1-remarks'); if (remEl) remEl.value = '';
    const comEl = document.getElementById('tx1-commission'); if (comEl) comEl.value = '0';
  } catch (e) {
    setText('tx-result', e.message);
    showAlert('tx1-alert', 'error', e.message || 'Submit failed');
  } finally {
    setLoading(btn, false);
  }
}

function setText(id, text) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (el) el.textContent = text;
}

function showAlert(id, type, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden', 'alert-success', 'alert-error');
  el.classList.add('alert', type === 'success' ? 'alert-success' : 'alert-error');
  el.textContent = message;
}

function clearAlert(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}

function jsonPretty(data) {
  try { return JSON.stringify(data, null, 2); } catch { return String(data); }
}

function setLoading(el, loading, textWhenLoading = 'Loading...') {
  if (!el) return;
  el.dataset.origText = el.dataset.origText || el.textContent;
  el.disabled = !!loading;
  el.textContent = loading ? textWhenLoading : el.dataset.origText;
}

function setActiveTab(tabName) {
  const tabsNav = document.getElementById('tabs');
  if (!tabsNav) return;
  tabsNav.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    const show = pane.dataset.pane === tabName;
    pane.classList.toggle('hidden', !show);
  });
  // Persist selected tab only when authenticated
  if (session.user) {
    try { localStorage.setItem('activeTab', tabName); } catch {}
  }
  // Do not auto-reload here; handled on explicit tab button click in bindTabs()
}

function bindTabs() {
  const tabsNav = document.getElementById('tabs');
  if (!tabsNav) return;
  tabsNav.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      setActiveTab(tab);
      // Reload tables for the clicked tab only
      if (tab === 'transactions') {
        try { loadRecentTransactions(); } catch (e) { console.error('loadRecentTransactions on tab click failed', e); }
        try { loadLoans(); } catch (e) { console.error('loadLoans on tab click failed', e); }
      } else if (tab === 'accounts') {
        try { loadAccounts(); } catch (e) { console.error('loadAccounts on tab click failed', e); }
      } else if (tab === 'reports') {
        try { fetchDaySummary(); } catch (e) { console.error('fetchDaySummary on tab click failed', e); }
        try { fetchLedger(); } catch (e) { console.error('fetchLedger on tab click failed', e); }
        try { fetchCommissions(); } catch (e) { console.error('fetchCommissions on tab click failed', e); }
      } else if (tab === 'admin') {
        try { adminLoadUsers(); } catch (e) { console.error('adminLoadUsers on tab click failed', e); }
      }
    });
  });
}

function exportTableCSV(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const rows = Array.from(table.querySelectorAll('tr'));
  const csv = rows.map(tr => Array.from(tr.querySelectorAll('th,td'))
    .map(td => '"' + String(td.textContent).replace(/"/g, '""') + '"')
    .join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename || (tableId + '.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function printTable(tableId, title) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const win = window.open('', '_blank');
  const style = `
    <style>
      body{font-family: Arial, sans-serif; padding:16px}
      table{width:100%; border-collapse:collapse}
      th,td{border:1px solid #ccc; padding:8px; text-align:left}
      th{background:#f0f0f0}
      @media print { @page { size: auto; margin: 10mm; } }
    </style>`;
  win.document.write(`<html><head><title>${title || tableId}</title>${style}</head><body>`);
  win.document.write(`<h3>${title || ''}</h3>`);
  win.document.write(table.outerHTML);
  win.document.write('</body></html>');
  win.document.close();
  win.focus();
  win.print();
}

function bindExportPrintButtons() {
  document.querySelectorAll('button[data-export]').forEach(btn => {
    btn.addEventListener('click', () => exportTableCSV(btn.dataset.export, btn.dataset.export + '.csv'));
  });
  document.querySelectorAll('button[data-print]').forEach(btn => {
    btn.addEventListener('click', () => printTable(btn.dataset.print, btn.dataset.print));
  });
}

function bindLanguageMenu() {
  const en = document.getElementById('lang-en');
  const ben = document.getElementById('lang-ben');
  const hin = document.getElementById('lang-hin');
  if (en) en.addEventListener('click', () => setLanguage('EN'));
  if (ben) ben.addEventListener('click', () => setLanguage('BEN'));
  if (hin) hin.addEventListener('click', () => setLanguage('HIN'));
}

function enableOneClickDatePickers() {
  document.querySelectorAll('input[type="date"], input[type="time"]').forEach(input => {
    input.addEventListener('mousedown', (e) => {
      // Attempt to open picker on first click
      if (input.showPicker) {
        e.preventDefault();
        input.showPicker();
      } else {
        input.focus();
      }
    });
  });
}

function todayInTimeZone(tz) {
  // Build YYYY-MM-DD in a specific IANA time zone
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

async function api(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  };
  const res = await fetch(path, opts);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(data && data.error ? data.error : `HTTP ${res.status}`);
  }
  return data;
}

function updateUI() {
  const authed = !!session.user;
  setHidden('login-section', authed);
  setHidden('session-section', !authed);
  setHidden('tabs', !authed);
  const role = session.user?.role || null;
  const isAdmin = role === 'admin';
  const isPrivileged = role === 'admin' || role === 'readonly_admin';
  setHidden('accounts-section', !authed || !isPrivileged);
  setHidden('tx-section', !authed);
  setHidden('tx-list-section', !authed);
  setHidden('reports-section', !authed || !isPrivileged);
  // Always enforce these regardless of previous state
  setHidden('admin-section', !authed || !isAdmin);
  setHidden('password-section', !authed);

  if (authed) {
    const roleLabel = session.user.role;
    const username = session.user.username;
    setText('session-role', roleLabel);
    setText('session-username', username);
    setHidden('account-create', !isAdmin);
    const tabAdmin = document.getElementById('tab-admin');
    const tabPassword = document.getElementById('tab-password');
    if (tabAdmin) tabAdmin.classList.toggle('hidden', !isAdmin);
    if (tabPassword) tabPassword.classList.toggle('hidden', false);
    const adminSection = document.getElementById('admin-section');
    if (adminSection) adminSection.classList.toggle('hidden', !isAdmin);
    const passwordSection = document.getElementById('password-section');
    if (passwordSection) passwordSection.classList.toggle('hidden', false);
    // Hide Reports/Accounts tabs for 'user'
    const tabsNav = document.getElementById('tabs');
    if (tabsNav) {
      const repBtn = tabsNav.querySelector('[data-tab="reports"]');
      const accBtn = tabsNav.querySelector('[data-tab="accounts"]');
      if (repBtn) repBtn.classList.toggle('hidden', !isPrivileged);
      if (accBtn) accBtn.classList.toggle('hidden', !isPrivileged);
    }
    // Default to transactions tab for restricted users
    setActiveTab('transactions');
  }
  // When logged out ensure login form is the visible subview
  if (!authed) {
    setText('session-role', '');
    setText('session-username', '');
    showLogin();
  }
}

function showLogin() {
  setHidden('login-form', false);
  setHidden('forgot-section', true);
  setHidden('reset-section', true);
}

function showForgot() {
  setHidden('login-form', true);
  setHidden('forgot-section', false);
  setHidden('reset-section', true);
}

function showReset() {
  setHidden('login-form', true);
  setHidden('forgot-section', true);
  setHidden('reset-section', false);
}

async function loadRecentTransactions() {
  const btn = document.getElementById('tx-refresh-btn');
  if (btn) setLoading(btn, true, 'Refreshing...');
  try {
    const tbody = document.querySelector('#tx-table tbody');
    if (!tbody) return;
    // sync pager state from controls
    txPager.from = document.getElementById('tx-from')?.value || null;
    txPager.to = document.getElementById('tx-to')?.value || null;
    const sel = document.getElementById('tx-page-size');
    if (sel) txPager.limit = parseInt(sel.value, 10) || 10;
    const qEl = document.getElementById('tx-search');
    if (qEl) txPager.q = qEl.value.trim();

    const params = new URLSearchParams();
    if (txPager.from && txPager.to) { params.set('from', txPager.from); params.set('to', txPager.to); }
    params.set('limit', String(txPager.limit));
    params.set('offset', String(txPager.offset));
    if (txPager.q) params.set('q', txPager.q);
    const filterEl = document.getElementById('tx-search-filter');
    if (filterEl && filterEl.value) params.set('q_field', filterEl.value);
    const res = await api(`/rehan/api/transactions?${params.toString()}`);
    const rows = res?.data || [];
    txPager.total = res?.total || 0;
    tbody.innerHTML = '';
    let totalAmt = 0, totalComm = 0;
    if (Array.isArray(rows) && rows.length) {
      let idx = txPager.offset + 1;
      for (const t of rows) {
        const tr = document.createElement('tr');
        totalAmt += Number(t.amount || 0);
        totalComm += Number(t.commission_amount || 0);
        tr.innerHTML = `
          <td>${idx++}</td>
          <td>${t.type}</td>
          <td>${Number(t.amount).toFixed(2)}</td>
          <td>${t.received_in_account ?? ''}</td>
          <td>${t.debit_from_account ?? ''}</td>
          <td>${Number(t.commission_amount).toFixed(2)}</td>
          <td>${t.commission_account ?? ''}</td>
          <td>${t.created_at}</td>
          <td>${t.transaction_ref ?? ''}</td>
          <td>${t.created_by_username ?? ''}</td>
          <td>${t.remarks ?? ''}</td>`;
        tbody.appendChild(tr);
      }
    } else {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="11">No records</td>`;
      tbody.appendChild(tr);
    }
    // update totals and pager info
    const totalText = `Total Amount (page): ${totalAmt.toFixed(2)} | Total Commission (page): ${totalComm.toFixed(2)}`;
    const totalsEl = document.getElementById('tx-totals');
    if (totalsEl) totalsEl.textContent = totalText;
    const page = Math.floor(txPager.offset / txPager.limit) + 1;
    const totalPages = txPager.limit > 0 ? Math.max(1, Math.ceil(txPager.total / txPager.limit)) : 1;
    const pagerEl = document.getElementById('tx-pager-info');
    if (pagerEl) pagerEl.textContent = `Page ${page} of ${totalPages} (${txPager.total} records)`;
    const prevBtn = document.getElementById('tx-prev');
    const nextBtn = document.getElementById('tx-next');
    if (prevBtn) prevBtn.disabled = txPager.offset <= 0;
    if (nextBtn) nextBtn.disabled = txPager.offset + txPager.limit >= txPager.total;
  } catch (e) {
    const tbody = document.querySelector('#tx-table tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="11">${e.message}</td></tr>`;
  } finally {
    if (btn) setLoading(btn, false);
  }
}

async function loadLoans() {
  const btn = document.getElementById('loans-refresh-btn');
  if (btn) setLoading(btn, true, 'Refreshing...');
  try {
    const tbody = document.querySelector('#loans-table tbody');
    if (!tbody) return;
    // sync pager state from controls
    loansPager.from = document.getElementById('loans-from')?.value || null;
    loansPager.to = document.getElementById('loans-to')?.value || null;
    const sel = document.getElementById('loans-page-size');
    if (sel) loansPager.limit = parseInt(sel.value, 10) || 10;
    const qEl = document.getElementById('loans-search');
    if (qEl) loansPager.q = qEl.value.trim();
    const statusEl = document.getElementById('loans-status');
    if (statusEl) loansPager.status = statusEl.value || 'all';

    const params = new URLSearchParams();
    if (loansPager.from && loansPager.to) { params.set('from', loansPager.from); params.set('to', loansPager.to); }
    params.set('limit', String(loansPager.limit));
    params.set('offset', String(loansPager.offset));
    if (loansPager.q) params.set('q', loansPager.q);
    if (loansPager.status) params.set('status', loansPager.status);
    const res = await api(`/rehan/api/loans?${params.toString()}`);
    const rows = res?.data || [];
    loansPager.total = res?.total || 0;
    loansPager.total_amount = res?.total_amount || 0;
    tbody.innerHTML = '';
    let totalAmt = 0;
    if (Array.isArray(rows) && rows.length) {
      let idx = loansPager.offset + 1;
      for (const t of rows) {
        const tr = document.createElement('tr');
        totalAmt += Number(t.amount || 0);
        const st = (t.status || '').toLowerCase();
        let badgeClass = 'badge';
        let label = t.status || '';
        if (st === 'open') { badgeClass = 'badge badge-pill badge-danger'; label = 'Open'; }
        else if (st === 'partially_paid') { badgeClass = 'badge badge-pill badge-warning'; label = 'Partial'; }
        else if (st === 'closed') { badgeClass = 'badge badge-pill badge-success'; label = 'Paid'; }
        tr.innerHTML = `
          <td>${idx++}</td>
          <td>${t.party_name ?? ''}</td>
          <td>${t.account_name ?? ''}</td>
          <td>${t.type ?? ''}</td>
          <td>${t.tr_type ?? ''}</td>
          <td>${Number(t.amount).toFixed(2)}</td>
          <td>${t.due_date ?? ''}</td>
          <td><span class="${badgeClass}">${label}</span></td>
          <td>${t.created_at}</td>
          <td>${t.transaction_ref ?? ''}</td>`;
        tbody.appendChild(tr);
      }
    } else {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="10">No records</td>`;
      tbody.appendChild(tr);
    }
    // update totals and pager info
    const totalText = `Total Amount (page): ${totalAmt.toFixed(2)} | Total Amount: ${loansPager.total_amount.toFixed(2)}`;
    const totalsEl = document.getElementById('loans-totals');
    if (totalsEl) totalsEl.textContent = totalText;
    const page = Math.floor(loansPager.offset / loansPager.limit) + 1;
    const totalPages = loansPager.limit > 0 ? Math.max(1, Math.ceil(loansPager.total / loansPager.limit)) : 1;
    const pagerEl = document.getElementById('loans-pager-info');
    if (pagerEl) pagerEl.textContent = `Page ${page} of ${totalPages} (${loansPager.total} records)`;
    const prevBtn = document.getElementById('loans-prev');
    const nextBtn = document.getElementById('loans-next');
    if (prevBtn) prevBtn.disabled = loansPager.offset <= 0;
    if (nextBtn) nextBtn.disabled = loansPager.offset + loansPager.limit >= loansPager.total;
  } catch (e) {
    const tbody = document.querySelector('#loans-table tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8">${e.message}</td></tr>`;
  } finally {
    if (btn) setLoading(btn, false);
  }
}

// Try to obtain client geolocation quickly (with a short timeout)
async function getClientGeo(timeoutMs = 7000) {
  if (!('geolocation' in navigator)) return null;
  return await new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const { latitude, longitude } = pos.coords || {};
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          resolve({ latitude, longitude });
        } else {
          resolve(null);
        }
      },
      () => { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: timeoutMs }
    );
  });
}

async function login() {
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value;
  setText('login-result', '');
  clearAlert('login-alert');
  const btn = document.getElementById('login-btn');
  setLoading(btn, true, 'Logging in...');
  try {
    const geo = await getClientGeo(7000);
    const body = { username, password };
    if (geo) {
      body.latitude = String(geo.latitude);
      body.longitude = String(geo.longitude);
      body.location = `${geo.latitude},${geo.longitude}`;
    }
    const res = await api('/rehan/api/login', { method: 'POST', body });
    session.user = res.user;
    updateUI();
    showAlert('login-alert', 'success', 'Login successful');
  } catch (e) {
    setText('login-result', e.message);
    showAlert('login-alert', 'error', e.message || 'Login failed');
  } finally {
    setLoading(btn, false);
  }
}

async function forgotPassword() {
  const idf = $('#forgot-identifier').value.trim();
  setText('forgot-result', '');
  clearAlert('forgot-alert');
  const btn = document.getElementById('forgot-btn');
  setLoading(btn, true, 'Sending...');
  try {
    const res = await api('/rehan/api/forgot-password', { method: 'POST', body: { username_or_email: idf } });
    setText('forgot-result', 'Reset token sent. Check your email or contact admin.');
    showAlert('forgot-alert', 'success', 'Reset token sent');
    // If dev returned token
    if (res && res.token) {
      const tok = document.getElementById('reset-token');
      if (tok) tok.value = res.token;
    }
    showReset();
  } catch (e) {
    setText('forgot-result', e.message);
    showAlert('forgot-alert', 'error', e.message || 'Failed to send reset token');
  } finally {
    setLoading(btn, false);
  }
}

async function resetPassword() {
  const token = $('#reset-token').value.trim();
  const newpass = $('#reset-new').value;
  setText('reset-result', '');
  clearAlert('reset-alert');
  const btn = document.getElementById('reset-btn');
  setLoading(btn, true, 'Resetting...');
  try {
    await api('/rehan/api/reset-password', { method: 'POST', body: { token, new_password: newpass } });
    setText('reset-result', 'Password reset. You can login now.');
    showAlert('reset-alert', 'success', 'Password reset successfully');
    showLogin();
  } catch (e) {
    setText('reset-result', e.message);
    showAlert('reset-alert', 'error', e.message || 'Password reset failed');
  } finally {
    setLoading(btn, false);
  }
}

async function changeMyPassword() {
  const current_password = $('#chg-current').value;
  const new_password = $('#chg-new').value;
  setText('chg-pass-result', '');
  clearAlert('chg-alert');
  const btn = document.getElementById('chg-pass-btn');
  setLoading(btn, true, 'Changing...');
  try {
    await api('/rehan/api/change-password', { method: 'POST', body: { current_password, new_password } });
    setText('chg-pass-result', 'Password changed');
    showAlert('chg-alert', 'success', 'Password changed successfully');
    $('#chg-current').value = '';
    $('#chg-new').value = '';
  } catch (e) {
    setText('chg-pass-result', e.message);
    showAlert('chg-alert', 'error', e.message || 'Failed to change password');
  } finally {
    setLoading(btn, false);
  }
}

async function createAccount() {
  const name = $('#acc-name').value.trim();
  const type = $('#acc-type').value;
  const opening_balance = parseFloat($('#acc-opening').value || '0');
  const notes = $('#acc-notes').value.trim() || null;
  setText('acc-create-result', '');
  clearAlert('acc-alert');
  const btn = $('#acc-create-btn');
  setLoading(btn, true, 'Creating...');
  try {
    await api('/rehan/api/accounts', { method: 'POST', body: { name, type, opening_balance, notes } });
    setText('acc-create-result', 'Account created');
    showAlert('acc-alert', 'success', 'Account created successfully');
    await loadAccounts();
    await loadRecentTransactions();
    await fetchDaySummary();
    await fetchCommissions();
    if (document.getElementById('rep-ledger-account')?.value !== undefined) {
      await fetchLedger();
    }
    // reset form
    $('#acc-name').value = '';
    $('#acc-type').value = 'cash';
    $('#acc-opening').value = '0';
    $('#acc-notes').value = '';
  } catch (e) {
    setText('acc-create-result', e.message);
    showAlert('acc-alert', 'error', e.message || 'Failed to create account');
  } finally {
    setLoading(btn, false);
  }
}

async function submitTransaction() {
  const amount = parseFloat($('#tx-amount').value || '0');
  const commission_amount = parseFloat($('#tx-commission').value || '0');
  const commission_account_id = parseInt($('#tx-commission-account').value, 10);
  const received_in_account_id = parseInt($('#tx-received').value, 10);
  const debit_from_account_id = parseInt($('#tx-debit').value, 10);
  const option_pay_later = $('#tx-paylater').checked ? 1 : 0;
  const remarks = $('#tx-remarks').value.trim() || null;
  const selected_type = document.getElementById('tx-type')?.value || 'MT';
  setText('tx-result', '');
  clearAlert('tx-alert');
  const btn = $('#tx-submit');
  setLoading(btn, true, 'Submitting...');
  try {
    const body = {
      type: selected_type,
      amount,
      commission_amount,
      commission_account_id,
      received_in_account_id,
      debit_from_account_id,
      option_pay_later,
      remarks,
      created_by: session.user.id,
    };
    const res = await api('/rehan/api/transactions', { method: 'POST', body });
    setText('tx-result', `Transaction submitted: ID ${res.transaction_id}`);
    showAlert('tx-alert', 'success', `Transaction submitted (ID ${res.transaction_id})`);
    await loadRecentTransactions();
    await fetchDaySummary();
    await fetchCommissions();
    // refresh ledger if an account is selected
    if (document.getElementById('rep-ledger-account')?.value) {
      await fetchLedger();
    }
  } catch (e) {
    setText('tx-result', e.message);
  } finally {
    setLoading(btn, false);
  }
}

function setTodayDefaults() {
  const today = todayInTimeZone('Asia/Kolkata');
  const rd = document.getElementById('rep-date'); if (rd) rd.value = today;
  const rlf = document.getElementById('rep-ledger-from'); if (rlf) rlf.value = today;
  const rlt = document.getElementById('rep-ledger-to'); if (rlt) rlt.value = today;
  const rcf = document.getElementById('rep-comm-from'); if (rcf) rcf.value = today;
  const rct = document.getElementById('rep-comm-to'); if (rct) rct.value = today;
  const txFrom = document.getElementById('tx-from');
  const txTo = document.getElementById('tx-to');
  if (txFrom) txFrom.value = today;
  if (txTo) txTo.value = today;
  const lnFrom = document.getElementById('loans-from'); if (lnFrom) lnFrom.value = today;
  const lnTo = document.getElementById('loans-to'); if (lnTo) lnTo.value = today;
  const asFrom = document.getElementById('acct-stmt-from'); if (asFrom) asFrom.value = today;
  const asTo = document.getElementById('acct-stmt-to'); if (asTo) asTo.value = today;
}

async function fetchDaySummary() {
  const dateEl = document.getElementById('rep-date');
  const date = dateEl && dateEl.value ? dateEl.value : todayInTimeZone('Asia/Kolkata');
  const btn = $('#rep-day-btn');
  setLoading(btn, true, 'Fetching...');
  try {
    const data = await api(`/rehan/api/reports/day-summary?date=${encodeURIComponent(date)}&ts=${Date.now()}`);
    const tbody = document.querySelector('#rep-day-table tbody');
    tbody.innerHTML = '';
    let sumCredits = 0, sumDebits = 0;
    if (Array.isArray(data) && data.length) {
      let idx = 1;
      for (const r of data) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${idx++}</td><td>${r.name}</td><td>${r.opening_balance}</td><td>${r.total_credits}</td><td>${r.total_debits}</td><td>${r.closing_balance}</td>`;
        tbody.appendChild(tr);
        sumCredits += Number(r.total_credits || 0);
        sumDebits += Number(r.total_debits || 0);
      }
    } else {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6">No records found</td>`;
      tbody.appendChild(tr);
    }
    const totC = document.getElementById('rep-day-total-credits');
    const totD = document.getElementById('rep-day-total-debits');
    if (totC) totC.textContent = sumCredits.toFixed(2);
    if (totD) totD.textContent = sumDebits.toFixed(2);
  } catch (e) {
    const tbody = document.querySelector('#rep-day-table tbody');
    tbody.innerHTML = `<tr><td colspan="6">${e.message}</td></tr>`;
    const totC = document.getElementById('rep-day-total-credits');
    const totD = document.getElementById('rep-day-total-debits');
    if (totC) totC.textContent = '0.00';
    if (totD) totD.textContent = '0.00';
  } finally {
    setLoading(btn, false);
  }
}

async function fetchLedger() {
  const accEl = document.getElementById('rep-ledger-account');
  const val = accEl ? accEl.value : '0';
  const account_id = val && val !== '' ? parseInt(val, 10) : 0;
  const from = $('#rep-ledger-from').value;
  const to = $('#rep-ledger-to').value;
  // sync from UI if page size present
  const sizeEl = document.getElementById('rep-ledger-page-size');
  if (sizeEl) {
    const v = parseInt(sizeEl.value, 10);
    ledgerPager.limit = Number.isFinite(v) && v > 0 ? v : ledgerPager.limit;
  }
  const btn = $('#rep-ledger-btn');
  setLoading(btn, true, 'Fetching...');
  try {
    const res = await api(`/rehan/api/reports/ledger?account_id=${account_id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=${ledgerPager.limit}&offset=${ledgerPager.offset}&ts=${Date.now()}`);
    const rows = res?.data || [];
    ledgerPager.total = res?.total || 0;
    const tbody = document.querySelector('#rep-ledger-table tbody');
    tbody.innerHTML = '';
    if (Array.isArray(rows) && rows.length) {
      let idx = ledgerPager.offset + 1;
      for (const r of rows) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${idx++}</td><td>${r.transaction_ref ?? ''}</td><td>${r.type}</td><td>${r.created_at}</td><td>${r.direction}</td><td>${r.amount}</td><td>${r.notes ?? ''}</td>`;
        tbody.appendChild(tr);
      }
    } else {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7">No records found</td>`;
      tbody.appendChild(tr);
    }
    // update pager UI
    const page = ledgerPager.limit > 0 ? Math.floor(ledgerPager.offset / ledgerPager.limit) + 1 : 1;
    const totalPages = ledgerPager.limit > 0 ? Math.max(1, Math.ceil(ledgerPager.total / ledgerPager.limit)) : 1;
    const pagerInfo = document.getElementById('rep-ledger-pager-info');
    if (pagerInfo) pagerInfo.textContent = `Page ${page} of ${totalPages} (${ledgerPager.total} records)`;
    const prevBtn = document.getElementById('rep-ledger-prev');
    const nextBtn = document.getElementById('rep-ledger-next');
    if (prevBtn) prevBtn.disabled = ledgerPager.offset <= 0;
    if (nextBtn) nextBtn.disabled = ledgerPager.offset + ledgerPager.limit >= ledgerPager.total;
  } catch (e) {
    const tbody = document.querySelector('#rep-ledger-table tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7">${e.message}</td></tr>`;
  } finally {
    setLoading(btn, false);
  }
}

async function fetchCommissions() {
  const from = $('#rep-comm-from').value;
  const to = $('#rep-comm-to').value;
  const btn = $('#rep-comm-btn');
  setLoading(btn, true, 'Fetching...');
  try {
    const data = await api(`/rehan/api/reports/commissions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const tbody = document.querySelector('#rep-comm-table tbody');
    tbody.innerHTML = '';
    let sumCommission = 0;
    if (Array.isArray(data) && data.length) {
      for (const r of data) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.date}</td><td>${r.commission_account ?? ''}</td><td>${r.total_commission}</td>`;
        tbody.appendChild(tr);
        sumCommission += Number(r.total_commission || 0);
      }
      const totalEl = document.getElementById('rep-comm-total');
      if (totalEl) totalEl.textContent = sumCommission.toFixed(2);
    } else {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3">No records found</td>`;
      tbody.appendChild(tr);
      const totalEl = document.getElementById('rep-comm-total');
      if (totalEl) totalEl.textContent = '0.00';
    }
  } catch (e) {
    const tbody = document.querySelector('#rep-comm-table tbody');
    tbody.innerHTML = `<tr><td colspan="3">${e.message}</td></tr>`;
    const totalEl = document.getElementById('rep-comm-total');
    if (totalEl) totalEl.textContent = '0.00';
  } finally {
    setLoading(btn, false);
  }
}

async function logout() {
  try {
    await api('/rehan/api/logout', { method: 'POST' });
  } catch (e) {
    // ignore, still clear client state
  }
  session.user = null;
  try { localStorage.removeItem('activeTab'); } catch {}
  updateUI();
}

function bindEvents() {
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) loginBtn.addEventListener('click', login);
  const menuToggle = document.getElementById('session-menu-toggle');
  const menu = document.getElementById('session-menu');
  if (menuToggle && menu) {
    menuToggle.addEventListener('click', () => {
      const isHidden = menu.classList.contains('hidden');
      menu.classList.toggle('hidden', !isHidden);
      menuToggle.setAttribute('aria-expanded', String(isHidden));
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target !== menuToggle) {
        menu.classList.add('hidden');
        menuToggle.setAttribute('aria-expanded', 'false');
      }
    });
    const menSet = document.getElementById('session-menu-settings');
    if (menSet) menSet.addEventListener('click', () => { menu.classList.add('hidden'); setActiveTab('accounts'); });
    const menPwd = document.getElementById('session-menu-password');
    if (menPwd) menPwd.addEventListener('click', () => { menu.classList.add('hidden'); setActiveTab('password'); });
    const menFaq = document.getElementById('session-menu-faq');
    if (menFaq) menFaq.addEventListener('click', () => { menu.classList.add('hidden'); setActiveTab('faq'); });
    const menOut = document.getElementById('session-menu-logout');
    if (menOut) menOut.addEventListener('click', () => { menu.classList.add('hidden'); logout(); });
  }
  const forgotLink = document.getElementById('forgot-link');
  if (forgotLink) forgotLink.addEventListener('click', showForgot);
  const forgotBack = document.getElementById('forgot-back');
  if (forgotBack) forgotBack.addEventListener('click', showLogin);
  const resetBack = document.getElementById('reset-back');
  if (resetBack) resetBack.addEventListener('click', showLogin);
  const chgBtn = document.getElementById('chg-pass-btn');
  if (chgBtn) chgBtn.addEventListener('click', changeMyPassword);
  // TX mode tabs
  const txModeTabs = document.getElementById('tx-mode-tabs');
  if (txModeTabs) {
    txModeTabs.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        txModeTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
        const mode = btn.dataset.txmode;
        const one = document.getElementById('tx-oneway');
        const two = document.getElementById('tx-twoway');
        if (one && two) {
          one.classList.toggle('hidden', mode !== 'oneway');
          two.classList.toggle('hidden', mode !== 'twoway');
        }
      });
    });
  }
  const tx1Submit = document.getElementById('tx1-submit');
  if (tx1Submit) tx1Submit.addEventListener('click', submitOneWay);
  // One Way: auto-select Tr. Type based on Mode
  const tx1ModeSel = document.getElementById('tx1-mode');
  const tx1TypeSel = document.getElementById('tx1-type');
  function applyOneWayTypeForMode() {
    if (!tx1ModeSel || !tx1TypeSel) return;
    const m = (tx1ModeSel.value || '').toUpperCase();
    let t = 'Debit';
    if (m === 'PS' || m === 'B') t = 'Credit';
    // PP, L, MT, R, T default to Debit
    tx1TypeSel.value = t;
  }
  if (tx1ModeSel) {
    tx1ModeSel.addEventListener('change', applyOneWayTypeForMode);
    // initialize on load
    applyOneWayTypeForMode();
  }
  const refreshAccounts = document.getElementById('refresh-accounts');
  if (refreshAccounts) refreshAccounts.addEventListener('click', loadAccounts);
  const accCreateBtn = document.getElementById('acc-create-btn');
  if (accCreateBtn) accCreateBtn.addEventListener('click', createAccount);
  const txSubmitBtn = document.getElementById('tx-submit');
  if (txSubmitBtn) txSubmitBtn.addEventListener('click', submitTransaction);
  const txRefresh = document.getElementById('tx-refresh-btn');
  if (txRefresh) txRefresh.addEventListener('click', loadRecentTransactions);
  const txPageSize = document.getElementById('tx-page-size');
  if (txPageSize) txPageSize.addEventListener('change', () => { txPager.offset = 0; loadRecentTransactions(); });
  const txSearch = document.getElementById('tx-search');
  if (txSearch) txSearch.addEventListener('input', debounce(() => { txPager.offset = 0; loadRecentTransactions(); }, 300));
  const txSearchFilter = document.getElementById('tx-search-filter');
  if (txSearchFilter) txSearchFilter.addEventListener('change', () => { txPager.offset = 0; loadRecentTransactions(); });
  const txPrev = document.getElementById('tx-prev');
  if (txPrev) txPrev.addEventListener('click', () => {
    txPager.offset = Math.max(0, txPager.offset - txPager.limit);
    loadRecentTransactions();
  });
  const txNext = document.getElementById('tx-next');
  if (txNext) txNext.addEventListener('click', () => {
    const totalPages = txPager.limit > 0 ? Math.max(1, Math.ceil(txPager.total / txPager.limit)) : 1;
    const lastOffset = (totalPages - 1) * txPager.limit;
    txPager.offset = Math.min(lastOffset, txPager.offset + txPager.limit);
    loadRecentTransactions();
  });
  const repDayBtn = document.getElementById('rep-day-btn');
  if (repDayBtn) repDayBtn.addEventListener('click', fetchDaySummary);
  const repLedgerBtn = document.getElementById('rep-ledger-btn');
  if (repLedgerBtn) repLedgerBtn.addEventListener('click', fetchLedger);
  const repCommBtn = document.getElementById('rep-comm-btn');
  if (repCommBtn) repCommBtn.addEventListener('click', fetchCommissions);

  const adminRefresh = document.getElementById('admin-users-refresh');
  if (adminRefresh) adminRefresh.addEventListener('click', adminLoadUsers);
  const adminCreate = document.getElementById('admin-create-btn');
  if (adminCreate) adminCreate.addEventListener('click', adminCreateUser);
  const adminCancelEdit = document.getElementById('admin-cancel-edit');
  if (adminCancelEdit) adminCancelEdit.addEventListener('click', exitAdminEditMode);
  // removed old standalone actions card bindings (activate/deactivate/set password/delete)

  // Auto-refresh on date/account changes
  const repDate = document.getElementById('rep-date');
  if (repDate) {
    const triggerDayFetch = debounce(() => {
      const v = document.getElementById('rep-date')?.value;
      if (v && v.length >= 10) fetchDaySummary();
    }, 200);
    repDate.addEventListener('change', triggerDayFetch);
    repDate.addEventListener('input', triggerDayFetch);
  }

  const repLedgerFrom = document.getElementById('rep-ledger-from');
  const repLedgerTo = document.getElementById('rep-ledger-to');
  const repLedgerAcc = document.getElementById('rep-ledger-account');
  if (repLedgerFrom) repLedgerFrom.addEventListener('change', () => { ledgerPager.offset = 0; fetchLedger(); });
  if (repLedgerTo) repLedgerTo.addEventListener('change', () => { ledgerPager.offset = 0; fetchLedger(); });
  if (repLedgerAcc) repLedgerAcc.addEventListener('change', () => { ledgerPager.offset = 0; fetchLedger(); });

  const repLedgerPageSize = document.getElementById('rep-ledger-page-size');
  if (repLedgerPageSize) repLedgerPageSize.addEventListener('change', () => {
    const v = parseInt(repLedgerPageSize.value, 10);
    ledgerPager.limit = Number.isFinite(v) && v > 0 ? v : 25;
    ledgerPager.offset = 0;
    fetchLedger();
  });
  const repLedgerPrev = document.getElementById('rep-ledger-prev');
  if (repLedgerPrev) repLedgerPrev.addEventListener('click', () => {
    ledgerPager.offset = Math.max(0, ledgerPager.offset - ledgerPager.limit);
    fetchLedger();
  });
  const repLedgerNext = document.getElementById('rep-ledger-next');
  if (repLedgerNext) repLedgerNext.addEventListener('click', () => {
    const totalPages = ledgerPager.limit > 0 ? Math.max(1, Math.ceil(ledgerPager.total / ledgerPager.limit)) : 1;
    const lastOffset = (totalPages - 1) * ledgerPager.limit;
    ledgerPager.offset = Math.min(lastOffset, ledgerPager.offset + ledgerPager.limit);
    fetchLedger();
  });

  const repCommFrom = document.getElementById('rep-comm-from');
  const repCommTo = document.getElementById('rep-comm-to');
  if (repCommFrom) repCommFrom.addEventListener('change', fetchCommissions);
  if (repCommTo) repCommTo.addEventListener('change', fetchCommissions);

  const txFrom = document.getElementById('tx-from');
  const txTo = document.getElementById('tx-to');
  if (txFrom) txFrom.addEventListener('change', () => { txPager.offset = 0; loadRecentTransactions(); });
  if (txTo) txTo.addEventListener('change', () => { txPager.offset = 0; loadRecentTransactions(); });

  // Loans events
  const loansFrom = document.getElementById('loans-from');
  const loansTo = document.getElementById('loans-to');
  const loansPageSize = document.getElementById('loans-page-size');
  const loansStatus = document.getElementById('loans-status');
  const loansSearch = document.getElementById('loans-search');
  const loansRefresh = document.getElementById('loans-refresh-btn');
  const loansPrev = document.getElementById('loans-prev');
  const loansNext = document.getElementById('loans-next');
  if (loansFrom) loansFrom.addEventListener('change', () => { loansPager.offset = 0; loadLoans(); });
  if (loansTo) loansTo.addEventListener('change', () => { loansPager.offset = 0; loadLoans(); });
  if (loansPageSize) loansPageSize.addEventListener('change', () => { loansPager.limit = parseInt(loansPageSize.value||'10',10); loansPager.offset = 0; loadLoans(); });
  if (loansStatus) loansStatus.addEventListener('change', () => { loansPager.status = loansStatus.value||'all'; loansPager.offset = 0; loadLoans(); });
  if (loansSearch) loansSearch.addEventListener('input', debounce(() => { loansPager.q = loansSearch.value.trim(); loansPager.offset = 0; loadLoans(); }, 300));
  if (loansRefresh) loansRefresh.addEventListener('click', () => { loadLoans(); });
  if (loansPrev) loansPrev.addEventListener('click', () => { loansPager.offset = Math.max(0, loansPager.offset - loansPager.limit); loadLoans(); });
  if (loansNext) loansNext.addEventListener('click', () => { loansPager.offset += loansPager.limit; loadLoans(); });

  // Account Statement events
  const asFrom = document.getElementById('acct-stmt-from');
  const asTo = document.getElementById('acct-stmt-to');
  const asMode = document.getElementById('acct-stmt-mode');
  const asPage = document.getElementById('acct-stmt-page-size');
  const asSearch = document.getElementById('acct-stmt-search');
  const asRefresh = document.getElementById('acct-stmt-refresh');
  const asPrev = document.getElementById('acct-stmt-prev');
  const asNext = document.getElementById('acct-stmt-next');
  if (asFrom) asFrom.addEventListener('change', async () => { acctStmtPager.from = asFrom.value; await acctStmtFetch(); acctStmtApplyFilters(); acctStmtRender(); });
  if (asTo) asTo.addEventListener('change', async () => { acctStmtPager.to = asTo.value; await acctStmtFetch(); acctStmtApplyFilters(); acctStmtRender(); });
  if (asMode) asMode.addEventListener('change', () => { acctStmtPager.offset = 0; acctStmtApplyFilters(); acctStmtRender(); });
  if (asPage) asPage.addEventListener('change', () => { acctStmtPager.offset = 0; acctStmtRender(); });
  if (asSearch) asSearch.addEventListener('input', debounce(() => { acctStmtPager.offset = 0; acctStmtApplyFilters(); acctStmtRender(); }, 300));
  if (asRefresh) asRefresh.addEventListener('click', async () => { await acctStmtFetch(); acctStmtApplyFilters(); acctStmtRender(); });
  if (asPrev) asPrev.addEventListener('click', () => { acctStmtPager.offset = Math.max(0, acctStmtPager.offset - acctStmtPager.limit); acctStmtRender(); });
  if (asNext) asNext.addEventListener('click', () => { acctStmtPager.offset = Math.min(Math.max(0, acctStmtPager.rows.length - acctStmtPager.limit), acctStmtPager.offset + acctStmtPager.limit); acctStmtRender(); });

  // FAQ toggles
  const faqList = document.querySelector('.faq-list');
  if (faqList) {
    faqList.querySelectorAll('.faq-q').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        if (item) item.classList.toggle('open');
      });
    });
  }
}

// tiny debounce helper
function debounce(fn, wait) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

async function tryRestoreSession() {
  try {
    const res = await api('/rehan/api/me');
    if (res && res.user) {
      session.user = res.user;
      updateUI();
      await loadAccounts();
      await loadRecentTransactions();
      try { await loadLoans(); } catch (e) { console.error('loadLoans on restore failed', e); }
      const role = session.user.role;
      const isPrivileged = role === 'admin' || role === 'readonly_admin';
      if (isPrivileged) {
        await fetchDaySummary();
        await fetchCommissions();
        if (document.getElementById('rep-ledger-account')?.value !== undefined) {
          await fetchLedger();
        }
      }
      if (role === 'admin') {
        await adminLoadUsers();
      }
      let savedTab = (() => { try { return localStorage.getItem('activeTab') || 'transactions'; } catch { return 'transactions'; } })();
      if (!isPrivileged && (savedTab === 'reports' || savedTab === 'accounts' || savedTab === 'admin')) {
        savedTab = 'transactions';
      }
      setActiveTab(savedTab);
    }
  } catch {
    // Not authenticated; ensure login view shows
    session.user = null;
    updateUI();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try { setTodayDefaults(); } catch (e) { console.error('setTodayDefaults failed', e); }
  try { setLanguage(getLanguage()); } catch (e) { console.error('setLanguage failed', e); }
  try { bindEvents(); } catch (e) { console.error('bindEvents failed', e); }
  try { bindExportPrintButtons(); } catch (e) { console.error('bindExportPrintButtons failed', e); }
  try { bindLanguageMenu(); } catch (e) { console.error('bindLanguageMenu failed', e); }
  try { enableOneClickDatePickers(); } catch (e) { console.error('enableOneClickDatePickers failed', e); }
  try { bindTabs(); } catch (e) { console.error('bindTabs failed', e); }
  try { updateUI(); } catch (e) { console.error('updateUI failed', e); }
  // Attempt to restore session and active tab on refresh
  try { tryRestoreSession(); } catch (e) { console.error('tryRestoreSession failed', e); }
  try { installPasswordToggles(); } catch (e) { console.error('installPasswordToggles failed', e); }
});

function installPasswordToggles() {
  const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
  for (const input of inputs) {
    if (input.dataset.pwAttached === '1') continue;
    input.dataset.pwAttached = '1';
    // Wrap in a container
    const container = document.createElement('div');
    container.className = 'pw-container';
    const parent = input.parentElement;
    if (!parent) continue;
    parent.insertBefore(container, input);
    container.appendChild(input);
    // Create toggle button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.setAttribute('aria-label', 'Toggle password visibility');
    btn.innerHTML = getEyeSVG(false);
    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.innerHTML = getEyeSVG(!showing);
      input.focus();
    });
    container.appendChild(btn);
  }
}

function getEyeSVG(showing) {
  if (showing) {
    // eye (visible)
    return '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  // eye-off (hidden)
  return '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18"/><path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42"/><path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a18.2 18.2 0 0 1-5.08 5.96"/><path d="M6.61 6.61A18.5 18.5 0 0 0 1 12s4 7 11 7c1.3 0 2.53-.2 3.68-.57"/></svg>';
}

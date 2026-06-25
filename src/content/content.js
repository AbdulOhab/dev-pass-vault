(() => {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let floatingBtn = null;
  let panel = null;
  let credentials = [];
  let detected = false;
  let hoverTimer = null;
  let leaveTimer = null;
  let fabPosition = 'right-center';
  let currentTheme = 'dark';

  function applyThemeToEl(el) {
    if (!el) return;
    if (currentTheme === 'light') el.setAttribute('data-theme', 'light');
    else el.removeAttribute('data-theme');
  }

  // ── Login page detection ───────────────────────────────────────────────────
  function hasLoginForm() {
    const pwFields = document.querySelectorAll('input[type="password"]');
    return pwFields.length > 0;
  }

  function findFormFields() {
    const pwField = document.querySelector('input[type="password"]:not([disabled])');
    if (!pwField) return null;

    // Walk up to find a form or nearby text/email input
    const form = pwField.closest('form') || pwField.parentElement?.parentElement;
    const candidates = form
      ? form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="password"])')
      : document.querySelectorAll('input[type="text"], input[type="email"], input:not([type])');

    const usernameField = Array.from(candidates).find(el => {
      const hint = `${el.name} ${el.id} ${el.placeholder} ${el.autocomplete}`.toLowerCase();
      return (
        hint.includes('user') ||
        hint.includes('email') ||
        hint.includes('login') ||
        hint.includes('account') ||
        hint.includes('phone') ||
        el.type === 'email'
      );
    }) || candidates[0] || null;

    const submitBtn = form
      ? form.querySelector('button[type="submit"], input[type="submit"], button:not([type])')
      : document.querySelector('button[type="submit"], input[type="submit"]');

    return { usernameField, pwField, submitBtn };
  }

  // ── Form filler ───────────────────────────────────────────────────────────
  function fillField(el, value) {
    if (!el) return;
    el.focus();
    // Works with React/Vue controlled inputs
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillCredential(cred, autoSubmit) {
    const fields = findFormFields();
    if (!fields) return;
    const { usernameField, pwField, submitBtn } = fields;

    fillField(usernameField, cred.username);
    fillField(pwField, cred.password);

    if (autoSubmit && submitBtn) {
      setTimeout(() => submitBtn.click(), 120);
    }

    closePanel();
  }

  // ── Floating button ────────────────────────────────────────────────────────
  async function createFloatingBtn() {
    if (floatingBtn) return;

    try {
      const s = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      fabPosition    = s.fabPosition || 'right-center';
      currentTheme   = s.theme || 'dark';
    } catch (_) {}

    floatingBtn = document.createElement('div');
    floatingBtn.id = 'dpv-fab';
    floatingBtn.setAttribute('title', 'Dev Pass Vault');
    floatingBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

    applyFabPosition();
    applyThemeToEl(floatingBtn);

    floatingBtn.addEventListener('mouseenter', () => {
      clearTimeout(leaveTimer);
      hoverTimer = setTimeout(openPanel, 150);
    });
    floatingBtn.addEventListener('mouseleave', scheduleClose);
    floatingBtn.addEventListener('click', () => panel ? closePanel() : openPanel());

    document.body.appendChild(floatingBtn);
    updateBadge();
  }

  function applyFabPosition() {
    if (!floatingBtn) return;
    const [side, vert] = (fabPosition || 'right-center').split('-');
    floatingBtn.className = `dpv-fab-${side} dpv-fab-${vert}`;
  }

  function updateBadge() {
    if (!floatingBtn) return;
    let badge = floatingBtn.querySelector('.dpv-badge');
    if (credentials.length > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'dpv-badge';
        floatingBtn.appendChild(badge);
      }
      badge.textContent = credentials.length > 9 ? '9+' : credentials.length;
    } else {
      badge?.remove();
    }
  }

  // ── Panel ─────────────────────────────────────────────────────────────────
  function openPanel() {
    if (panel) return;
    refreshCredentials().then(renderPanel);
  }

  function renderPanel() {
    if (panel) panel.remove();

    panel = document.createElement('div');
    panel.id = 'dpv-panel';

    panel.addEventListener('mouseenter', () => clearTimeout(leaveTimer));
    panel.addEventListener('mouseleave', scheduleClose);

    // Header
    const header = document.createElement('div');
    header.className = 'dpv-panel-header';
    header.innerHTML = `
      <span class="dpv-panel-title">Dev Pass Vault</span>
      <div class="dpv-panel-actions">
        <button class="dpv-icon-btn dpv-add-btn" title="Add credential for this page">+</button>
        <button class="dpv-icon-btn dpv-close-btn" title="Close">✕</button>
      </div>`;

    header.querySelector('.dpv-close-btn').addEventListener('click', closePanel);
    header.querySelector('.dpv-add-btn').addEventListener('click', openAddDialog);

    panel.appendChild(header);

    // Current URL pill
    const urlPill = document.createElement('div');
    urlPill.className = 'dpv-url-pill';
    urlPill.textContent = location.hostname + (location.port ? `:${location.port}` : '');
    panel.appendChild(urlPill);

    // Credential list
    const list = document.createElement('div');
    list.className = 'dpv-list';

    if (credentials.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'dpv-empty';
      empty.textContent = 'No saved credentials for this page.';
      list.appendChild(empty);
    } else {
      credentials.forEach(cred => {
        const item = createCredentialItem(cred);
        list.appendChild(item);
      });
    }

    panel.appendChild(list);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'dpv-panel-footer';
    footer.innerHTML = `<a class="dpv-manage-link" href="#" title="Open full manager">Manage All →</a>`;
    footer.querySelector('.dpv-manage-link').addEventListener('click', e => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: '__OPEN_OPTIONS__' });
    });
    panel.appendChild(footer);

    document.body.appendChild(panel);
    applyThemeToEl(panel);
    positionPanel();
  }

  function createCredentialItem(cred) {
    const item = document.createElement('div');
    item.className = 'dpv-item';

    const noteIcon = cred.notes ? ' 📝' : '';
    item.innerHTML = `
      <div class="dpv-item-info">
        <span class="dpv-item-label">${escHtml(cred.label || cred.username)}${noteIcon}</span>
        <span class="dpv-item-user">${escHtml(cred.username)}</span>
        ${cred.tags?.length ? `<span class="dpv-tags">${cred.tags.map(t => `<span class="dpv-tag">${escHtml(t)}</span>`).join('')}</span>` : ''}
      </div>
      <div class="dpv-item-btns">
        <button class="dpv-btn dpv-fill-btn" title="Fill form">Fill</button>
        <button class="dpv-btn dpv-submit-btn" title="Fill &amp; Submit">Fill+Go</button>
        <button class="dpv-btn dpv-edit-btn" title="Edit">✎</button>
      </div>`;

    item.querySelector('.dpv-fill-btn').addEventListener('click', () => fillCredential(cred, false));
    item.querySelector('.dpv-submit-btn').addEventListener('click', () => fillCredential(cred, true));
    item.querySelector('.dpv-edit-btn').addEventListener('click', () => openCredDialog(cred));

    return item;
  }

  function positionPanel() {
    if (!panel || !floatingBtn) return;
    const fabRect = floatingBtn.getBoundingClientRect();
    const panelH = panel.offsetHeight;
    const vpH = window.innerHeight;

    let top = fabRect.top + window.scrollY;
    if (top + panelH > window.scrollY + vpH - 16) {
      top = window.scrollY + vpH - panelH - 16;
    }
    if (top < window.scrollY + 8) top = window.scrollY + 8;

    panel.style.top = `${top}px`;
    const side = (fabPosition || 'right-center').split('-')[0];
    if (side === 'left') {
      panel.style.left  = `${fabRect.right + 8}px`;
      panel.style.right = 'auto';
    } else {
      panel.style.right = `${window.innerWidth - fabRect.left + 8}px`;
      panel.style.left  = 'auto';
    }
  }

  function closePanel() {
    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    panel?.remove();
    panel = null;
  }

  function scheduleClose() {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(closePanel, 300);
  }

  // ── Add / Edit dialog (inline in the panel) ──────────────────────────────
  function openAddDialog() { openCredDialog(null); }

  function openCredDialog(existingCred) {
    if (!panel) return;
    const existing = panel.querySelector('.dpv-add-dialog');
    if (existing) { existing.remove(); if (!existingCred) return; }

    const isEdit = !!existingCred;
    const currentDomain = location.hostname + (location.port ? `:${location.port}` : '');

    const dialog = document.createElement('div');
    dialog.className = 'dpv-add-dialog';

    dialog.innerHTML = `
      <div class="dpv-dialog-title">${isEdit ? '✎ Edit Credential' : 'Add Credential'}</div>
      <label>Label<input class="dpv-input" name="label" placeholder="e.g. Dev Admin" value="${escHtml(existingCred?.label || '')}" /></label>
      <label>Username / Email<input class="dpv-input" name="username" placeholder="user@example.com" value="${escHtml(existingCred?.username || '')}" /></label>
      <label>Password
        <div style="position:relative">
          <input class="dpv-input dpv-pw-input" name="password" type="password" placeholder="••••••••" value="${escHtml(existingCred?.password || '')}" style="padding-right:32px" />
          <button class="dpv-pw-eye" type="button" title="Show/hide" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:13px;color:var(--dpv-text2)">👁</button>
        </div>
      </label>
      <label>Tags (comma separated)<input class="dpv-input" name="tags" placeholder="dev, admin" value="${escHtml((existingCred?.tags || []).join(', '))}" /></label>
      <label>Notes<input class="dpv-input" name="notes" placeholder="optional" value="${escHtml(existingCred?.notes || '')}" /></label>
      <div class="dpv-url-rules-header">
        <span>URL Rules</span>
        <button class="dpv-icon-btn dpv-add-rule-btn" title="Add rule">+</button>
      </div>
      <div class="dpv-url-rules-list"></div>
      <div class="dpv-dialog-footer">
        <button class="dpv-btn dpv-save-cred-btn">${isEdit ? 'Update' : 'Save'}</button>
        ${isEdit ? '<button class="dpv-btn dpv-delete-cred-btn">Delete</button>' : ''}
        <button class="dpv-btn dpv-cancel-btn">Cancel</button>
      </div>`;

    // Populate URL rule rows
    const ruleList = dialog.querySelector('.dpv-url-rules-list');
    const rulesToShow = existingCred?.urlRules?.length
      ? existingCred.urlRules
      : [{ type: 'domain', pattern: currentDomain }];
    rulesToShow.forEach(r => addRuleRowToDialog(ruleList, r.pattern, r.type));

    // Password toggle
    dialog.querySelector('.dpv-pw-eye').addEventListener('click', () => {
      const pw = dialog.querySelector('.dpv-pw-input');
      pw.type = pw.type === 'password' ? 'text' : 'password';
    });

    // Add rule button
    dialog.querySelector('.dpv-add-rule-btn').addEventListener('click', () => {
      addRuleRowToDialog(ruleList, location.href, 'exact');
    });

    dialog.querySelector('.dpv-cancel-btn').addEventListener('click', () => dialog.remove());
    dialog.querySelector('.dpv-save-cred-btn').addEventListener('click', () => saveCred(dialog, existingCred?.id));
    dialog.querySelector('.dpv-delete-cred-btn')?.addEventListener('click', () => deleteCred(dialog, existingCred.id, existingCred.label || existingCred.username));

    panel.insertBefore(dialog, panel.querySelector('.dpv-list'));
  }

  function addRuleRowToDialog(ruleList, pattern = '', type = 'domain') {
    const TYPES = ['domain','exact','prefix','contains','wildcard'];
    const LABELS = { domain:'Domain', exact:'Exact URL', prefix:'Prefix', contains:'Contains', wildcard:'Wildcard' };
    const row = document.createElement('div');
    row.className = 'dpv-url-rule-row';
    row.innerHTML = `
      <select class="dpv-select dpv-rule-type">
        ${TYPES.map(t => `<option value="${t}"${t === type ? ' selected' : ''}>${LABELS[t]}</option>`).join('')}
      </select>
      <input class="dpv-input dpv-rule-pattern" value="${escHtml(pattern)}" placeholder="pattern" />
      <button class="dpv-icon-btn dpv-remove-rule" title="Remove">✕</button>`;
    row.querySelector('.dpv-remove-rule').addEventListener('click', () => {
      row.remove();
      if (!ruleList.children.length) addRuleRowToDialog(ruleList);
    });
    ruleList.appendChild(row);
  }

  async function saveCred(dialog, existingId) {
    const get = name => dialog.querySelector(`[name="${name}"]`)?.value.trim() || '';
    const username = get('username');
    const password = get('password');
    if (!username || !password) {
      alert('Username and password are required.');
      return;
    }

    const tags = get('tags').split(',').map(t => t.trim()).filter(Boolean);
    const urlRules = Array.from(dialog.querySelectorAll('.dpv-url-rule-row'))
      .map(row => ({
        type:    row.querySelector('.dpv-rule-type').value,
        pattern: row.querySelector('.dpv-rule-pattern').value.trim(),
      }))
      .filter(r => r.pattern);

    const id = existingId || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

    await chrome.runtime.sendMessage({ type: 'SAVE', credential: {
      id, label: get('label') || username, username, password,
      notes: get('notes'), tags, urlRules, autoSubmit: false,
    }});
    await refreshCredentials();
    renderPanel();
  }

  async function deleteCred(dialog, id, name) {
    if (!confirm(`Delete "${name}"?`)) return;
    await chrome.runtime.sendMessage({ type: 'DELETE', id });
    await refreshCredentials();
    renderPanel();
  }

  // ── Credentials refresh ───────────────────────────────────────────────────
  async function refreshCredentials() {
    try {
      credentials = await chrome.runtime.sendMessage({ type: 'GET_MATCHING', url: location.href });
    } catch {
      credentials = [];
    }
    updateBadge();
    return credentials;
  }

  // ── Listen for background / popup triggers ───────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'OPEN_SAVE_DIALOG') {
      if (!panel) openPanel();
      setTimeout(openAddDialog, 100);
    }
    if (msg.type === 'FILL') {
      fillCredential(msg.credential, !!msg.autoSubmit);
    }
  });

  // ── Form submit detection ────────────────────────────────────────────────
  let submitHooked = false;

  function hookFormSubmit() {
    if (submitHooked) return;
    const fields = findFormFields();
    if (!fields) return;
    const { usernameField, pwField, submitBtn } = fields;

    const capture = () => {
      const username = usernameField?.value?.trim();
      const password = pwField?.value?.trim();
      if (!username || !password) return;
      const hostname = location.hostname + (location.port ? `:${location.port}` : '');
      try {
        sessionStorage.setItem('dpv_pending_save', JSON.stringify({
          username, password, hostname, ts: Date.now(),
        }));
      } catch (_) {}
      // SPA: also try to show prompt after a short delay
      setTimeout(() => checkAndShowSavePrompt({ username, password, hostname }), 800);
    };

    const form = pwField.closest('form');
    if (form) form.addEventListener('submit', capture, { once: true });
    if (submitBtn) submitBtn.addEventListener('click', capture, { once: true });
    submitHooked = true;
  }

  // ── Save prompt (cross-page navigation support) ───────────────────────────
  async function checkPendingSave() {
    try {
      const raw = sessionStorage.getItem('dpv_pending_save');
      if (!raw) return;
      sessionStorage.removeItem('dpv_pending_save');
      const data = JSON.parse(raw);
      if (Date.now() - data.ts > 30000) return; // stale
      await checkAndShowSavePrompt(data);
    } catch (_) {}
  }

  async function checkAndShowSavePrompt(data) {
    try {
      const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (!settings.autoDetectLogin) return;

      const all = await chrome.runtime.sendMessage({ type: 'GET_ALL' });
      const alreadySaved = all.some(c =>
        c.username === data.username &&
        c.urlRules?.some(r => r.type === 'domain' && r.pattern === data.hostname)
      );
      if (alreadySaved) return;

      showSavePrompt(data, settings.savePromptPosition || 'top-right');
    } catch (_) {}
  }

  function showSavePrompt(data, position) {
    if (document.getElementById('dpv-save-prompt')) return;

    const el = document.createElement('div');
    el.id = 'dpv-save-prompt';
    el.className = `dpv-save-prompt dpv-pos-${position}`;
    el.innerHTML = `
      <div class="dpv-sp-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span>Save this password?</span>
        <button class="dpv-sp-x" title="Dismiss">✕</button>
      </div>
      <div class="dpv-sp-body">
        <div class="dpv-sp-row"><span class="dpv-sp-lbl">Site</span><span class="dpv-sp-val">${escHtml(data.hostname)}</span></div>
        <div class="dpv-sp-row"><span class="dpv-sp-lbl">User</span><span class="dpv-sp-val">${escHtml(data.username)}</span></div>
      </div>
      <div class="dpv-sp-actions">
        <button class="dpv-sp-btn dpv-sp-save">Save</button>
        <button class="dpv-sp-btn dpv-sp-later">Not Now</button>
      </div>`;

    el.querySelector('.dpv-sp-x').addEventListener('click', () => el.remove());
    el.querySelector('.dpv-sp-later').addEventListener('click', () => el.remove());
    el.querySelector('.dpv-sp-save').addEventListener('click', async () => {
      el.remove();
      await quickSaveCredential(data);
    });

    applyThemeToEl(el);
    document.body.appendChild(el);
    setTimeout(() => el?.remove(), 15000);
  }

  async function quickSaveCredential(data) {
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    await chrome.runtime.sendMessage({
      type: 'SAVE',
      credential: {
        id,
        label: data.hostname,
        username: data.username,
        password: data.password,
        notes: '',
        tags: [],
        urlRules: [{ type: 'domain', pattern: data.hostname }],
        autoSubmit: false,
      },
    });
    await refreshCredentials();
  }

  // ── MutationObserver for SPA page transitions ─────────────────────────────
  let checkTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(checkPage, 500);
  });

  function checkPage() {
    if (hasLoginForm()) {
      if (!detected) {
        detected = true;
        createFloatingBtn();
        refreshCredentials();
        hookFormSubmit();
      }
    } else {
      if (detected) {
        detected = false;
        submitHooked = false;
        closePanel();
        floatingBtn?.remove();
        floatingBtn = null;
      }
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    checkPendingSave(); // check if we navigated here after a login
    checkPage();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();

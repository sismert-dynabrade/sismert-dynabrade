/* =====================================================
   AI Task Force Tracker — Main Application
   Dynabrade Internal Tool

   Architecture
   ─────────────────────────────────────────────────
   Auth   — AD group → role mapping (mock SSO login)
   Store  — CRUD layer (localStorage now; swap for
            fetch('/api/...') when backend connects)
   Router — Hash-based SPA routing
   Views  — Pure render functions per page
   ===================================================== */

'use strict';

// ══════════════════════════════════════════════════════
// AUTH  — Active Directory group simulation
// In production: replace login() with Azure AD / ADFS
// OAuth2 OIDC redirect; user object comes from the
// decoded JWT returned by your identity provider.
// ══════════════════════════════════════════════════════
const Auth = (() => {
  const GROUP_ROLES = {
    AI_TFADM: 'admin',
    AI_TFM:   'member',
    AI_TFRO:  'readonly',
  };

  // Demo user directory — mirrors AD accounts
  // Production: populated dynamically from AAD Graph API
  const USERS = [
    { id: 1, name: 'John Admin',  email: 'j.admin@dynabrade.com',  adGroup: 'AI_TFADM', dept: 'IT',            initials: 'JA' },
    { id: 2, name: 'Jane Smith',  email: 'j.smith@dynabrade.com',  adGroup: 'AI_TFM',   dept: 'Operations',    initials: 'JS' },
    { id: 3, name: 'Mike King',   email: 'm.king@dynabrade.com',   adGroup: 'AI_TFM',   dept: 'Engineering',   initials: 'MK' },
    { id: 4, name: 'Alex Lee',    email: 'a.lee@dynabrade.com',    adGroup: 'AI_TFM',   dept: 'Supply Chain',  initials: 'AL' },
    { id: 5, name: 'Tom Kelly',   email: 't.kelly@dynabrade.com',  adGroup: 'AI_TFM',   dept: 'Finance',       initials: 'TK' },
    { id: 6, name: 'Rachel Soto', email: 'r.soto@dynabrade.com',   adGroup: 'AI_TFRO',  dept: 'Management',    initials: 'RS' },
    { id: 7, name: 'Dana Park',   email: 'd.park@dynabrade.com',   adGroup: 'AI_TFRO',  dept: 'Executive',     initials: 'DP' },
  ];

  let _user = null;

  function restore() {
    try { _user = JSON.parse(sessionStorage.getItem('aitf_sess')); } catch {}
    return !!_user;
  }

  function login(userId) {
    const u = USERS.find(u => u.id === +userId);
    if (!u) return false;
    _user = { ...u, role: GROUP_ROLES[u.adGroup] };
    sessionStorage.setItem('aitf_sess', JSON.stringify(_user));
    return true;
  }

  function logout() {
    _user = null;
    sessionStorage.removeItem('aitf_sess');
  }

  // Permission matrix — maps actions to allowed roles
  function can(action) {
    if (!_user) return false;
    const matrix = {
      createIdea:   ['admin', 'member'],
      editOwnIdea:  ['admin', 'member'],
      promotePilot: ['admin'],
      assignPilot:  ['admin'],
      toProduction: ['admin'],
      markComplete: ['admin'],
      adminPanel:   ['admin'],
    };
    return (matrix[action] || []).includes(_user.role);
  }

  return {
    restore, login, logout, can,
    getMembers:   () => USERS.filter(u => u.adGroup === 'AI_TFM'),
    getAllUsers:   () => USERS,
    getUserById:  id => USERS.find(u => u.id === +id),
    get user()    { return _user; },
  };
})();


// ══════════════════════════════════════════════════════
// STORE  — Data persistence layer
//
// SWAP GUIDE (when backend DB is ready):
//   load()         → GET  /api/initiatives (initial fetch)
//   getAll()       → GET  /api/initiatives?stage=...
//   create()       → POST /api/initiatives
//   update()       → PATCH /api/initiatives/:id
//   promote()      → POST /api/initiatives/:id/promote
//   canComplete()  → server-side 30-day check
//   getLog()       → GET  /api/activity
// ══════════════════════════════════════════════════════
const Store = (() => {
  const KEY = 'aitf_db_v2';
  let db = null;

  function emptyDb() {
    return { initiatives: [], log: [], seq: 0 };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      db = raw ? JSON.parse(raw) : emptyDb();
    } catch {
      db = emptyDb();
    }
    if (!db.initiatives || !db.initiatives.length) seed();
  }

  function persist() {
    localStorage.setItem(KEY, JSON.stringify(db));
  }

  function nextId() {
    db.seq = (db.seq || 0) + 1;
    return `AI-${new Date().getFullYear()}-${String(db.seq).padStart(3, '0')}`;
  }

  function ago(days) {
    return new Date(Date.now() - days * 86_400_000).toISOString();
  }

  function mkItem(id, seq, title, stage, priority, createdBy, assignedTo, createdAt, promotedAt, productionAt, completedAt) {
    return {
      id, seq, title, stage, priority,
      createdBy, assignedTo,
      createdAt, promotedAt, productionAt, completedAt,
      description: '',
      businessValue: 'Operational Efficiency',
      status: completedAt ? 'completed' : 'active',
    };
  }

  function seed() {
    db.seq = 12;
    db.initiatives = [
      // Ideas (5)
      mkItem('AI-2026-001', 1,  'Predictive Maintenance ML Model',  'ideas',      'high',   2, [],     ago(2),   null,    null,    null),
      mkItem('AI-2026-002', 2,  'Quality Vision Inspection System', 'ideas',      'high',   3, [],     ago(3),   null,    null,    null),
      mkItem('AI-2026-003', 3,  'Demand Forecasting Algorithm',     'ideas',      'medium', 4, [],     ago(5),   null,    null,    null),
      mkItem('AI-2026-004', 4,  'Chatbot for Internal Support',     'ideas',      'low',    4, [],     ago(7),   null,    null,    null),
      mkItem('AI-2026-005', 5,  'Energy Optimization AI',           'ideas',      'medium', 5, [],     ago(7),   null,    null,    null),
      // Pilot (3)
      mkItem('AI-2025-089', 6,  'RAG Document Search',              'pilot',      'high',   2, [2, 3], ago(30),  ago(14), null,    null),
      mkItem('AI-2025-092', 7,  'Anomaly Detection Sensors',        'pilot',      'medium', 3, [3],    ago(35),  ago(21), null,    null),
      mkItem('AI-2025-095', 8,  'Auto-Report Generation',           'pilot',      'low',    4, [4, 5], ago(40),  ago(30), null,    null),
      // Production (2 — one eligible for completion, one not)
      mkItem('AI-2025-067', 9,  'Inventory Smart Reorder',          'production', 'high',   5, [5],    ago(90),  ago(60), ago(35), null),
      mkItem('AI-2025-071', 10, 'Supplier Risk Scoring',            'production', 'medium', 2, [2],    ago(100), ago(70), ago(10), null),
      // Completed (2)
      mkItem('AI-2025-034', 11, 'OCR Invoice Processing',           'completed',  'high',   3, [3],    ago(180), ago(150), ago(90), ago(55)),
      mkItem('AI-2025-041', 12, 'Email Classification Bot',         'completed',  'medium', 4, [4],    ago(200), ago(170), ago(120), ago(85)),
    ];
    db.log = [
      { type: 'promote', msg: 'RAG Document Search promoted to Pilot',              by: 1, at: ago(14) },
      { type: 'create',  msg: 'Predictive Maintenance ML Model submitted as idea',   by: 2, at: ago(2)  },
      { type: 'complete',msg: 'OCR Invoice Processing completed after 30-day review',by: 1, at: ago(55) },
    ];
    persist();
  }

  // ── Queries ──────────────────────────────────────
  function getAll(filter = {}) {
    // TODO: GET /api/initiatives?stage=&createdBy=&assignedTo=
    return (db.initiatives || []).filter(item => {
      if (filter.stage && item.stage !== filter.stage) return false;
      if (filter.createdBy  !== undefined && item.createdBy !== filter.createdBy) return false;
      if (filter.assignedTo !== undefined && !item.assignedTo.includes(filter.assignedTo)) return false;
      return true;
    });
  }

  function getById(id) {
    // TODO: GET /api/initiatives/:id
    return db.initiatives.find(x => x.id === id);
  }

  function counts() {
    const c = { ideas: 0, pilot: 0, production: 0, completed: 0, total: 0 };
    (db.initiatives || []).forEach(i => {
      if (c[i.stage] !== undefined) c[i.stage]++;
      if (i.stage !== 'completed') c.total++;
    });
    return c;
  }

  // ── Mutations ─────────────────────────────────────
  function create(data) {
    // TODO: POST /api/initiatives
    const item = {
      ...data,
      id:           nextId(),
      seq:          db.seq,
      stage:        'ideas',
      assignedTo:   [],
      createdAt:    new Date().toISOString(),
      promotedAt:   null,
      productionAt: null,
      completedAt:  null,
      status:       'active',
      createdBy:    Auth.user.id,
    };
    db.initiatives.push(item);
    _log('create', `${item.title} submitted as new idea`, Auth.user.id);
    persist();
    return item;
  }

  function update(id, patch) {
    // TODO: PATCH /api/initiatives/:id
    const idx = db.initiatives.findIndex(x => x.id === id);
    if (idx < 0) return null;
    db.initiatives[idx] = { ...db.initiatives[idx], ...patch };
    persist();
    return db.initiatives[idx];
  }

  function promote(id, stage, assignees) {
    // TODO: POST /api/initiatives/:id/promote
    const item = db.initiatives.find(x => x.id === id);
    if (!item) return;
    const now = new Date().toISOString();
    const patch = { stage };
    if (stage === 'pilot') {
      patch.promotedAt = now;
      if (assignees && assignees.length) patch.assignedTo = assignees;
    }
    if (stage === 'production') patch.productionAt = now;
    if (stage === 'completed')  { patch.completedAt = now; patch.status = 'completed'; }
    update(id, patch);
    const labels = { pilot: 'Pilot', production: 'Production', completed: 'Completed' };
    _log('promote', `${item.title} promoted to ${labels[stage]}`, Auth.user.id);
  }

  function canComplete(id) {
    // TODO: server enforces this — client just disables the button
    const item = db.initiatives.find(x => x.id === id);
    if (!item || item.stage !== 'production' || !item.productionAt) return false;
    return (Date.now() - new Date(item.productionAt)) / 86_400_000 >= 30;
  }

  function daysInProd(id) {
    const item = db.initiatives.find(x => x.id === id);
    return item && item.productionAt
      ? Math.floor((Date.now() - new Date(item.productionAt)) / 86_400_000)
      : 0;
  }

  function _log(type, msg, by) {
    db.log.unshift({ type, msg, by, at: new Date().toISOString() });
    if (db.log.length > 50) db.log.length = 50;
    persist();
  }

  function addLog(type, msg) {
    _log(type, msg, Auth.user?.id);
  }

  return {
    load, getAll, getById, counts, create, update, promote,
    canComplete, daysInProd, addLog,
    getLog: () => db.log,
    reset: () => { db = emptyDb(); seed(); },
  };
})();


// ══════════════════════════════════════════════════════
// ROUTER  — Hash-based SPA routing
// ══════════════════════════════════════════════════════
const Router = (() => {
  const routes = {};

  function on(path, fn) { routes[path] = fn; }

  function go(path) { window.location.hash = '#' + path; }

  function dispatch() {
    const raw   = window.location.hash.slice(1) || '/home';
    const parts = raw.split('/').filter(Boolean);
    const key   = '/' + (parts[0] || 'home');
    const fn    = routes[key] || routes['/home'];
    if (fn) fn(parts.slice(1));
    // highlight active nav item
    document.querySelectorAll('[data-route]').forEach(el => {
      el.classList.toggle('active', el.dataset.route === key);
    });
  }

  window.addEventListener('hashchange', dispatch);
  return { on, go, dispatch };
})();


// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function $(id) { return document.getElementById(id); }

function timeAgo(iso) {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function priorityBadge(p) {
  const map = { high: ['badge-high', 'High'], medium: ['badge-medium', 'Med'], low: ['badge-low', 'Low'] };
  const [cls, label] = map[p] || ['badge-low', p];
  return `<span class="badge ${cls}">${label}</span>`;
}

function stageBadge(s) {
  const labels = { ideas: 'Ideas', pilot: 'Pilot', production: 'Production', completed: 'Completed' };
  return `<span class="badge badge-stage ${s}">${labels[s] || s}</span>`;
}

function roleBadge(role) {
  const labels = { admin: 'Admin', member: 'Member', readonly: 'Read Only' };
  return `<span class="badge badge-role ${role}">${labels[role] || role}</span>`;
}

function avatarStack(ids) {
  if (!ids || !ids.length) return '<span style="font-size:11px;color:#94a3b8">Unassigned</span>';
  return `<div class="avatars">${ids.slice(0, 4).map(id => {
    const u = Auth.getUserById(id);
    return u ? `<div class="av" title="${u.name}">${u.initials}</div>` : '';
  }).join('')}${ids.length > 4 ? `<div class="av gray">+${ids.length - 4}</div>` : ''}</div>`;
}

function renderPage(html) { $('content').innerHTML = html; }
function setTitle(t)      { $('page-title').textContent = t; }

function openModal(id)  { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeAllModals();
});


// ══════════════════════════════════════════════════════
// SIDEBAR / NAV RENDERING
// ══════════════════════════════════════════════════════
function renderSidebar() {
  const u   = Auth.user;
  const isAdmin  = u.role === 'admin';
  const isMember = u.role === 'member';
  const c   = Store.counts();

  const navItem = (route, icon, label, badge, badgeCls = '') => `
    <a class="nav-item" data-route="${route}" href="#${route}" onclick="return true">
      <span class="nav-icon">${icon}</span>
      <span class="nav-label">${label}</span>
      ${badge !== undefined ? `<span class="nav-badge ${badgeCls}">${badge}</span>` : ''}
    </a>`;

  const section = (label, items) => `
    <div class="nav-group">
      <div class="nav-section-label">${label}</div>
      ${items}
    </div>`;

  let nav = navItem('/home', '⊞', 'Home');

  if (isMember) {
    nav += section('My Work',
      navItem('/my-ideas', '◎', 'My Ideas') +
      navItem('/my-tasks', '☑', 'My Tasks')
    );
  }

  if (isAdmin || isMember) {
    nav += section('Create',
      navItem('/new-idea', '+', 'New AI Idea')
    );
  }

  nav += section('Pipeline',
    navItem('/ideas',      '●', 'Ideas',      c.ideas,      '') +
    navItem('/pilot',      '●', 'Pilot',       c.pilot,      'teal') +
    navItem('/production', '●', 'Production',  c.production, 'gray') +
    navItem('/completed',  '●', 'Completed',   c.completed,  'green')
  );

  if (isAdmin) {
    nav += section('Admin',
      navItem('/admin', '⚙', 'Members & Access')
    );
  }

  $('sidebar').innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-icon">AI</div>
      <div>
        <div class="brand-name">AI Task Force</div>
        <div class="brand-sub">Dynabrade Internal</div>
      </div>
    </div>
    <nav class="nav">${nav}</nav>
    <div class="sidebar-user">
      <div class="av">${u.initials}</div>
      <div class="sidebar-user-info">
        <div class="sidebar-user-name">${u.name}</div>
        <div class="sidebar-user-group">${u.adGroup}</div>
      </div>
      <button class="btn-signout" title="Sign out" onclick="App.logout()">⏻</button>
    </div>`;
}

function refreshBadges() {
  const c = Store.counts();
  const map = { '/ideas': c.ideas, '/pilot': c.pilot, '/production': c.production, '/completed': c.completed };
  document.querySelectorAll('[data-route]').forEach(el => {
    const badge = el.querySelector('.nav-badge');
    if (badge && map[el.dataset.route] !== undefined) badge.textContent = map[el.dataset.route];
  });
}


// ══════════════════════════════════════════════════════
// SHARED INITIATIVE CARD
// ══════════════════════════════════════════════════════
function initCard(item, opts = {}) {
  const u         = Auth.user;
  const creator   = Auth.getUserById(item.createdBy);
  const isMine    = item.createdBy === u.id;
  const isAssigned= item.assignedTo.includes(u.id);
  const canEdit   = (isMine || u.role === 'admin') && item.stage !== 'completed';
  const showActions = opts.showActions !== false;

  let actions = '';

  if (showActions && u.role !== 'readonly') {
    if (canEdit) {
      actions += `<button class="btn btn-ghost btn-sm" onclick="Views.editIdea('${item.id}')">Edit</button>`;
    }
    if (u.role === 'admin') {
      if (item.stage === 'ideas') {
        actions += `<button class="btn btn-teal btn-sm" onclick="Views.openPromotePilot('${item.id}')">→ Pilot</button>`;
      } else if (item.stage === 'pilot') {
        actions += `<button class="btn btn-ghost btn-sm" onclick="Views.openAssign('${item.id}')">Assign</button>`;
        actions += `<button class="btn btn-teal btn-sm" onclick="Views.promoteToProduction('${item.id}')">→ Production</button>`;
      } else if (item.stage === 'production') {
        const days  = Store.daysInProd(item.id);
        const ready = Store.canComplete(item.id);
        actions += ready
          ? `<button class="btn btn-success btn-sm" onclick="Views.markComplete('${item.id}')">✓ Mark Complete</button>`
          : `<span class="prod-timer pending">⏱ ${days}/30 days review</span>`;
      }
    }
    if (u.role === 'member' && item.stage === 'pilot' && isAssigned && !canEdit) {
      actions += `<button class="btn btn-ghost btn-sm" onclick="Views.editIdea('${item.id}')">Update</button>`;
    }
  }

  const metaParts = [];
  if (creator) metaParts.push(`By ${creator.name}`);
  metaParts.push(timeAgo(item.createdAt));
  if (item.stage === 'pilot' || item.stage === 'production') {
    metaParts.push(avatarStack(item.assignedTo));
  }
  if (item.stage === 'production') {
    const d = Store.daysInProd(item.id);
    metaParts.push(`<span class="prod-timer ${d >= 30 ? 'ready' : 'pending'}">⏱ ${d}/30d</span>`);
  }

  return `
    <div class="init-card ${item.stage}${isMine ? ' mine' : ''}">
      <div class="init-id">${item.id}</div>
      <div class="init-body">
        <div class="init-title">
          ${item.title}
          ${isMine ? '<span class="init-mine-tag">★ mine</span>' : ''}
        </div>
        <div class="init-meta">${metaParts.join(' · ')}</div>
      </div>
      ${priorityBadge(item.priority)}
      ${showActions
        ? `<div class="init-actions">${actions || (u.role === 'readonly' ? stageBadge(item.stage) : '')}</div>`
        : stageBadge(item.stage)
      }
    </div>`;
}

function activityFeed(entries) {
  if (!entries.length) return '<div class="empty-state"><div class="empty-icon">📋</div><p>No activity yet</p></div>';
  const icons = { create: '✦', promote: '⇢', complete: '✓' };
  return entries.map(e => {
    const by = Auth.getUserById(e.by);
    return `
      <div class="activity-item">
        <div class="activity-dot ${e.type}">${icons[e.type] || '·'}</div>
        <div>
          <div class="activity-text">${e.msg}</div>
          <div class="activity-time">${timeAgo(e.at)}${by ? ' · ' + by.name : ''}</div>
        </div>
      </div>`;
  }).join('');
}


// ══════════════════════════════════════════════════════
// PAGE VIEWS
// ══════════════════════════════════════════════════════
const Views = (() => {

  // ── HOME ────────────────────────────────────────────
  function home() {
    setTitle('Home');
    const c  = Store.counts();
    const u  = Auth.user;
    const log = Store.getLog().slice(0, 6);

    // Visible initiatives depend on role
    let recent;
    if (u.role === 'admin') {
      recent = Store.getAll().slice(0, 8);
    } else if (u.role === 'member') {
      const mine     = Store.getAll({ createdBy: u.id });
      const assigned = Store.getAll({ assignedTo: u.id });
      const ids      = new Set([...mine, ...assigned].map(x => x.id));
      recent         = [...mine, ...assigned.filter(x => !ids.has(x.id))].slice(0, 8);
      if (!recent.length) recent = Store.getAll().slice(0, 8);
    } else {
      recent = Store.getAll().slice(0, 8);
    }

    renderPage(`
      <div class="filter-bar" id="home-filter">
        ${['All time','Today','7 days','30 days','Last month','Custom'].map((t, i) =>
          `<button class="filter-tab${i === 0 ? ' active' : ''}"
            onclick="this.closest('.filter-bar').querySelectorAll('.filter-tab').forEach(b=>b.classList.remove('active'));this.classList.add('active')"
          >${t}</button>`
        ).join('')}
      </div>

      <div class="stats-grid">
        <div class="stat-card ideas"      onclick="Router.go('/ideas')">
          <div class="stat-num">${c.ideas}</div>
          <div class="stat-lbl">Ideas</div>
        </div>
        <div class="stat-card pilot"      onclick="Router.go('/pilot')">
          <div class="stat-num">${c.pilot}</div>
          <div class="stat-lbl">Pilot</div>
        </div>
        <div class="stat-card production" onclick="Router.go('/production')">
          <div class="stat-num">${c.production}</div>
          <div class="stat-lbl">Production</div>
        </div>
        <div class="stat-card completed"  onclick="Router.go('/completed')">
          <div class="stat-num">${c.completed}</div>
          <div class="stat-lbl">Completed</div>
        </div>
        <div class="stat-card total">
          <div class="stat-num">${c.total}</div>
          <div class="stat-lbl">Total Active</div>
        </div>
      </div>

      <div class="section-card">
        <div class="section-hdr">
          <span class="section-title">Recent Initiatives</span>
          <button class="btn btn-ghost btn-sm" onclick="Router.go('/ideas')">View All</button>
        </div>
        <div class="init-list">
          ${recent.length
            ? recent.map(i => initCard(i)).join('')
            : `<div class="empty-state"><div class="empty-icon">🚀</div>
               <h3>No initiatives yet</h3>
               <p>${Auth.can('createIdea') ? '<button class="btn btn-primary" onclick="Router.go(\'/new-idea\')">Submit First Idea</button>' : 'No initiatives have been submitted yet.'}</p></div>`
          }
        </div>
      </div>

      <div class="section-card">
        <div class="section-hdr"><span class="section-title">Recent Activity</span></div>
        ${activityFeed(log)}
      </div>
    `);
  }

  // ── NEW IDEA ─────────────────────────────────────────
  function newIdea() {
    if (!Auth.can('createIdea')) { Router.go('/home'); return; }
    setTitle('New AI Idea');
    renderPage(`
      <div class="section-card" style="max-width:700px">
        <div class="section-hdr">
          <span class="section-title">Submit New AI Idea</span>
        </div>

        <div class="placeholder-notice">
          <strong>📋 Form fields coming soon.</strong>
          The detailed intake form fields (impact estimates, data requirements, stakeholder info, etc.)
          will be configured once the database schema is finalized. The fields below are the initial baseline.
        </div>

        <form id="idea-form" onsubmit="Views.submitIdea(event)">
          <div class="form-group">
            <label class="form-label">Idea Title *</label>
            <input class="form-control" id="f-title" type="text" required
              placeholder="e.g., Predictive Maintenance using Sensor Data">
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Priority *</label>
              <select class="form-control" id="f-priority">
                <option value="high">High</option>
                <option value="medium" selected>Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Business Value *</label>
              <select class="form-control" id="f-biz">
                <option>Cost Reduction</option>
                <option>Revenue Growth</option>
                <option>Quality Improvement</option>
                <option>Safety Enhancement</option>
                <option selected>Operational Efficiency</option>
                <option>Risk Mitigation</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea class="form-control" id="f-desc"
              placeholder="Describe the problem this AI idea addresses, expected outcomes, and any known constraints..."></textarea>
            <div class="form-hint">Additional structured fields will be added in the next iteration.</div>
          </div>

          <div style="display:flex;gap:10px;margin-top:8px">
            <button type="submit" class="btn btn-primary">Submit Idea</button>
            <button type="button" class="btn btn-ghost" onclick="Router.go('/ideas')">Cancel</button>
          </div>
        </form>
      </div>
    `);
  }

  function submitIdea(e) {
    e.preventDefault();
    const title = $('f-title').value.trim();
    if (!title) return;
    Store.create({
      title,
      priority:      $('f-priority').value,
      businessValue: $('f-biz').value,
      description:   $('f-desc').value.trim(),
    });
    refreshBadges();
    Router.go('/ideas');
  }

  // ── IDEA EDIT MODAL ──────────────────────────────────
  function editIdea(id) {
    const item = Store.getById(id);
    if (!item) return;
    const u = Auth.user;
    const isMine = item.createdBy === u.id;
    if (!isMine && u.role !== 'admin') return;

    $('edit-id').value          = id;
    $('edit-title').value       = item.title;
    $('edit-priority').value    = item.priority;
    $('edit-biz').value         = item.businessValue || 'Operational Efficiency';
    $('edit-desc').value        = item.description || '';
    $('edit-modal-title').textContent = item.stage === 'pilot'
      ? 'Update Pilot Details' : 'Edit Idea';

    // Show pilot-specific note if in pilot
    $('edit-pilot-note').style.display = item.stage === 'pilot' ? 'block' : 'none';

    openModal('edit-modal');
  }

  function saveEdit() {
    const id = $('edit-id').value;
    const title = $('edit-title').value.trim();
    if (!title) return;
    Store.update(id, {
      title,
      priority:      $('edit-priority').value,
      businessValue: $('edit-biz').value,
      description:   $('edit-desc').value.trim(),
    });
    Store.addLog('promote', `${title} updated`);
    closeModal('edit-modal');
    Router.dispatch();
  }

  // ── PROMOTE TO PILOT MODAL ───────────────────────────
  function openPromotePilot(id) {
    const item = Store.getById(id);
    if (!item) return;
    $('promote-id').value       = id;
    $('promote-title').textContent = item.title;

    const members = Auth.getMembers();
    $('member-picker').innerHTML = members.map(m => `
      <label class="member-item">
        <input type="checkbox" value="${m.id}">
        <div class="member-av">${m.initials}</div>
        <div>
          <div class="member-name">${m.name}</div>
          <div class="member-dept">${m.dept}</div>
        </div>
      </label>`).join('');

    openModal('promote-modal');
  }

  function confirmPromotePilot() {
    const id       = $('promote-id').value;
    const checked  = [...$('member-picker').querySelectorAll('input:checked')].map(i => +i.value);
    if (!checked.length) {
      alert('Please assign at least one Task Force Member to this pilot.');
      return;
    }
    Store.promote(id, 'pilot', checked);
    refreshBadges();
    closeModal('promote-modal');
    Router.dispatch();
  }

  // ── RE-ASSIGN PILOT MEMBERS MODAL ───────────────────
  function openAssign(id) {
    const item = Store.getById(id);
    if (!item) return;
    $('assign-id').value = id;
    $('assign-title').textContent = item.title;

    const members = Auth.getMembers();
    $('assign-picker').innerHTML = members.map(m => `
      <label class="member-item">
        <input type="checkbox" value="${m.id}" ${item.assignedTo.includes(m.id) ? 'checked' : ''}>
        <div class="member-av">${m.initials}</div>
        <div>
          <div class="member-name">${m.name}</div>
          <div class="member-dept">${m.dept}</div>
        </div>
      </label>`).join('');

    openModal('assign-modal');
  }

  function saveAssign() {
    const id      = $('assign-id').value;
    const checked = [...$('assign-picker').querySelectorAll('input:checked')].map(i => +i.value);
    Store.update(id, { assignedTo: checked });
    Store.addLog('promote', `Pilot members updated for ${Store.getById(id)?.title}`);
    closeModal('assign-modal');
    Router.dispatch();
  }

  // ── PROMOTE TO PRODUCTION ────────────────────────────
  function promoteToProduction(id) {
    const item = Store.getById(id);
    if (!item) return;
    if (!confirm(`Move "${item.title}" to Production?\n\nA 30-day review period will start from today.`)) return;
    Store.promote(id, 'production');
    refreshBadges();
    Router.dispatch();
  }

  // ── MARK COMPLETE ────────────────────────────────────
  function markComplete(id) {
    const item = Store.getById(id);
    if (!item) return;
    if (!Store.canComplete(id)) {
      alert('The 30-day production review period has not yet elapsed.');
      return;
    }
    if (!confirm(`Mark "${item.title}" as Completed?\n\nThis will move it to the Completed archive.`)) return;
    Store.promote(id, 'completed');
    refreshBadges();
    Router.dispatch();
  }

  // ── IDEAS PAGE ──────────────────────────────────────
  function ideas() {
    setTitle('Ideas');
    const u    = Auth.user;
    const all  = Store.getAll({ stage: 'ideas' });
    const isRO = u.role === 'readonly';

    renderPage(`
      ${isRO ? '<div class="ro-banner">👁 Read-only access — you can view all ideas but cannot edit or submit.</div>' : ''}
      <div class="section-card">
        <div class="section-hdr">
          <span class="section-title">Ideas Pipeline <span style="color:#94a3b8;font-weight:400;font-size:13px">${all.length} initiative${all.length !== 1 ? 's' : ''}</span></span>
          ${Auth.can('createIdea') ? '<button class="btn btn-primary btn-sm" onclick="Router.go(\'/new-idea\')">+ New Idea</button>' : ''}
        </div>
        <div class="init-list">
          ${all.length ? all.map(i => initCard(i)).join('') : emptyStage('ideas')}
        </div>
      </div>
    `);
  }

  // ── MY IDEAS PAGE ────────────────────────────────────
  function myIdeas() {
    setTitle('My Ideas');
    const u   = Auth.user;
    const all = Store.getAll({ createdBy: u.id });

    renderPage(`
      <div class="section-card">
        <div class="section-hdr">
          <span class="section-title">My Submitted Ideas <span style="color:#94a3b8;font-weight:400;font-size:13px">${all.length}</span></span>
          <button class="btn btn-primary btn-sm" onclick="Router.go('/new-idea')">+ New Idea</button>
        </div>
        <div class="init-list">
          ${all.length ? all.map(i => initCard(i)).join('') : `
            <div class="empty-state">
              <div class="empty-icon">💡</div>
              <h3>No ideas submitted yet</h3>
              <p><button class="btn btn-primary" onclick="Router.go('/new-idea')">Submit Your First Idea</button></p>
            </div>`
          }
        </div>
      </div>
    `);
  }

  // ── MY TASKS PAGE ────────────────────────────────────
  function myTasks() {
    setTitle('My Tasks');
    const u    = Auth.user;
    const all  = Store.getAll({ assignedTo: u.id });

    renderPage(`
      <div class="section-card">
        <div class="section-hdr">
          <span class="section-title">Assigned to Me <span style="color:#94a3b8;font-weight:400;font-size:13px">${all.length}</span></span>
        </div>
        <div class="init-list">
          ${all.length ? all.map(i => initCard(i)).join('') : `
            <div class="empty-state">
              <div class="empty-icon">☑</div>
              <h3>No tasks assigned</h3>
              <p>You have not been assigned to any Pilot or Production initiatives yet.</p>
            </div>`
          }
        </div>
      </div>
    `);
  }

  // ── PILOT PAGE ───────────────────────────────────────
  function pilot() {
    setTitle('Pilot');
    const u   = Auth.user;
    const isRO = u.role === 'readonly';
    let all   = Store.getAll({ stage: 'pilot' });

    // Members only see pilots they are assigned to
    if (u.role === 'member') {
      all = all.filter(i => i.assignedTo.includes(u.id) || i.createdBy === u.id);
    }

    renderPage(`
      ${isRO ? '<div class="ro-banner">👁 Read-only access.</div>' : ''}
      ${u.role === 'member' && !isRO ? `
        <div class="ro-banner" style="background:#fff7f4;border-color:#FA4616;color:#7c2d12">
          ✏ You can update pilots you are assigned to. Contact an Admin to be assigned to others.
        </div>` : ''}
      <div class="section-card">
        <div class="section-hdr">
          <span class="section-title">Pilot Stage <span style="color:#94a3b8;font-weight:400;font-size:13px">${all.length} initiative${all.length !== 1 ? 's' : ''}</span></span>
        </div>
        <div class="init-list">
          ${all.length ? all.map(i => initCard(i)).join('') : emptyStage('pilot')}
        </div>
      </div>
    `);
  }

  // ── PRODUCTION PAGE ──────────────────────────────────
  function production() {
    setTitle('Production');
    const u   = Auth.user;
    const isRO = u.role !== 'admin';
    const all = Store.getAll({ stage: 'production' });

    renderPage(`
      ${isRO ? '<div class="ro-banner">👁 Only Admins can promote or complete production initiatives.</div>' : ''}
      <div class="section-card">
        <div class="section-hdr">
          <span class="section-title">Production <span style="color:#94a3b8;font-weight:400;font-size:13px">${all.length} initiative${all.length !== 1 ? 's' : ''}</span></span>
        </div>
        <div class="init-list">
          ${all.length ? all.map(i => initCard(i)).join('') : emptyStage('production')}
        </div>
      </div>
      ${u.role === 'admin' ? `
        <div class="section-card" style="background:#f8fafc;border:1px dashed #e2e8f0">
          <div style="font-size:12px;color:#94a3b8;line-height:1.6">
            <strong style="color:#4D4D4F">30-Day Review Policy:</strong>
            An initiative must remain in Production for a minimum of 30 days before it can be marked Complete.
            The timer starts when the Admin promotes it to Production status.
            The "✓ Mark Complete" button activates automatically once the period elapses.
          </div>
        </div>` : ''}
    `);
  }

  // ── COMPLETED PAGE ───────────────────────────────────
  function completed() {
    setTitle('Completed');
    const all = Store.getAll({ stage: 'completed' });
    renderPage(`
      <div class="section-card">
        <div class="section-hdr">
          <span class="section-title">Completed Initiatives <span style="color:#94a3b8;font-weight:400;font-size:13px">${all.length}</span></span>
        </div>
        <div class="init-list">
          ${all.length ? all.map(i => initCard(i, { showActions: false })).join('') : emptyStage('completed')}
        </div>
      </div>
    `);
  }

  // ── ADMIN PAGE ───────────────────────────────────────
  function admin() {
    if (!Auth.can('adminPanel')) { Router.go('/home'); return; }
    setTitle('Members & Access');
    const users = Auth.getAllUsers();

    renderPage(`
      <div class="section-card">
        <div class="section-hdr">
          <span class="section-title">Active Directory Groups</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:6px">
          ${[
            ['AI_TFADM','admin','Platform Administrators — full access, promote stages, manage members'],
            ['AI_TFM','member','Task Force Members — submit ideas, work assigned pilots'],
            ['AI_TFRO','readonly','Read-Only observers — view all pipeline stages, no editing'],
          ].map(([grp, role, desc]) => `
            <div style="background:var(--gray-50);border-radius:var(--r-md);padding:14px">
              <div style="font-weight:700;font-size:13px;color:var(--black);margin-bottom:4px">${grp}</div>
              <div style="margin-bottom:6px">${roleBadge(role)}</div>
              <div style="font-size:11px;color:var(--gray-400);line-height:1.5">${desc}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="section-card">
        <div class="section-hdr">
          <span class="section-title">User Directory</span>
          <span style="font-size:12px;color:var(--gray-400)">Managed via Active Directory</span>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Department</th>
              <th>AD Group</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => {
              const roleMap = { AI_TFADM: 'admin', AI_TFM: 'member', AI_TFRO: 'readonly' };
              return `<tr>
                <td style="display:flex;align-items:center;gap:8px">
                  <div class="av" style="width:28px;height:28px;font-size:10px">${u.initials}</div>
                  <span style="font-weight:600;color:var(--black)">${u.name}</span>
                </td>
                <td>${u.email}</td>
                <td>${u.dept}</td>
                <td><code style="font-size:11px;background:var(--gray-100);padding:2px 6px;border-radius:4px">${u.adGroup}</code></td>
                <td>${roleBadge(roleMap[u.adGroup])}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div style="margin-top:14px;padding:12px;background:var(--gray-50);border-radius:var(--r-sm);font-size:12px;color:var(--gray-400);line-height:1.6">
          <strong style="color:var(--gray-600)">Access management:</strong>
          Add or remove users from AD groups <strong>AI_TFADM</strong>, <strong>AI_TFM</strong>, and <strong>AI_TFRO</strong>
          via your Active Directory / Azure AD admin portal. Changes take effect on next login.
        </div>
      </div>

      <div class="section-card">
        <div class="section-hdr">
          <span class="section-title">Platform Settings</span>
          <span style="font-size:11px;color:var(--orange);background:#fff7f4;padding:2px 8px;border-radius:4px;font-weight:600">Coming Soon</span>
        </div>
        <div style="font-size:13px;color:var(--gray-400);line-height:1.7">
          Notification preferences, email digest configuration, database connection, and integration settings
          will be available once the backend infrastructure is provisioned.
        </div>
      </div>
    `);
  }

  // ── HELPERS ─────────────────────────────────────────
  function emptyStage(stage) {
    const msgs = {
      ideas:      { icon: '💡', h: 'No ideas yet', p: Auth.can('createIdea') ? '<button class="btn btn-primary" onclick="Router.go(\'/new-idea\')">Submit First Idea</button>' : 'No ideas have been submitted yet.' },
      pilot:      { icon: '🔬', h: 'No pilots running', p: 'Ideas promoted to Pilot by an Admin will appear here.' },
      production: { icon: '🚀', h: 'Nothing in Production', p: 'Pilots promoted to Production by an Admin will appear here.' },
      completed:  { icon: '✅', h: 'No completed initiatives', p: 'Completed AI initiatives will be archived here.' },
    };
    const m = msgs[stage] || { icon: '📋', h: 'Empty', p: '' };
    return `<div class="empty-state"><div class="empty-icon">${m.icon}</div><h3>${m.h}</h3><p>${m.p}</p></div>`;
  }

  return {
    home, newIdea, submitIdea, ideas, myIdeas, myTasks,
    pilot, production, completed, admin,
    editIdea, saveEdit,
    openPromotePilot, confirmPromotePilot,
    openAssign, saveAssign,
    promoteToProduction, markComplete,
  };
})();


// ══════════════════════════════════════════════════════
// MODALS MARKUP  — injected once into DOM
// ══════════════════════════════════════════════════════
function buildModals() {
  const container = document.createElement('div');
  container.id = 'modals';
  container.innerHTML = `

    <!-- Edit / Update Modal -->
    <div class="modal-overlay" id="edit-modal">
      <div class="modal">
        <div class="modal-hdr">
          <h3 id="edit-modal-title">Edit Idea</h3>
          <button class="modal-close" onclick="closeModal('edit-modal')">×</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="edit-id">

          <div id="edit-pilot-note" style="display:none" class="placeholder-notice">
            <strong>Pilot Update:</strong>
            Additional pilot-specific fields (test plan, KPIs, resource usage, notes)
            will be defined in the next form iteration.
          </div>

          <div class="form-group">
            <label class="form-label">Title *</label>
            <input class="form-control" id="edit-title" type="text" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Priority</label>
              <select class="form-control" id="edit-priority">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Business Value</label>
              <select class="form-control" id="edit-biz">
                <option>Cost Reduction</option>
                <option>Revenue Growth</option>
                <option>Quality Improvement</option>
                <option>Safety Enhancement</option>
                <option>Operational Efficiency</option>
                <option>Risk Mitigation</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea class="form-control" id="edit-desc"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('edit-modal')">Cancel</button>
          <button class="btn btn-primary" onclick="Views.saveEdit()">Save Changes</button>
        </div>
      </div>
    </div>

    <!-- Promote to Pilot Modal -->
    <div class="modal-overlay" id="promote-modal">
      <div class="modal">
        <div class="modal-hdr">
          <h3>Promote to Pilot</h3>
          <button class="modal-close" onclick="closeModal('promote-modal')">×</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="promote-id">
          <p style="font-size:14px;color:var(--gray-600);margin-bottom:16px">
            Promoting <strong id="promote-title"></strong> to Pilot.
            Select the Task Force Members who will have read/write access to this pilot.
          </p>
          <div class="form-group">
            <label class="form-label">Assign Task Force Members (required) *</label>
            <div class="member-list" id="member-picker"></div>
          </div>
          <div class="placeholder-notice">
            <strong>Pilot form fields coming soon.</strong>
            Fields for pilot scope, success criteria, timeline, and resource allocation
            will be added once defined.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('promote-modal')">Cancel</button>
          <button class="btn btn-teal" onclick="Views.confirmPromotePilot()">Confirm Promotion</button>
        </div>
      </div>
    </div>

    <!-- Re-assign Members Modal -->
    <div class="modal-overlay" id="assign-modal">
      <div class="modal">
        <div class="modal-hdr">
          <h3>Manage Pilot Assignment</h3>
          <button class="modal-close" onclick="closeModal('assign-modal')">×</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="assign-id">
          <p style="font-size:14px;color:var(--gray-600);margin-bottom:14px">
            Updating assigned members for <strong id="assign-title"></strong>.
            Selected members receive read/write access to this pilot.
          </p>
          <div class="form-group">
            <label class="form-label">Task Force Members</label>
            <div class="member-list" id="assign-picker"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('assign-modal')">Cancel</button>
          <button class="btn btn-primary" onclick="Views.saveAssign()">Save Assignment</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(container);
}


// ══════════════════════════════════════════════════════
// APP — Bootstrap & lifecycle
// ══════════════════════════════════════════════════════
const App = (() => {

  function showLogin() {
    $('login-page').style.display = 'flex';
    $('app').classList.remove('visible');
  }

  function showApp() {
    $('login-page').style.display = 'none';
    $('app').classList.add('visible');
    renderSidebar();
    bindRoutes();
    Router.dispatch();
  }

  function bindRoutes() {
    Router.on('/home',       Views.home);
    Router.on('/new-idea',   Views.newIdea);
    Router.on('/ideas',      Views.ideas);
    Router.on('/my-ideas',   Views.myIdeas);
    Router.on('/my-tasks',   Views.myTasks);
    Router.on('/pilot',      Views.pilot);
    Router.on('/production', Views.production);
    Router.on('/completed',  Views.completed);
    Router.on('/admin',      Views.admin);
  }

  function login() {
    const uid = $('user-select').value;
    if (!uid) return;
    if (Auth.login(uid)) showApp();
  }

  function logout() {
    Auth.logout();
    window.location.hash = '';
    showLogin();
  }

  function init() {
    Store.load();
    buildModals();

    // Restore session if available
    if (Auth.restore()) {
      showApp();
    } else {
      showLogin();
    }
  }

  return { init, login, logout };
})();

// Boot
document.addEventListener('DOMContentLoaded', App.init);

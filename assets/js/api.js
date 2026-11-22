/* DONE | تمّ — data layer.
   Today everything is stored in the browser (localStorage) so the site works with no server.
   When a backend is ready, replace these functions with fetch() calls —
   the site, the admin panel and the future mobile app only talk to DoneAPI.

   ⚠ Admin login here is a client-side check (good for a demo, NOT real security).
   With a backend, move login to the server and remove ADMIN_DEFAULT below. */

const DoneAPI = (() => {
  const K = { req: 'done.requests.v1', teams: 'done.teams.v1', admin: 'done.admin.v1', session: 'done.session', customer: 'done.customer.v1', registry: 'done.customers.v1' };
  // default admin: username "admin" — password is in ADMIN-LOGIN.md (only its hash is stored here)
  const ADMIN_DEFAULT = { user: 'admin', hash: '042c582760af437df6db208f000df9d1f20fb5ca8233a7044cb986008babc24e' };

  const read = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const newId = (p) => p + Date.now().toString().slice(-6) + Math.floor(Math.random() * 10);

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const credHash = (u, p) => sha256(`done:${u}:${p}`);

  return {
    /* ---------- Requests ---------- */
    async listRequests() {
      return read(K.req, []).sort((a, b) => b.createdAt - a.createdAt);
    },
    async getRequest(id) {
      return read(K.req, []).find((r) => r.id === id) || null;
    },
    async createRequest(data) {
      const req = { id: newId('DN-'), createdAt: Date.now(), status: 0, teamId: null, schedule: null, notes: [], log: [{ at: Date.now(), text: 'created' }], data };
      write(K.req, [req, ...read(K.req, [])]);
      return req;
    },
    async updateRequest(id, patch, logText) {
      const list = read(K.req, []);
      const r = list.find((x) => x.id === id);
      if (!r) return null;
      Object.assign(r, patch, { updatedAt: Date.now() });
      if (logText) (r.log = r.log || []).push({ at: Date.now(), text: logText });
      write(K.req, list);
      return r;
    },
    async addNote(id, text) {
      const list = read(K.req, []);
      const r = list.find((x) => x.id === id);
      if (!r) return null;
      (r.notes = r.notes || []).push({ at: Date.now(), text });
      write(K.req, list);
      return r;
    },
    async deleteRequest(id) {
      write(K.req, read(K.req, []).filter((r) => r.id !== id));
    },
    async completeRequest(id) {
      return this.updateRequest(id, { status: 4, completedAt: Date.now() }, 'تم الانتهاء من الطلب ✓');
    },
    async rateRequest(id, stars, comment) {
      const s = Math.max(1, Math.min(5, Math.round(stars)));
      return this.updateRequest(id, { rating: { stars: s, comment: (comment || '').trim(), at: Date.now() } }, `تقييم العميل: ${'★'.repeat(s)}`);
    },

    /* ---------- Customers ----------
       A customer = their mobile number. To open "My requests" they enter
       mobile + one of their request numbers (later: mobile + OTP code via the server). */
    normPhone(p) {
      let d = String(p || '').replace(/\D/g, '');
      if (d.startsWith('00966')) d = d.slice(5); else if (d.startsWith('966')) d = d.slice(3);
      if (d.startsWith('0')) d = d.slice(1);
      return d; // e.g. 5XXXXXXXX
    },
    normId(id) {
      let s = String(id || '').toUpperCase().replace(/[#\s]/g, '');
      if (/^\d+$/.test(s)) s = 'DN-' + s;
      if (/^DN\d/.test(s)) s = 'DN-' + s.slice(2);
      return s;
    },
    async customerLogin(phone, reqId) {
      const p = this.normPhone(phone), id = this.normId(reqId);
      const ok = !!p && read(K.req, []).some((r) => r.id === id && this.normPhone(r.data.phone) === p);
      if (ok) write(K.customer, { phone: p, at: Date.now() });
      return ok;
    },
    customerSignIn(phone) { const s = read(K.customer, {}) || {}; write(K.customer, { ...s, phone: this.normPhone(phone), at: Date.now() }); },
    // Sign-up on first visit: name + mobile. The mobile identifies the customer;
    // with a server this becomes "send an OTP code to the mobile" before signing in.
    async customerRegister(name, phone) {
      const p = this.normPhone(phone), n = String(name || '').trim();
      write(K.customer, { name: n, phone: p, at: Date.now() });
      const reg = read(K.registry, []);
      const i = reg.findIndex((c) => c.phone === p);
      if (i > -1) reg[i] = { ...reg[i], name: n, lastSeen: Date.now() };
      else reg.push({ phone: p, name: n, at: Date.now(), lastSeen: Date.now() });
      write(K.registry, reg);
      return { name: n, phone: p };
    },
    customerSession() { return read(K.customer, null); },
    customerLogout() { try { localStorage.removeItem(K.customer); } catch {} },
    async listCustomerRequests(phone) {
      const p = this.normPhone(phone);
      return (await this.listRequests()).filter((r) => this.normPhone(r.data.phone) === p);
    },
    async listCustomers() {
      const map = new Map();
      for (const r of await this.listRequests()) {
        const p = this.normPhone(r.data.phone);
        if (!map.has(p)) map.set(p, { phone: '+966' + p, name: r.data.name, requests: [], cities: new Set() });
        const c = map.get(p);
        c.requests.push(r);
        if (r.data.city !== '' && r.data.city != null) c.cities.add(r.data.city);
      }
      const reg = read(K.registry, []);
      for (const s of reg) {
        if (!map.has(s.phone)) map.set(s.phone, { phone: '+966' + s.phone, name: s.name, requests: [], cities: new Set(), at: s.at });
        else map.get(s.phone).at = s.at;
      }
      return [...map.values()].map((c) => {
        const rated = c.requests.filter((r) => r.rating);
        const times = c.requests.map((r) => r.createdAt);
        if (!times.length) times.push(c.at || Date.now());
        return {
          registeredAt: c.at || null,
          phone: c.phone, name: c.name, email: (c.requests.find((r) => r.data.email) || { data: {} }).data.email || '',
          count: c.requests.length,
          open: c.requests.filter((r) => r.status < 4).length,
          done: c.requests.filter((r) => r.status === 4).length,
          avg: rated.length ? rated.reduce((a, r) => a + r.rating.stars, 0) / rated.length : null,
          first: Math.min(...times),
          last: Math.max(...times),
          cities: [...c.cities],
          ids: c.requests.map((r) => r.id),
        };
      }).sort((a, b) => b.last - a.last);
    },

    /* ---------- Teams ---------- */
    async listTeams() { return read(K.teams, []); },
    async saveTeam(team) {
      const list = read(K.teams, []);
      if (team.id) { const i = list.findIndex((t) => t.id === team.id); if (i > -1) list[i] = team; }
      else { team.id = newId('T-'); list.push(team); }
      write(K.teams, list);
      return team;
    },
    async deleteTeam(id) {
      write(K.teams, read(K.teams, []).filter((t) => t.id !== id));
      const reqs = read(K.req, []);
      reqs.forEach((r) => { if (r.teamId === id) r.teamId = null; });
      write(K.req, reqs);
    },

    /* ---------- Admin auth ---------- */
    async login(user, pass) {
      const admin = read(K.admin, ADMIN_DEFAULT);
      const ok = user.trim() === admin.user && (await credHash(user.trim(), pass)) === admin.hash;
      if (ok) sessionStorage.setItem(K.session, JSON.stringify({ user: admin.user, at: Date.now() }));
      return ok;
    },
    logout() { sessionStorage.removeItem(K.session); },
    session() { try { return JSON.parse(sessionStorage.getItem(K.session)); } catch { return null; } },
    async changeCredentials(currentPass, newUser, newPass) {
      const admin = read(K.admin, ADMIN_DEFAULT);
      if ((await credHash(admin.user, currentPass)) !== admin.hash) return false;
      write(K.admin, { user: newUser.trim(), hash: await credHash(newUser.trim(), newPass) });
      sessionStorage.setItem(K.session, JSON.stringify({ user: newUser.trim(), at: Date.now() }));
      return true;
    },

    /* ---------- Demo data ---------- */
    async seedDemo() {
      const day = 864e5, now = Date.now();
      const iso = (d) => new Date(now + d * day).toISOString().slice(0, 10);
      const teams = [
        { name: 'فريق القياس والتصميم', lead: 'م. سامر', phone: '+966500000001', skills: ['measure', 'design'] },
        { name: 'فريق الرخام والبورسلان', lead: 'أبو خالد', phone: '+966500000002', skills: ['porcelain', 'sink', 'kitchen', 'table'] },
        { name: 'فريق الباركيه', lead: 'أحمد', phone: '+966500000003', skills: ['parquet'] },
        { name: 'فريق الموزاييك والمسابح', lead: 'يوسف', phone: '+966500000004', skills: ['mosaic'] },
        { name: 'فريق الألمنيوم', lead: 'ماهر', phone: '+966500000005', skills: ['aluminium'] },
      ];
      const saved = [];
      for (const t of teams) saved.push(await this.saveTeam(t));
      const mk = (o, i) => ({
        id: 'DN-DEMO' + (i + 1), createdAt: now - (i + 1) * day * 0.7, status: o.status, teamId: o.team != null ? saved[o.team].id : null,
        schedule: o.schedule || null, notes: [], rating: o.rating ? { ...o.rating, at: now - day * 0.5 } : undefined, log: [{ at: now - (i + 1) * day * 0.7, text: 'created' }],
        data: { property: 'villa', area: o.area || null, material: o.material || 'undecided', needDesign: !!o.design, notes: o.notes || '', photos: [],
          district: o.district, address: '', date: iso(o.in), slot: 'morning', email: '', contact: 'whatsapp', services: o.services, city: o.city, name: o.name, phone: o.phone },
      });
      const demo = [
        { name: 'عبدالله المطيري', phone: '+966551112233', city: '0', district: 'أبحر الشمالية', services: ['kitchen', 'sink'], material: 'marble', design: true, area: 18, in: 2, status: 0, notes: 'سطح مطبخ رخام أبيض كرارا مع مغسلتين' },
        { name: 'نورة القحطاني', phone: '+966552223344', city: '0', district: 'الشاطئ', services: ['mosaic'], area: 60, in: 3, status: 0, notes: 'تكسية مسبح موزاييك أزرق' },
        { name: 'فهد الدوسري', phone: '+966553334455', city: '1', district: 'العزيزية', services: ['measure', 'design', 'porcelain'], design: true, area: 220, in: 1, status: 1, team: 0, schedule: iso(1) },
        { name: 'سارة العتيبي', phone: '+966554445566', city: '0', district: 'الحمراء', services: ['parquet'], material: 'wood', area: 95, in: -2, status: 3, team: 2, schedule: iso(-2) },
        { name: 'محمد الشهري', phone: '+966555556677', city: '1', district: 'الشوقية', services: ['aluminium'], material: 'aluminium', in: -5, status: 4, team: 4, schedule: iso(-5), rating: { stars: 5, comment: 'شغل نظيف والتزام بالموعد' } },
        { name: 'عبدالله المطيري', phone: '+966551112233', city: '0', district: 'أبحر الشمالية', services: ['porcelain'], material: 'porcelain', area: 140, in: -20, status: 4, team: 1, schedule: iso(-20), rating: { stars: 4, comment: '' } },
        { name: 'ريم الزهراني', phone: '+966556667788', city: '0', district: 'الروضة', services: ['table', 'design'], material: 'marble', design: true, in: 4, status: 2, team: 0, schedule: iso(-1) },
      ];
      write(K.req, [...demo.map(mk), ...read(K.req, [])]);
    },
    async clearAll() { localStorage.removeItem(K.req); localStorage.removeItem(K.teams); localStorage.removeItem(K.registry); },
    remote: false,
    async canRate(id) { return (await this.listRequests()).some((r) => r.id === id && r.status === 4 && !r.rating); },
  };
})();

/* ================= Supabase backend =================
   When BACKEND.url + BACKEND.key are set (assets/js/data.js), requests, teams and customers
   live in the Supabase database (tables + security rules: supabase/schema.sql):
   - customers can only create a request, read their own (by mobile) and rate it;
   - the admin signs in with Supabase Auth (email + password) and has full access. */
(() => {
  const B = typeof BACKEND !== 'undefined' && BACKEND.url && BACKEND.key ? BACKEND : null;
  if (!B) return;
  const L = { ...DoneAPI };            // local helpers we keep (normPhone, customer session…)
  const AK = 'done.auth';
  const base = B.url.replace(/\/+$/, '');
  const getTok = () => { try { return JSON.parse(sessionStorage.getItem(AK)); } catch { return null; } };
  const setTok = (t) => { if (t) sessionStorage.setItem(AK, JSON.stringify(t)); else sessionStorage.removeItem(AK); };
  const newId = (p) => p + Date.now().toString().slice(-6) + Math.floor(Math.random() * 10);

  async function auth(path, body, token) {
    const h = { apikey: B.key, 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    const res = await fetch(`${base}/auth/v1/${path}`, { method: body ? (path === 'user' ? 'PUT' : 'POST') : 'GET', headers: h, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    return res.ok ? j : null;
  }
  const keep = (j) => j && j.access_token ? { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || (Date.now() / 1000 + (j.expires_in || 3600)), email: (j.user || {}).email } : null;
  async function token() {
    const t = getTok();
    if (!t) return null;
    if (t.expires_at * 1000 > Date.now() + 60e3) return t.access_token;
    const n = keep(await auth('token?grant_type=refresh_token', { refresh_token: t.refresh_token }));
    setTok(n ? { ...n, email: n.email || t.email } : null);
    return n ? n.access_token : null;
  }
  async function rest(path, { method = 'GET', body, prefer } = {}) {
    const h = { apikey: B.key, 'Content-Type': 'application/json' };
    const tk = await token();
    if (tk) h.Authorization = 'Bearer ' + tk;
    if (prefer) h.Prefer = prefer;
    const res = await fetch(`${base}/rest/v1/${path}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`DONE backend ${res.status}: ${await res.text()}`);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }
  const rpc = (fn, args) => rest('rpc/' + fn, { method: 'POST', body: args });
  const q = encodeURIComponent;

  const toReq = (r) => ({
    id: r.id, createdAt: +r.created_at, status: r.status, teamId: r.team_id ?? null, schedule: r.schedule ?? null,
    completedAt: r.completed_at ? +r.completed_at : undefined, updatedAt: r.updated_at ? +r.updated_at : undefined,
    rating: r.rating || undefined, notes: r.notes || [], log: r.log || [], data: r.data || {},
  });
  const COLS = { status: 'status', teamId: 'team_id', schedule: 'schedule', completedAt: 'completed_at', updatedAt: 'updated_at', rating: 'rating', notes: 'notes', log: 'log', data: 'data' };
  const toRow = (patch) => { const o = {}; for (const k in patch) if (COLS[k]) o[COLS[k]] = patch[k] === undefined ? null : patch[k]; return o; };
  const reqRow = (r) => ({ id: r.id, phone: L.normPhone(r.data.phone), created_at: r.createdAt, status: r.status, team_id: r.teamId, schedule: r.schedule, completed_at: r.completedAt || null, rating: r.rating || null, notes: r.notes || [], log: r.log || [], data: r.data });

  Object.assign(DoneAPI, {
    remote: true,

    async listRequests() {
      if (!getTok()) return [];   // only the admin can list all requests
      return (await rest('requests?select=*&order=created_at.desc')).map(toReq);
    },
    async getRequest(id) {
      const [r] = await rest(`requests?select=*&id=eq.${q(id)}`);
      return r ? toReq(r) : null;
    },
    async createRequest(data) {
      const now = Date.now();
      const req = { id: newId('DN-'), createdAt: now, status: 0, teamId: null, schedule: null, notes: [], log: [{ at: now, text: 'created' }], data };
      await rest('requests', { method: 'POST', body: reqRow(req), prefer: 'return=minimal' });
      return req;
    },
    async updateRequest(id, patch, logText) {
      const cur = await this.getRequest(id);
      if (!cur) return null;
      const p = { ...patch, updatedAt: Date.now() };
      if (logText) p.log = [...(cur.log || []), { at: Date.now(), text: logText }];
      const [r] = await rest(`requests?id=eq.${q(id)}`, { method: 'PATCH', body: toRow(p), prefer: 'return=representation' });
      return r ? toReq(r) : null;
    },
    async addNote(id, text) {
      const cur = await this.getRequest(id);
      if (!cur) return null;
      const [r] = await rest(`requests?id=eq.${q(id)}`, { method: 'PATCH', body: { notes: [...(cur.notes || []), { at: Date.now(), text }] }, prefer: 'return=representation' });
      return r ? toReq(r) : null;
    },
    async deleteRequest(id) { await rest(`requests?id=eq.${q(id)}`, { method: 'DELETE' }); },
    async rateRequest(id, stars, comment) {
      await rpc('rate_request', { p_id: id, p_stars: Math.round(stars), p_note: comment || '' });
    },
    async canRate(id) { try { return !!(await rpc('can_rate', { p_id: id })); } catch { return false; } },

    /* customers */
    async customerRegister(name, phone) {
      const c = await L.customerRegister(name, phone);
      rpc('register_customer', { p_phone: c.phone, p_name: c.name }).catch(() => {});
      return c;
    },
    async listCustomerRequests(phone) {
      const p = L.normPhone(phone);
      if (!/^5\d{8}$/.test(p)) return [];
      try { return (await rpc('my_requests', { p_phone: p })).map(toReq); } catch { return []; }
    },
    async customerLogin(phone, reqId) {
      const id = L.normId(reqId);
      const ok = (await this.listCustomerRequests(phone)).some((r) => r.id === id);
      if (ok) L.customerSignIn(phone);
      return ok;
    },
    async listCustomers() {
      const [reqs, reg] = await Promise.all([this.listRequests(), rest('customers?select=*')]);
      return summarize(reqs, reg.map((c) => ({ phone: c.phone, name: c.name, at: c.at ? +c.at : null })));
    },

    /* teams */
    async listTeams() { return rest('teams?select=*&order=name'); },
    async saveTeam(team) {
      const row = { name: team.name, lead: team.lead || '', phone: team.phone || '', skills: team.skills || [] };
      if (team.id) { await rest(`teams?id=eq.${q(team.id)}`, { method: 'PATCH', body: row }); return team; }
      const t = { id: newId('T-'), ...row };
      await rest('teams', { method: 'POST', body: t, prefer: 'return=minimal' });
      return t;
    },
    async deleteTeam(id) {
      await rest(`requests?team_id=eq.${q(id)}`, { method: 'PATCH', body: { team_id: null } });
      await rest(`teams?id=eq.${q(id)}`, { method: 'DELETE' });
    },

    /* admin auth (Supabase Auth: email + password) */
    async login(email, pass) {
      const t = keep(await auth('token?grant_type=password', { email: String(email).trim(), password: pass }));
      if (!t) return false;
      setTok(t);
      try {                       // signed in, but is this user an admin of the panel?
        const me = await rest('admins?select=user_id');
        if (!me.length) { setTok(null); return false; }
      } catch { setTok(null); return false; }
      return true;
    },
    logout() { const t = getTok(); if (t) auth('logout', {}, t.access_token).catch(() => {}); setTok(null); },
    session() { const t = getTok(); return t ? { user: t.email || 'admin', at: Date.now() } : null; },
    async changeCredentials(currentPass, _newUser, newPass) {
      const t = getTok(); if (!t) return false;
      const chk = keep(await auth('token?grant_type=password', { email: t.email, password: currentPass }));
      if (!chk) return false;
      setTok(chk);
      return !!(await auth('user', { password: newPass }, chk.access_token));
    },

    /* demo / reset */
    async seedDemo() {
      const backup = { req: localStorage.getItem('done.requests.v1'), teams: localStorage.getItem('done.teams.v1') };
      localStorage.removeItem('done.requests.v1'); localStorage.removeItem('done.teams.v1');
      try {
        await L.seedDemo.call(L);
        const teams = JSON.parse(localStorage.getItem('done.teams.v1') || '[]');
        const reqs = JSON.parse(localStorage.getItem('done.requests.v1') || '[]');
        if (teams.length) await rest('teams', { method: 'POST', body: teams.map((t) => ({ id: t.id, name: t.name, lead: t.lead, phone: t.phone, skills: t.skills })), prefer: 'return=minimal,resolution=merge-duplicates' });
        if (reqs.length) await rest('requests', { method: 'POST', body: reqs.map(reqRow), prefer: 'return=minimal,resolution=merge-duplicates' });
      } finally {
        ['req', 'teams'].forEach((k) => { const key = k === 'req' ? 'done.requests.v1' : 'done.teams.v1'; if (backup[k] == null) localStorage.removeItem(key); else localStorage.setItem(key, backup[k]); });
      }
    },
    async clearAll() {
      await rest('requests?id=not.is.null', { method: 'DELETE' });
      await rest('teams?id=not.is.null', { method: 'DELETE' });
      await rest('customers?phone=not.is.null', { method: 'DELETE' });
    },
  });

  // same summary the local version computes
  function summarize(requests, reg) {
    const map = new Map();
    for (const r of requests) {
      const p = L.normPhone(r.data.phone);
      if (!map.has(p)) map.set(p, { phone: '+966' + p, name: r.data.name, requests: [], cities: new Set() });
      const c = map.get(p);
      c.requests.push(r);
      if (r.data.city !== '' && r.data.city != null) c.cities.add(r.data.city);
    }
    for (const s of reg) {
      if (!map.has(s.phone)) map.set(s.phone, { phone: '+966' + s.phone, name: s.name, requests: [], cities: new Set(), at: s.at });
      else map.get(s.phone).at = s.at;
    }
    return [...map.values()].map((c) => {
      const rated = c.requests.filter((r) => r.rating);
      const times = c.requests.map((r) => r.createdAt);
      if (!times.length) times.push(c.at || Date.now());
      return {
        registeredAt: c.at || null, phone: c.phone, name: c.name,
        email: (c.requests.find((r) => r.data.email) || { data: {} }).data.email || '',
        count: c.requests.length, open: c.requests.filter((r) => r.status < 4).length, done: c.requests.filter((r) => r.status === 4).length,
        avg: rated.length ? rated.reduce((a, r) => a + r.rating.stars, 0) / rated.length : null,
        first: Math.min(...times), last: Math.max(...times), cities: [...c.cities], ids: c.requests.map((r) => r.id),
      };
    }).sort((a, b) => b.last - a.last);
  }
})();

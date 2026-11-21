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
  };
})();

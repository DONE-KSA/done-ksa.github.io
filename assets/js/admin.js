/* DONE | تمّ — Admin panel logic */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paintIcons = (root = document) => $$('[data-icon]', root).forEach((el) => { if (!el.querySelector('svg')) el.insertAdjacentHTML('afterbegin', svg(el.dataset.icon)); });

  const LOC = 'ar-SA-u-ca-gregory-nu-latn';
  const fmtDate = (d) => d ? new Date(d.length === 10 ? d + 'T00:00' : d).toLocaleDateString(LOC, { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
  const fmtDT = (ts) => new Date(ts).toLocaleString(LOC, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const svcById = (id) => SERVICES.find((s) => s.id === id);
  const city = (i) => (i === '' || i == null) ? '—' : CITIES.ar[i] || i;
  const PROPERTY = { villa: 'فيلا', apartment: 'شقة', commercial: 'تجاري', other: 'أخرى' };
  const MATERIAL = { marble: 'رخام طبيعي', porcelain: 'بورسلان', wood: 'خشب', aluminium: 'ألمنيوم', undecided: 'لم يقرر' };
  const SLOT = { morning: 'صباحاً 8–12', afternoon: 'ظهراً 12–4', evening: 'مساءً 4–9' };
  const STAT_LABELS = ['جديدة', 'رفع المقاسات', 'التصميم', 'قيد التنفيذ', 'منجزة'];
  const digits = (p) => String(p || '').replace(/\D/g, '');

  let filter = { status: 'all', q: '', service: '', city: '', team: '' };
  let reqs = [], teams = [], customers = [], openId = null;
  let custFilter = { q: '', kind: '' };

  function toast(msg) {
    const t = $('#toast');
    t.innerHTML = svg('check') + esc(msg);
    t.hidden = false;
    clearTimeout(toast.tm);
    toast.tm = setTimeout(() => { t.hidden = true; }, 2400);
  }

  /* ================= AUTH ================= */
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#lUser').focus(); }
  async function showApp() {
    $('#login').hidden = true; $('#app').hidden = false;
    $('#whoami').textContent = DoneAPI.session().user;
    try { await load(); }
    catch (err) { console.error(err); DoneAPI.logout(); showLogin(); $('#loginErr').textContent = 'انتهت الجلسة أو تعذّر الاتصال، سجّل الدخول مرة أخرى'; return; }
    setView('requests');
  }
  if (DoneAPI.remote) {
    // database mode: sign in with the admin e-mail; the e-mail itself can't be changed from here
    $('label[for="lUser"]').textContent = 'البريد الإلكتروني';
    $('#lUser').type = 'email';
    $('label[for="cUser"]').textContent = 'البريد الإلكتروني';
    $('#cUser').readOnly = true;
    const n = $('#credForm').nextElementSibling && $('#credForm').nextElementSibling.querySelector('.note');
    if (n) n.innerHTML = '<b>متصل بقاعدة البيانات ✓</b>تصل طلبات العملاء من كل الأجهزة إلى هذه اللوحة مباشرة، وتتحدث تلقائياً كل 30 ثانية.';
    // pick up new customer requests automatically (not while a drawer/modal is open)
    setInterval(() => {
      if (DoneAPI.session() && !$('#app').hidden && $('#reqDrawer').hidden && $('#teamModal').hidden && document.visibilityState === 'visible') load().catch(() => {});
    }, 30000);
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await DoneAPI.login($('#lUser').value, $('#lPass').value);
    if (ok) { $('#lPass').value = ''; $('#loginErr').textContent = ''; showApp(); }
    else {
      $('#loginErr').textContent = DoneAPI.remote ? 'البريد أو كلمة المرور غير صحيحة' : 'اسم المستخدم أو كلمة المرور غير صحيحة';
      const c = $('.login__card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
    }
  });
  $('#eye').addEventListener('click', () => { const p = $('#lPass'); p.type = p.type === 'password' ? 'text' : 'password'; });
  $('#logout').addEventListener('click', () => { DoneAPI.logout(); location.reload(); });

  /* ================= DATA ================= */
  async function load() {
    [reqs, teams] = await Promise.all([DoneAPI.listRequests(), DoneAPI.listTeams()]);
    renderFilters();
    renderStats();
    renderRows();
    renderTeams();
    customers = await DoneAPI.listCustomers();
    renderCustomers();
    $('#custCount').textContent = customers.length; $('#custCount').hidden = !customers.length;
    const n = reqs.filter((r) => r.status === 0 && !r.teamId).length;
    $('#newCount').textContent = n; $('#newCount').hidden = !n;
    if (openId) renderDetail();
  }
  // a customer submitting in another tab of this browser shows up live
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('done.') && DoneAPI.session()) load(); });

  /* ================= VIEWS ================= */
  const TITLES = { requests: 'الطلبات', customers: 'العملاء', teams: 'فرق التنفيذ', settings: 'الإعدادات' };
  function setView(v) {
    $$('.side__nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    $$('.view').forEach((s) => { s.hidden = s.dataset.view !== v; });
    $('#viewTitle').textContent = TITLES[v];
    $('#side').classList.remove('open');
    if (v === 'settings') $('#cUser').value = DoneAPI.session().user;
  }
  $$('.side__nav button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#sideToggle').addEventListener('click', () => $('#side').classList.toggle('open'));

  /* ================= REQUESTS ================= */
  function renderFilters() {
    const keep = (sel, html) => { const v = sel.value; sel.innerHTML = html; sel.value = v; };
    keep($('#fService'), '<option value="">كل الخدمات</option>' + SERVICES.map((s) => `<option value="${s.id}">${s.ar.t}</option>`).join(''));
    keep($('#fCity'), '<option value="">كل المدن</option>' + CITIES.ar.map((c, i) => `<option value="${i}">${c}</option>`).join(''));
    keep($('#fTeam'), '<option value="">كل الفرق</option><option value="none">غير موزّعة</option>' + teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join(''));
  }

  function renderStats() {
    const count = (i) => reqs.filter((r) => r.status === i).length;
    const items = [{ k: 'all', label: 'كل الطلبات', icon: 'list', n: reqs.length }]
      .concat(STAT_LABELS.map((l, i) => ({ k: String(i), label: l, icon: STATUSES[i].icon, n: count(i) })));
    const rated = reqs.filter((r) => r.rating);
    const avg = rated.length ? (rated.reduce((a, r) => a + r.rating.stars, 0) / rated.length) : 0;
    $('#stats').innerHTML = items.map((s) => `
      <button class="stat ${s.k === '0' ? 'stat--new' : ''} ${String(filter.status) === s.k ? 'active' : ''}" data-stat="${s.k}">
        <small>${svg(s.icon)}${s.label}</small><b>${s.n}</b>
      </button>`).join('') + `
      <div class="stat stat--rating">
        <small>${svg('star')}متوسط التقييم</small>
        <b>${rated.length ? avg.toFixed(1) : '—'}<span>/5</span></b>
        <em>${rated.length ? `من ${rated.length} تقييم` : 'لا تقييمات بعد'}</em>
      </div>`;
  }

  function filtered() {
    const q = filter.q.trim().toLowerCase();
    return reqs.filter((r) => {
      if (filter.status !== 'all' && r.status !== +filter.status) return false;
      if (filter.service && !r.data.services.includes(filter.service)) return false;
      if (filter.city !== '' && r.data.city !== filter.city) return false;
      if (filter.team === 'none' && r.teamId) return false;
      if (filter.team && filter.team !== 'none' && r.teamId !== filter.team) return false;
      if (q) {
        const hay = [r.id, r.data.name, r.data.phone, r.data.district, r.data.address, city(r.data.city)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderRows() {
    const list = filtered();
    const teamName = (id) => (teams.find((t) => t.id === id) || {}).name;
    $('#rows').innerHTML = list.map((r) => `
      <tr data-open="${r.id}">
        <td class="t-id" dir="ltr">${r.status === 0 && !r.teamId ? '<span class="new-dot"></span>' : ''}#${esc(r.id)}<small dir="rtl">${fmtDT(r.createdAt)}</small></td>
        <td class="t-name"><b>${esc(r.data.name)}</b><small dir="ltr">${esc(r.data.phone)}</small></td>
        <td><div class="t-svcs">${r.data.services.map((id) => { const s = svcById(id); return s ? `<span title="${s.ar.t}">${svg(s.icon)}</span>` : ''; }).join('')}</div></td>
        <td>${esc(city(r.data.city))}${r.data.district ? `<br><small class="muted">${esc(r.data.district)}</small>` : ''}</td>
        <td>${fmtDate(r.schedule || r.data.date)}</td>
        <td class="t-team">${r.teamId && teamName(r.teamId) ? esc(teamName(r.teamId)) : '<span class="t-none">غير موزّع</span>'}</td>
        <td><span class="st st--${r.status}">${STATUSES[r.status].ar}</span></td>
        <td>${r.rating ? starsHTML(r.rating.stars) : r.status === 4 ? '<small class="muted">بانتظار التقييم</small>' : '<small class="muted">—</small>'}</td>
        <td class="t-act">
          ${r.status < 4 ? `<button class="act act--done" data-finish="${r.id}" title="إنهاء الطلب">${svg('check')}<span>إنهاء</span></button>` : `<span class="act act--ok">${svg('check')}<span>منتهي</span></span>`}
          <button class="act act--del" data-delete="${r.id}" title="حذف الطلب">${svg('trash')}<span>حذف</span></button>
        </td>
      </tr>`).join('');
    const empty = $('#rowsEmpty');
    empty.hidden = list.length > 0;
    $('.table').hidden = list.length === 0;
    if (!list.length) {
      empty.innerHTML = reqs.length
        ? `${svg('list')}<b>لا توجد طلبات مطابقة</b>جرّب تغيير الفلاتر.`
        : `${svg('list')}<b>لا توجد طلبات بعد</b>ستظهر هنا طلبات العملاء فور إرسالها. لتجربة اللوحة أضف بيانات تجريبية من «الإعدادات».`;
    }
  }

  $('#stats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stat]'); if (!b) return;
    filter.status = b.dataset.stat; renderStats(); renderRows();
  });
  $('#q').addEventListener('input', (e) => { filter.q = e.target.value; renderRows(); });
  $('#fService').addEventListener('change', (e) => { filter.service = e.target.value; renderRows(); });
  $('#fCity').addEventListener('change', (e) => { filter.city = e.target.value; renderRows(); });
  $('#fTeam').addEventListener('change', (e) => { filter.team = e.target.value; renderRows(); });
  $('#rows').addEventListener('click', async (e) => {
    const fin = e.target.closest('[data-finish]');
    if (fin) { e.stopPropagation(); return finishRequest(fin.dataset.finish); }
    const del = e.target.closest('[data-delete]');
    if (del) { e.stopPropagation(); return removeRequest(del.dataset.delete); }
    if (e.target.closest('.act')) return;
    const tr = e.target.closest('[data-open]'); if (tr) openRequest(tr.dataset.open);
  });

  async function finishRequest(id) {
    if (!confirm(`إنهاء الطلب #${id}؟ سيظهر للعميل كمنتهي ويُطلب منه التقييم.`)) return;
    await DoneAPI.completeRequest(id);
    toast('تم الانتهاء من الطلب ✓');
    await load();
  }
  async function removeRequest(id) {
    if (!confirm(`حذف الطلب #${id} نهائياً؟ لا يمكن التراجع.`)) return;
    await DoneAPI.deleteRequest(id);
    if (openId === id) closeRequest();
    toast('تم حذف الطلب');
    await load();
  }
  const starsHTML = (n) => `<span class="stars stars--sm" title="${n} من 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}">${svg('star')}</i>`).join('')}</span>`;
  const rateLink = (r) => `${location.origin}${location.pathname.replace(/admin\.html$/, '')}index.html#rate=${r.id}`;

  /* ================= REQUEST DETAIL ================= */
  function openRequest(id) {
    openId = id;
    $('#reqDrawer').hidden = false;
    document.body.style.overflow = 'hidden';
    renderDetail();
  }
  function closeRequest() { openId = null; $('#reqDrawer').hidden = true; document.body.style.overflow = ''; }
  $$('#reqDrawer [data-close]').forEach((b) => b.addEventListener('click', closeRequest));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#teamModal').hidden) closeTeam(); else if (!$('#reqDrawer').hidden) closeRequest();
  });

  function teamMessage(r, team) {
    const d = r.data;
    return [
      `طلب تنفيذ جديد — تمّ DONE`,
      `رقم الطلب: #${r.id}`,
      `الخدمات: ${d.services.map((id) => (svcById(id) || {}).ar?.t).filter(Boolean).join('، ')}`,
      `العميل: ${d.name} — ${d.phone}`,
      `الموقع: ${[city(d.city), d.district, d.address].filter(Boolean).join('، ')}`,
      `الموعد: ${fmtDate(r.schedule || d.date)} — ${SLOT[d.slot] || ''}`,
      d.area ? `المساحة: ${d.area} م²` : '',
      d.needDesign ? 'مطلوب تصميم قبل التنفيذ' : '',
      d.notes ? `ملاحظات العميل: ${d.notes}` : '',
      team ? `الفريق: ${team.name}` : '',
    ].filter(Boolean).join('\n');
  }

  async function loadPhotos(r) {
    const paths = (r.data.photos || []).filter((p) => String(p).includes('/'));
    if (!paths.length) return;
    let urls = [];
    try { urls = await DoneAPI.photoUrls(paths); } catch (e) { console.warn(e); }
    const box = $('#dPhotos');
    if (!box || openId !== r.id) return;
    box.innerHTML = urls.length
      ? urls.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener" title="فتح الصورة ${i + 1} بالحجم الكامل"><img src="${esc(u)}" alt="صورة ${i + 1}" loading="lazy"></a>`).join('')
      : '<b class="muted">تعذّر تحميل الصور</b>';
  }

  function renderDetail() {
    const r = reqs.find((x) => x.id === openId);
    if (!r) { closeRequest(); return; }
    setTimeout(() => loadPhotos(r));
    const d = r.data;
    const team = teams.find((t) => t.id === r.teamId);
    const sorted = [...teams].map((t) => ({ t, score: (t.skills || []).filter((s) => d.services.includes(s)).length }))
      .sort((a, b) => b.score - a.score);
    const best = sorted.filter((x) => x.score > 0).map((x) => x.t.name);
    const custWa = (text) => `https://wa.me/${digits(d.phone)}?text=${encodeURIComponent(text)}`;
    const svcNames = d.services.map((id) => (svcById(id) || {}).ar?.t).filter(Boolean).join('، ');
    const visit = `${fmtDate(r.schedule || d.date)} — ${SLOT[d.slot] || ''}`;
    const waMsgs = [
      { label: 'تأكيد استلام الطلب', text: `مرحباً ${d.name}،\nتم استلام طلبك رقم #${r.id} لدى تمّ DONE ✓\nالخدمات: ${svcNames}\nسنتواصل معك لتأكيد موعد رفع المقاسات.` },
      { label: 'تأكيد موعد الزيارة', text: `مرحباً ${d.name}،\nنؤكد موعد زيارة فريق تمّ لطلبك #${r.id}:\n${visit}\nالموقع: ${city(d.city)}${d.district ? ' — ' + d.district : ''}\nللتعديل يرجى الرد على هذه الرسالة.` },
      { label: 'الطلب جاهز / تم', text: `مرحباً ${d.name}،\nتم الانتهاء من طلبك #${r.id} ✓\nشكراً لثقتك بـ تمّ DONE.` },
    ];
    const isLink = /^https?:\/\//i.test(d.address || '');

    $('#dTitle').textContent = '#' + r.id;
    $('#dCreated').textContent = 'وصل ' + fmtDT(r.createdAt);
    $('#dBody').innerHTML = `
      <div class="dactions">
        ${r.status < 4
          ? `<button class="btn btn--primary" data-finish="${r.id}">${svg('check')}إنهاء الطلب</button>`
          : `<span class="done-badge">${svg('check')}الطلب منتهي${r.completedAt ? ' · ' + fmtDT(r.completedAt) : ''}</span>`}
        <button class="btn btn--ghost danger" data-delete="${r.id}">${svg('trash')}حذف الطلب</button>
      </div>

      ${r.status === 4 ? `
      <section class="dsec dsec--rating">
        <h4>${svg('star')}تقييم العميل</h4>
        ${r.rating
          ? `<div class="rating-big">${starsHTML(r.rating.stars)}<b>${r.rating.stars}/5</b><small class="muted">${fmtDT(r.rating.at)}</small></div>
             ${r.rating.comment ? `<p class="rating-note">«${esc(r.rating.comment)}»</p>` : '<p class="muted" style="font-size:.86rem">بدون ملاحظات.</p>'}`
          : `<p class="muted" style="font-size:.88rem;margin-bottom:.8rem">لم يقيّم العميل بعد. سيظهر له طلب التقييم عند فتح الموقع، أو أرسل له رابط التقييم:</p>
             <a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="https://wa.me/${digits(d.phone)}?text=${encodeURIComponent(`مرحباً ${d.name}، تم الانتهاء من طلبك #${r.id} لدى تمّ DONE ✓\nيسعدنا تقييمك للخدمة (دقيقة واحدة):\n${rateLink(r)}`)}">${svg('star')}إرسال رابط التقييم واتساب</a>`}
      </section>` : ''}

      <section class="dsec">
        <h4>${svg('sparkle')}حالة الطلب</h4>
        <div class="status-steps">
          ${STATUSES.map((s, i) => `<button data-status="${i}" class="${i < r.status ? 'done' : i === r.status ? 'current' : ''}">${svg(i < r.status ? 'check' : s.icon)}${s.ar}</button>`).join('')}
        </div>
      </section>

      <section class="dsec">
        <h4>${svg('team')}توزيع الطلب على فريق</h4>
        ${teams.length ? `
        <div class="assign">
          <div>
            <label class="label" for="aTeam">الفريق المنفّذ</label>
            <select class="input" id="aTeam">
              <option value="">— اختر فريقاً —</option>
              ${sorted.map(({ t, score }) => `<option value="${t.id}" ${t.id === r.teamId ? 'selected' : ''}>${score ? '★ ' : ''}${esc(t.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="label" for="aDate">موعد الزيارة / التنفيذ</label>
            <input class="input" type="date" id="aDate" value="${esc(r.schedule || d.date || '')}">
          </div>
        </div>
        <p class="suggest">${best.length ? '★ مقترح حسب التخصص: ' + esc(best.join('، ')) : 'لا يوجد فريق بتخصص مطابق — يمكنك اختيار أي فريق.'}</p>
        <div class="assign-actions">
          <button class="btn btn--primary" id="aSave">${svg('check')}حفظ التوزيع</button>
          ${team && team.phone ? `<a class="btn btn--wa" target="_blank" rel="noopener" href="https://wa.me/${digits(team.phone)}?text=${encodeURIComponent(teamMessage(r, team))}">${svg('phone')}إرسال الطلب للفريق واتساب</a>` : ''}
        </div>` : `<p class="muted">لا توجد فرق بعد. <button class="btn btn--ghost btn--sm" data-goto-teams>${svg('plus')}أضف فريقاً</button></p>`}
      </section>

      <section class="dsec">
        <h4>${svg('phone')}العميل</h4>
        <div class="kv">
          <div><small>الاسم</small><b>${esc(d.name)}</b></div>
          <div><small>الجوال</small><b dir="ltr">${esc(d.phone)}</b></div>
          <div><small>البريد</small><b dir="ltr">${esc(d.email) || '—'}</b></div>
          <div><small>يفضّل التواصل</small><b>${d.contact === 'call' ? 'اتصال' : 'واتساب'}</b></div>
        </div>
        <div class="contact-btns">
          <a class="btn btn--ghost btn--sm" href="tel:${esc(d.phone)}">${svg('phone')}اتصال</a>
          <a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${custWa(`مرحباً ${d.name}، معك فريق تمّ DONE بخصوص طلبك #${r.id}.`)}">واتساب العميل</a>
        </div>
        <div class="wa-templates">
          <small>رسائل جاهزة للعميل على واتساب ${d.contact === 'whatsapp' ? '<b class="wa-pref">العميل يفضّل واتساب</b>' : ''}</small>
          <div>${waMsgs.map((m) => `<a class="act act--done" target="_blank" rel="noopener" href="${custWa(m.text)}">${svg('phone')}<span>${m.label}</span></a>`).join('')}</div>
        </div>
      </section>

      <section class="dsec">
        <h4>${svg('grid')}تفاصيل المشروع</h4>
        <div class="review__tags" style="margin-bottom:.9rem">${d.services.map((id) => { const s = svcById(id); return s ? `<span>${svg(s.icon)}${s.ar.t}</span>` : ''; }).join('')}</div>
        <div class="kv">
          <div><small>نوع العقار</small><b>${PROPERTY[d.property] || '—'}</b></div>
          <div><small>المساحة</small><b>${d.area ? d.area + ' م²' : 'غير محددة'}</b></div>
          <div><small>الخامة</small><b>${MATERIAL[d.material] || '—'}</b></div>
          <div><small>تصميم قبل التنفيذ</small><b>${d.needDesign ? 'نعم' : 'لا'}</b></div>
          ${d.notes ? `<div class="full"><small>وصف العميل</small><b>${esc(d.notes)}</b></div>` : ''}
          ${d.photos && d.photos.length ? `<div class="full"><small>صور الموقع المرفقة (${d.photos.length})</small>${
            d.photos.some((p) => String(p).includes('/'))
              ? `<div class="dphotos" id="dPhotos">${d.photos.map(() => '<span class="dphotos__ph"></span>').join('')}</div>`
              : `<b>${d.photos.length} صورة (أُرسلت قبل تفعيل رفع الصور)</b>`}</div>` : ''}
        </div>
      </section>

      <section class="dsec">
        <h4>${svg('pin')}الموقع والموعد المطلوب</h4>
        <div class="kv">
          <div><small>المدينة</small><b>${esc(city(d.city))}</b></div>
          <div><small>الحي</small><b>${esc(d.district) || '—'}</b></div>
          <div class="full"><small>العنوان</small><b>${d.address ? (isLink ? `<a href="${esc(d.address)}" target="_blank" rel="noopener" style="color:var(--gold-2)">فتح الموقع على الخريطة</a>` : esc(d.address)) : '—'}</b></div>
          <div><small>التاريخ المفضل</small><b>${fmtDate(d.date)}</b></div>
          <div><small>الفترة</small><b>${SLOT[d.slot] || '—'}</b></div>
        </div>
      </section>

      <section class="dsec">
        <h4>${svg('pen')}ملاحظات داخلية</h4>
        <div class="notes-list">${(r.notes || []).map((n) => `<div><small>${fmtDT(n.at)}</small>${esc(n.text)}</div>`).join('') || '<p class="muted" style="font-size:.86rem">لا توجد ملاحظات.</p>'}</div>
        <div class="note-add"><input class="input" id="noteIn" placeholder="أضف ملاحظة للفريق أو للمتابعة…"><button class="btn btn--primary btn--sm" id="noteAdd">إضافة</button></div>
      </section>

      <section class="dsec">
        <h4>${svg('clock')}سجل الطلب</h4>
        <ul class="log">${[...(r.log || [])].reverse().map((l) => `<li><span>${esc(l.text === 'created' ? 'تم إنشاء الطلب' : l.text)}</span><time>${fmtDT(l.at)}</time></li>`).join('')}</ul>
      </section>

    `;
  }

  $('#dBody').addEventListener('click', async (e) => {
    const r = reqs.find((x) => x.id === openId); if (!r) return;
    const st = e.target.closest('[data-status]');
    if (st) {
      const s = +st.dataset.status;
      if (s === r.status) return;
      await DoneAPI.updateRequest(r.id, { status: s }, `تغيير الحالة إلى «${STATUSES[s].ar}»`);
      toast('تم تحديث الحالة'); return load();
    }
    if (e.target.closest('#aSave')) {
      const teamId = $('#aTeam').value || null, schedule = $('#aDate').value || null;
      const t = teams.find((x) => x.id === teamId);
      const patch = { teamId, schedule };
      if (teamId && r.status === 0) patch.status = 1;
      await DoneAPI.updateRequest(r.id, patch, t ? `توزيع على «${t.name}»${schedule ? ' — موعد ' + fmtDate(schedule) : ''}` : 'إلغاء التوزيع');
      toast(t ? 'تم توزيع الطلب على ' + t.name : 'تم إلغاء التوزيع'); return load();
    }
    if (e.target.closest('#noteAdd')) {
      const v = $('#noteIn').value.trim(); if (!v) return;
      await DoneAPI.addNote(r.id, v); toast('تمت إضافة الملاحظة'); return load();
    }
    if (e.target.closest('[data-goto-teams]')) { closeRequest(); setView('teams'); openTeam(); return; }
    if (e.target.closest('[data-finish]')) return finishRequest(r.id);
    if (e.target.closest('[data-delete]')) return removeRequest(r.id);
  });
  $('#dBody').addEventListener('keydown', (e) => { if (e.target.id === 'noteIn' && e.key === 'Enter') { e.preventDefault(); $('#noteAdd').click(); } });

  /* ================= CUSTOMERS ================= */
  const fmtDay = (ts) => new Date(ts).toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: 'numeric' });
  function renderCustomers() {
    const returning = customers.filter((c) => c.count > 1).length;
    const rated = customers.filter((c) => c.avg != null);
    const avg = rated.length ? rated.reduce((a, c) => a + c.avg, 0) / rated.length : null;
    $('#custStats').innerHTML = `
      <div class="stat"><small>${svg('team')}إجمالي العملاء</small><b>${customers.length}</b></div>
      <div class="stat"><small>${svg('sparkle')}عملاء متكررون</small><b>${returning}</b></div>
      <div class="stat"><small>${svg('plus')}مسجّلون بدون طلبات</small><b>${customers.filter((c) => !c.count).length}</b></div>
      <div class="stat stat--rating"><small>${svg('star')}رضا العملاء</small><b>${avg != null ? avg.toFixed(1) : '—'}<span>/5</span></b></div>`;

    const q = custFilter.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    const list = customers.filter((c) => {
      if (custFilter.kind === 'returning' && c.count < 2) return false;
      if (custFilter.kind === 'new' && c.count !== 1) return false;
      if (custFilter.kind === 'open' && !c.open) return false;
      if (custFilter.kind === 'none' && c.count !== 0) return false;
      if (q && !(c.name.toLowerCase().includes(q) || (qd && c.phone.replace(/\D/g, '').includes(qd)))) return false;
      return true;
    });
    $('#custRows').innerHTML = list.map((c) => `
      <tr data-cust="${esc(c.phone)}">
        <td class="t-name"><b>${esc(c.name)}</b>${c.count > 1 ? '<span class="tag tag--gold">عميل متكرر</span>' : c.count === 1 ? '<span class="tag">جديد</span>' : '<span class="tag tag--muted">مسجّل — بدون طلبات</span>'}</td>
        <td dir="ltr" style="text-align:end;font-family:var(--font-latin)">${esc(c.phone)}</td>
        <td><b class="num">${c.count}</b></td>
        <td><span class="st st--3">${c.open} جارية</span> <span class="st st--4">${c.done} منتهية</span></td>
        <td>${c.avg != null ? `${starsHTML(Math.round(c.avg))} <small class="muted">${c.avg.toFixed(1)}</small>` : '<small class="muted">—</small>'}</td>
        <td><small>${fmtDay(c.first)}</small></td>
        <td><small>${fmtDay(c.last)}</small></td>
        <td class="t-act">
          <a class="act act--done" target="_blank" rel="noopener" href="https://wa.me/${digits(c.phone)}" title="واتساب">${svg('phone')}<span>واتساب</span></a>
          <button class="act" data-cust-reqs="${esc(c.phone)}">${svg('list')}<span>طلباته</span></button>
        </td>
      </tr>`).join('');
    $('.table--cust').hidden = !list.length;
    const empty = $('#custEmpty');
    empty.hidden = !!list.length;
    if (!list.length) empty.innerHTML = customers.length ? `${svg('team')}<b>لا يوجد عملاء مطابقون</b>جرّب بحثاً آخر.` : `${svg('team')}<b>لا يوجد عملاء بعد</b>يظهر العميل هنا تلقائياً بعد أول طلب، ويُعرَّف برقم جواله.`;
  }
  $('#cq').addEventListener('input', (e) => { custFilter.q = e.target.value; renderCustomers(); });
  $('#cFilter').addEventListener('change', (e) => { custFilter.kind = e.target.value; renderCustomers(); });
  $('#custRows').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const b = e.target.closest('[data-cust-reqs]') || e.target.closest('[data-cust]');
    if (!b) return;
    const phone = b.dataset.custReqs || b.dataset.cust;
    filter = { status: 'all', q: phone.replace('+966', ''), service: '', city: '', team: '' };
    $('#q').value = filter.q; $('#fService').value = ''; $('#fCity').value = ''; $('#fTeam').value = '';
    renderStats(); renderRows(); setView('requests');
  });
  $('#exportCust').addEventListener('click', () => {
    const head = ['الاسم', 'الجوال', 'البريد', 'عدد الطلبات', 'جارية', 'منتهية', 'متوسط التقييم', 'المدن', 'أول طلب', 'آخر طلب', 'أرقام الطلبات'];
    const rows = customers.map((c) => [c.name, c.phone, c.email, c.count, c.open, c.done, c.avg != null ? c.avg.toFixed(1) : '',
      c.cities.map(city).join(' / '), fmtDay(c.first), fmtDay(c.last), c.ids.join(' ')]);
    const csv = '﻿' + [head, ...rows].map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `done-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  /* ================= TEAMS ================= */
  function renderTeams() {
    const box = $('#teams');
    if (!teams.length) {
      box.innerHTML = `<div class="empty panel" style="grid-column:1/-1">${svg('team')}<b>لا توجد فرق بعد</b>أضف فرق التنفيذ لتتمكن من توزيع الطلبات عليها.</div>`;
      return;
    }
    box.innerHTML = teams.map((t) => {
      const mine = reqs.filter((r) => r.teamId === t.id);
      const active = mine.filter((r) => r.status < 4).length;
      return `
      <article class="team">
        <div class="team__top"><span class="team__av">${esc(t.name.replace(/^فريق\s*/, '').replace(/^ال/, '').charAt(0) || 'ف')}</span>
          <div><h3>${esc(t.name)}</h3><small>${esc(t.lead || '')}${t.phone ? ` · <span dir="ltr">${esc(t.phone)}</span>` : ''}</small></div></div>
        <div class="skill-tags">${(t.skills || []).map((id) => { const s = svcById(id); return s ? `<span>${svg(s.icon)}${s.ar.t}</span>` : ''; }).join('')}</div>
        <div class="team__load"><span><b>${active}</b>طلبات جارية</span><span><b>${mine.length - active}</b>منجزة</span></div>
        <div class="team__actions">
          <button class="btn btn--ghost" data-team-filter="${t.id}">${svg('list')}طلباته</button>
          <button class="btn btn--ghost" data-team-edit="${t.id}">${svg('pen')}تعديل</button>
        </div>
      </article>`;
    }).join('');
  }

  $('#teams').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-team-edit]');
    if (ed) return openTeam(teams.find((t) => t.id === ed.dataset.teamEdit));
    const f = e.target.closest('[data-team-filter]');
    if (f) { filter.team = f.dataset.teamFilter; $('#fTeam').value = filter.team; filter.status = 'all'; renderStats(); renderRows(); setView('requests'); }
  });
  $('#addTeam').addEventListener('click', () => openTeam());

  function openTeam(t = null) {
    $('#teamModalTitle').textContent = t ? 'تعديل الفريق' : 'فريق جديد';
    $('#tId').value = t ? t.id : '';
    $('#tName').value = t ? t.name : '';
    $('#tLead').value = t ? t.lead || '' : '';
    $('#tPhone').value = t ? t.phone || '' : '';
    $('#tSkills').innerHTML = SERVICES.map((s) => `<label><input type="checkbox" value="${s.id}" ${t && (t.skills || []).includes(s.id) ? 'checked' : ''}><span>${s.ar.t}</span></label>`).join('');
    $('#tDelete').hidden = !t;
    $('#teamErr').textContent = '';
    $('#teamModal').hidden = false;
    $('#tName').focus();
  }
  function closeTeam() { $('#teamModal').hidden = true; }
  $$('[data-close-team]').forEach((b) => b.addEventListener('click', closeTeam));

  $('#teamForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#tName').value.trim();
    const skills = $$('#tSkills input:checked').map((i) => i.value);
    if (!name) { $('#teamErr').textContent = 'أدخل اسم الفريق'; return; }
    if (!skills.length) { $('#teamErr').textContent = 'اختر تخصصاً واحداً على الأقل'; return; }
    await DoneAPI.saveTeam({ id: $('#tId').value || undefined, name, lead: $('#tLead').value.trim(), phone: $('#tPhone').value.trim(), skills });
    closeTeam(); toast('تم حفظ الفريق'); load();
  });
  $('#tDelete').addEventListener('click', async () => {
    if (!confirm('حذف هذا الفريق؟ الطلبات الموزعة عليه ستصبح غير موزّعة.')) return;
    await DoneAPI.deleteTeam($('#tId').value); closeTeam(); toast('تم حذف الفريق'); load();
  });

  /* ================= SETTINGS ================= */
  $('#credForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#credErr');
    const u = $('#cUser').value.trim(), p = $('#cPass').value, p2 = $('#cPass2').value;
    if (u.length < 3) return (err.textContent = 'اسم المستخدم 3 أحرف على الأقل');
    if (p.length < 8) return (err.textContent = 'كلمة المرور 8 أحرف على الأقل');
    if (p !== p2) return (err.textContent = 'كلمتا المرور غير متطابقتين');
    const ok = await DoneAPI.changeCredentials($('#cCur').value, u, p);
    if (!ok) return (err.textContent = 'كلمة المرور الحالية غير صحيحة');
    err.textContent = '';
    ['#cCur', '#cPass', '#cPass2'].forEach((s) => { $(s).value = ''; });
    $('#whoami').textContent = u;
    toast('تم تحديث بيانات الدخول');
  });

  $('#exportCsv').addEventListener('click', () => {
    const head = ['رقم الطلب', 'تاريخ الطلب', 'الحالة', 'العميل', 'الجوال', 'البريد', 'الخدمات', 'العقار', 'المساحة', 'الخامة', 'تصميم', 'المدينة', 'الحي', 'العنوان', 'التاريخ المفضل', 'الفترة', 'الفريق', 'موعد الزيارة', 'وصف العميل', 'التقييم', 'ملاحظة التقييم'];
    const rows = reqs.map((r) => {
      const d = r.data;
      return [r.id, new Date(r.createdAt).toLocaleString(LOC), STATUSES[r.status].ar, d.name, d.phone, d.email,
        d.services.map((id) => (svcById(id) || {}).ar?.t).join(' + '), PROPERTY[d.property], d.area || '', MATERIAL[d.material], d.needDesign ? 'نعم' : 'لا',
        city(d.city), d.district, d.address, d.date, SLOT[d.slot], (teams.find((t) => t.id === r.teamId) || {}).name || '', r.schedule || '', d.notes, r.rating ? r.rating.stars : '', r.rating ? r.rating.comment : ''];
    });
    const csv = '﻿' + [head, ...rows].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `done-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#seedDemo').addEventListener('click', async () => { await DoneAPI.seedDemo(); toast('تمت إضافة بيانات تجريبية'); await load(); setView('requests'); });
  $('#clearAll').addEventListener('click', async () => {
    if (!confirm('حذف كل الطلبات والفرق نهائياً؟ لا يمكن التراجع.')) return;
    await DoneAPI.clearAll(); toast('تم حذف البيانات'); load();
  });

  /* ================= INIT ================= */
  paintIcons();
  if (DoneAPI.session()) showApp(); else showLogin();
})();

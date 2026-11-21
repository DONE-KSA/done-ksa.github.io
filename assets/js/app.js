/* DONE | تمّ — UI logic */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let lang = 'ar';
  try { lang = localStorage.getItem('done.lang') || 'ar'; } catch {}
  const t = (k) => (I18N[lang] && I18N[lang][k]) || I18N.ar[k] || k;

  const form = $('#reqForm');
  let step = 1;
  const TOTAL = 5;
  let photos = []; // { file, url }

  /* ---------- Icons ---------- */
  const paintIcons = (root = document) =>
    $$('[data-icon]', root).forEach((el) => {
      if (!el.querySelector('svg')) el.insertAdjacentHTML('afterbegin', svg(el.dataset.icon));
    });

  /* ---------- Rendering ---------- */
  function renderServices() {
    $('#megaGrid').innerHTML = SERVICES.map((s) => `
      <a href="#request" class="mega__item ${s.tone === 'featured' ? 'mega__item--featured' : ''}" data-preselect="${s.id}">
        <img src="${s.img}" onerror="this.onerror=null;this.src='${s.fallback}'" alt="" width="96" height="58">
        <span class="mega__text">
          <b>${s[lang].t}${s.tone === 'featured' ? `<em>${t('service.featured')}</em>` : ''}</b>
          <small>${s[lang].d}</small>
        </span>
      </a>`).join('');

    const picked = getPicked();
    $('#svcPick').innerHTML = SERVICES.map((s) => `
      <label>
        <input type="checkbox" name="services" value="${s.id}" ${picked.includes(s.id) ? 'checked' : ''}>
        <span class="opt"><img class="opt__img" src="${s.img}" onerror="this.onerror=null;this.src='${s.fallback}'" alt="" width="64" height="40"><span>${s[lang].t}</span></span>
      </label>`).join('');


    const city = $('#city').value;
    $('#city').innerHTML = `<option value="">${t('f.cityPh')}</option>` +
      CITIES.ar.map((c, i) => `<option value="${i}">${CITIES[lang][i]}</option>`).join('');
    $('#city').value = city;

    // clear "Request ..." buttons on the home page
    $('#quickGrid').innerHTML = SERVICES.map((s) => `
      <a href="#request" class="quick__item ${s.tone === 'featured' ? 'quick__item--featured' : ''}" data-preselect="${s.id}">
        <span class="quick__img"><img src="${s.img}" onerror="this.onerror=null;this.src='${s.fallback}'" alt="" loading="lazy"></span>
        <span class="quick__label">${s[lang].t}</span>
      </a>`).join('');

    observeReveal();
  }

  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = lang === 'ar' ? 'تمّ | DONE — قياس، تصميم، تركيب' : 'DONE | تمّ — Measure, Design, Install';
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    renderServices();
    if (step === 5) renderReview();
    if (!$('#orders').hidden) renderOrders();
    $$('.err').forEach((e) => { if (e.textContent && e.dataset.key) e.textContent = t(e.dataset.key); });
  }

  /* ---------- Wizard ---------- */
  const getPicked = () => $$('input[name="services"]:checked').map((i) => i.value);
  const val = (n) => form.elements[n];

  function showStep(n) {
    step = n;
    $$('.wstep').forEach((f) => { f.hidden = +f.dataset.step !== n; });
    $$('#wizProgress li').forEach((li) => {
      const s = +li.dataset.step;
      li.classList.toggle('active', s === n);
      li.classList.toggle('done', s < n);
    });
    $('#prevBtn').hidden = n === 1;
    $('#nextBtn').hidden = n === TOTAL;
    $('#submitBtn').hidden = n !== TOTAL;
    if (n === TOTAL) renderReview();
  }

  function setErr(key, msgKey) {
    const el = $(`[data-err="${key}"]`);
    if (el) { el.textContent = msgKey ? t(msgKey) : ''; el.dataset.key = msgKey || ''; }
  }

  function validate(n) {
    let ok = true;
    const fail = (key, msg, input) => { ok = false; setErr(key, msg); input && input.classList.add('invalid'); };
    $$(`.wstep[data-step="${n}"] .invalid`).forEach((i) => i.classList.remove('invalid'));
    $$(`.wstep[data-step="${n}"] .err`).forEach((e) => { e.textContent = ''; e.dataset.key = ''; });

    if (n === 1 && !getPicked().length) fail('services', 'err.services');
    if (n === 2 && !form.querySelector('input[name="property"]:checked')) fail('property', 'err.property');
    if (n === 3) {
      if (!val('city').value) fail('city', 'err.city', val('city'));
      if (!val('date').value) fail('date', 'err.date', val('date'));
    }
    if (n === 4) {
      if (val('name').value.trim().length < 2) fail('name', 'err.name', val('name'));
      const phone = val('phone').value.replace(/\D/g, '').replace(/^0/, '');
      if (!/^5\d{8}$/.test(phone)) fail('phone', 'err.phone', $('.phone'));
      if (!val('agree').checked) fail('agree', 'err.agree');
    }
    if (!ok) {
      const first = $(`.wstep[data-step="${n}"] .err:not(:empty)`);
      first && first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return ok;
  }

  function collect() {
    const radio = (n) => (form.querySelector(`input[name="${n}"]:checked`) || {}).value || '';
    return {
      services: getPicked(),
      property: radio('property'),
      area: val('areaUnknown').checked ? null : (val('area').value || null),
      material: val('material').value,
      needDesign: val('needDesign').checked,
      notes: val('notes').value.trim(),
      photos: photos.map((p) => p.file.name),
      city: val('city').value,
      district: val('district').value.trim(),
      address: val('address').value.trim(),
      date: val('date').value,
      slot: radio('slot'),
      name: val('name').value.trim(),
      phone: '+966' + val('phone').value.replace(/\D/g, '').replace(/^0/, ''),
      email: val('email').value.trim(),
      contact: radio('contact'),
    };
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svcTags = (ids) => `<div class="review__tags">${ids.map((id) => {
    const s = SERVICES.find((x) => x.id === id); return s ? `<span>${svg(s.icon)}${s[lang].t}</span>` : '';
  }).join('')}</div>`;
  const fmtDate = (d) => d ? new Date(d + 'T00:00').toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  function renderReview() {
    const d = collect();
    const block = (title, goto, body) => `
      <section class="review__block">
        <header><h4>${title}</h4><button type="button" data-goto="${goto}">${t('btn.edit')}</button></header>${body}
      </section>`;
    const project = [
      t('p.' + d.property),
      d.area ? `${d.area} ${lang === 'ar' ? 'م²' : 'm²'}` : t('f.areaUnknown'),
      t('m.' + d.material),
      d.needDesign ? t('rev.designYes') : '',
      photos.length ? `${photos.length} ${t('rev.photos')}` : '',
    ].filter(Boolean).join(' · ');
    $('#review').innerHTML =
      block(t('rev.services'), 1, svcTags(d.services)) +
      block(t('rev.project'), 2, `<p>${esc(project)}</p>${d.notes ? `<p style="margin-top:.4rem">${esc(d.notes)}</p>` : ''}`) +
      block(t('rev.location'), 3, `<p>${esc([CITIES[lang][d.city], d.district, d.address].filter(Boolean).join('، '))}</p><p>${fmtDate(d.date)} · ${t('s.' + d.slot)}</p>`) +
      block(t('rev.contact'), 4, `<p>${esc(d.name)} · <span dir="ltr">${esc(d.phone)}</span>${d.email ? ' · ' + esc(d.email) : ''} · ${t('c.' + d.contact)}</p>`);
  }

  // name + mobile always come from the signed-up customer
  function fillContact() {
    const s = DoneAPI.customerSession();
    if (!s) return;
    val('name').value = s.name || val('name').value;
    val('phone').value = s.phone || '';
  }
  function resetForm() {
    form.reset();
    fillContact();
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    renderThumbs();
    $('#success').hidden = true;
    form.hidden = false;
    $('#wizProgress').hidden = false;
    showStep(1);
  }

  /* ---------- Photos ---------- */
  function addFiles(files) {
    [...files].filter((f) => f.type.startsWith('image/')).slice(0, 10 - photos.length)
      .forEach((file) => photos.push({ file, url: URL.createObjectURL(file) }));
    renderThumbs();
  }
  function renderThumbs() {
    $('#thumbs').innerHTML = photos.map((p, i) =>
      `<figure><img src="${p.url}" alt=""><button type="button" data-rm="${i}" aria-label="remove">${svg('close')}</button></figure>`).join('');
  }

  /* ---------- Orders ---------- */
  async function renderOrders() {
    const box = $('#ordersList');
    const sess = DoneAPI.customerSession();
    if (!sess) { showGate(() => openOrders(), 'orders'); return; }
    const list = await DoneAPI.listCustomerRequests(sess.phone);
    const who = `
      <div class="cwho">
        <span class="cwho__av">${svg('team')}</span>
        <div><b>${esc(sess.name || (list[0] ? list[0].data.name : ''))}</b><small dir="ltr">+966 ${esc(sess.phone)}</small></div>
        <button class="cwho__out" data-cust-logout>${t('login.logout')}</button>
      </div>`;
    if (!list.length) {
      box.innerHTML = who + `<div class="empty">${svg('list')}<b>${t('orders.empty')}</b>${t('orders.emptySub')}</div>`;
      return;
    }
    box.innerHTML = who + list.map((o) => `
      <article class="order">
        <div class="order__top">
          <span class="order__id" dir="ltr">#${o.id}</span>
          <span class="status-chip">${STATUSES[o.status][lang]}</span>
        </div>
        ${svcTags(o.data.services)}
        <div class="order__meta">
          <span>${t('orders.date')}<b>${new Date(o.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB')}</b></span>
          <span>${t('orders.visit')}<b>${fmtDate(o.schedule || o.data.date)}</b></span>
        </div>
        <ol class="mini-steps">
          ${STATUSES.map((s, i) => `<li class="${i < o.status ? 'done' : i === o.status ? 'current' : ''}"><i>${svg(i < o.status ? 'check' : s.icon)}</i>${s[lang]}</li>`).join('')}
        </ol>
        ${o.status === 4 ? (o.rating
          ? `<div class="order__rating"><small>${t('rate.your')}</small>${starsHTML(o.rating.stars)}${o.rating.comment ? `<p>${esc(o.rating.comment)}</p>` : ''}</div>`
          : `<button class="btn btn--gold btn--sm order__rate" data-rate="${o.id}">${svg('star')}${t('rate.btn')}</button>`) : ''}
      </article>`).join('');
  }

  // customer login (mobile + request number)
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'custLogin') return;
    e.preventDefault();
    const phone = $('#cPhone').value, id = $('#cReq').value, err = $('#custErr');
    if (!/^5\d{8}$/.test(DoneAPI.normPhone(phone))) { err.textContent = t('err.phone'); $('#cPhone').closest('.phone').classList.add('invalid'); return; }
    if (!id.trim()) { err.textContent = t('login.errId'); $('#cReq').classList.add('invalid'); return; }
    if (await DoneAPI.customerLogin(phone, id)) { renderOrders(); updateCount(); promptRating(); }
    else { err.textContent = t('login.err'); const f = $('#custLogin'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'cPhone') { e.target.value = e.target.value.replace(/[^\d]/g, ''); e.target.closest('.phone').classList.remove('invalid'); }
    if (e.target.id === 'cPhone' || e.target.id === 'cReq') { e.target.classList.remove('invalid'); const er = $('#custErr'); if (er) er.textContent = ''; }
  });

  /* ---------- Rating (after the request is done) ---------- */
  const starsHTML = (n) => `<span class="stars stars--sm" aria-label="${n}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}">${svg('star')}</i>`).join('')}</span>`;
  let rateId = null, rateStars = 0;
  function setStars(n) {
    rateStars = n;
    $$('#stars [data-star]').forEach((b) => {
      const on = +b.dataset.star <= n;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(+b.dataset.star === n));
    });
    $('#starsLabel').textContent = n ? t('rate.l' + n) : ' ';
    $('#rateSend').disabled = !n;
  }
  function openRate(id) {
    rateId = id;
    closeOrders(); closeReq(); closePanels();
    $('#rateId').textContent = '#' + id;
    $('#stars').innerHTML = [1, 2, 3, 4, 5].map((i) => `<button type="button" role="radio" data-star="${i}" aria-label="${i}">${svg('star')}</button>`).join('');
    $('#rateNote').value = '';
    setStars(0);
    $('#rateForm').hidden = false; $('#rateThanks').hidden = true;
    $('#rateModal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeRate() {
    if (rateId && !$('#rateForm').hidden) {
      try { sessionStorage.setItem('done.rateLater.' + rateId, '1'); } catch {}
    }
    rateId = null;
    $('#rateModal').hidden = true;
    document.body.style.overflow = '';
    if (location.hash.startsWith('#rate=')) history.replaceState(null, '', location.pathname + location.search);
  }
  $('#rateSend').addEventListener('click', async () => {
    if (!rateId || !rateStars) return;
    await DoneAPI.rateRequest(rateId, rateStars, $('#rateNote').value);
    $('#rateForm').hidden = true; $('#rateThanks').hidden = false;
  });
  // hover preview on desktop
  $('#stars').addEventListener('mouseover', (e) => {
    const b = e.target.closest('[data-star]'); if (!b) return;
    $$('#stars [data-star]').forEach((x) => x.classList.toggle('hover', +x.dataset.star <= +b.dataset.star));
  });
  $('#stars').addEventListener('mouseleave', () => $$('#stars [data-star]').forEach((x) => x.classList.remove('hover')));

  async function promptRating() {
    const m = location.hash.match(/^#rate=([\w-]+)/);
    const all = await DoneAPI.listRequests();
    // a rating link sent to the customer on WhatsApp carries the request number
    if (m && all.some((r) => r.id === m[1] && r.status === 4 && !r.rating)) return openRate(m[1]);
    const sess = DoneAPI.customerSession();
    if (!sess) return;
    const list = await DoneAPI.listCustomerRequests(sess.phone);
    const later = (id) => { try { return sessionStorage.getItem('done.rateLater.' + id); } catch { return null; } };
    const due = list.find((r) => r.status === 4 && !r.rating && !later(r.id));
    if (due) setTimeout(() => openRate(due.id), 900);
  }
  async function updateCount() {
    const sess = DoneAPI.customerSession();
    const n = sess ? (await DoneAPI.listCustomerRequests(sess.phone)).length : 0;
    const b = $('[data-orders-count]');
    b.textContent = n; b.hidden = !n;
  }
  /* ---------- Services menu & request popup ---------- */
  const reqTop = () => { $('.req-modal__card').scrollTo({ top: 0, behavior: 'smooth' }); };
  // Dropdown panels under the top bar: services / how / why / faq
  function togglePanel(name, force) {
    const target = name ? $(`.mega[data-panel="${name}"]`) : null;
    const open = !!target && (force ?? target.hidden);
    $$('.mega').forEach((p) => { p.hidden = !(open && p === target); });
    $$('[data-open-panel]').forEach((b) => b.setAttribute('aria-expanded', String(open && b.dataset.openPanel === name)));
    if (open) $('#nav').classList.remove('open');
  }
  const closePanels = () => togglePanel(null);
  const anyPanelOpen = () => !!$('.mega:not([hidden])');

  async function openReq() {
    closePanels();
    $('#nav').classList.remove('open');
    const sess = DoneAPI.customerSession();
    if (!sess) { showGate(() => openReq(), 'request'); return; }   // name + mobile first, then choose the service
    fillContact();
    if (!val('email').value) {
      const last = (await DoneAPI.listCustomerRequests(sess.phone))[0];
      if (last && last.data.email) val('email').value = last.data.email;
    }
    $('#request').hidden = false;
    document.body.style.overflow = 'hidden';
    $('.req-modal__card').scrollTop = 0;
  }
  function closeReq() {
    $('#request').hidden = true;
    if ($('#orders').hidden) document.body.style.overflow = '';
    if (location.hash === '#request') history.replaceState(null, '', location.pathname + location.search);
  }

  function openOrders() {
    closeReq();
    closePanels();
    $('#nav').classList.remove('open');
    $('#orders').hidden = false;
    document.body.style.overflow = 'hidden';
    renderOrders();
  }
  function closeOrders() {
    $('#orders').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------- Reveal on scroll ---------- */
  let io;
  function observeReveal() {
    if (!('IntersectionObserver' in window)) { $$('.reveal').forEach((e) => e.classList.add('in')); return; }
    io = io || new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal:not(.in)').forEach((e) => io.observe(e));
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', (e) => {
    const panelBtn = e.target.closest('[data-open-panel]');
    if (panelBtn) { e.preventDefault(); togglePanel(panelBtn.dataset.openPanel); return; }
    if (anyPanelOpen() && !e.target.closest('.mega')) closePanels();
    if (e.target.closest('.mega a')) closePanels();

    const star = e.target.closest('[data-star]');
    if (star) setStars(+star.dataset.star);
    const rateBtn = e.target.closest('[data-rate]');
    if (rateBtn) openRate(rateBtn.dataset.rate);
    if (e.target.closest('[data-close-rate]')) closeRate();

    const pre = e.target.closest('[data-preselect]');
    if (pre) {
      resetForm();
      const box = form.querySelector(`input[name="services"][value="${pre.dataset.preselect}"]`);
      if (box) box.checked = true;
    }
    const reqLink = e.target.closest('a[href="#request"]');
    if (reqLink) { e.preventDefault(); openReq(); }
    if (e.target.closest('[data-close-req]')) closeReq();
    if (e.target.closest('[data-open-orders]')) openOrders();
    if (e.target.closest('[data-close-orders]')) closeOrders();
    if (e.target.closest('[data-cust-logout]')) { DoneAPI.customerLogout(); closeOrders(); updateCount(); resetForm(); }
    if (e.target.closest('[data-close-gate]')) { afterGate = null; hideGate(); }
    if (e.target.closest('[data-lang-toggle]')) toggleLang();
    const go = e.target.closest('[data-goto]');
    if (go) showStep(+go.dataset.goto);
    const rm = e.target.closest('[data-rm]');
    if (rm) { const [p] = photos.splice(+rm.dataset.rm, 1); URL.revokeObjectURL(p.url); renderThumbs(); }
    if (e.target.closest('.nav a')) $('#nav').classList.remove('open');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#gate').hidden) { afterGate = null; hideGate(); }
    else if (!$('#rateModal').hidden) closeRate();
    else if (!$('#orders').hidden) closeOrders();
    else if (!$('#request').hidden) closeReq();
    else if (anyPanelOpen()) closePanels();
  });

  $('#nextBtn').addEventListener('click', () => {
    if (validate(step)) { showStep(step + 1); reqTop(); }
  });
  $('#prevBtn').addEventListener('click', () => showStep(step - 1));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (let s = 1; s < TOTAL; s++) if (!validate(s)) { showStep(s); return; }
    const req = await DoneAPI.createRequest(collect());
    DoneAPI.customerSignIn(req.data.phone); // the customer is now "signed in" on this device
    form.hidden = true;
    $('#wizProgress').hidden = true;
    $('#successId').textContent = '#' + req.id;
    // WhatsApp: opens the customer's WhatsApp with the request ready to send to the company number
    const wa = String(COMPANY.whatsapp || '').replace(/\D/g, '');
    $('#waSend').hidden = $('#waHint').hidden = !wa;
    if (wa) {
      const d = req.data;
      const msg = [
        lang === 'ar' ? `مرحباً تمّ، هذا طلبي رقم #${req.id}` : `Hello DONE, this is my request #${req.id}`,
        `${lang === 'ar' ? 'الاسم' : 'Name'}: ${d.name}`,
        `${lang === 'ar' ? 'الجوال' : 'Mobile'}: ${d.phone}`,
        `${lang === 'ar' ? 'الخدمات' : 'Services'}: ${d.services.map((id) => (SERVICES.find((s) => s.id === id) || {})[lang]?.t).filter(Boolean).join('، ')}`,
        `${lang === 'ar' ? 'المدينة' : 'City'}: ${CITIES[lang][d.city] || ''}${d.district ? ' — ' + d.district : ''}`,
        `${lang === 'ar' ? 'الموعد المفضل' : 'Preferred date'}: ${d.date} (${t('s.' + d.slot)})`,
        d.notes ? `${lang === 'ar' ? 'ملاحظات' : 'Notes'}: ${d.notes}` : '',
      ].filter(Boolean).join('\n');
      $('#waSend').href = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
    }
    $('#success').hidden = false;
    reqTop();
    updateCount();
  });
  $('#newReq').addEventListener('click', resetForm);

  form.addEventListener('change', (e) => {
    if (e.target.name === 'services') setErr('services');
    if (e.target.name === 'property') setErr('property');
    if (e.target.name === 'agree') setErr('agree');
    if (e.target.name === 'areaUnknown') { val('area').disabled = e.target.checked; if (e.target.checked) val('area').value = ''; }
  });
  form.addEventListener('input', (e) => {
    e.target.classList.remove('invalid');
    if (e.target.name === 'phone') { e.target.value = e.target.value.replace(/[^\d]/g, ''); $('.phone').classList.remove('invalid'); }
  });

  const drop = $('#drop');
  $('#photos').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('drag')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });

  /* ---------- Name + mobile: first thing when requesting a service ----------
     The home page is open to everyone. The first time a customer requests a service
     (or opens "My requests") we ask for name + mobile, then continue where they were going. */
  let afterGate = null;
  function showGate(next, context = 'request') {
    afterGate = next || null;
    closePanels(); closeReq(); closeOrders();
    const k = context === 'orders' ? { t: 'gate.titleOrders', s: 'gate.subOrders', b: 'gate.btnOrders' } : { t: 'gate.title', s: 'gate.sub', b: 'gate.btn' };
    $('#gateTitle').dataset.i18n = k.t; $('#gateTitle').textContent = t(k.t);
    $('#gateSub').dataset.i18n = k.s; $('#gateSub').textContent = t(k.s);
    $('#gateBtn').dataset.i18n = k.b; $('#gateBtn').textContent = t(k.b);
    $('#gateSteps').hidden = context !== 'request';
    $('#gate').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => { const n = $('#gName'); if (n && !n.value) n.focus(); }, 50);
  }
  function hideGate() {
    $('#gate').hidden = true;
    document.body.style.overflow = '';
  }
  $('#gateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#gName').value.trim(), phone = $('#gPhone').value;
    let ok = true;
    $('#gNameErr').textContent = ''; $('#gPhoneErr').textContent = '';
    $('#gName').classList.remove('invalid'); $('#gPhone').closest('.phone').classList.remove('invalid');
    if (name.length < 2) { ok = false; $('#gNameErr').textContent = t('gate.errName'); $('#gName').classList.add('invalid'); }
    if (!/^5\d{8}$/.test(DoneAPI.normPhone(phone))) { ok = false; $('#gPhoneErr').textContent = t('err.phone'); $('#gPhone').closest('.phone').classList.add('invalid'); }
    if (!ok) return;
    await DoneAPI.customerRegister(name, phone);
    hideGate();
    fillContact();
    updateCount();
    const next = afterGate; afterGate = null;
    if (next) next(); else promptRating();
  });
  $('#gPhone').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^\d]/g, ''); });

  function toggleLang() {
    lang = lang === 'ar' ? 'en' : 'ar';
    try { localStorage.setItem('done.lang', lang); } catch {}
    applyLang();
  }
  $('#langBtn').addEventListener('click', () => {
    toggleLang();
  });
  $('#menuBtn').addEventListener('click', () => $('#nav').classList.toggle('open'));

  const header = $('.header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Init ---------- */
  const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  $('#date').min = today.toISOString().slice(0, 10);
  $('#year').textContent = new Date().getFullYear();
  paintIcons();
  applyLang();
  showStep(1);
  updateCount();
  onScroll();
  fillContact();                                       // home page is open to everyone
  if (location.hash === '#request') openReq(); else promptRating();

  /* ---------- PWA ---------- */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();

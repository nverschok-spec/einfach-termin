'use strict';
// ── Session ─────────────────────────────────────────────────────
let cu = DB.get('et2_admin_sess');
let draggedApptId = null;

// ── SIDEBAR NAVIGATION ────────────────────────────────────────────
function switchSection(sectionId, btn) {
    // Hide all sections
    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    // Remove active from all sidebar items
    document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));
    // Show target section
    const target = document.getElementById(sectionId);
    if (target) target.classList.add('active');
    // Mark button active
    if (btn) btn.classList.add('active');
    // ── Задача 2: скролл наверх при переключении (страница не "уплывает") ──
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTop = 0;
    // Close sidebar on mobile
    closeSidebar();
    // Re-render relevant section
    if (sectionId === 'section-kanban') { renderKanban(); initManualBooking(); }
    if (sectionId === 'section-doctors') { renderDoctorsList(); renderAuslastungFull(); }
    if (sectionId === 'section-settings') { loadSettingsDropdowns(); loadEJSConfigFields(); }
}

function toggleSidebar() {
    const s = document.getElementById('main-sidebar');
    const o = document.getElementById('sidebar-overlay');
    s.classList.toggle('open');
    o.classList.toggle('open');
}
function closeSidebar() {
    document.getElementById('main-sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
}

// ── Задача 3: сворачиваемая Manuelle Buchung ────────────────────
function toggleManualBooking() {
    const body = document.getElementById('manual-booking-body');
    const icon = document.getElementById('manual-toggle-icon');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.textContent = isOpen ? '▸' : '▾';
    if (!isOpen) initManualBooking();
}

function showAuthPage(id) {
    document.querySelectorAll('#auth-shell .page').forEach(p => p.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
}

// Master PIN (Sprint 2 placeholder)
function promptMasterPin() {
    const pin = prompt('Master-PIN eingeben:');
    if (pin === '70947396') {
        document.getElementById('sidebar-master-btn').style.display = 'flex';
        document.getElementById('sidebar-master-lock').style.display = 'none';
        showToast('👑 Master-Zugang freigeschaltet!', 'success');
    } else {
        showToast('❌ Falscher PIN!', 'error');
    }
}

// ── Auth ─────────────────────────────────────────────────────────
async function handleLogin() {
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pass  = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-err');
    errEl.style.display = 'none';
    if (!email || !pass) { errEl.innerText = 'Bitte E-Mail und Passwort eingeben.'; errEl.style.display = 'block'; return; }
    const prx = praxen.find(p => p.email.toLowerCase() === email);
    if (prx && await verifyPassword(pass, prx.pass)) {
        if (prx.pass.length < 60) { prx.pass = await hashPassword(pass); saveAll(); }
        DB.set('et2_admin_sess', prx);
        DB.set('et2_admin_login_time', Date.now());
        location.reload(); return;
    }
    errEl.innerText = 'E-Mail oder Passwort falsch.';
    errEl.style.display = 'block';
}

async function handleRegister() {
    const errEl = document.getElementById('reg-err'); errEl.style.display = 'none';
    const name  = document.getElementById('r-name').value.trim();
    const addr  = document.getElementById('r-addr').value.trim();
    const city  = document.getElementById('r-city').value.trim();
    const region= document.getElementById('r-region').value;
    const email = document.getElementById('r-email').value.trim().toLowerCase();
    const phone = document.getElementById('r-phone').value.trim();
    const pw    = document.getElementById('r-pw').value;
    const pc    = document.getElementById('r-pc').value;
    const logo  = document.getElementById('r-logo').value.trim() || '🏥';
    if (!name || !city || !email || !pw) { errEl.innerText = 'Pflichtfelder ausfüllen!'; errEl.style.display = 'block'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.innerText = 'Bitte gültige E-Mail eingeben!'; errEl.style.display = 'block'; return; }
    if (pw !== pc) { errEl.innerText = 'Passwörter stimmen nicht überein!'; errEl.style.display = 'block'; return; }
    if (pw.length < 8) { errEl.innerText = 'Passwort mindestens 8 Zeichen!'; errEl.style.display = 'block'; return; }
    if (praxen.find(p => p.email.toLowerCase() === email)) { errEl.innerText = 'E-Mail bereits registriert!'; errEl.style.display = 'block'; return; }
    if (patients.find(p => p.email.toLowerCase() === email)) { errEl.innerText = 'E-Mail bereits als Patient registriert!'; errEl.style.display = 'block'; return; }
    const hashedPw = await hashPassword(pw);
    const slug = name.toLowerCase().replace(/[äÄ]/g,'ae').replace(/[öÖ]/g,'oe').replace(/[üÜ]/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,32);
    praxen.push({ id: generateID(), name, slug, city, address: addr, phone, email, pass: hashedPw, logo, region });
    saveAll();
    showToast('✅ Praxis registriert!', 'success');
    showAuthPage('page-login');
}

function logout() {
    localStorage.removeItem('et2_admin_sess');
    localStorage.removeItem('et2_admin_login_time');
    location.reload();
}

// ── Авто-выход через 8 часов ─────────────────────────────────────
const SESSION_HOURS  = 8;
const SESSION_MS     = SESSION_HOURS * 60 * 60 * 1000;
const CHECK_INTERVAL = 5 * 60 * 1000;

function checkSessionExpiry() {
    const loginTime = DB.get('et2_admin_login_time');
    if (!loginTime) return;
    const elapsed   = Date.now() - loginTime;
    const remaining = Math.ceil((SESSION_MS - elapsed) / 60000);
    if (elapsed >= SESSION_MS) {
        showToast('⏰ Sitzung abgelaufen (8 Stunden). Bitte erneut anmelden.', 'warning');
        setTimeout(() => { localStorage.removeItem('et2_admin_sess'); localStorage.removeItem('et2_admin_login_time'); location.reload(); }, 3000);
    } else if (remaining <= 30 && remaining > 0) {
        showToast(`⏰ Sitzung läuft in ${remaining} Min. ab. Bitte speichern!`, 'warning');
    }
}
function startSessionTimer() {
    checkSessionExpiry();
    setInterval(checkSessionExpiry, CHECK_INTERVAL);
}

// ── Manuelle Buchung ─────────────────────────────────────────────
let mbSelSlot = '';

function initManualBooking() {
    const docSel = document.getElementById('mb-doc');
    if (!docSel) return;
    const myDocs = doctors.filter(d => d.praxisId === cu.id && d.status === 'active');
    docSel.innerHTML = '<option value="">Arzt wählen…</option>' + myDocs.map(d => `<option value="${d.id}">${d.name} (${d.spec})</option>`).join('');
    const dateInp = document.getElementById('mb-date');
    if (dateInp) dateInp.min = new Date().toISOString().split('T')[0];
}

function updateManualSlots() {
    const docId = document.getElementById('mb-doc')?.value;
    const date  = document.getElementById('mb-date')?.value;
    const grid  = document.getElementById('mb-slot-grid');
    const info  = document.getElementById('mb-slot-info');
    mbSelSlot = '';
    if (!grid) return;
    if (!docId || !date) { grid.innerHTML = '<span style="color:#aaa;font-size:.8rem;">Arzt und Datum wählen</span>'; return; }
    const doc = doctors.find(d => d.id === docId);
    if (!doc) return;
    const day = new Date(date).getDay();
    if (day === 0 || day === 6) { grid.innerHTML = '<div style="color:var(--danger);font-size:.82rem;">⛔ Wochenenden nicht verfügbar.</div>'; if (info) info.innerText = ''; return; }
    const slots    = generateSlots(doc, date);
    const takenMap = {};
    appts.filter(a => a.doctorId === docId && a.date === date && (a.status === 'confirmed' || a.status === 'pending')).forEach(a => { takenMap[a.time] = a.status; });
    const freeCount = slots.filter(s => !s.isBreak && !takenMap[s.time]).length;
    if (info) { info.innerText = `${freeCount} freie Slots · ${doc.slotDuration}Min-Intervall`; info.style.color = freeCount === 0 ? 'var(--danger)' : 'var(--text-muted)'; }
    grid.innerHTML = slots.map(s => {
        if (s.isBreak) return `<div class="slot break-slot" title="Mittagspause">☕ ${s.time}</div>`;
        const taken = !!takenMap[s.time];
        return `<div class="slot${taken ? ' taken' : ''}" ${taken ? `title="Belegt (${takenMap[s.time]})"` : `onclick="mbPickSlot(this,'${s.time}')"`}>${s.time}${taken ? `<br><span style="font-size:.55rem;color:#bbb;">${takenMap[s.time]==='confirmed'?'best.':'ausst.'}</span>` : ''}</div>`;
    }).join('');
}

function mbPickSlot(el, t) {
    document.querySelectorAll('#mb-slot-grid .slot').forEach(s => s.classList.remove('sel'));
    el.classList.add('sel');
    mbSelSlot = t;
}

function saveManualBooking() {
    const errEl = document.getElementById('mb-err'); errEl.style.display = 'none';
    const name   = document.getElementById('mb-name')?.value.trim();
    const phone  = document.getElementById('mb-phone')?.value.trim() || '';
    const docId  = document.getElementById('mb-doc')?.value;
    const date   = document.getElementById('mb-date')?.value;
    const type   = document.getElementById('mb-type')?.value || 'exam';
    const reason = document.getElementById('mb-reason')?.value.trim() || '';
    if (!name)    { errEl.innerText = 'Bitte Patientennamen eingeben!'; errEl.style.display = 'block'; return; }
    if (!docId)   { errEl.innerText = 'Bitte Arzt wählen!';            errEl.style.display = 'block'; return; }
    if (!date)    { errEl.innerText = 'Bitte Datum wählen!';           errEl.style.display = 'block'; return; }
    if (!mbSelSlot) { errEl.innerText = 'Bitte Zeitslot wählen!';      errEl.style.display = 'block'; return; }
    const doc = doctors.find(d => d.id === docId); if (!doc) return;
    const clash = appts.find(a => a.doctorId === docId && a.date === date && a.time === mbSelSlot && (a.status === 'confirmed' || a.status === 'pending'));
    if (clash) { errEl.innerText = `⛔ ${mbSelSlot} Uhr ist bereits belegt!`; errEl.style.display = 'block'; return; }
    const newAppt = { id: generateID(), patientId: 'walk-in-' + generateID(), patientName: name, patientEmail: phone || 'walk-in@praxis.local', doctorId: docId, doctorName: doc.name, praxisId: cu.id, praxisName: cu.name, date, time: mbSelSlot, status: 'confirmed', apptType: type, reason: reason || phone, note: phone ? `Tel: ${phone}` : 'Manuelle Buchung (Walk-in)', rating: null, urgent: false, docs: [], isManual: true };
    appts.push(newAppt); saveAll();
    writeAudit(`📝 Manuell: ${name} → ${doc.name} am ${date} um ${mbSelSlot} (${cu.name})`, cu.id);
    SoundUX.confirm();
    showToast(`✅ ${name} eingetragen — ${date} um ${mbSelSlot} Uhr`, 'success');
    ['mb-name','mb-phone','mb-reason','mb-date'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    document.getElementById('mb-doc').value = '';
    document.getElementById('mb-slot-grid').innerHTML = '<span style="color:#aaa;font-size:.8rem;">Arzt und Datum wählen</span>';
    document.getElementById('mb-slot-info').innerText = '';
    mbSelSlot = '';
    renderDashboard();
}

// ── Dashboard ────────────────────────────────────────────────────
function renderDashboard() {
    if (!cu) return;
    document.getElementById('d-title').innerText    = cu.name;
    document.getElementById('d-subtitle').innerText = `📍 ${cu.city} · ${cu.address}`;
    document.getElementById('sidebar-praxis-name').innerText = cu.name;

    const link    = `einfach-termin.de/${cu.slug}`;
    const linkBar = document.getElementById('praxis-link-bar');
    if (linkBar) linkBar.innerHTML = `<span style="font-size:.82rem;color:var(--text-muted);">Ihr Praxis-Link:</span><span class="praxis-link-pill" onclick="copyLink('${link}')">🔗 ${link}</span><button class="btn-sm" style="border-color:var(--primary);color:var(--primary);" onclick="copyLink('${link}')">Kopieren</button>`;

    const myDocs  = doctors.filter(d => d.praxisId === cu.id);
    const myAppts = appts.filter(a => a.praxisId === cu.id);

    const txt = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
    txt('ds-total',     myAppts.length);
    txt('ds-confirmed', myAppts.filter(a => a.status === 'confirmed').length);
    txt('ds-pending',   myAppts.filter(a => a.status === 'pending').length);
    txt('ds-cancelled', myAppts.filter(a => a.status === 'cancelled').length);

    // Sidebar badges
    const pendingCount = myAppts.filter(a => a.status === 'pending').length;
    const pendingBadge = document.getElementById('badge-pending');
    const kanbanBadge  = document.getElementById('badge-kanban');
    if (pendingBadge) { pendingBadge.innerText = pendingCount; pendingBadge.style.display = pendingCount > 0 ? 'inline-flex' : 'none'; }
    if (kanbanBadge)  { kanbanBadge.innerText = pendingCount; kanbanBadge.style.display = pendingCount > 0 ? 'inline-flex' : 'none'; }

    // Session info in sidebar
    const loginTime = DB.get('et2_admin_login_time');
    const elapsed   = loginTime ? Date.now() - loginTime : 0;
    const remMins   = Math.max(0, Math.ceil((SESSION_MS - elapsed) / 60000));
    const remHours  = Math.floor(remMins / 60);
    const remLabel  = remHours > 0 ? `${remHours}h ${remMins % 60}min` : `${remMins}min`;
    const sessEl = document.getElementById('sidebar-session-info');
    if (sessEl) sessEl.innerText = `⏱ Sitzung: ${remLabel}`;

    // Today banner
    const todayStr  = new Date().toISOString().split('T')[0];
    const todayApts = myAppts.filter(a => a.date === todayStr && a.status !== 'cancelled');
    const todayDone = todayApts.filter(a => a.status === 'confirmed').length;
    const tbWrap = document.getElementById('today-banner-wrap');
    if (tbWrap) tbWrap.innerHTML = `<div class="today-banner">
        <div style="display:flex;align-items:center;gap:16px;">
            <div class="tb-num">${todayApts.length - todayDone}</div>
            <div><div class="tb-label">Heute verbleibende Termine</div><div class="tb-sublabel">${todayApts.length} gesamt · ${todayDone} abgeschlossen</div></div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="unavail-toggle" onclick="toggleAllUnavailable()"><span class="unavail-dot"></span>Praxis heute schließen</button>
            <button class="unavail-toggle" onclick="printTodaySchedule()" style="background:rgba(255,255,255,.2);">🖨️ Tagesplan drucken</button>
        </div>
    </div>`;

    renderWeekChart(myAppts, 'dwb-');
    renderExtraStats(myAppts, 'ds-extra');

    const kf = document.getElementById('kanban-filter-doc');
    if (kf) kf.innerHTML = '<option value="">Alle Ärzte</option>' + myDocs.map(d => `<option value="${d.id}">${d.name}${d.status !== 'active' ? ' (' + d.status + ')' : ''}</option>`).join('');

    renderKanban();
    renderDoctorsList();
    renderAuditLog();
    updateStats();
    initManualBooking();
    renderNoShowPanel();
    loadEJSConfigFields();
    renderAuslastung();
}

function loadSettingsDropdowns() {
    if (!cu) return;
    const myDocs = doctors.filter(d => d.praxisId === cu.id);
    const ss = document.getElementById('settings-doc-sel');
    if (ss) ss.innerHTML = '<option value="">Arzt wählen…</option>' + myDocs.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    const sd = document.getElementById('sched-doc-sel');
    if (sd) sd.innerHTML = '<option value="">Arzt wählen…</option>' + myDocs.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
}

// ── Doctors ──────────────────────────────────────────────────────
function renderDoctorsList() {
    const el = document.getElementById('doctors-list'); if (!el) return;
    const myDocs = doctors.filter(d => d.praxisId === cu.id);
    if (!myDocs.length) { el.innerHTML = '<div class="empty">Noch keine Ärzte.</div>'; return; }
    el.innerHTML = myDocs.map(d => {
        const dotCls   = d.status === 'urlaub' ? 'dot-urlaub' : d.status === 'krank' ? 'dot-krank' : 'dot-active';
        const avg      = getAvgRating(d.id);
        const stars    = avg ? `<span style="color:#f39c12;font-size:.75rem;">${'★'.repeat(Math.round(avg))}</span> <small style="color:var(--text-muted);">(${avg})</small>` : '';
        const todayStr = new Date().toISOString().split('T')[0];
        const blockedTag = d.unavailableToday === todayStr ? '<span style="background:var(--danger-light);color:var(--danger);font-size:.7rem;padding:2px 6px;border-radius:8px;margin-left:4px;">Heute gesperrt</span>' : '';
        return `<div class="doctor-item">
            <div class="di-left">
                <div class="doctor-avatar" style="background:${d.color || '#7c5cbf'};">${initials(d.name)}</div>
                <div class="di-info">
                    <div class="di-name">${d.name} ${stars} ${blockedTag}</div>
                    <div class="di-spec">${d.spec} · ${d.slotDuration}Min-Slots</div>
                    <div class="di-schedule">${scheduleToString(d)}</div>
                    ${(()=>{ const ns=getDoctorNoShowStats(d.id); return ns.total>0 ? `<div style="font-size:.7rem;margin-top:3px;display:flex;align-items:center;gap:6px;"><span style="color:${ns.pct>=30?'var(--danger)':'var(--warning)'};">⚠️ No-Show: ${ns.count}/${ns.total} (${ns.pct}%)</span><div class="noshow-stat-bar" style="width:60px;"><div class="noshow-stat-fill${ns.pct>=30?' high':''}" style="width:${ns.pct}%;"></div></div></div>` : ''; })()}
                </div>
                <span class="doctor-status-dot ${dotCls}"></span>
            </div>
            <div class="di-right">
                <select class="status-select" onchange="setDoctorStatus('${d.id}',this.value)">
                    <option value="active"${d.status==='active'?' selected':''}>✅ Aktiv</option>
                    <option value="urlaub"${d.status==='urlaub'?' selected':''}>🏖 Urlaub</option>
                    <option value="krank"${d.status==='krank'?' selected':''}>🤒 Krank</option>
                </select>
                <button class="btn-sm btn-cancel" onclick="removeDoctor('${d.id}')">✕</button>
            </div>
        </div>`;
    }).join('');
}

function addDoctor() {
    const name = document.getElementById('new-doc-name')?.value.trim();
    const spec = document.getElementById('new-doc-spec')?.value.trim();
    const dur  = document.getElementById('new-doc-duration')?.value || '15';
    const brk  = document.getElementById('new-doc-break')?.value || '';
    if (!name || !spec) return showToast('Bitte Name und Fachrichtung eingeben!', 'warning');
    const [bs, be] = brk ? brk.split('-') : ['', ''];
    const palette  = ['#7c5cbf','#27ae60','#c0392b','#2060a0','#967BB6','#e67e22','#8e44ad','#16a085'];
    const col      = palette[doctors.filter(d => d.praxisId === cu.id).length % palette.length];
    doctors.push({ id: generateID(), praxisId: cu.id, name, spec, status: 'active', slotDuration: parseInt(dur), breakStart: bs || '', breakEnd: be || '', color: col });
    saveAll();
    document.getElementById('new-doc-name').value = '';
    document.getElementById('new-doc-spec').value = '';
    writeAudit(`Arzt ${name} (${spec}, ${dur}Min) hinzugefügt`, cu.id);
    showToast(`✅ ${name} zum Team hinzugefügt!`, 'success');
    renderDashboard();
}

function removeDoctor(id) {
    if (!confirm('Arzt wirklich entfernen?')) return;
    doctors = doctors.filter(d => d.id !== id); saveAll();
    writeAudit('Arzt entfernt', cu.id); showToast('Arzt entfernt'); renderDashboard();
}

function setDoctorStatus(id, status) {
    const d = doctors.find(x => x.id === id); if (!d) return;
    d.status = status; saveAll();
    const labels = { active: 'Aktiv', urlaub: 'Urlaub', krank: 'Krank' };
    writeAudit(`Status von ${d.name} → ${labels[status]}`, cu.id);
    showToast(`${d.name}: ${labels[status]}`, status === 'active' ? 'success' : 'warning');
    renderDashboard();
}

// ── Doctor Settings ──────────────────────────────────────────────
function loadDoctorSettings() {
    const docId = document.getElementById('settings-doc-sel')?.value;
    const wrap  = document.getElementById('doctor-settings-wrap');
    if (!wrap) return;
    if (!docId) { wrap.innerHTML = '<div class="empty">Arzt auswählen.</div>'; return; }
    const d = doctors.find(x => x.id === docId && x.praxisId === cu.id);
    if (!d) { wrap.innerHTML = '<div class="empty">Arzt nicht gefunden.</div>'; return; }
    const slots = generateSlots(d);
    const freeCount = slots.filter(s => !s.isBreak).length;
    const brkCount  = slots.filter(s => s.isBreak).length;
    wrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">
        <div class="g2">
            <div><label>Slot-Intervall</label><select id="ds-dur" style="margin:4px 0 0;">${[5,10,15,20,30,50].map(v=>`<option value="${v}"${d.slotDuration===v?' selected':''}>${v} Min</option>`).join('')}</select></div>
            <div><label>Mittagspause</label><select id="ds-break" style="margin:4px 0 0;"><option value="12:00-13:00"${d.breakStart==='12:00'?' selected':''}>12:00–13:00</option><option value="13:00-14:00"${d.breakStart==='13:00'?' selected':''}>13:00–14:00</option><option value="12:30-13:30"${d.breakStart==='12:30'?' selected':''}>12:30–13:30</option><option value="">Keine Pause</option></select></div>
        </div>
        <div style="background:var(--bg);border-radius:var(--r-sm);padding:10px;font-size:.8rem;color:var(--text-muted);">📊 <strong>${freeCount}</strong> buchbare Slots · <strong>${brkCount}</strong> Pausen-Slots · ${d.slotDuration}Min-Intervall</div>
        <div><label>Heute sperren (Datum)</label><input type="date" id="ds-close-date" style="margin:4px 0 0;" value="${d.unavailableToday||''}"></div>
        <button class="btn btn-main" style="margin:0;" onclick="saveDoctorSettings('${d.id}')">💾 Einstellungen speichern</button>
    </div>`;
}

function saveDoctorSettings(docId) {
    const d = doctors.find(x => x.id === docId && x.praxisId === cu.id); if (!d) return;
    const dur  = parseInt(document.getElementById('ds-dur')?.value) || 15;
    const brk  = document.getElementById('ds-break')?.value || '';
    const date = document.getElementById('ds-close-date')?.value || '';
    const [bs, be] = brk ? brk.split('-') : ['', ''];
    d.slotDuration = dur; d.breakStart = bs || ''; d.breakEnd = be || ''; d.unavailableToday = date;
    saveAll();
    writeAudit(`${d.name}: ${dur}Min-Slots gespeichert`, cu.id);
    showToast('✅ Einstellungen gespeichert!', 'success');
    renderDashboard();
}

// ── Kanban ───────────────────────────────────────────────────────
function renderKanban() {
    const filterDocId = document.getElementById('kanban-filter-doc')?.value || '';
    const myDocIds    = new Set(doctors.filter(d => d.praxisId === cu.id).map(d => d.id));
    let my = appts.filter(a => myDocIds.has(a.doctorId));
    if (filterDocId) my = my.filter(a => a.doctorId === filterDocId);
    const bl     = DB.arr('et2_blacklist');
    const sorted = [...my].sort((a, b) => a.date > b.date ? 1 : -1);
    const pending  = sorted.filter(a => a.status === 'pending');
    const waiting  = sorted.filter(a => a.status === 'waiting');
    const doneCanc = sorted.filter(a => a.status === 'confirmed' || a.status === 'cancelled');
    const pe = document.getElementById('d-pending-list');
    const we = document.getElementById('d-waiting-list');
    const de = document.getElementById('d-done-list');
    if (pe) pe.innerHTML = pending.length  ? pending.map(a  => kanbanCard(a, bl)).join('') : '<div class="empty" style="font-size:.8rem;">Keine Anfragen.</div>';
    if (we) we.innerHTML = waiting.length  ? waiting.map(a  => kanbanCard(a, bl)).join('') : '<div class="empty" style="font-size:.8rem;color:var(--warning);">Niemand wartet.</div>';
    if (de) de.innerHTML = doneCanc.length ? doneCanc.map(a => kanbanCard(a, bl)).join('') : '<div class="empty" style="font-size:.8rem;">Keine Einträge.</div>';
    document.querySelectorAll('.kanban-card[draggable]').forEach(c => {
        c.addEventListener('dragstart', e => { draggedApptId = c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
        c.addEventListener('dragend',   () => c.classList.remove('dragging'));
    });
}

function kanbanCard(a, bl) {
    const isBlocked = bl.includes(a.patientEmail);
    const d         = doctors.find(x => x.id === a.doctorId);
    const docColor  = d?.color || 'var(--primary)';
    const nsCount   = getNoShowCount(a.patientId, a.patientEmail);
    const nsBadge   = nsCount >= 3 ? `<span class="noshow-badge ${nsCount >= 5 ? 'high' : ''}">⚠️ ${nsCount}× No-Show</span>` : nsCount >= 1 ? `<span class="noshow-badge">⚠️ ${nsCount}× No-Show</span>` : '';
    const docsBadge = (a.docs && a.docs.length) ? `<div style="margin-top:4px;"><button onclick="openDocPreview('${a.id}');event.stopPropagation()" style="background:var(--primary-light);border:1px solid var(--lavender-deep);color:var(--primary);border-radius:8px;padding:3px 9px;font-size:.72rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">📎 ${a.docs.length} Dokument${a.docs.length > 1 ? 'e' : ''} ansehen</button></div>` : '';
    return `<div class="kanban-card${a.urgent ? ' urgent-card' : ''}" draggable="true" data-id="${a.id}">
        <div class="kc-name">${a.urgent ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--danger);margin-right:5px;animation:urgentDot 1s infinite;vertical-align:middle;"></span>⚠️ ` : ''}${a.patientName}${isBlocked ? ' 🚫' : ''}${nsBadge}</div>
        <div class="kc-meta" style="display:flex;align-items:center;gap:5px;"><span style="width:8px;height:8px;border-radius:50%;background:${docColor};display:inline-block;"></span>${a.doctorName}</div>
        <div class="kc-meta">📅 ${a.date} · ${a.time}</div>
        ${getTypeBadge(a.apptType)}
        ${a.reason ? `<div class="kc-meta" style="margin-top:3px;">💬 ${a.reason}</div>` : ''}
        ${docsBadge}
        ${hasPrivateNote(a) ? `<div style="display:flex;align-items:center;gap:5px;margin-top:4px;background:linear-gradient(135deg,#fff8f0,#fff3e0);border-radius:6px;padding:4px 8px;border:1px solid #ffcc80;font-size:.68rem;color:#e65100;font-weight:600;"><span>🔒</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">${a.privateNote.slice(0,40)}${a.privateNote.length>40?'…':''}</span></div>` : ''}
        <div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap;">
            ${a.status==='pending'   ? `<button class="btn-sm btn-ok"     onclick="updateStatusWithNoShow('${a.id}','confirmed');event.stopPropagation()">✓</button>` : ''}
            ${(a.status==='pending'||a.status==='confirmed') ? `<button class="btn-sm" onclick="updateStatusWithNoShow('${a.id}','waiting');event.stopPropagation()" style="border-color:var(--warning);color:var(--warning);" title="Patient ist im Wartezimmer">🪑</button>` : ''}
            ${a.status==='waiting'   ? `<button class="btn-sm btn-ok"     onclick="updateStatusWithNoShow('${a.id}','confirmed');event.stopPropagation()" title="Termin abgeschlossen">✓ Fertig</button>` : ''}
            ${a.status!=='cancelled' ? `<button class="btn-sm btn-cancel"  onclick="updateStatusWithNoShow('${a.id}','cancelled');event.stopPropagation()">✗</button>` : ''}
            <button class="btn-sm" onclick="openEHR('${a.patientId}','${a.patientName.replace(/'/g,"\\'")}');event.stopPropagation()" style="border-color:#888;color:#888;">📋</button>
            <button class="btn-sm" onclick="toggleUrgent('${a.id}');event.stopPropagation()" style="border-color:#f39c12;color:#f39c12;">⚠️</button>
            <button class="btn-sm" onclick="toggleBlacklist('${a.patientEmail}');event.stopPropagation()" style="border-color:var(--danger);color:var(--danger);">🚫</button>
        </div>
        <div style="display:flex;gap:5px;align-items:center;margin-top:6px;">
            <input type="text" id="note-${a.id}" placeholder="💬 Öffentliche Notiz (Patient sieht dies)…" onclick="event.stopPropagation()" style="margin:0;padding:5px;font-size:.72rem;flex:1;border:1px solid var(--border);border-radius:4px;" value="${(a.note||'').replace(/"/g,'&quot;')}" title="Diese Notiz ist für den Patienten sichtbar">
            <button class="btn-sm" onclick="saveNote('${a.id}');event.stopPropagation()" style="background:var(--bg);border-color:var(--border);" title="Öffentliche Notiz speichern">💾</button>
        </div>
        <div class="private-note-wrap" onclick="event.stopPropagation()">
            <div class="private-note-label">🔒 Praxis-interne Notiz</div>
            <textarea class="private-note-input" id="pvtnote-${a.id}" rows="2" placeholder="Interne Bemerkungen, Diagnose-Hinweise…" onclick="event.stopPropagation()">${(a.privateNote||'').replace(/</g,'&lt;')}</textarea>
            <div class="private-note-save"><button class="private-note-btn" onclick="savePrivateNote('${a.id}');event.stopPropagation()">🔒 Intern speichern</button></div>
        </div>
    </div>`;
}

function kanbanDragOver(e, col) { e.preventDefault(); document.getElementById('kanban-' + col)?.classList.add('drag-over'); }
function kanbanDragLeave() { document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over')); }
function kanbanDrop(e, newStatus) {
    e.preventDefault(); kanbanDragLeave(); if (!draggedApptId) return;
    const idx = appts.findIndex(a => a.id === draggedApptId); if (idx === -1) return;
    const a = appts[idx]; if (a.status === newStatus) return;
    a.status = newStatus; saveAll();
    writeAudit(`${a.patientName} → ${newStatus} (${a.date})`, cu.id);
    if (newStatus === 'confirmed') { SoundUX.confirm(); showToast('✅ Bestätigt!'); sendEmail(a, 'confirmed'); }
    else if (newStatus === 'waiting') { SoundUX.success(); showToast('🪑 Patient im Wartezimmer!', 'warning'); }
    else { SoundUX.cancel(); showToast('✗ Abgesagt'); sendEmail(a, 'cancelled'); }
    if (newStatus === 'cancelled') {
        const nsCount = getNoShowCount(a.patientId, a.patientEmail);
        if (nsCount >= NOSHOW_THRESHOLD) { setTimeout(() => showToast(`⚠️ ${a.patientName}: ${nsCount}× No-Show!`, nsCount>=5?'error':'warning'), 500); renderNoShowPanel(); }
    }
    renderKanban(); draggedApptId = null;
}

function updateStatus(id, newStatus) {
    const idx = appts.findIndex(a => a.id === id); if (idx === -1) return;
    appts[idx].status = newStatus; saveAll();
    writeAudit(`Termin von ${appts[idx].patientName} am ${appts[idx].date} → ${newStatus}`, cu.id);
    if (newStatus === 'confirmed') SoundUX.confirm();
    else if (newStatus === 'waiting') { SoundUX.success(); showToast('🪑 Patient im Wartezimmer!', 'warning'); }
    else SoundUX.cancel();
    renderKanban();
}

function toggleUrgent(id) {
    const a = appts.find(x => x.id === id); if (!a) return;
    a.urgent = !a.urgent; saveAll();
    showToast(a.urgent ? '⚠️ Als dringend markiert!' : 'Priorität entfernt');
    renderKanban();
}

function toggleBlacklist(email) {
    let bl = DB.arr('et2_blacklist');
    if (bl.includes(email)) { bl = bl.filter(e => e !== email); showToast('✅ Patient entsperrt'); }
    else { bl.push(email); showToast('🚫 Patient blockiert!'); }
    DB.set('et2_blacklist', bl); renderKanban();
}

function saveNote(id) {
    const inp = document.getElementById(`note-${id}`); if (!inp) return;
    const a = appts.find(x => x.id === id); if (!a) return;
    a.note = inp.value; saveAll();
    showToast('💬 Öffentliche Notiz gespeichert', 'success');
    renderKanban();
}

function savePrivateNote(id) {
    const inp = document.getElementById(`pvtnote-${id}`); if (!inp) return;
    const a = appts.find(x => x.id === id); if (!a) return;
    a.privateNote = inp.value.trim(); saveAll();
    writeAudit(`🔒 Interne Notiz für ${a.patientName} am ${a.date} aktualisiert`, cu.id);
    showToast('🔒 Interne Notiz gespeichert!', 'success');
    inp.style.background = '#d4edda';
    setTimeout(() => inp.style.background = '', 800);
}
function hasPrivateNote(a) { return a.privateNote && a.privateNote.trim().length > 0; }

// ── Emergency ────────────────────────────────────────────────────
function activateEmergencyMode() {
    if (!confirm('⚠️ NOTFALL-MODUS: Alle heutigen Termine werden SOFORT abgesagt. Fortfahren?')) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const myDocIds = new Set(doctors.filter(d => d.praxisId === cu.id).map(d => d.id));
    let count = 0;
    appts.forEach(a => { if (myDocIds.has(a.doctorId) && a.date === todayStr && a.status !== 'cancelled') { a.status = 'cancelled'; count++; } });
    saveAll(); SoundUX.emergency();
    showToast(`🚨 NOTFALL: ${count} Termine abgesagt!`, 'emergency');
    writeAudit(`🚨 NOTFALL-MODUS: ${count} Termine für ${todayStr} abgesagt`, cu.id);
    setTimeout(() => showToast(`📧 ${count} Patienten benachrichtigt.`, 'success'), 2000);
    renderDashboard();
}

function toggleAllUnavailable() {
    const todayStr = new Date().toISOString().split('T')[0];
    const myDocs   = doctors.filter(d => d.praxisId === cu.id);
    const allClosed= myDocs.every(d => d.unavailableToday === todayStr);
    myDocs.forEach(d => { d.unavailableToday = allClosed ? '' : todayStr; });
    saveAll();
    showToast(allClosed ? '✅ Praxis wieder geöffnet!' : '⛔ Praxis heute gesperrt!', allClosed ? 'success' : 'warning');
    renderDashboard();
}

// ── Tagesplan drucken ────────────────────────────────────────────
function printTodaySchedule() {
    const todayStr  = new Date().toISOString().split('T')[0];
    const todayDate = new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const myDocIds  = new Set(doctors.filter(d => d.praxisId === cu.id).map(d => d.id));
    const todayAppts = appts.filter(a => myDocIds.has(a.doctorId) && a.date === todayStr && a.status !== 'cancelled').sort((a, b) => a.time > b.time ? 1 : -1);
    const byDoctor = {};
    doctors.filter(d => d.praxisId === cu.id).forEach(d => { const da = todayAppts.filter(a => a.doctorId === d.id); if (da.length) byDoctor[d.id] = { doc: d, appts: da }; });
    const typeLabels   = { exam: 'Untersuchung', consult: 'Konsultation', procedure: 'Behandlung', operation: 'Operation' };
    const statusLabels = { confirmed: '✓ Best.', pending: '⏳ Ausst.' };
    const sections = Object.values(byDoctor).map(({ doc, appts: da }) => {
        const rows = da.map(a => `<tr class="${a.urgent ? 'sp-urgent' : a.isManual ? 'sp-manual' : ''}"><td><strong>${a.time}</strong></td><td>${a.patientName}${a.urgent ? ' ⚠️' : ''}${a.isManual ? ' 📝' : ''}</td><td>${typeLabels[a.apptType] || a.apptType}</td><td>${a.reason || '—'}</td><td>${a.note ? a.note.slice(0,30) : ''}${a.privateNote ? '<br><span style="font-size:.7rem;color:#e65100;">[🔒 '+a.privateNote.slice(0,30)+']</span>' : ''}${!a.note&&!a.privateNote?'—':''}</td><td>${statusLabels[a.status] || a.status}</td><td style="width:60px;border:1px solid #ccc;"></td></tr>`).join('');
        return `<div class="sp-doc-section"><div class="sp-doc-title">👨‍⚕️ ${doc.name} — ${doc.spec}</div><table><thead><tr><th>Zeit</th><th>Patient</th><th>Typ</th><th>Grund</th><th>Notiz</th><th>Status</th><th>✓ Check-in</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join('');
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = `<div class="schedule-print"><h1>🏥 Tagesplan — ${cu.name}</h1><div class="sp-meta">📅 ${todayDate} &nbsp;·&nbsp; ${todayAppts.length} Termine &nbsp;·&nbsp; ${todayAppts.filter(a=>a.status==='confirmed').length} bestätigt &nbsp;·&nbsp; ${todayAppts.filter(a=>a.status==='pending').length} ausstehend<br><small style="color:#aaa;">⚠️ = Dringend &nbsp;·&nbsp; 📝 = Manuell eingetragen</small></div>${sections}${todayAppts.length === 0 ? '<p style="color:#999;text-align:center;padding:20px;">Keine Termine für heute.</p>' : ''}<div class="sp-footer">Gedruckt: ${new Date().toLocaleString('de-DE')} &nbsp;·&nbsp; Einfach-Termin · ${cu.name}</div></div>`;
    printArea.style.display = 'block';
    setTimeout(() => { window.print(); setTimeout(() => { printArea.style.display = 'none'; }, 1000); }, 150);
}

// ── EHR ──────────────────────────────────────────────────────────
function openEHR(patientId, pName) {
    document.getElementById('ehr-title').innerText = 'Akte: ' + pName;
    const list = document.getElementById('ehr-history-list');
    list.innerHTML = appts.filter(a => a.patientId === patientId).map(h => `<div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:.88rem;"><strong>${h.date}</strong> — ${h.reason || '—'}<br><small>Status: ${h.status} | Arzt: ${h.doctorName}</small>${getTypeBadge(h.apptType)}${h.note ? `<br><small style="color:var(--text-muted);">💬 ${h.note}</small>` : ''}${h.privateNote ? `<div style="margin-top:5px;background:linear-gradient(135deg,#fff8f0,#fff3e0);border-left:3px solid #ff8f00;border-radius:5px;padding:5px 8px;font-size:.75rem;color:#5d4037;"><span style="font-size:.6rem;font-weight:700;color:#e65100;text-transform:uppercase;display:block;margin-bottom:2px;">🔒 Intern</span>${h.privateNote}</div>` : ''}${h.rating ? `<br><span style="color:#f39c12;">${'★'.repeat(h.rating)}${'☆'.repeat(5-h.rating)}</span>` : ''}${(h.docs && h.docs.length) ? `<br>${h.docs.map(d=>`<a href="${d.base64}" download="${d.name}" style="font-size:.72rem;color:var(--primary);">📎 ${d.name}</a>`).join(' ')}` : ''}</div>`).join('') || '<div style="padding:10px 0;color:#aaa;">Keine Besuche.</div>';
    document.getElementById('ehr-overlay').style.display = 'block';
    document.getElementById('ehr-modal').style.display  = 'block';
}
function closeEHR() { document.getElementById('ehr-overlay').style.display = 'none'; document.getElementById('ehr-modal').style.display = 'none'; }

// ── 4-Month Chart ────────────────────────────────────────────────
function updateStats() {
    const myDocIds = new Set(doctors.filter(d => d.praxisId === cu.id).map(d => d.id));
    const now = new Date(); const months = [];
    for (let i = 3; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString('de-DE', { month: 'short' }) }); }
    const counts = months.map(m => appts.filter(a => myDocIds.has(a.doctorId) && a.status !== 'cancelled' && (() => { const d = new Date(a.date); return d.getFullYear() === m.year && d.getMonth() === m.month; })()).length);
    const max = Math.max(...counts, 1);
    counts.forEach((c, i) => { const bar = document.getElementById(`bar-${i+1}`); const lbl = document.getElementById(`bar-lbl-${i+1}`); if (bar) { bar.style.height = Math.max(5, Math.round(c / max * 100)) + 'px'; bar.setAttribute('data-value', c); } if (lbl) lbl.innerText = months[i].label; });
}

// ── CSV Export ───────────────────────────────────────────────────
function exportCSV() {
    const myDocIds = new Set(doctors.filter(d => d.praxisId === cu.id).map(d => d.id));
    let csv = '\uFEFFDatum,Patient,Arzt,Typ,Grund,Status\n';
    appts.filter(a => myDocIds.has(a.doctorId)).forEach(a => { csv += `${a.date},${a.patientName},${a.doctorName},${a.apptType||''},${a.reason||''},${a.status}\n`; });
    const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const l = document.createElement('a'); l.href = URL.createObjectURL(b); l.setAttribute('download', `Patienten_${cu.name}.csv`); document.body.appendChild(l); l.click(); document.body.removeChild(l);
    showToast('📥 CSV exportiert!', 'success');
}

// ── Dokument-Vorschau ────────────────────────────────────────────
function openDocPreview(apptId) {
    const a = appts.find(x => x.id === apptId); if (!a || !a.docs || !a.docs.length) return;
    document.getElementById('doc-modal-title').innerText = `📎 ${a.docs.length} Dokument${a.docs.length > 1 ? 'e' : ''}`;
    document.getElementById('doc-modal-patient').innerText = `${a.patientName} · ${a.date} · ${a.time} Uhr`;
    const body = document.getElementById('doc-modal-body');
    body.innerHTML = a.docs.map((doc, i) => {
        const isImage = doc.type && doc.type.startsWith('image/'); const isPdf = doc.type && doc.type.includes('pdf'); const icon = isPdf ? '📕' : isImage ? '🖼️' : '📄';
        const preview = isImage ? `<img src="${doc.base64}" alt="${doc.name}" style="width:100%;max-height:400px;object-fit:contain;border-radius:8px;border:1px solid var(--border);background:#f9f9f9;padding:8px;">` : isPdf ? `<iframe src="${doc.base64}" style="width:100%;height:420px;border:1px solid var(--border);border-radius:8px;" title="${doc.name}"></iframe>` : `<div style="padding:20px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:8px;border:1px solid var(--border);">${icon} Vorschau nicht verfügbar.</div>`;
        return `<div style="margin-bottom:20px;${i > 0 ? 'padding-top:20px;border-top:1px solid var(--border);' : ''}"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><div><span style="font-weight:700;font-size:.88rem;">${icon} ${doc.name}</span><span style="color:var(--text-muted);font-size:.75rem;margin-left:8px;">${doc.size || ''}</span></div><a href="${doc.base64}" download="${doc.name}" style="background:var(--primary);color:#fff;border-radius:8px;padding:5px 12px;font-size:.78rem;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:5px;">⬇️ Download</a></div>${preview}</div>`;
    }).join('');
    document.getElementById('doc-overlay').style.display = 'block';
    const modal = document.getElementById('doc-modal'); modal.style.display = 'flex';
}
function closeDocPreview() { document.getElementById('doc-overlay').style.display = 'none'; document.getElementById('doc-modal').style.display = 'none'; }

// ── Audit Log ────────────────────────────────────────────────────
function renderAuditLog() {
    const wrap = document.getElementById('audit-log-wrap'); if (!wrap) return;
    const log = DB.arr('et2_audit');
    const myLog = log.filter(e => e.praxisId === cu?.id);
    wrap.innerHTML = myLog.length ? myLog.map(e => `<div class="audit-item"><span class="audit-time">${e.time}</span><span>${e.message}</span></div>`).join('') : '<div class="empty" style="font-size:.8rem;">Noch keine Aktionen.</div>';
}

function clearAudit() {
    const log = DB.arr('et2_audit'); const others = log.filter(e => e.praxisId && e.praxisId !== cu?.id);
    DB.set('et2_audit', others); renderAuditLog(); showToast('🗑 Protokoll gelöscht');
}

// ── EmailJS ───────────────────────────────────────────────────────
const EJS_CONFIG_KEY  = 'et2_emailjs_config';
const EJS_LOG_KEY     = 'et2_email_log';
const EJS_TOGGLES_KEY = 'et2_email_toggles';

function getEJSConfig()  { return DB.get(EJS_CONFIG_KEY) || { serviceId: '', templateId: '', pubKey: '' }; }
function isEJSConfigured() { const c = getEJSConfig(); return !!(c.serviceId && c.templateId && c.pubKey); }
function getEJSToggles() { return DB.get(EJS_TOGGLES_KEY) || { onConfirm: true, onCancel: true, onReminder: true }; }

function initEmailJS() {
    const c = getEJSConfig(); if (!c.pubKey) return false;
    try { if (typeof emailjs !== 'undefined') { emailjs.init({ publicKey: c.pubKey }); return true; } } catch(e) { console.warn('[EmailJS] init error:', e); }
    return false;
}
function saveEmailJSConfig() {
    const serviceId  = document.getElementById('ejs-service')?.value.trim();
    const templateId = document.getElementById('ejs-template')?.value.trim();
    const pubKey     = document.getElementById('ejs-pubkey')?.value.trim();
    if (!serviceId || !templateId || !pubKey) { showToast('⚠️ Bitte alle drei Felder ausfüllen!', 'warning'); return; }
    DB.set(EJS_CONFIG_KEY, { serviceId, templateId, pubKey }); initEmailJS(); updateEJSStatusBadge();
    const testBtn = document.getElementById('ejs-test-btn'); if (testBtn) testBtn.disabled = false;
    showToast('✅ EmailJS Konfiguration gespeichert!', 'success'); writeAudit('📧 EmailJS konfiguriert', cu.id);
}
function saveEmailToggles() {
    DB.set(EJS_TOGGLES_KEY, { onConfirm: document.getElementById('ejs-on-confirm')?.checked ?? true, onCancel: document.getElementById('ejs-on-cancel')?.checked ?? true, onReminder: document.getElementById('ejs-on-reminder')?.checked ?? true });
}
function updateEJSStatusBadge() {
    const badge = document.getElementById('emailjs-status-badge'); if (!badge) return;
    if (isEJSConfigured()) { badge.className = 'emailjs-status configured'; badge.textContent = '✅ Konfiguriert'; }
    else { badge.className = 'emailjs-status not-configured'; badge.textContent = '⚪ Nicht konfiguriert'; }
}
function loadEJSConfigFields() {
    const c = getEJSConfig();
    const s = document.getElementById('ejs-service'); const t = document.getElementById('ejs-template'); const p = document.getElementById('ejs-pubkey');
    if (s) s.value = c.serviceId || ''; if (t) t.value = c.templateId || ''; if (p) p.value = c.pubKey || '';
    const testBtn = document.getElementById('ejs-test-btn'); if (testBtn) testBtn.disabled = !isEJSConfigured();
    const tog = getEJSToggles();
    const cb1 = document.getElementById('ejs-on-confirm'); const cb2 = document.getElementById('ejs-on-cancel'); const cb3 = document.getElementById('ejs-on-reminder');
    if (cb1) cb1.checked = tog.onConfirm; if (cb2) cb2.checked = tog.onCancel; if (cb3) cb3.checked = tog.onReminder;
    updateEJSStatusBadge(); renderEmailLog();
}
async function sendEmail(appt, type) {
    if (!isEJSConfigured()) return;
    const toggles = getEJSToggles();
    if (type === 'confirmed' && !toggles.onConfirm) return;
    if (type === 'cancelled' && !toggles.onCancel)  return;
    if (type === 'reminder'  && !toggles.onReminder) return;
    const toEmail = appt.patientEmail;
    if (!toEmail || toEmail.includes('walk-in@') || toEmail.includes('praxis.local')) return;
    const c = getEJSConfig(); const praxis = praxen.find(p => p.id === appt.praxisId);
    const typeMap = { exam: 'Untersuchung', consult: 'Konsultation', procedure: 'Behandlung', operation: 'Operation' };
    const statusLabel = type === 'confirmed' ? '✅ Bestätigt' : type === 'cancelled' ? '❌ Abgesagt' : '🔔 Erinnerung';
    const messageMap = { confirmed: `Ihr Termin bei ${appt.doctorName} am ${appt.date} um ${appt.time} Uhr wurde bestätigt. Bitte erscheinen Sie 5 Minuten vor dem Termin.`, cancelled: `Ihr Termin bei ${appt.doctorName} am ${appt.date} um ${appt.time} Uhr wurde leider abgesagt. Bitte buchen Sie einen neuen Termin.`, reminder: `Erinnerung: Morgen haben Sie einen Termin bei ${appt.doctorName} um ${appt.time} Uhr. Wir freuen uns auf Ihren Besuch!` };
    const params = { to_email: toEmail, to_name: appt.patientName, doctor_name: appt.doctorName, praxis_name: appt.praxisName || (praxis?.name || ''), praxis_phone: praxis?.phone || '', date: appt.date, time: appt.time + ' Uhr', appt_type: typeMap[appt.apptType] || appt.apptType || '—', reason: appt.reason || '—', status_label: statusLabel, message: messageMap[type] || '' };
    showEmailPreview(params, type);
    try { initEmailJS(); if (typeof emailjs === 'undefined') throw new Error('EmailJS nicht geladen'); await emailjs.send(c.serviceId, c.templateId, params); addEmailLog({ type, to: toEmail, name: appt.patientName, date: appt.date, ok: true }); showToast(`📧 E-Mail an ${appt.patientName} gesendet!`, 'success'); writeAudit(`📧 E-Mail (${type}) an ${appt.patientName} (${toEmail})`, cu.id); }
    catch(err) { console.error('[EmailJS] send error:', err); addEmailLog({ type, to: toEmail, name: appt.patientName, date: appt.date, ok: false, err: err.text || err.message }); updateEJSStatusBadge(); const badge = document.getElementById('emailjs-status-badge'); if (badge) { badge.className = 'emailjs-status error'; badge.textContent = '❌ Fehler beim Senden'; } showToast(`❌ E-Mail Fehler: ${err.text || err.message || 'Unbekannt'}`, 'error'); }
}
function showEmailPreview(params, type) {
    const box = document.getElementById('email-preview-box'); if (!box) return;
    const subjectMap = { confirmed: `✅ Terminbestätigung — ${params.date} um ${params.time}`, cancelled: `❌ Termin abgesagt — ${params.date}`, reminder: `🔔 Erinnerung: Termin morgen um ${params.time}` };
    box.innerHTML = `<div class="ep-subject">${subjectMap[type] || 'E-Mail'}</div><div class="ep-body">An: ${params.to_name} &lt;${params.to_email}&gt;\n\n${params.message}\n\n${params.praxis_name}${params.praxis_phone ? '\nTel: ' + params.praxis_phone : ''}</div>`;
}
function addEmailLog(entry) {
    const log = DB.arr(EJS_LOG_KEY); log.unshift({ ...entry, time: new Date().toLocaleString('de-DE') }); if (log.length > 50) log.pop();
    DB.set(EJS_LOG_KEY, log); renderEmailLog();
}
function renderEmailLog() {
    const wrap = document.getElementById('email-log-wrap'); if (!wrap) return;
    const log  = DB.arr(EJS_LOG_KEY);
    if (!log.length) { wrap.innerHTML = '<div style="color:#aaa;font-size:.76rem;padding:6px 0;">Noch keine E-Mails.</div>'; return; }
    wrap.innerHTML = log.slice(0, 8).map(e => `<div class="email-log-item"><span class="email-log-icon">${e.ok ? '✅' : '❌'}</span><div style="flex:1;"><span style="font-weight:700;">${e.name}</span><span style="color:var(--text-muted);"> · ${e.type} · ${e.date}</span>${!e.ok && e.err ? `<br><span style="color:var(--danger);font-size:.68rem;">${e.err}</span>` : ''}</div><span style="color:#aaa;font-size:.68rem;flex-shrink:0;">${e.time}</span></div>`).join('');
}
async function sendTestEmail() {
    if (!cu) return;
    const fakeAppt = { id: 'test-001', patientName: cu.name || 'Test Patient', patientEmail: cu.email, doctorName: 'Dr. Test', praxisName: cu.name, praxisId: cu.id, date: new Date().toISOString().split('T')[0], time: '10:00', apptType: 'exam', reason: 'Testbuchung' };
    showToast('📨 Test-E-Mail wird gesendet…');
    await sendEmail(fakeAppt, 'confirmed');
}
async function sendReminders() {
    if (!isEJSConfigured()) { showToast('⚠️ Bitte zuerst EmailJS konfigurieren!', 'warning'); return; }
    const tmr = new Date(); tmr.setDate(tmr.getDate() + 1); const tmrStr = tmr.toISOString().split('T')[0];
    const myDocIds = new Set(doctors.filter(d => d.praxisId === cu.id).map(d => d.id));
    const tomorrow = appts.filter(a => myDocIds.has(a.doctorId) && a.date === tmrStr && a.status === 'confirmed');
    if (!tomorrow.length) { showToast('ℹ️ Keine bestätigten Termine morgen.'); return; }
    showToast(`📨 Sende ${tomorrow.length} Erinnerungen…`);
    let sent = 0;
    for (const a of tomorrow) { await sendEmail(a, 'reminder'); sent++; await new Promise(r => setTimeout(r, 300)); }
    showToast(`✅ ${sent} Erinnerungen gesendet!`, 'success');
    writeAudit(`📧 ${sent} Erinnerungen für ${tmrStr} gesendet`, cu.id);
}

// ── Auslastung ────────────────────────────────────────────────────
let _loadPeriodDays = 7;

function setLoadPeriod(days, el) {
    _loadPeriodDays = days;
    document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    renderAuslastung();
    renderAuslastungFull();
}

function renderAuslastung() {
    if (!cu) return;
    const myDocs   = doctors.filter(d => d.praxisId === cu.id);
    const myDocIds = new Set(myDocs.map(d => d.id));
    const now = new Date(); const fromDate = new Date(now); fromDate.setDate(now.getDate() - _loadPeriodDays);
    const fromStr = fromDate.toISOString().split('T')[0]; const toStr = now.toISOString().split('T')[0];
    const periodAppts = appts.filter(a => myDocIds.has(a.doctorId) && a.date >= fromStr && a.date <= toStr && a.status !== 'cancelled');
    renderLoadSummary(myDocs, periodAppts, fromStr, toStr);
    renderLoadDocList(myDocs, periodAppts, fromStr, toStr, 'load-doc-list');
}

function renderAuslastungFull() {
    if (!cu) return;
    const myDocs   = doctors.filter(d => d.praxisId === cu.id);
    const myDocIds = new Set(myDocs.map(d => d.id));
    const now = new Date(); const fromDate = new Date(now); fromDate.setDate(now.getDate() - _loadPeriodDays);
    const fromStr = fromDate.toISOString().split('T')[0]; const toStr = now.toISOString().split('T')[0];
    const periodAppts = appts.filter(a => myDocIds.has(a.doctorId) && a.date >= fromStr && a.date <= toStr && a.status !== 'cancelled');
    renderLoadDocList(myDocs, periodAppts, fromStr, toStr, 'load-doc-list-2');
    renderLoadHeatmap(periodAppts);
}

function renderLoadSummary(myDocs, periodAppts, fromStr, toStr) {
    const el = document.getElementById('load-summary'); if (!el) return;
    let totalCapacity = 0, totalBooked = 0;
    myDocs.forEach(d => { const cap = calcDoctorCapacity(d, fromStr, toStr); totalCapacity += cap; totalBooked += periodAppts.filter(a => a.doctorId === d.id).length; });
    const overallPct = totalCapacity > 0 ? Math.round(totalBooked / totalCapacity * 100) : 0;
    const pctCls = overallPct >= 80 ? 'var(--danger)' : overallPct >= 50 ? 'var(--warning)' : 'var(--success)';
    const hourCounts = {}; periodAppts.forEach(a => { const h = a.time ? a.time.split(':')[0] : null; if (h) hourCounts[h] = (hourCounts[h] || 0) + 1; });
    const peakHour  = Object.entries(hourCounts).sort((a,b) => b[1]-a[1])[0];
    const peakLabel = peakHour ? `${peakHour[0]}:00 Uhr` : '—';
    const docCounts = {}; periodAppts.forEach(a => { docCounts[a.doctorId] = (docCounts[a.doctorId] || 0) + 1; });
    const topDocEntry = Object.entries(docCounts).sort((a,b) => b[1]-a[1])[0];
    const topDoc = topDocEntry ? myDocs.find(d => d.id === topDocEntry[0]) : null;
    const topDocName = topDoc ? topDoc.name.replace('Dr. med. ','Dr. ').split(' ').slice(0,2).join(' ') : '—';
    el.innerHTML = `<div class="load-summary-item"><div class="load-summary-num" style="color:${pctCls};">${overallPct}%</div><div class="load-summary-lbl">Gesamtauslastung</div></div><div class="load-summary-item"><div class="load-summary-num" style="color:var(--primary);font-size:1rem;">${topDocName}</div><div class="load-summary-lbl">Meist gebucht</div></div><div class="load-summary-item"><div class="load-summary-num" style="color:var(--accent);font-size:1rem;">${peakLabel}</div><div class="load-summary-lbl">Stoßzeit</div></div>`;
}

function renderLoadDocList(myDocs, periodAppts, fromStr, toStr, targetId) {
    const el = document.getElementById(targetId || 'load-doc-list'); if (!el) return;
    if (!myDocs.length) { el.innerHTML = '<div class="empty">Keine Ärzte.</div>'; return; }
    el.innerHTML = myDocs.map(d => {
        const booked   = periodAppts.filter(a => a.doctorId === d.id).length;
        const capacity = calcDoctorCapacity(d, fromStr, toStr);
        const pct      = capacity > 0 ? Math.round(booked / capacity * 100) : 0;
        const cls      = pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';
        const allInPeriod = appts.filter(a => a.doctorId === d.id && a.date >= fromStr && a.date <= toStr);
        const cancelCount = allInPeriod.filter(a => a.status === 'cancelled').length;
        const cancelPct   = allInPeriod.length ? Math.round(cancelCount / allInPeriod.length * 100) : 0;
        const statusEmoji = d.status === 'urlaub' ? ' 🏖' : d.status === 'krank' ? ' 🤒' : '';
        return `<div class="doc-load-row"><div class="doc-load-avatar" style="background:${d.color||'#7c5cbf'};">${initials(d.name)}</div><div class="doc-load-info"><div class="doc-load-name">${d.name}${statusEmoji}</div><div class="doc-load-spec">${d.spec} · ${booked} Termine</div></div><div class="doc-load-bar-wrap"><div class="doc-load-bar-track"><div class="doc-load-bar-fill ${cls}" style="width:${pct}%;"></div></div><div class="doc-load-sub">${capacity} Slots verfügbar · ${cancelPct}% Storno</div></div><div class="doc-load-pct ${cls}">${pct}%</div></div>`;
    }).join('');
}

function calcDoctorCapacity(doctor, fromStr, toStr) {
    ensureSchedule(doctor); const dur = parseInt(doctor.slotDuration) || 15; let total = 0;
    const from = new Date(fromStr); const to = new Date(toStr);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        if (doctor.unavailableToday === dateStr) continue;
        const daySched = getDaySchedule(doctor, dateStr); if (!daySched || !daySched.enabled) continue;
        const startMin = timeToMin(daySched.start); const endMin = timeToMin(daySched.end);
        for (let m = startMin; m < endMin; m += dur) { if (!isInBreak(doctor, m)) total++; }
    }
    return total;
}

function renderLoadHeatmap(periodAppts) {
    const el = document.getElementById('load-heatmap'); if (!el) return;
    if (!periodAppts.length) { el.innerHTML = '<div class="empty" style="font-size:.78rem;">Keine Daten im Zeitraum.</div>'; return; }
    const hours = [8,9,10,11,12,13,14,15,16,17]; const dayLabels = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    const matrix = {}; hours.forEach(h => { matrix[h] = {}; dayLabels.forEach((_,i) => matrix[h][i] = 0); });
    periodAppts.forEach(a => { if (!a.date || !a.time) return; const dow = new Date(a.date).getDay(); const h = parseInt(a.time.split(':')[0]); if (matrix[h] && matrix[h][dow] !== undefined) matrix[h][dow]++; });
    let maxVal = 1; hours.forEach(h => { dayLabels.forEach((_,i) => { if (matrix[h][i] > maxVal) maxVal = matrix[h][i]; }); });
    let html = '<div class="heatmap-grid"><div></div>';
    dayLabels.forEach(l => { html += `<div class="heatmap-day-label">${l}</div>`; });
    hours.forEach(h => { html += `<div class="heatmap-label">${h}h</div>`; dayLabels.forEach((_, i) => { const v = matrix[h][i]; const lvl = v === 0 ? 0 : Math.min(4, Math.ceil(v / maxVal * 4)); html += `<div class="heatmap-cell heatmap-${lvl}" title="${dayLabels[i]} ${h}:00 · ${v > 0 ? v + ' Termine' : '—'}">${v > 0 ? v : ''}</div>`; }); });
    html += `</div><div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:.65rem;color:var(--text-muted);"><span>Wenig</span>${[0,1,2,3,4].map(l=>`<div style="width:14px;height:14px;border-radius:3px;" class="heatmap-${l}"></div>`).join('')}<span>Viel</span></div>`;
    el.innerHTML = html;
}

// ── No-Show ───────────────────────────────────────────────────────
const NOSHOW_THRESHOLD = 3;
function getNoShowCount(patientId, patientEmail) {
    const today = new Date().toISOString().split('T')[0];
    return appts.filter(a => (a.patientId === patientId || a.patientEmail === patientEmail) && a.date < today && a.status === 'cancelled').length;
}
function getDoctorNoShowStats(doctorId) {
    const today = new Date().toISOString().split('T')[0];
    const past  = appts.filter(a => a.doctorId === doctorId && a.date < today);
    const noshow= past.filter(a => a.status === 'cancelled').length; const total = past.length;
    return { count: noshow, total, pct: total ? Math.round(noshow / total * 100) : 0 };
}
function getNoShowPatients() {
    const today = new Date().toISOString().split('T')[0];
    const myDocIds = new Set(doctors.filter(d => d.praxisId === cu.id).map(d => d.id));
    const cancelled = appts.filter(a => myDocIds.has(a.doctorId) && a.date < today && a.status === 'cancelled');
    const byPatient = {}; cancelled.forEach(a => { const key = a.patientId || a.patientEmail; if (!byPatient[key]) byPatient[key] = { id: a.patientId, email: a.patientEmail, name: a.patientName, count: 0, total: 0, lastDate: '' }; byPatient[key].count++; if (a.date > byPatient[key].lastDate) byPatient[key].lastDate = a.date; });
    appts.filter(a => myDocIds.has(a.doctorId) && a.date < today).forEach(a => { const key = a.patientId || a.patientEmail; if (byPatient[key]) byPatient[key].total++; });
    return Object.values(byPatient).filter(p => p.count >= NOSHOW_THRESHOLD).sort((a, b) => b.count - a.count);
}
function renderNoShowPanel() {
    const wrap = document.getElementById('noshow-panel-wrap'); if (!wrap) return;
    const pts = getNoShowPatients(); if (!pts.length) { wrap.innerHTML = ''; return; }
    const rows = pts.slice(0, 5).map(p => { const pct = p.total ? Math.round(p.count / p.total * 100) : 0; const isHigh = p.count >= 5; const bl = DB.arr('et2_blacklist'); const blocked = bl.includes(p.email); return `<div class="noshow-patient-row"><div style="display:flex;align-items:center;gap:8px;flex:1;"><div style="width:28px;height:28px;border-radius:50%;background:${isHigh?'var(--danger)':'var(--warning)'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.72rem;flex-shrink:0;">${p.count}</div><div><div style="font-weight:700;font-size:.82rem;">${p.name}${blocked ? ' 🚫' : ''}</div><div style="font-size:.7rem;color:var(--text-muted);">${p.count}/${p.total} Termine abgesagt (${pct}%) · Letzter: ${p.lastDate}</div></div></div><div style="display:flex;gap:5px;align-items:center;flex-shrink:0;"><button class="btn-sm" onclick="openEHR('${p.id}','${p.name.replace(/'/g,"\\'")}');" style="border-color:#888;color:#888;font-size:.7rem;">📋 Akte</button><button class="btn-sm ${blocked ? 'btn-ok' : 'btn-cancel'}" onclick="toggleBlacklist('${p.email}');renderNoShowPanel();renderKanban();" style="font-size:.7rem;" title="${blocked ? 'Entsperren' : 'Blockieren'}">${blocked ? '✓ Freig.' : '🚫 Sperren'}</button></div></div>`; }).join('');
    wrap.innerHTML = `<div class="card" style="border:2px solid #f5c6cb;padding:16px 20px;"><div class="noshow-panel-title"><span style="font-size:1.1rem;">⚠️</span><span>No-Show Alarm — ${pts.length} Patient${pts.length>1?'en':''} mit ${NOSHOW_THRESHOLD}+ Absagen</span><button onclick="document.getElementById('noshow-panel-wrap').innerHTML=''" style="margin-left:auto;background:transparent;border:none;cursor:pointer;font-size:.75rem;color:var(--text-muted);">✕ Ausblenden</button></div>${rows}</div>`;
}
function updateStatusWithNoShow(id, newStatus) {
    const idx = appts.findIndex(a => a.id === id); if (idx === -1) return;
    appts[idx].status = newStatus; saveAll();
    writeAudit(`Termin von ${appts[idx].patientName} am ${appts[idx].date} → ${newStatus}`, cu.id);
    if (newStatus === 'confirmed') { SoundUX.confirm(); sendEmail(appts[idx], 'confirmed'); }
    else if (newStatus === 'waiting') { SoundUX.success(); showToast('🪑 Patient im Wartezimmer!', 'warning'); }
    else if (newStatus === 'cancelled') { SoundUX.cancel(); sendEmail(appts[idx], 'cancelled'); }
    if (newStatus === 'cancelled') { const a = appts[idx]; const nsCount = getNoShowCount(a.patientId, a.patientEmail); if (nsCount === NOSHOW_THRESHOLD) showToast(`⚠️ ${a.patientName} hat jetzt ${nsCount} Absagen!`, 'warning'); else if (nsCount > NOSHOW_THRESHOLD) showToast(`🚨 ${a.patientName}: ${nsCount}× No-Show!`, 'error'); renderNoShowPanel(); }
    renderKanban();
}

// ── Schedule Editor ──────────────────────────────────────────────
let editSchedule = null;
function loadScheduleEditor() {
    const docId = document.getElementById('sched-doc-sel')?.value;
    const wrap  = document.getElementById('schedule-editor-wrap');
    if (!wrap) return;
    if (!docId) { wrap.innerHTML = '<div class="empty">Arzt auswählen.</div>'; return; }
    const d = doctors.find(x => x.id === docId && x.praxisId === cu.id);
    if (!d) { wrap.innerHTML = '<div class="empty">Arzt nicht gefunden.</div>'; return; }
    ensureSchedule(d); editSchedule = JSON.parse(JSON.stringify(d.schedule));
    renderScheduleEditor(d, wrap);
}
function renderScheduleEditor(doctor, wrap) {
    if (!editSchedule) return;
    const dayRows = editSchedule.workDays.map((day, i) => { const slotCount = day.enabled ? countDaySlots(doctor, day) : 0; return `<div class="day-row" id="day-row-${i}"><label class="day-toggle"><input type="checkbox" ${day.enabled ? 'checked' : ''} onchange="toggleDay(${i}, this.checked)"><span>${day.label}</span></label><input type="time" value="${day.start}" ${day.enabled ? '' : 'disabled'} onchange="updateDayTime(${i},'start',this.value)" style="${day.enabled ? '' : 'opacity:.4;'}"><input type="time" value="${day.end}" ${day.enabled ? '' : 'disabled'} onchange="updateDayTime(${i},'end',this.value)" style="${day.enabled ? '' : 'opacity:.4;'}"><div class="day-preview">${day.enabled ? slotCount + ' Slots' : '—'}</div></div>`; }).join('');
    const breakItems = editSchedule.breaks.map((b, i) => `<div class="break-item" id="break-item-${i}"><input type="time" value="${b.start}" onchange="updateBreak(${i},'start',this.value)" title="Von"><input type="time" value="${b.end}" onchange="updateBreak(${i},'end',this.value)" title="Bis"><input type="text" value="${b.label}" onchange="updateBreak(${i},'label',this.value)" placeholder="Bezeichnung" style="font-size:.78rem;"><button onclick="removeBreak(${i})" class="btn-sm btn-cancel" title="Pause entfernen">✕</button></div>`).join('');
    const activeDays = editSchedule.workDays.filter(d => d.enabled); const totalSlots = activeDays.reduce((s, day) => s + countDaySlots(doctor, day), 0); const avgSlots = activeDays.length ? Math.round(totalSlots / activeDays.length) : 0;
    wrap.innerHTML = `<div style="margin-bottom:10px;"><div class="section-label">Arbeitstage & Öffnungszeiten</div>${dayRows}</div>${renderTimeline(doctor)}<div class="slot-count-badge">✅ Ø ${avgSlots} buchbare Slots/Tag</div><div style="margin-top:14px;"><div class="section-label">Pausenzeiten</div><div id="breaks-list">${breakItems || '<div style="color:#aaa;font-size:.82rem;padding:8px 0;">Keine Pausen definiert.</div>'}</div><button class="add-break-btn" onclick="addBreak()">＋ Pause hinzufügen</button></div><button class="btn btn-main" style="margin-top:16px;" onclick="saveSchedule('${doctor.id}')">💾 Zeitplan speichern</button>`;
}
function countDaySlots(doctor, day) {
    if (!day.enabled) return 0; const dur = parseInt(doctor.slotDuration) || 15; const startMin = timeToMin(day.start); const endMin = timeToMin(day.end); let count = 0;
    for (let m = startMin; m < endMin; m += dur) { if (!editSchedule.breaks.some(b => { const bs = timeToMin(b.start), be = timeToMin(b.end); return bs < be && m >= bs && m < be; })) count++; }
    return count;
}
function renderTimeline(doctor) {
    const START = 7 * 60, END = 20 * 60, SPAN = END - START; const pct = (min) => Math.max(0, Math.min(100, ((min - START) / SPAN) * 100)).toFixed(2);
    const activeDays = editSchedule.workDays.filter(d => d.enabled); if (!activeDays.length) return '<div style="color:#aaa;font-size:.8rem;padding:6px 0;">Kein aktiver Arbeitstag.</div>';
    const ex = activeDays[0]; const wsMin = timeToMin(ex.start), weMin = timeToMin(ex.end);
    let segments = []; if (wsMin > START) segments.push({ pct: pct(START), width: pct(wsMin) - pct(START), cls: 'timeline-closed', label: '' });
    let cur = wsMin; const breaks = [...editSchedule.breaks].sort((a,b) => timeToMin(a.start) - timeToMin(b.start));
    breaks.forEach(b => { const bs = timeToMin(b.start), be = timeToMin(b.end); if (bs > cur && bs < weMin) { segments.push({ width: (pct(Math.min(bs, weMin)) - pct(cur)).toFixed(2), cls: 'timeline-work', label: '' }); cur = bs; } if (bs < weMin) { segments.push({ width: (pct(Math.min(be, weMin)) - pct(bs)).toFixed(2), cls: 'timeline-break', label: b.label || '☕' }); cur = Math.min(be, weMin); } });
    if (cur < weMin) segments.push({ width: (pct(weMin) - pct(cur)).toFixed(2), cls: 'timeline-work', label: '' }); if (weMin < END) segments.push({ width: (pct(END) - pct(weMin)).toFixed(2), cls: 'timeline-closed', label: '' });
    const bars = segments.map(s => `<div class="timeline-segment ${s.cls}" style="width:${s.width}%;" title="${s.label}">${parseFloat(s.width) > 8 ? s.label : ''}</div>`).join('');
    const labels = ['07','09','11','13','15','17','19'].map((h,i) => `<span style="position:absolute;left:${((i*2*60)/SPAN*100).toFixed(1)}%;font-size:.62rem;color:var(--text-muted);transform:translateX(-50%);">${h}</span>`).join('');
    return `<div class="schedule-timeline">${bars}</div><div style="position:relative;height:14px;margin-bottom:6px;">${labels}</div>`;
}
function toggleDay(idx, enabled) { editSchedule.workDays[idx].enabled = enabled; const docId = document.getElementById('sched-doc-sel')?.value; const d = doctors.find(x => x.id === docId); if (d) renderScheduleEditor(d, document.getElementById('schedule-editor-wrap')); }
function updateDayTime(idx, field, val) { editSchedule.workDays[idx][field] = val; const docId = document.getElementById('sched-doc-sel')?.value; const d = doctors.find(x => x.id === docId); if (d) renderScheduleEditor(d, document.getElementById('schedule-editor-wrap')); }
function addBreak() { editSchedule.breaks.push({ start: '12:00', end: '13:00', label: 'Pause' }); const docId = document.getElementById('sched-doc-sel')?.value; const d = doctors.find(x => x.id === docId); if (d) renderScheduleEditor(d, document.getElementById('schedule-editor-wrap')); }
function removeBreak(idx) { editSchedule.breaks.splice(idx, 1); const docId = document.getElementById('sched-doc-sel')?.value; const d = doctors.find(x => x.id === docId); if (d) renderScheduleEditor(d, document.getElementById('schedule-editor-wrap')); }
function updateBreak(idx, field, val) { editSchedule.breaks[idx][field] = val; }
function saveSchedule(docId) {
    const d = doctors.find(x => x.id === docId && x.praxisId === cu.id); if (!d || !editSchedule) return;
    d.schedule = JSON.parse(JSON.stringify(editSchedule));
    const firstBreak = editSchedule.breaks[0]; d.breakStart = firstBreak ? firstBreak.start : ''; d.breakEnd = firstBreak ? firstBreak.end : '';
    saveAll(); const activeDays = editSchedule.workDays.filter(x => x.enabled).map(x => x.label).join(', ');
    writeAudit(`${d.name}: Zeitplan gespeichert (${activeDays}, ${editSchedule.breaks.length} Pausen)`, cu.id);
    showToast('✅ Zeitplan gespeichert!', 'success'); editSchedule = null; renderDashboard();
}

// ── INIT ─────────────────────────────────────────────────────────
(async function init() {
    await seedDemo();
    praxen   = DB.arr('et2_praxen');
    doctors  = DB.arr('et2_doctors');
    patients = DB.arr('et2_patients');
    appts    = DB.arr('et2_appts');
    cu       = DB.get('et2_admin_sess');

    if (cu) {
        document.getElementById('auth-shell').style.display    = 'none';
        document.getElementById('dashboard-shell').style.display = 'flex';
        initEmailJS();
        setTimeout(renderDashboard, 300);
        startSessionTimer();
    } else {
        document.getElementById('auth-shell').style.display    = 'flex';
        document.getElementById('dashboard-shell').style.display = 'none';
    }

    // GDPR
    if (!DB.get('et2_gdpr')) { setTimeout(() => { const b = document.getElementById('gdpr-box'); if(b) b.style.display = 'block'; }, 1500); }
})();

function acceptGDPR() { DB.set('et2_gdpr', true); const b = document.getElementById('gdpr-box'); if(b) b.style.display = 'none'; }
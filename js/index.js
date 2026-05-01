/* ================================================================
   EINFACH-TERMIN — index.js
   Логика страницы пациента
   Зависимости: shared.js (должен быть загружен раньше)
================================================================ */
'use strict';

// ЗАДАЧА 16: Suspicious helper (index.js)
function checkSuspiciousBooking(email, name) {
    if (!email) return { isSuspicious: false };
    var now = Date.now();
    var norm = email.trim().toLowerCase();
    var recent = appts.filter(function(a) {
        if ((a.patientEmail||'').trim().toLowerCase() !== norm) return false;
        if (a.status === 'cancelled') return false;
        var ts = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        if (!ts) { var today = new Date().toISOString().split('T')[0]; if (a.date === today) ts = now - 1800000; }
        return (now - ts) < 3600000;
    });
    return { isSuspicious: recent.length >= 3, count: recent.length, reason: recent.length + ' Buchungen von ' + email + ' in der letzten Stunde' };
}
function markSuspiciousAppt(appt, reason) {
    appt.suspicious = true;
    appt.suspiciousReason = reason;
    writeAudit('[SUSPICIOUS] ' + appt.patientName + ' (' + appt.patientEmail + '): ' + reason, appt.praxisId);
}


// ── Session ─────────────────────────────────────────────────────
let cu = DB.get('et2_sess');   // { role:'patient', ...patientObj }

// ── Booking state ────────────────────────────────────────────────
let selDoctor  = null;
let selPraxis  = null;
let selSlot    = '';
let pendingDoc = null;
let selectedColor = cu?.color || '#7c5cbf';

// ── Auth ─────────────────────────────────────────────────────────
async function handleLogin() {
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pass  = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-err');
    errEl.style.display = 'none';

    if (!email || !pass) {
        errEl.innerText = 'Bitte E-Mail und Passwort eingeben.';
        errEl.style.display = 'block'; return;
    }

    // Patient suchen und Passwort prüfen (async SHA-256)
    const pat = patients.find(p => p.email.toLowerCase() === email);
    if (pat && await verifyPassword(pass, pat.pass)) {
        // Legacy-Migration: Falls Passwort noch im Klartext — jetzt hashen
        if (pat.pass.length < 60) {
            pat.pass = await hashPassword(pass);
            saveAll();
        }
        DB.set('et2_sess', { ...pat, role: 'patient' });
        location.reload(); return;
    }

    // Praxis suchen (Weiterleitung zu admin.html)
    const prx = praxen.find(p => p.email.toLowerCase() === email);
    if (prx && await verifyPassword(pass, prx.pass)) {
        window.location.href = 'admin.html'; return;
    }

    errEl.innerText = 'E-Mail oder Passwort falsch.';
    errEl.style.display = 'block';
}

async function handleRegister() {
    const errEl = document.getElementById('reg-err');
    errEl.style.display = 'none';

    if (!document.getElementById('r-gdpr').checked) {
        errEl.innerText = '⚠️ Datenschutz muss akzeptiert werden!';
        errEl.style.display = 'block'; return;
    }
    const fn  = document.getElementById('r-fn').value.trim();
    const ln  = document.getElementById('r-ln').value.trim();
    const em  = document.getElementById('r-em').value.trim().toLowerCase();
    const ph  = document.getElementById('r-ph').value.trim();
    const ins = document.getElementById('r-ins').value;
    const pw  = document.getElementById('r-pw').value;
    const pc  = document.getElementById('r-pc').value;

    if (!fn || !ln || !em || !pw) { errEl.innerText = 'Pflichtfelder ausfüllen!'; errEl.style.display = 'block'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { errEl.innerText = 'Bitte gültige E-Mail eingeben!'; errEl.style.display = 'block'; return; }
    if (pw !== pc) { errEl.innerText = 'Passwörter stimmen nicht überein!'; errEl.style.display = 'block'; return; }
    if (pw.length < 8) { errEl.innerText = 'Passwort mindestens 8 Zeichen!'; errEl.style.display = 'block'; return; }
    if (patients.find(p => p.email.toLowerCase() === em)) { errEl.innerText = 'E-Mail bereits registriert!'; errEl.style.display = 'block'; return; }

    // Passwort hashen vor dem Speichern
    const hashedPw = await hashPassword(pw);
    const newPat = { id: generateID(), fname: fn, lname: ln, name: `${fn} ${ln}`, email: em, phone: ph, ins, pass: hashedPw, color: '#7c5cbf' };
    patients.push(newPat);
    saveAll();
    showToast('✅ Registrierung erfolgreich!', 'success');
    showPage('page-login');
}

function logout() { localStorage.removeItem('et2_sess'); location.reload(); }

// ── Render Patient Panel ─────────────────────────────────────────
function renderPatient() {
    if (!cu) return;

    // Profile
    const av = document.getElementById('p-avatar');
    if (av) { av.innerText = initials(cu.name); av.style.background = cu.color || '#7c5cbf'; }
    const txt = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
    txt('p-profile-name',  cu.name);
    txt('p-profile-email', cu.email);
    txt('p-profile-phone', cu.phone || '—');
    const insEl = document.getElementById('p-profile-ins');
    if (insEl) insEl.innerHTML = cu.ins === 'private'
        ? '<span class="ins-badge ins-private">Privat (PKV)</span>'
        : '<span class="ins-badge ins-public">Gesetzlich (GKV)</span>';

    // Stats — uses shared getAvgRating, renderWeekChart, renderExtraStats
    const my   = appts.filter(a => a.patientId === cu.id);
    const conf = my.filter(a => a.status === 'confirmed').length;
    const pend = my.filter(a => a.status === 'pending').length;
    const canc = my.filter(a => a.status === 'cancelled').length;
    txt('hs-total', my.length); txt('hs-confirmed', conf); txt('hs-pending', pend); txt('hs-cancelled', canc);
    const pct = my.length ? Math.round(conf / my.length * 100) : 0;
    const bar = document.getElementById('hs-bar'); if (bar) bar.style.width = pct + '%';
    txt('hs-pct', pct + '%');
    renderWeekChart(my, 'wb-');        // ← shared.js
    renderExtraStats(my, 'hs-extra'); // ← shared.js

    // Next visit banner
    const now      = new Date().toISOString().split('T')[0];
    const upcoming = [...my].filter(a => a.date >= now && a.status !== 'cancelled').sort((a, b) => a.date > b.date ? 1 : -1);
    const nb = document.getElementById('next-visit-banner-wrap');
    if (nb) {
        const next = upcoming[0];
        if (next) {
            const dl   = Math.ceil((new Date(next.date) - new Date()) / 86400000);
            const when = dl === 0 ? 'Heute' : dl === 1 ? 'Morgen' : `In ${dl} Tagen`;
            nb.innerHTML = `<div class="next-visit-banner"><div class="nv-icon">📋</div><div>
                <div class="nv-label">Nächster Termin</div>
                <div class="nv-main">${next.doctorName} · ${next.praxisName || ''}</div>
                <div class="nv-sub">${when} · ${next.date} · ${next.time} Uhr ${next.status === 'pending' ? '⏳' : '✅'}</div>
            </div></div>`;
        } else nb.innerHTML = '';
    }

    // Reminder Center (Nr.21)
    renderReminderCenter();

    // Buchungsformular: Erinnerungs-Banner (bleibt als Kurzhinweis)
    const tmr    = new Date(); tmr.setDate(tmr.getDate() + 1);
    const tmrStr = tmr.toISOString().split('T')[0];
    const hasTmr = appts.find(a => a.patientId === cu.id && a.date === tmrStr && a.status === 'confirmed');
    const remEl  = document.getElementById('reminder-container');
    if (remEl) remEl.innerHTML = hasTmr
        ? `<div class="reminder-banner">
              🔔
              <div>Morgen Termin bei <b>${hasTmr.doctorName}</b> um <b>${hasTmr.time}</b> Uhr!</div>
              <button class="rb-close" onclick="this.parentElement.remove()" title="Schließen">✕</button>
           </div>`
        : '';

    // Date min
    const di = document.getElementById('book-date'); if (di) di.min = now;

    // City / Spec filters — only active doctors
    const activeDocs     = doctors.filter(d => d.status === 'active');
    const activePraxIds  = new Set(activeDocs.map(d => d.praxisId));
    const activePraxen   = praxen.filter(p => activePraxIds.has(p.id));
    const cities = [...new Set(activePraxen.map(p => p.city).filter(Boolean))];
    const specs  = [...new Set(activeDocs.map(d => d.spec))];
    const cityEl = document.getElementById('filter-city');
    const specEl = document.getElementById('filter-spec');
    if (cityEl) cityEl.innerHTML = '<option value="">Alle Städte</option>'       + cities.map(c => `<option value="${c}">${c}</option>`).join('');
    if (specEl) specEl.innerHTML = '<option value="">Alle Fachrichtungen</option>' + specs.map(s  => `<option value="${s}">${s}</option>`).join('');

    renderPraxisList();

    // Appointments
    const past  = my.filter(a => a.date < now || a.status === 'cancelled').sort((a, b) => b.date > a.date ? 1 : -1);
    const upEl  = document.getElementById('p-upcoming');
    const paEl  = document.getElementById('p-past');
    if (upEl) upEl.innerHTML = upcoming.length ? upcoming.map(a => patientApptCard(a)).join('') : '<div class="empty">Keine bevorstehenden Termine.</div>';
    if (paEl) paEl.innerHTML = past.length     ? past.map(a => patientApptCard(a, true)).join('') : '<div class="empty">Keine Einträge.</div>';

    initPushButton();
}

function patientApptCard(a, isPast = false) {
    const cancelBtn = !isPast && (a.status === 'pending' || a.status === 'confirmed')
        ? (canCancel(a.date) ? `<button class="btn-cancel-appt" onclick="cancelAppt('${a.id}')">Stornieren</button>` : `<span class="lock-text">Storno &lt;24h</span>`)
        : '';
    const icsBtn   = `<button class="btn-sm" onclick='downloadICS(${JSON.stringify(a).replace(/'/g,"&#39;")})'>📅</button>`;
    const printBtn = `<button class="print-ticket-btn" onclick='openTicketModal(${JSON.stringify(a).replace(/'/g,"&#39;")})'>🎟️ Ticket</button>`;
    const ratingEl = (isPast && a.status === 'confirmed' && !a.rating)
        ? `<div class="star-row">${[1,2,3,4,5].map(n => `<span class="star" onclick="rateAppt('${a.id}',${n})">☆</span>`).join('')}</div><div style="font-size:.72rem;color:#aaa;">Termin bewerten</div>`
        : a.rating ? `<div class="star-display">${'★'.repeat(a.rating)}${'☆'.repeat(5 - a.rating)}</div>` : '';
    const docsBadge = (a.docs && a.docs.length) ? `<span style="font-size:.72rem;color:var(--primary);">📎 ${a.docs.length} Dok.</span>` : '';

    // Recall-Button: nur für vergangene bestätigte Termine (Nr.15)
    const recallBtn = (isPast && a.status === 'confirmed')
        ? `<button onclick='openRecall(${JSON.stringify(a).replace(/'/g,"&#39;")})' 
            style="display:inline-flex;align-items:center;gap:5px;background:linear-gradient(135deg,var(--primary-light),var(--lavender));
            border:1.5px solid var(--lavender-deep);color:var(--primary);border-radius:var(--r-sm);
            padding:6px 11px;font-size:.76rem;font-weight:700;cursor:pointer;width:100%;justify-content:center;
            margin-top:4px;font-family:'DM Sans',sans-serif;transition:all .18s;"
            onmouseover="this.style.background='var(--primary)';this.style.color='#fff'"
            onmouseout="this.style.background='linear-gradient(135deg,var(--primary-light),var(--lavender))';this.style.color='var(--primary)'">
            🔄 Wiedervorstellung
           </button>`
        : '';

    return `<div class="appt-row ${getTypeClass(a.apptType)}${a.urgent ? ' urgent-task' : ''}">
        <div class="appt-l">
            ${a.urgent ? '<span class="urgent-badge">Dringend</span>' : ''}
            ${getTypeBadge(a.apptType)}
            ${a.isRecall ? '<span style="display:inline-block;background:linear-gradient(135deg,var(--primary-light),var(--lavender));color:var(--primary);font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:12px;margin-bottom:3px;">🔄 Wiedervorstellung</span>' : ''}
            <span class="appt-name">${a.doctorName}</span>
            <span class="appt-meta">${a.praxisName || ''} · 📅 ${a.date} · 🕐 ${a.time}</span>
            <div style="margin-top:4px;">${statusBadge(a.status)}</div>
            ${a.reason ? `<div style="margin-top:4px;font-size:.78rem;color:var(--text-muted);">Grund: ${a.reason}</div>` : ''}
            ${a.note   ? `<div style="margin-top:6px;font-size:.82rem;background:var(--warning-light);padding:8px;border-left:3px solid var(--warning);border-radius:6px;">${a.note}</div>` : ''}
            ${docsBadge}${ratingEl}
            ${recallBtn}
        </div>
        <div class="appt-r">
            <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;">
                ${cancelBtn}${icsBtn}${printBtn}
            </div>
        </div>
    </div>`;
}

// ── Praxis → Doctor flow ─────────────────────────────────────────
function renderPraxisList() {
    const wrap = document.getElementById('praxis-list-wrap'); if (!wrap) return;
    const city = document.getElementById('filter-city')?.value || '';
    const spec = document.getElementById('filter-spec')?.value || '';

    const activeDocs = doctors.filter(d => d.status === 'active');
    let filtered = praxen.filter(p => {
        if (city && p.city !== city) return false;
        const pDocs = activeDocs.filter(d => d.praxisId === p.id);
        if (!pDocs.length) return false;
        if (spec && !pDocs.find(d => d.spec === spec)) return false;
        return true;
    });

    if (!filtered.length) { wrap.innerHTML = '<div class="empty">Keine Praxen gefunden.</div>'; return; }

    wrap.innerHTML = filtered.map(p => {
        const pActiveDocs = activeDocs.filter(d => d.praxisId === p.id);
        const specs       = [...new Set(pActiveDocs.map(d => d.spec))];
        const link        = `einfach-termin.de/${p.slug}`;
        const avgRatings  = pActiveDocs.map(d => getAvgRating(d.id)).filter(Boolean);
        const praxisAvg   = avgRatings.length ? (avgRatings.reduce((s, r) => s + r, 0) / avgRatings.length).toFixed(1) : null;
        const stars       = praxisAvg ? `<span class="star-display" style="font-size:.75rem;">${'★'.repeat(Math.round(praxisAvg))}</span> <small style="color:var(--text-muted);">(${praxisAvg})</small>` : '';
        const isSelected  = selPraxis && selPraxis.id === p.id;

        return `<div class="praxis-card${isSelected ? ' selected' : ''}" onclick="selectPraxis('${p.id}')">
            <div class="pc-header">
                <div class="praxis-icon">${p.logo || '🏥'}</div>
                <div style="flex:1;">
                    <div class="praxis-name">${p.name} ${stars}</div>
                    <div class="praxis-addr">📍 ${p.city} · ${p.address}</div>
                    <span class="praxis-link-pill" onclick="copyLink('${link}');event.stopPropagation()" style="font-size:.74rem;color:var(--primary);font-weight:600;cursor:pointer;">🔗 ${link}</span>
                </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
                ${specs.map(s => `<span style="background:var(--primary-light);color:var(--primary);border-radius:20px;padding:3px 10px;font-size:.75rem;font-weight:600;">${s}</span>`).join('')}
            </div>
            <div style="font-size:.73rem;color:var(--text-muted);margin-top:8px;">👆 Klicken um Ärzte anzuzeigen</div>
        </div>`;
    }).join('');
}

function selectPraxis(praxisId) {
    selPraxis = praxen.find(p => p.id === praxisId);
    selDoctor = null; selSlot = '';
    if (!selPraxis) return;
    renderPraxisList();

    const pDocs     = doctors.filter(d => d.praxisId === praxisId);
    const wrap      = document.getElementById('doctor-selector-wrap');
    const chipsWrap = document.getElementById('doctor-chips-wrap');
    if (!wrap || !chipsWrap) return;

    const todayStr = new Date().toISOString().split('T')[0];
    chipsWrap.innerHTML = pDocs.map(d => {
        const isUnavail  = d.status !== 'active' || d.unavailableToday === todayStr;
        const dotCls     = d.status === 'urlaub' ? 'dot-urlaub' : d.status === 'krank' ? 'dot-krank' : 'dot-active';
        const statusNote = d.status === 'urlaub' ? '(Urlaub)' : d.status === 'krank' ? '(Krank)' : d.unavailableToday === todayStr ? '(Heute gesperrt)' : '';
        const avg        = getAvgRating(d.id);
        const stars      = avg ? ` ⭐${avg}` : '';
        const click      = isUnavail ? '' : `onclick="selectDoctor('${d.id}')"`;
        return `<div class="doctor-chip${isUnavail ? ' unavail' : ''}" ${click}>
            <span class="doctor-status-dot ${dotCls}"></span>
            ${d.name} <small style="opacity:.75;">(${d.spec}${stars})</small>
            ${isUnavail ? `<small style="color:var(--danger);">${statusNote}</small>` : `<small style="opacity:.5;">${d.slotDuration}Min</small>`}
        </div>`;
    }).join('');

    wrap.style.display = 'block';
    document.getElementById('booking-form-wrap').style.display = 'none';
    wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function selectDoctor(doctorId) {
    selDoctor = doctors.find(d => d.id === doctorId && d.praxisId === selPraxis?.id);
    if (!selDoctor) return;
    document.querySelectorAll('.doctor-chip').forEach(c => c.classList.remove('selected'));
    event?.currentTarget?.classList.add('selected');
    document.getElementById('booking-form-wrap').style.display = 'block';
    selSlot = '';
    renderWorkdaysInfo();
    updateSlots();
    updateSpamWarn(); // ← Anti-Spam-Zähler aktualisieren
    document.getElementById('book-date')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`👨‍⚕️ ${selDoctor.name} — ${selDoctor.slotDuration}Min-Slots`, 'success');
}

/** Zeigt Öffnungszeiten + Pausen des gewählten Arztes (Nr.13) */
function renderWorkdaysInfo() {
    if (!selDoctor) return;
    ensureSchedule(selDoctor);
    const infoEl = document.getElementById('booking-form-wrap');
    if (!infoEl) return;
    const old = document.getElementById('workdays-info');
    if (old) old.remove();
    const sched = selDoctor.schedule;
    const activeDays = sched.workDays.filter(d => d.enabled);
    const chips = sched.workDays.map(d =>
        `<span class="workday-chip ${d.enabled ? 'active' : 'closed'}">${d.label}</span>`
    ).join('');
    const breakInfo = sched.breaks.length
        ? sched.breaks.map(b => `<span style="font-size:.72rem;color:var(--warning);font-weight:600;">☕ ${b.label||'Pause'}: ${b.start}–${b.end}</span>`).join(' · ')
        : '<span style="font-size:.72rem;color:#aaa;">Keine Pausen</span>';
    const timeInfo = activeDays.length
        ? [...new Set(activeDays.map(d => `${d.start}–${d.end}`))].join(' / ')
        : 'Kein Arbeitstag';
    const div = document.createElement('div');
    div.id = 'workdays-info';
    div.style = 'background:var(--primary-light);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:10px;border:1px solid var(--lavender-deep);';
    div.innerHTML = `<div style="font-size:.78rem;font-weight:700;color:var(--primary);margin-bottom:6px;">🗓 Öffnungszeiten: ${selDoctor.name}</div>
        <div class="workdays-strip">${chips}</div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:4px;">🕐 ${timeInfo}</div>
        <div style="margin-top:4px;">${breakInfo}</div>`;
    infoEl.prepend(div);
}

/** Prüft ob das gewählte Datum für den Arzt verfügbar ist (Nr.13) */
function checkDateAvailability(el) {
    checkWeekend(el);
    const date = el.value;
    const old = document.getElementById('date-avail-msg');
    if (old) old.remove();
    if (!date || !selDoctor) return;
    ensureSchedule(selDoctor);
    if (selDoctor.unavailableToday === date) {
        showDateMsg('⛔ Arzt an diesem Tag gesperrt.', false);
        document.getElementById('slot-grid').innerHTML = '<div style="color:var(--danger);font-size:.83rem;">Kein Termin möglich.</div>';
        return;
    }
    const daySched = getDaySchedule(selDoctor, date);
    if (!daySched || !daySched.enabled) {
        const labels = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
        const dow = new Date(date).getDay();
        showDateMsg(`⛔ ${labels[dow]} ist kein Arbeitstag für ${selDoctor.name}.`, false);
        document.getElementById('slot-grid').innerHTML = '<div style="color:var(--danger);font-size:.83rem;">Kein Arbeitstag.</div>';
        return;
    }
    showDateMsg(`✅ ${daySched.start}–${daySched.end} Uhr · ${selDoctor.slotDuration}Min-Slots`, true);
    updateSlots();
}

function showDateMsg(text, ok) {
    const remEl = document.getElementById('reminder-container');
    if (!remEl) return;
    const div = document.createElement('div');
    div.id = 'date-avail-msg';
    div.className = `date-avail-msg ${ok ? 'date-avail-ok' : 'date-avail-err'}`;
    div.innerHTML = text;
    remEl.parentNode.insertBefore(div, remEl.nextSibling);
    if (!ok) setTimeout(() => div.remove(), 5000);
}

// ── Anti-Spam-Zähler anzeigen ────────────────────────────────────
function updateSpamWarn() {
    const wrap = document.getElementById('spam-warn-wrap');
    const btn  = document.getElementById('book-btn');
    if (!wrap || !selDoctor || !cu) return;

    const active = appts.filter(a =>
        a.patientId === cu.id &&
        a.doctorId  === selDoctor.id &&
        (a.status === 'pending' || a.status === 'confirmed')
    ).length;

    const remaining = 3 - active;

    if (active >= 3) {
        // Limit erreicht — Button sperren + rote Meldung
        wrap.innerHTML = `<div style="background:var(--danger-light);border-left:3px solid var(--danger);
            border-radius:var(--r-sm);padding:10px 14px;font-size:.82rem;color:var(--danger);margin-bottom:8px;">
            🚫 <strong>Limit erreicht:</strong> Sie haben bereits 3 aktive Buchungen bei ${selDoctor.name}.
            Bitte warten Sie bis eine Buchung abgeschlossen oder abgesagt wurde.
        </div>`;
        if (btn) { btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'not-allowed'; }
    } else if (active > 0) {
        // Noch Platz — gelbe Info
        wrap.innerHTML = `<div style="background:var(--warning-light);border-left:3px solid var(--warning);
            border-radius:var(--r-sm);padding:8px 14px;font-size:.78rem;color:var(--warning);margin-bottom:8px;">
            ⚠️ ${active} von 3 möglichen Buchungen bei ${selDoctor.name} aktiv · noch ${remaining} frei
        </div>`;
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
    } else {
        // Kein Problem
        wrap.innerHTML = '';
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
    }
}

// ── Slots — uses shared.js generateSlots() ───────────────────────
function updateSlots() {
    if (!selDoctor) return;
    const date = document.getElementById('book-date')?.value;
    const grid = document.getElementById('slot-grid');
    const info = document.getElementById('slot-info-wrap');
    if (!grid) return;
    if (!date) { grid.innerHTML = '<span style="color:#aaa;font-size:.83rem;">Datum wählen</span>'; return; }

    if (selDoctor.unavailableToday === date) {
        grid.innerHTML = '<div style="color:var(--danger);font-size:.83rem;">⛔ Arzt an diesem Tag nicht verfügbar.</div>';
        if (info) info.innerText = ''; return;
    }

    // ── Wochenplan: Datum prüfen → dayDisabled wenn kein Arbeitstag ──
    const slots    = generateSlots(selDoctor, date); // ← shared.js
    if (slots.length === 1 && slots[0].dayDisabled) {
        grid.innerHTML = '<div style="color:var(--danger);font-size:.83rem;">⛔ An diesem Tag keine Sprechstunde.</div>';
        if (info) info.innerText = ''; return;
    }
    const takenMap = {};
    appts.filter(a => a.doctorId === selDoctor.id && a.date === date && (a.status === 'confirmed' || a.status === 'pending'))
         .forEach(a => { takenMap[a.time] = a.status; });

    // Freie Slots = nicht Pause, nicht belegt, nicht vergangen, nicht im Puffer
    const freeCount = slots.filter(s => !s.isBreak && !s.isPast && !s.isBuffer && !takenMap[s.time]).length;
    const workSlots = slots.filter(s => !s.isBreak).length;
    if (info) {
        info.innerText = freeCount > 0
            ? `✅ ${freeCount} von ${workSlots} Slots frei · ${selDoctor.slotDuration}Min-Intervall`
            : '⛔ Alle Slots belegt';
        info.style.color = freeCount === 0 ? 'var(--danger)' : 'var(--text-muted)';
    }

    selSlot = '';
    grid.innerHTML = slots.map(s => {
        // Pause
        if (s.isBreak)  return `<div class="slot break-slot" title="${s.breakLabel||'Pause'}">☕ ${s.time}<br><span style="font-size:.58rem;">${s.breakLabel||''}</span></div>`;
        // Vergangener Slot (nur heute)
        if (s.isPast)   return `<div class="slot taken" title="Bereits vergangen" style="opacity:.45;">🕐 ${s.time}</div>`;
        // Puffer: weniger als 2h bis zum Termin
        if (s.isBuffer) return `<div class="slot taken" title="Buchung nur bis 2 Stunden vorher möglich" style="opacity:.5;">🔒 ${s.time}</div>`;
        // Belegt
        const taken = !!takenMap[s.time];
        return `<div class="slot${taken ? ' taken' : ''}" ${taken ? `title="Belegt"` : `onclick="pickSlot(this,'${s.time}')"`}>${s.time}${taken ? `<br><span style="font-size:.58rem;color:#bbb;">${takenMap[s.time] === 'confirmed' ? 'best.' : 'ausst.'}</span>` : ''}</div>`;
    }).join('');
}

function pickSlot(el, t) {
    document.querySelectorAll('#slot-grid .slot').forEach(s => s.classList.remove('sel'));
    el.classList.add('sel'); selSlot = t;
}

function checkWeekend(el) {
    const parts = el.value.split('-'); if (parts.length < 3) return;
    const day = new Date(+parts[0], +parts[1] - 1, +parts[2]).getDay();
    if ([0, 6].includes(day)) { showToast('⚠️ Wochenenden nicht verfügbar!', 'warning'); el.value = ''; updateSlots(); }
}

// ── Booking ──────────────────────────────────────────────────────
function bookAppt() {
    if (!cu) return;
    if (!selPraxis) return showToast('Bitte Praxis wählen.', 'warning');
    if (!selDoctor) return showToast('Bitte Arzt wählen.', 'warning');
    const date   = document.getElementById('book-date')?.value;
    const type   = document.getElementById('in-appt-type')?.value || 'exam';
    const reason = document.getElementById('in-reason')?.value || '';
    if (!date)    return showToast('Bitte Datum wählen.', 'warning');
    if (!selSlot) return showToast('Bitte Zeitslot wählen.', 'warning');

    const bl = DB.arr('et2_blacklist');
    if (bl.includes(cu.email)) return showToast('❌ Buchung gesperrt.', 'error');

    // ── Anti-Spam: max 3 aktive Buchungen pro Patient bei demselben Arzt ──
    const activeAtThisDoctor = appts.filter(a =>
        a.patientId === cu.id &&
        a.doctorId  === selDoctor.id &&
        (a.status === 'pending' || a.status === 'confirmed')
    ).length;
    if (activeAtThisDoctor >= 3) return showToast('⛔ Максимум 3 активные записи к одному врачу.', 'error');

    // ── Wochenplan-Check ──────────────────────────────────────────────
    ensureSchedule(selDoctor);
    const daySched = getDaySchedule(selDoctor, date);
    if (!daySched || !daySched.enabled) return showToast('⛔ Kein Arbeitstag für diesen Arzt.', 'error');
    if (selDoctor.unavailableToday === date) return showToast('⛔ Arzt an diesem Tag gesperrt.', 'error');

    const slotsCheck = generateSlots(selDoctor, date); // ← shared.js — mit Datum für isPast-Prüfung
    if (slotsCheck.length === 1 && slotsCheck[0].dayDisabled) return showToast('⛔ Kein Arbeitstag.', 'error');
    if (slotsCheck.find(s => s.time === selSlot && s.isBreak)) return showToast('⛔ Mittagspause — nicht buchbar.', 'error');
    if (slotsCheck.find(s => s.time === selSlot && s.isPast))  return showToast('⛔ Dieser Zeitslot liegt in der Vergangenheit.', 'error');

    // ── Puffer: Buchung nur bis 2 Stunden vor dem Termin möglich ─────
    const apptDateTime = new Date(`${date}T${selSlot}:00`);
    const diffMinutes  = (apptDateTime - new Date()) / 60000;
    if (diffMinutes < 120) return showToast('⛔ Buchung nur bis 2 Stunden vorher möglich.', 'error');

    const clash = appts.find(a => a.doctorId === selDoctor.id && a.date === date && a.time === selSlot && (a.status === 'confirmed' || a.status === 'pending'));
    if (clash) return showToast('⛔ Slot bereits gebucht.', 'error');

    // ── ЗАДАЧА 19: maxOnlineSlotsPerHour — лимит онлайн-записей в час ──
    const slotHour   = parseInt((selSlot || '0:0').split(':')[0]);
    const hourLimit  = selPraxis.maxOnlineSlotsPerHour || 10;
    const bookedThisHour = appts.filter(a => {
        if (a.praxisId !== selPraxis.id) return false;
        if (a.date     !== date)         return false;
        if (a.status === 'cancelled')    return false;
        if (a.status === 'waiting_queue') return false;
        return parseInt((a.time || '0:0').split(':')[0]) === slotHour;
    }).length;

    if (bookedThisHour >= hourLimit) {
        // Лимит достигнут — ставим в живую очередь
        showQueueModal(selPraxis, selDoctor, date, selSlot, type, reason);
        return;
    }

    const newAppt = {
        id: generateID(), // ← shared.js
        patientId: cu.id, patientName: cu.name, patientEmail: cu.email,
        doctorId: selDoctor.id, doctorName: selDoctor.name,
        praxisId: selPraxis.id, praxisName: selPraxis.name,
        date, time: selSlot, status: 'pending',
        apptType: type, reason, note: '', rating: null, urgent: false, docs: []
    };

    if (pendingDoc) {
        newAppt.docs.push({ name: pendingDoc.name, size: pendingDoc.size, base64: pendingDoc.base64, type: pendingDoc.type });
        pendingDoc = null; renderDocPreview();
    }

    newAppt.createdAt = new Date().toISOString(); // ЗАДАЧА 16: timestamp для детектора
    appts.push(newAppt);
    saveAll(); // ← shared.js
    writeAudit(`${cu.name} → ${selDoctor.name} (${selPraxis.name}) am ${date} um ${selSlot}`, selPraxis.id); // ← shared.js
    // ЗАДАЧА 16: Suspicious detector
    const _suspCheck = checkSuspiciousBooking(cu.email, cu.name);
    if (_suspCheck.isSuspicious) {
        markSuspiciousAppt(newAppt, _suspCheck.reason);
        saveAll();
    }
    SoundUX.success(); // ← shared.js
    selSlot = '';
    showToast('✅ Termin erfolgreich angefragt!', 'success');
    notifyBookingReceived(newAppt); // ← Nr.20 Push
    savePushSnapshot();             // ← Nr.20 Snapshot aktualisieren
    renderPatient();
}

function cancelAppt(id) {
    if (!confirm('Termin wirklich absagen?')) return;
    const a = appts.find(x => x.id === id);
    if (a) { a.status = 'cancelled'; saveAll(); SoundUX.cancel(); renderPatient(); }
}


// ── Ticket Modal (Nr.14) ──────────────────────────────────────────
let _ticketAppt = null; // Aktuell geöffneter Termin

/** Baut das schöne Ticket-HTML auf (in Modal + für Export) */
function buildTicketHTML(a, forExport = false) {
    const typeLabels = {
        exam: '🔵 Untersuchung', consult: '🟣 Konsultation',
        procedure: '🟤 Behandlung', operation: '⚫ Operation'
    };
    const statusLabel = a.status === 'confirmed'
        ? '<span class="t-status-badge">✓ Bestätigt</span>'
        : '<span class="t-status-badge" style="background:#fff3cd;color:#7a4800;">⏳ Ausstehend</span>';

    // Kompakter QR-Block (ASCII bleibt lesbar für Scanner-Simulation)
    const qr = qrAscii(a.id); // shared.js

    const baseStyle = forExport
        ? 'font-family:DM Sans,sans-serif;max-width:380px;margin:0 auto;border:2px solid #ddd8f0;border-radius:16px;padding:24px;background:#fff;color:#2d1b69;'
        : '';

    return `<div class="ticket-preview-inner" id="ticket-export-root" ${forExport ? `style="${baseStyle}"` : ''}>
        <div class="t-header">
            <div class="t-logo">Einfach<span style="color:#967BB6;font-style:italic;">-Termin</span></div>
            <div class="t-subtitle">Terminbestätigung</div>
        </div>
        <div class="t-row"><span class="t-label">Patient</span><span class="t-val">${a.patientName}</span></div>
        <div class="t-row"><span class="t-label">Arzt</span><span class="t-val">${a.doctorName}</span></div>
        <div class="t-row"><span class="t-label">Praxis</span><span class="t-val">${a.praxisName || '—'}</span></div>
        <hr class="t-divider">
        <div class="t-row"><span class="t-label">📅 Datum</span><span class="t-val" style="color:var(--primary,#7c5cbf);font-size:1rem;">${a.date}</span></div>
        <div class="t-row"><span class="t-label">🕐 Uhrzeit</span><span class="t-val" style="color:var(--primary,#7c5cbf);font-size:1rem;">${a.time} Uhr</span></div>
        <div class="t-row"><span class="t-label">Typ</span><span class="t-val">${typeLabels[a.apptType] || a.apptType || '—'}</span></div>
        ${a.reason ? `<div class="t-row"><span class="t-label">Grund</span><span class="t-val">${a.reason}</span></div>` : ''}
        <hr class="t-divider">
        <div class="t-status">${statusLabel}</div>
        <div class="t-qr-new">${qr}</div>
        <div class="t-footer">
            ID: ${a.id.slice(0, 10).toUpperCase()}<br>
            einfach-termin.de · Bitte 5 Min. vor Termin erscheinen
        </div>
    </div>`;
}

function openTicketModal(a) {
    _ticketAppt = a;
    const overlay = document.getElementById('ticket-modal-overlay');
    const preview = document.getElementById('ticket-modal-preview');
    if (!overlay || !preview) {
        // Fallback: alte Druckfunktion
        printTicket(a); return;
    }
    preview.innerHTML = buildTicketHTML(a);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeTicketModal() {
    document.getElementById('ticket-modal-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
    _ticketAppt = null;
}

function ticketDoPrint() {
    if (!_ticketAppt) return;
    printTicket(_ticketAppt); // shared.js — bestehende Druckfunktion
}

/** Ticket als PDF über Browser-Druckdialog speichern (native, kein lib nötig) */
function ticketSavePDF() {
    if (!_ticketAppt) return;
    const a = _ticketAppt;

    // Temporäre Print-Seite nur mit Ticket-Inhalt
    const tc = document.getElementById('ticket-content');
    if (tc) {
        tc.innerHTML = buildTicketHTML(a, true);
    }
    const printArea = document.getElementById('print-area');
    if (printArea) {
        printArea.style.display = 'block';
        // Kurzer Hinweis für den User
        showToast('📄 PDF: Im Druckdialog "Als PDF speichern" wählen', 'success');
        setTimeout(() => {
            window.print();
            setTimeout(() => {
                printArea.style.display = 'none';
            }, 1000);
        }, 300);
    }
}

/** Ticket als PNG-Bild speichern über html2canvas */
async function ticketSaveImage() {
    if (!_ticketAppt) return;
    const a = _ticketAppt;

    const preview = document.getElementById('ticket-modal-preview');
    if (!preview) return;

    // Generating-Overlay
    const root = document.getElementById('ticket-export-root');
    if (!root) return;

    showToast('🖼️ Bild wird erstellt…');

    try {
        // html2canvas ist über CDN geladen
        if (typeof html2canvas === 'undefined') {
            showToast('⚠️ Bild-Export nicht verfügbar (kein Internet)', 'warning');
            return;
        }

        const canvas = await html2canvas(root, {
            backgroundColor: '#ffffff',
            scale: 2,              // 2x für scharfe Darstellung auf Handy
            useCORS: true,
            logging: false
        });

        // Canvas → Blob → Download
        canvas.toBlob(blob => {
            const url  = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href     = url;
            link.download = `Termin_${a.date}_${a.time.replace(':', '')}.png`;
            link.click();
            URL.revokeObjectURL(url);
            showToast('✅ Bild gespeichert!', 'success');
        }, 'image/png');

    } catch (err) {
        console.error('html2canvas error:', err);
        showToast('❌ Bild-Export fehlgeschlagen. Bitte Screenshot nutzen.', 'error');
    }
}


// ── Recall / Wiedervorstellung (Nr.15) ────────────────────────────
let _recallAppt   = null;   // Ursprünglicher Termin
let _recallWeeks  = 0;      // Gewählte Wochen
let _recallDate   = '';     // Berechnetes Datum

const RECALL_OPTIONS = [
    { weeks: 1,  label: 'Woche' },
    { weeks: 2,  label: 'Wochen' },
    { weeks: 3,  label: 'Wochen' },
    { weeks: 4,  label: 'Wochen' },
    { weeks: 6,  label: 'Wochen' },
    { weeks: 8,  label: 'Wochen' },
    { weeks: 12, label: 'Wochen' },
    { weeks: 24, label: 'Wochen' },
];

/** Öffnet das Recall-Modal für einen abgeschlossenen Termin */
function openRecall(a) {
    _recallAppt  = a;
    _recallWeeks = 0;
    _recallDate  = '';

    // Subtitle
    const sub = document.getElementById('recall-subtitle');
    if (sub) sub.innerText = `${a.doctorName} · ${a.praxisName || ''}`;

    // Wochen-Grid aufbauen
    const grid = document.getElementById('recall-weeks-grid');
    if (grid) {
        grid.innerHTML = RECALL_OPTIONS.map(opt => `
            <button class="recall-week-btn" onclick="selectRecallWeeks(${opt.weeks}, this)">
                <span class="rw-num">${opt.weeks}</span>
                <span class="rw-lbl">${opt.label}</span>
            </button>`).join('');
    }

    // Preview zurücksetzen
    const preview = document.getElementById('recall-date-preview');
    if (preview) preview.innerHTML = '📅 Bitte Zeitraum wählen…';
    const info = document.getElementById('recall-avail-info');
    if (info) info.innerText = '';
    const btn = document.getElementById('recall-confirm-btn');
    if (btn) btn.disabled = true;

    document.getElementById('recall-overlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeRecall() {
    document.getElementById('recall-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
    _recallAppt = _recallWeeks = null;
    _recallDate = '';
}

/** Wird aufgerufen wenn Nutzer eine Wochen-Option anklickt */
function selectRecallWeeks(weeks, el) {
    _recallWeeks = weeks;

    // Aktiven Button markieren
    document.querySelectorAll('.recall-week-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');

    // Datum berechnen: ab heute + weeks Wochen, auf nächsten Werktag runden
    const base = new Date();
    base.setDate(base.getDate() + weeks * 7);
    // Wochenende überspringen
    while (base.getDay() === 0 || base.getDay() === 6) {
        base.setDate(base.getDate() + 1);
    }
    _recallDate = base.toISOString().split('T')[0];

    // Datum schön anzeigen
    const dateLabel = base.toLocaleDateString('de-DE', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const preview = document.getElementById('recall-date-preview');
    if (preview) {
        preview.innerHTML = `📅 <strong>${dateLabel}</strong>`;
    }

    // Verfügbarkeit prüfen (Wochenplan + unavailableToday)
    checkRecallAvailability();
}

/** Prüft ob der Arzt am berechneten Datum verfügbar ist */
function checkRecallAvailability() {
    const info = document.getElementById('recall-avail-info');
    const btn  = document.getElementById('recall-confirm-btn');
    if (!_recallAppt || !_recallDate) return;

    const doc = doctors.find(d => d.id === _recallAppt.doctorId);
    if (!doc) {
        if (info) info.innerHTML = '<span style="color:var(--danger);">⚠️ Arzt nicht mehr verfügbar.</span>';
        if (btn) btn.disabled = true;
        return;
    }

    // Praxis noch aktiv?
    const praxis = praxen.find(p => p.id === _recallAppt.praxisId);
    if (!praxis) {
        if (info) info.innerHTML = '<span style="color:var(--danger);">⚠️ Praxis nicht mehr verfügbar.</span>';
        if (btn) btn.disabled = true;
        return;
    }

    // Arzt-Status
    if (doc.status !== 'active') {
        if (info) info.innerHTML = `<span style="color:var(--warning);">⚠️ ${doc.name} ist derzeit ${doc.status === 'urlaub' ? 'im Urlaub' : 'krank'}. Bitte anderen Zeitraum wählen.</span>`;
        if (btn) btn.disabled = true;
        return;
    }

    // Wochenplan
    ensureSchedule(doc);
    const daySched = getDaySchedule(doc, _recallDate);
    if (!daySched || !daySched.enabled) {
        const dow = new Date(_recallDate).getDay();
        const labels = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
        // Nächsten Werktag suchen
        const next = new Date(_recallDate);
        let tries = 0;
        do { next.setDate(next.getDate() + 1); tries++; }
        while (tries < 7 && (!getDaySchedule(doc, next.toISOString().split('T')[0])?.enabled));
        const nextLabel = next.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
        if (info) info.innerHTML = `<span style="color:var(--warning);">ℹ️ ${labels[dow]} ist kein Arbeitstag — Datum wird auf ${nextLabel} verschoben.</span>`;
        // Datum automatisch verschieben
        _recallDate = next.toISOString().split('T')[0];
        const preview = document.getElementById('recall-date-preview');
        if (preview) {
            const newLabel = next.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            preview.innerHTML = `📅 <strong>${newLabel}</strong> <span style="font-size:.72rem;opacity:.7;">(verschoben)</span>`;
        }
    } else {
        // Freie Slots zählen
        const slots = generateSlots(doc, _recallDate);
        const takenCount = appts.filter(a =>
            a.doctorId === doc.id && a.date === _recallDate &&
            (a.status === 'confirmed' || a.status === 'pending')
        ).length;
        const freeSlots = slots.filter(s => !s.isBreak && !s.dayDisabled).length - takenCount;
        if (freeSlots <= 0) {
            if (info) info.innerHTML = `<span style="color:var(--warning);">⚠️ Keine freien Slots an diesem Tag. Sie werden auf die Warteliste gesetzt.</span>`;
        } else {
            if (info) info.innerHTML = `<span style="color:var(--success);">✅ ${freeSlots} freie Slots verfügbar.</span>`;
        }
    }

    if (btn) btn.disabled = false;
}

/** Bucht den Recall-Termin (pending, gleicher Arzt, berechnetes Datum, gleiche Uhrzeit) */
function confirmRecall() {
    if (!_recallAppt || !_recallDate) return;

    const doc    = doctors.find(d => d.id === _recallAppt.doctorId);
    const praxis = praxen.find(p => p.id === _recallAppt.praxisId);
    if (!doc || !praxis) return showToast('⚠️ Arzt oder Praxis nicht mehr verfügbar.', 'warning');

    // Gleiche Uhrzeit wie der ursprüngliche Termin bevorzugen
    // Falls nicht frei → ersten freien Slot nehmen
    const preferredTime = _recallAppt.time;
    const slots  = generateSlots(doc, _recallDate);
    const taken  = new Set(
        appts.filter(a => a.doctorId === doc.id && a.date === _recallDate &&
                         (a.status === 'confirmed' || a.status === 'pending'))
             .map(a => a.time)
    );

    let chosenTime = preferredTime;
    // Bevorzugte Zeit prüfen
    const preferredSlot = slots.find(s => s.time === preferredTime && !s.isBreak && !s.dayDisabled);
    if (!preferredSlot || taken.has(preferredTime)) {
        // Ersten freien nehmen
        const firstFree = slots.find(s => !s.isBreak && !s.dayDisabled && !taken.has(s.time));
        if (firstFree) {
            chosenTime = firstFree.time;
        } else {
            // Kein Slot frei — trotzdem eintragen mit pending (Warteliste)
            chosenTime = preferredTime;
        }
    }

    // Blacklist
    if (DB.arr('et2_blacklist').includes(cu.email)) return showToast('❌ Buchung gesperrt.', 'error');

    // Anti-Spam
    const activeAtDoc = appts.filter(a =>
        a.patientId === cu.id && a.doctorId === doc.id &&
        (a.status === 'pending' || a.status === 'confirmed')
    ).length;
    if (activeAtDoc >= 3) return showToast('⛔ Maximal 3 aktive Buchungen pro Arzt.', 'error');

    const newAppt = {
        id:           generateID(),
        patientId:    cu.id,
        patientName:  cu.name,
        patientEmail: cu.email,
        doctorId:     doc.id,
        doctorName:   doc.name,
        praxisId:     praxis.id,
        praxisName:   praxis.name,
        date:         _recallDate,
        time:         chosenTime,
        status:       'pending',
        apptType:     _recallAppt.apptType || 'exam',
        reason:       `Wiedervorstellung (nach ${_recallWeeks}W) — ${_recallAppt.reason || ''}`.trim(),
        note:         '',
        rating:       null,
        urgent:       false,
        docs:         [],
        isRecall:     true,              // Markierung
        recallFrom:   _recallAppt.id,   // Ursprungs-Termin
    };

    appts.push(newAppt);
    saveAll();
    writeAudit(`🔄 Recall: ${cu.name} → ${doc.name} am ${_recallDate} um ${chosenTime}`, doc.praxisId);
    SoundUX.success();
    notifyBookingReceived(newAppt); // ← Nr.20 Push
    savePushSnapshot();             // ← Nr.20 Snapshot

    const timeNote = chosenTime !== preferredTime
        ? ` (Uhrzeit geändert auf ${chosenTime})`
        : '';
    showToast(`✅ Wiedervorstellung am ${_recallDate} um ${chosenTime} Uhr angefragt!${timeNote}`, 'success');

    closeRecall();
    renderPatient();
}

// ── Smart Search ─────────────────────────────────────────────────
function smartSearch(q) {
    const drop = document.getElementById('ss-results'); if (!drop) return;
    if (!q.trim()) { drop.style.display = 'none'; return; }
    const query   = q.toLowerCase();
    const results = [];

    praxen.forEach(p => {
        const hasActive = doctors.some(d => d.praxisId === p.id && d.status === 'active');
        if (!hasActive) return;
        if (p.name.toLowerCase().includes(query) || p.city.toLowerCase().includes(query) || p.address.toLowerCase().includes(query))
            results.push({ type: 'praxis', obj: p });
    });
    doctors.filter(d => d.status === 'active').forEach(d => {
        if (d.name.toLowerCase().includes(query) || d.spec.toLowerCase().includes(query)) {
            const prx = praxen.find(x => x.id === d.praxisId);
            results.push({ type: 'doctor', obj: d, praxis: prx });
        }
    });

    if (!results.length) { drop.innerHTML = '<div class="ss-item"><span class="ss-meta">Keine Ergebnisse</span></div>'; drop.style.display = 'block'; return; }
    drop.innerHTML = results.slice(0, 6).map(r => {
        if (r.type === 'praxis') return `<div class="ss-item" onclick="searchSelectPraxis('${r.obj.id}')"><div><div class="ss-name">${r.obj.logo} ${r.obj.name}</div><div class="ss-meta">📍 ${r.obj.city}</div></div></div>`;
        const avg = getAvgRating(r.obj.id);
        return `<div class="ss-item" onclick="searchSelectDoctor('${r.obj.id}','${r.obj.praxisId}')"><div><div class="ss-name">${r.obj.name}</div><div class="ss-meta">${r.obj.spec} · ${r.praxis?.name || ''} · ${r.obj.slotDuration}Min</div></div>${avg ? `<span class="star-display" style="font-size:.75rem;">${'★'.repeat(Math.round(avg))}</span>` : ''}</div>`;
    }).join('');
    drop.style.display = 'block';
}
function hideSSResults() { const d = document.getElementById('ss-results'); if (d) d.style.display = 'none'; }
function searchSelectPraxis(id) { hideSSResults(); document.getElementById('smart-search').value = ''; selectPraxis(id); }
function searchSelectDoctor(docId, praxisId) {
    hideSSResults(); document.getElementById('smart-search').value = '';
    selectPraxis(praxisId);
    setTimeout(() => {
        selDoctor = doctors.find(d => d.id === docId);
        if (selDoctor) { document.getElementById('booking-form-wrap').style.display = 'block'; selSlot = ''; updateSlots(); showToast(`👨‍⚕️ ${selDoctor.name} ausgewählt`, 'success'); }
    }, 200);
}

// ── Ratings ──────────────────────────────────────────────────────
function rateAppt(id, stars) {
    const a = appts.find(x => x.id === id);
    if (a) { a.rating = stars; saveAll(); showToast(`⭐ ${stars}/5 gespeichert!`, 'success'); renderPatient(); }
}

// ── Profile ──────────────────────────────────────────────────────
function setAvatarColor(c, el) {
    selectedColor = c;
    document.querySelectorAll('.color-opt').forEach(d => d.style.border = '2px solid transparent');
    el.style.border = '2px solid var(--primary)';
    const av = document.getElementById('p-avatar'); if (av) av.style.background = c;
}
function updateProfile() {
    const n = document.getElementById('edit-name')?.value.trim();
    if (!n) return showToast('Bitte Namen eingeben!');
    cu.name = n; cu.color = selectedColor; DB.set('et2_sess', cu);
    const idx = patients.findIndex(p => p.id === cu.id);
    if (idx !== -1) { patients[idx].name = n; patients[idx].color = selectedColor; saveAll(); }
    showToast('✅ Profil aktualisiert!', 'success'); renderPatient();
}
async function changePassword() {
    const oldPw = document.getElementById('old-pw')?.value;
    const newPw = document.getElementById('new-pw')?.value;
    // Altes Passwort mit Hash vergleichen
    if (!await verifyPassword(oldPw, cu.pass)) return showToast('❌ Altes Passwort falsch!', 'error');
    if (!newPw || newPw.length < 8) return showToast('Neues Passwort mindestens 8 Zeichen!');
    // Neues Passwort hashen
    const hashedNew = await hashPassword(newPw);
    cu.pass = hashedNew; DB.set('et2_sess', cu);
    const idx = patients.findIndex(p => p.id === cu.id);
    if (idx !== -1) { patients[idx].pass = hashedNew; saveAll(); }
    document.getElementById('old-pw').value = ''; document.getElementById('new-pw').value = '';
    showToast('✅ Passwort geändert!', 'success');
}

// ── DSGVO Export ─────────────────────────────────────────────────
function downloadMyData() {
    const data = { profil: cu, termine: appts.filter(a => a.patientId === cu.id), exportiert: new Date().toISOString() };
    const b = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = `meine-daten-${cu.email}.json`; l.click();
    showToast('📦 Daten exportiert (DSGVO Art. 20)');
}

// ── Document Upload ───────────────────────────────────────────────
function handleDocUpload(inp) {
    const file = inp.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showToast('Datei zu groß (max 5MB)', 'error');
    const reader = new FileReader();
    reader.onload = e => { pendingDoc = { name: file.name, size: `${(file.size / 1024).toFixed(1)} KB`, base64: e.target.result, type: file.type }; renderDocPreview(); showToast('📎 Dokument angehängt!'); };
    reader.readAsDataURL(file);
}
function renderDocPreview() {
    const el = document.getElementById('doc-list-preview'); if (!el) return;
    if (!pendingDoc) { el.innerHTML = ''; return; }
    const icon = pendingDoc.type?.includes('pdf') ? '📕' : pendingDoc.type?.includes('image') ? '🖼️' : '📄';
    el.innerHTML = `<div class="doc-item"><span class="di-name">${icon} ${pendingDoc.name}</span><span class="di-size">${pendingDoc.size}</span><button class="btn-sm btn-cancel" onclick="pendingDoc=null;renderDocPreview()">✕</button></div>`;
}
function docDragOver(e) { e.preventDefault(); document.getElementById('doc-drop-zone')?.classList.add('dragover'); }
function docDragLeave()  { document.getElementById('doc-drop-zone')?.classList.remove('dragover'); }
function docDrop(e)      { e.preventDefault(); docDragLeave(); const f = e.dataTransfer.files[0]; if (f) handleDocUpload({ files: [f] }); }

// ── EHR ──────────────────────────────────────────────────────────
function openEHR(patientId, pName) {
    const history = appts.filter(a => a.patientId === patientId);
    document.getElementById('ehr-title').innerText = 'Akte: ' + pName;
    const list = document.getElementById('ehr-history-list');
    // Nr.17: privateNote wird NICHT angezeigt — nur note (öffentlich)
    list.innerHTML = history.map(h => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:.88rem;">
            <strong>${h.date}</strong> — ${h.reason || '—'}<br>
            <small>Status: ${h.status} | Arzt: ${h.doctorName}</small>
            ${getTypeBadge(h.apptType)}
            ${h.note   ? `<br><small style="color:var(--text-muted);">💬 ${h.note}</small>` : ''}
            ${h.rating ? `<br><span class="star-display">${'★'.repeat(h.rating)}${'☆'.repeat(5 - h.rating)}</span>` : ''}
        </div>`).join('') || '<div style="padding:10px 0;color:#aaa;">Keine Besuche.</div>';
    document.getElementById('ehr-overlay').style.display = 'block';
    document.getElementById('ehr-modal').style.display  = 'block';
}
function closeEHR() { document.getElementById('ehr-overlay').style.display = 'none'; document.getElementById('ehr-modal').style.display = 'none'; }

// ── Push-Benachrichtigungen (Nr.20) ──────────────────────────────
const PUSH_TOGGLES_KEY  = 'et2_push_toggles';
const PUSH_HISTORY_KEY  = 'et2_push_history';
const PUSH_SEEN_KEY     = 'et2_push_seen';    // последний просмотренный статус записей
let   _pushPollTimer    = null;

/** Поддерживается ли Push на этом устройстве/протоколе */
function isPushSupported() {
    return ('Notification' in window) &&
        (location.protocol === 'https:' ||
         location.hostname === 'localhost' ||
         location.hostname === '127.0.0.1');
}

/** Настройки чекбоксов из localStorage */
function getPushToggles() {
    return DB.get(PUSH_TOGGLES_KEY) || {
        onConfirm: true, onCancel: true, onReminder: true, onBook: true
    };
}
function savePushToggles() {
    DB.set(PUSH_TOGGLES_KEY, {
        onConfirm: document.getElementById('push-on-confirm')?.checked ?? true,
        onCancel:  document.getElementById('push-on-cancel')?.checked  ?? true,
        onReminder:document.getElementById('push-on-reminder')?.checked ?? true,
        onBook:    document.getElementById('push-on-book')?.checked    ?? true,
    });
}

/** Инициализация кнопки и блока настроек */
function initPushButton() {
    const btn  = document.getElementById('push-btn');
    const wrap = document.getElementById('push-settings-wrap');
    const hist = document.getElementById('push-history-wrap');
    if (!btn) return;

    if (!isPushSupported()) {
        btn.innerText = '🔔 Push (nur HTTPS verfügbar)';
        btn.classList.add('denied');
        btn.onclick = () => showToast('⚠️ Push-Benachrichtigungen erfordern HTTPS');
        return;
    }

    const perm = Notification.permission;
    if (perm === 'granted') {
        btn.classList.add('enabled');
        btn.innerText = '✅ Push aktiv — Einstellungen';
        btn.onclick = () => {
            const s = document.getElementById('push-settings-wrap');
            if (s) s.style.display = s.style.display === 'none' ? 'block' : 'none';
        };
        if (wrap) wrap.style.display = 'block';
        if (hist) hist.style.display = 'block';
        // Загружаем настройки чекбоксов
        const tog = getPushToggles();
        ['confirm','cancel','reminder','book'].forEach(k => {
            const el = document.getElementById(`push-on-${k}`);
            if (el) el.checked = tog[k === 'confirm' ? 'onConfirm'
                                    : k === 'cancel'  ? 'onCancel'
                                    : k === 'reminder'? 'onReminder'
                                    :                   'onBook'];
        });
        renderPushHistory();
        startPushPolling(); // запускаем polling
    } else if (perm === 'denied') {
        btn.classList.add('denied');
        btn.innerText = '🚫 Push blockiert (Browser-Einstellungen)';
        btn.onclick = () => showToast('Push ist blockiert. Bitte in den Browser-Einstellungen aktivieren.', 'warning');
    } else {
        btn.innerText = '🔔 Push-Benachrichtigungen aktivieren';
        btn.onclick = togglePushNotifications;
    }
}

function togglePushNotifications() {
    if (!isPushSupported()) return showToast('⚠️ Push erfordert HTTPS', 'warning');
    if (Notification.permission === 'granted') {
        showToast('🔔 Push bereits aktiv', 'success'); return;
    }
    Notification.requestPermission().then(p => {
        if (p === 'granted') {
            showToast('🔔 Push-Benachrichtigungen aktiviert!', 'success');
            initPushButton();
            // Willkommens-Notification
            sendPushNotification(
                '🏥 Einfach-Termin',
                'Push-Benachrichtigungen sind jetzt aktiv! Sie erhalten Updates zu Ihren Terminen.',
                { tag: 'welcome' }
            );
        } else {
            showToast('Push wurde abgelehnt. Bitte in Browser-Einstellungen ändern.', 'warning');
            initPushButton();
        }
    });
}

/**
 * Zeigt eine Browser-Push-Notification.
 * @param {string} title
 * @param {string} body
 * @param {object} opts  — zusätzliche Notification-Optionen
 */
function sendPushNotification(title, body, opts = {}) {
    if (Notification.permission !== 'granted') return;
    const toggles = getPushToggles();

    // Typ-Prüfung
    if (opts._type === 'confirmed' && !toggles.onConfirm)  return;
    if (opts._type === 'cancelled' && !toggles.onCancel)   return;
    if (opts._type === 'reminder'  && !toggles.onReminder) return;
    if (opts._type === 'booked'    && !toggles.onBook)     return;

    const notif = new Notification(title, {
        body,
        icon:   'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏥</text></svg>',
        badge:  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔔</text></svg>',
        tag:    opts.tag || 'et2-' + Date.now(),
        silent: false,
        ...opts
    });

    // Клик по уведомлению — фокус на вкладку
    notif.onclick = () => { window.focus(); notif.close(); };

    // Пишем в историю
    addPushHistory({ title, body, time: new Date().toLocaleString('de-DE'), type: opts._type || 'info' });
}

/** История push-уведомлений */
function addPushHistory(entry) {
    const hist = DB.arr(PUSH_HISTORY_KEY);
    hist.unshift(entry);
    if (hist.length > 20) hist.pop();
    DB.set(PUSH_HISTORY_KEY, hist);
    renderPushHistory();
}
function renderPushHistory() {
    const el = document.getElementById('push-history-list'); if (!el) return;
    const hist = DB.arr(PUSH_HISTORY_KEY);
    if (!hist.length) {
        el.innerHTML = '<div style="color:#aaa;font-size:.75rem;padding:4px 0;">Noch keine Benachrichtigungen.</div>';
        return;
    }
    const icons = { confirmed:'✅', cancelled:'❌', reminder:'🔔', booked:'📝', info:'ℹ️' };
    el.innerHTML = hist.slice(0, 6).map(h => `
        <div class="push-history-item">
            <span class="push-history-icon">${icons[h.type] || 'ℹ️'}</span>
            <div style="flex:1;">
                <div style="font-weight:700;font-size:.78rem;">${h.title}</div>
                <div style="color:var(--text-muted);font-size:.72rem;">${h.body}</div>
            </div>
            <div style="color:#aaa;font-size:.65rem;flex-shrink:0;text-align:right;">${h.time}</div>
        </div>`).join('');
}
function clearPushHistory() {
    localStorage.removeItem(PUSH_HISTORY_KEY);
    renderPushHistory();
    showToast('🗑 Verlauf gelöscht');
}

// ─── POLLING: Пациент видит изменения статуса сразу ──────────────
/**
 * Каждые 15 секунд читаем et2_appts из localStorage.
 * Если статус записи изменился — показываем Push.
 * Работает даже если пациент не перезагружал страницу.
 */
function startPushPolling() {
    if (_pushPollTimer) return; // уже запущен
    // Сохраняем текущий снимок статусов
    savePushSnapshot();
    _pushPollTimer = setInterval(checkPushUpdates, 15000); // каждые 15с
}

function savePushSnapshot() {
    if (!cu) return;
    const myAppts = DB.arr('et2_appts').filter(a => a.patientId === cu.id);
    const snapshot = {};
    myAppts.forEach(a => { snapshot[a.id] = a.status; });
    DB.set(PUSH_SEEN_KEY, snapshot);
}

function checkPushUpdates() {
    if (!cu || Notification.permission !== 'granted') return;

    const snapshot  = DB.get(PUSH_SEEN_KEY) || {};
    const freshAppts = DB.arr('et2_appts').filter(a => a.patientId === cu.id);
    let changed = false;

    freshAppts.forEach(a => {
        const oldStatus = snapshot[a.id];
        if (!oldStatus) {
            // Новая запись появилась (например из другой вкладки)
            snapshot[a.id] = a.status;
            return;
        }
        if (oldStatus === a.status) return; // без изменений

        // Статус изменился!
        changed = true;
        snapshot[a.id] = a.status;

        const dateStr = a.date + ' um ' + a.time + ' Uhr';

        if (a.status === 'confirmed' && oldStatus !== 'confirmed') {
            sendPushNotification(
                '✅ Termin bestätigt!',
                `${a.doctorName} · ${dateStr}`,
                { tag: 'confirm-' + a.id, _type: 'confirmed' }
            );
        } else if (a.status === 'cancelled' && oldStatus !== 'cancelled') {
            sendPushNotification(
                '❌ Termin abgesagt',
                `${a.doctorName} · ${dateStr} wurde abgesagt.`,
                { tag: 'cancel-' + a.id, _type: 'cancelled' }
            );
        } else if (a.status === 'waiting' && oldStatus !== 'waiting') {
            sendPushNotification(
                '🪑 Sie sind dran!',
                `Bitte kommen Sie zu ${a.doctorName}.`,
                { tag: 'waiting-' + a.id, _type: 'info' }
            );
        }
    });

    if (changed) {
        DB.set(PUSH_SEEN_KEY, snapshot);
        // Reload der Termin-Anzeige ohne Seiten-Reload
        appts    = DB.arr('et2_appts');
        patients = DB.arr('et2_patients');
        renderPatient();
    }
}

/**
 * Wird nach erfolgreicher Buchung aufgerufen (Nr.20).
 * Bestätigt dem Patienten per Push dass die Anfrage eingegangen ist.
 */
function notifyBookingReceived(appt) {
    sendPushNotification(
        '📝 Terminanfrage eingegangen',
        `${appt.doctorName} · ${appt.date} um ${appt.time} Uhr · Warten auf Bestätigung.`,
        { tag: 'booked-' + appt.id, _type: 'booked' }
    );
}

/**
 * 24h-Erinnerung — wird beim Laden geprüft (Nr.20 + Nr.21).
 * Wenn morgen ein bestätigter Termin ist → Push.
 */
function checkTomorrowReminder() {
    if (!cu || Notification.permission !== 'granted') return;
    const toggles = getPushToggles();
    if (!toggles.onReminder) return;

    const tmr    = new Date(); tmr.setDate(tmr.getDate() + 1);
    const tmrStr = tmr.toISOString().split('T')[0];
    const remKey = 'et2_reminder_sent_' + tmrStr;
    if (DB.get(remKey)) return;

    const myAppts = DB.arr('et2_appts').filter(a =>
        a.patientId === cu.id && a.date === tmrStr && a.status === 'confirmed'
    );
    if (!myAppts.length) return;

    myAppts.forEach(a => {
        sendPushNotification(
            '🔔 Termin morgen!',
            `${a.doctorName} · ${a.praxisName || ''} · ${a.time} Uhr. Nicht vergessen!`,
            { tag: 'reminder-' + a.id, _type: 'reminder' }
        );
    });

    DB.set(remKey, true);
}

// ── Reminder Center (Nr.21) ───────────────────────────────────────

const SNOOZE_KEY  = 'et2_snoozed';    // { apptId: snoozeUntilTimestamp }
let   _reminderTimer = null;

/**
 * Baut das Reminder-Center auf — zeigt alle kommenden Termine
 * der nächsten 7 Tage mit Countdown und Status.
 */
function renderReminderCenter() {
    const wrap = document.getElementById('reminder-center-wrap');
    if (!wrap || !cu) return;

    const now     = new Date();
    const todayStr= now.toISOString().split('T')[0];
    const in7days = new Date(now); in7days.setDate(now.getDate() + 7);
    const in7Str  = in7days.toISOString().split('T')[0];

    const snoozed = DB.get(SNOOZE_KEY) || {};

    // Alle eigenen Termine der nächsten 7 Tage (nicht abgesagt)
    const upcoming = appts
        .filter(a =>
            a.patientId === cu.id &&
            a.date >= todayStr &&
            a.date <= in7Str &&
            a.status !== 'cancelled'
        )
        .sort((a, b) => (a.date + a.time) > (b.date + b.time) ? 1 : -1);

    if (!upcoming.length) { wrap.innerHTML = ''; return; }

    // Snooze-cleanup: abgelaufene Snoozes entfernen
    let snoozeChanged = false;
    Object.keys(snoozed).forEach(id => {
        if (snoozed[id] < Date.now()) { delete snoozed[id]; snoozeChanged = true; }
    });
    if (snoozeChanged) DB.set(SNOOZE_KEY, snoozed);

    const items = upcoming.map(a => buildReminderItem(a, now, snoozed)).join('');

    // Ungelesen-Zähler: heute + morgen confirmed
    const urgentCount = upcoming.filter(a => {
        const diff = getDiffHours(a.date, a.time, now);
        return diff <= 24 && diff >= 0 && a.status === 'confirmed' && !snoozed[a.id];
    }).length;

    const countBadge = urgentCount > 0
        ? `<span class="reminder-badge-count">${urgentCount}</span>`
        : '';

    wrap.innerHTML = `
        <div class="reminder-center">
            <div class="reminder-center-header">
                <div class="reminder-center-title">
                    🗓 Meine Termine (7 Tage) ${countBadge}
                </div>
                <button onclick="document.getElementById('reminder-center-wrap').innerHTML=''"
                    style="background:transparent;border:none;cursor:pointer;font-size:.75rem;color:var(--text-muted);">
                    ✕
                </button>
            </div>
            ${items}
        </div>`;
}

/** Baut eine einzelne Reminder-Zeile */
function buildReminderItem(a, now, snoozed) {
    const diffH   = getDiffHours(a.date, a.time, now);
    const isSnoozed = !!snoozed[a.id];

    // Klasse und Label
    let cls = 'ri-soon', timeCls = 'rtl-primary', timeLabel = '', icon = '📋';
    if (diffH < 0) {
        cls = 'ri-done'; timeCls = 'rtl-success'; timeLabel = 'Abgeschlossen'; icon = '✅';
    } else if (diffH <= 2) {
        cls = 'ri-today'; timeCls = 'rtl-danger';
        timeLabel = diffH < 1 ? `In ${Math.round(diffH*60)} Min.` : `In ${diffH.toFixed(1)}h`;
        icon = '🚨';
    } else if (diffH <= 24) {
        cls = 'ri-tomorrow'; timeCls = 'rtl-warning';
        timeLabel = diffH <= 24 ? 'Morgen' : formatCountdown(diffH);
        icon = '🔔';
        if (diffH < 5) timeLabel = `In ${Math.round(diffH)}h`;
    } else if (diffH <= 48) {
        timeLabel = 'Übermorgen'; icon = '📅';
    } else {
        const days = Math.floor(diffH / 24);
        timeLabel = `In ${days} Tagen`; icon = '📅';
    }

    if (a.status === 'pending') { icon = '⏳'; timeCls = 'rtl-primary'; timeLabel = timeLabel || 'Ausstehend'; }
    if (isSnoozed) { cls += ' ri-done'; icon = '😴'; }

    const typeMap = { exam:'Untersuchung', consult:'Konsultation', procedure:'Behandlung', operation:'Operation' };
    const snoozeBtn = (!isSnoozed && diffH > 0 && diffH <= 48)
        ? `<button class="reminder-snooze" onclick="snoozeReminder('${a.id}',2)">😴 2h</button>
           <button class="reminder-snooze" onclick="snoozeReminder('${a.id}',24)" style="margin-left:4px;">😴 1 Tag</button>`
        : isSnoozed
        ? `<button class="reminder-snooze" onclick="unsnoozeReminder('${a.id}')">🔔 Aktivieren</button>`
        : '';

    return `<div class="reminder-item ${cls}">
        <div class="reminder-icon">${icon}</div>
        <div class="reminder-info">
            <div class="reminder-title">${a.doctorName}${a.urgent ? ' ⚠️' : ''}</div>
            <div class="reminder-meta">
                ${a.praxisName || ''} · 📅 ${a.date} · 🕐 ${a.time} Uhr<br>
                ${typeMap[a.apptType] || ''} ${a.reason ? '· ' + a.reason : ''}
            </div>
            <div style="margin-top:5px;">${snoozeBtn}</div>
        </div>
        <div class="reminder-time-badge">
            <span class="reminder-time-label ${timeCls}">${timeLabel || formatCountdown(diffH)}</span>
            <div style="font-size:.64rem;color:#aaa;margin-top:4px;">${a.status === 'confirmed' ? '✅ Best.' : '⏳ Ausst.'}</div>
        </div>
    </div>`;
}

/** Разница в часах между appt и сейчас */
function getDiffHours(date, time, now) {
    const apptTime = new Date(`${date}T${time}:00`);
    return (apptTime - now) / 3600000;
}

function formatCountdown(hours) {
    if (hours <= 0) return 'Vorbei';
    if (hours < 1)  return `${Math.round(hours * 60)} Min.`;
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${Math.floor(hours / 24)}d`;
}

/** Snooze: Erinnerung X Stunden ausblenden */
function snoozeReminder(apptId, hours) {
    const snoozed = DB.get(SNOOZE_KEY) || {};
    snoozed[apptId] = Date.now() + hours * 3600000;
    DB.set(SNOOZE_KEY, snoozed);
    renderReminderCenter();
    showToast(`😴 Erinnerung für ${hours}h ausgeblendet`);
}

function unsnoozeReminder(apptId) {
    const snoozed = DB.get(SNOOZE_KEY) || {};
    delete snoozed[apptId];
    DB.set(SNOOZE_KEY, snoozed);
    renderReminderCenter();
    showToast('🔔 Erinnerung wieder aktiv');
}

/**
 * Auto-Timer: Aktualisiert den Reminder Center jede Minute
 * und prüft ob eine Push-Notification fällig ist.
 * Löst aus bei: 24h, 2h, 30min vor dem Termin.
 */
function startReminderAutoTimer() {
    if (_reminderTimer) return;

    // Sofort einmal prüfen
    runReminderAutoCheck();

    // Dann jede Minute
    _reminderTimer = setInterval(runReminderAutoCheck, 60000);
}

function runReminderAutoCheck() {
    if (!cu) return;

    const now     = new Date();
    const todayStr= now.toISOString().split('T')[0];
    const tmr     = new Date(now); tmr.setDate(now.getDate() + 1);
    const tmrStr  = tmr.toISOString().split('T')[0];

    // Reminder Center neu rendern (Countdown aktualisieren)
    renderReminderCenter();

    // Push-Prüfung — nur wenn Notifications aktiv
    if (Notification.permission !== 'granted') return;
    const toggles = getPushToggles();
    if (!toggles.onReminder) return;

    const snoozed = DB.get(SNOOZE_KEY) || {};
    const myAppts = DB.arr('et2_appts').filter(a =>
        a.patientId === cu.id &&
        a.status === 'confirmed' &&
        (a.date === todayStr || a.date === tmrStr)
    );

    myAppts.forEach(a => {
        if (snoozed[a.id]) return; // gesnoozed — überspringen

        const diffH   = getDiffHours(a.date, a.time, now);
        const sentKey = `et2_push_sent_${a.id}`;
        const sent    = DB.get(sentKey) || {};

        // Trigger bei 24h, 2h, 30min (jeweils ±2 Minuten Toleranz)
        const triggers = [
            { hours: 24,   key: 'h24', label: '🔔 Termin morgen!',         body: `${a.doctorName} · ${a.time} Uhr morgen früh.` },
            { hours: 2,    key: 'h2',  label: '⏰ Termin in 2 Stunden!',   body: `${a.doctorName} · ${a.time} Uhr · Bitte rechtzeitig aufbrechen!` },
            { hours: 0.5,  key: 'm30', label: '🚨 Termin in 30 Minuten!',  body: `${a.doctorName} · ${a.time} Uhr · Sind Sie schon auf dem Weg?` },
        ];

        triggers.forEach(tr => {
            const diff = diffH - tr.hours;
            if (diff >= 0 && diff < (2/60) && !sent[tr.key]) {
                // Genau im Fenster — Push senden
                sendPushNotification(tr.label, tr.body, {
                    tag: `auto-${a.id}-${tr.key}`,
                    _type: 'reminder',
                    requireInteraction: tr.hours <= 0.5 // 30min bleibt sichtbar
                });
                sent[tr.key] = true;
                DB.set(sentKey, sent);
            }
        });
    });
}

// ── ЗАДАЧА 30: Praxis-Direktlink Hilfsfunktionen ─────────────────────────────

/**
 * Liest den Praxis-Slug aus der aktuellen URL.
 * Unterstützte Formate:
 *   ?praxis=slug   →  expliziter Parameter
 *   ?p=slug        →  Kurzform
 *   #slug          →  Hash-basiert
 *   /slug          →  Pfad (wenn via .htaccess → index.html?praxis=slug umgeleitet)
 *
 * @returns {object|null} — Praxis-Objekt oder null
 */
function _resolveDirectPraxisSlug() {
    const params = new URLSearchParams(window.location.search);
    const hash   = window.location.hash.replace('#', '').trim();

    // Priorität: ?praxis= → ?p= → #hash
    const slug = params.get('praxis') || params.get('p') || (hash && !hash.includes('=') ? hash : null);
    if (!slug) return null;

    // Slug normalisieren
    const normalized = slug.toLowerCase().trim();

    // Exakter Slug-Match
    let found = praxen.find(p => p.slug === normalized);
    if (!found) {
        // Fallback: Teil-Match im Namen oder Stadt
        found = praxen.find(p =>
            (p.slug || '').includes(normalized) ||
            normalized.includes((p.slug || '').split('-')[0])
        );
    }

    return found || null;
}

/**
 * Bereinigt die URL nach dem Lesen des Slugs
 * (ersetzt ?praxis=xxx durch ?praxis=xxx ohne weitere Parameter — sauber für Sharing)
 */
function _cleanDirectUrl(slug) {
    if (!slug || !window.history?.replaceState) return;
    const cleanUrl = window.location.pathname + '?praxis=' + encodeURIComponent(slug);
    window.history.replaceState({ praxis: slug }, '', cleanUrl);
}

/**
 * Zeigt eine Praxis-Landing-Seite für nicht eingeloggte Patienten.
 * Erscheint als Modal über der Welcome-Seite mit Praxis-Info + CTA zum Einloggen/Registrieren.
 */
function _showPraxisLanding(praxis) {
    const existing = document.getElementById('praxis-landing-modal');
    if (existing) existing.remove();

    const myDocs = doctors.filter(d => d.praxisId === praxis.id && d.status === 'active');
    const specs  = [...new Set(myDocs.map(d => d.spec))].join(', ') || '—';
    const rating = (() => {
        const rated = appts.filter(a => a.praxisId === praxis.id && a.rating > 0);
        if (!rated.length) return null;
        return (rated.reduce((s,a) => s+a.rating, 0) / rated.length).toFixed(1);
    })();
    const apptCount = appts.filter(a => a.praxisId === praxis.id && a.status === 'confirmed').length;

    const html = `
    <div id="praxis-landing-modal" style="position:fixed;inset:0;background:rgba(44,27,105,.6);backdrop-filter:blur(8px);z-index:8000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)closePraxisLanding()">
        <div class="praxis-landing-box">

            <!-- Шапка с логотипом -->
            <div class="pl-header">
                <div class="pl-logo">${praxis.logo || '🏥'}</div>
                <div>
                    <div class="pl-name">${praxis.name}</div>
                    <div class="pl-city">📍 ${praxis.address || praxis.city}</div>
                </div>
                <button onclick="closePraxisLanding()" class="pl-close">✕</button>
            </div>

            <!-- Метрики -->
            <div class="pl-stats">
                <div class="pl-stat">
                    <div class="pl-stat-num">${myDocs.length}</div>
                    <div class="pl-stat-lbl">Ärzte</div>
                </div>
                ${rating ? `<div class="pl-stat">
                    <div class="pl-stat-num">${rating} ⭐</div>
                    <div class="pl-stat-lbl">Bewertung</div>
                </div>` : ''}
                <div class="pl-stat">
                    <div class="pl-stat-num">${apptCount}</div>
                    <div class="pl-stat-lbl">Termine</div>
                </div>
                ${praxis.phone ? `<div class="pl-stat">
                    <div class="pl-stat-num" style="font-size:.85rem;">${praxis.phone}</div>
                    <div class="pl-stat-lbl">Telefon</div>
                </div>` : ''}
            </div>

            <!-- Специализации -->
            <div style="padding:14px 20px;border-bottom:1px solid var(--border);">
                <div style="font-size:.75rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">🩺 Fachgebiete</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                    ${myDocs.map(d => `<span class="pl-spec-tag" style="background:${d.color}22;color:${d.color};border:1px solid ${d.color}44;">${d.spec}</span>`).join('')}
                </div>
            </div>

            <!-- Врачи -->
            ${myDocs.length ? `<div style="padding:14px 20px;border-bottom:1px solid var(--border);">
                <div style="font-size:.75rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">👨‍⚕️ Unser Team</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${myDocs.slice(0,4).map(d => `
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:32px;height:32px;border-radius:50%;background:${d.color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.78rem;flex-shrink:0;">${initials(d.name)}</div>
                        <div>
                            <div style="font-size:.85rem;font-weight:700;">${d.name}</div>
                            <div style="font-size:.72rem;color:var(--text-muted);">${d.spec} · ${d.slotDuration} Min. Slots</div>
                        </div>
                    </div>`).join('')}
                    ${myDocs.length > 4 ? `<div style="font-size:.72rem;color:var(--text-muted);">+${myDocs.length-4} weitere…</div>` : ''}
                </div>
            </div>` : ''}

            <!-- CTA кнопки -->
            <div class="pl-actions">
                <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:12px;text-align:center;">
                    Melden Sie sich an, um direkt einen Termin zu buchen.
                </div>
                <button class="btn btn-main" style="margin-bottom:8px;" onclick="closePraxisLanding();showPage('page-login');">
                    🔐 Anmelden & Termin buchen
                </button>
                <button class="btn btn-outline" onclick="closePraxisLanding();showPage('page-register');">
                    ✨ Neu registrieren
                </button>
                <button class="pl-guest-btn" onclick="closePraxisLandingKeepPraxis()">
                    Ohne Konto fortfahren →
                </button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
}

function closePraxisLanding() {
    document.getElementById('praxis-landing-modal')?.remove();
    selPraxis = null;
    _cleanDirectUrl('');
    window.history.replaceState({}, '', window.location.pathname);
}

function closePraxisLandingKeepPraxis() {
    // Schließt nur das Modal — Praxis bleibt vorausgewählt
    document.getElementById('praxis-landing-modal')?.remove();
    // Zur Praxisliste scrollen und Praxis markieren
    showPage('page-welcome');
    setTimeout(() => {
        const el = document.querySelector('.praxis-card.selected') ||
                   document.getElementById('praxen-list');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
}

// ── INIT ─────────────────────────────────────────────────────────
(async function init() {
    await seedDemo(); // async — Passwörter werden gehasht
    praxen   = DB.arr('et2_praxen');
    doctors  = DB.arr('et2_doctors');
    patients = DB.arr('et2_patients');
    appts    = DB.arr('et2_appts');
    cu       = DB.get('et2_sess');

    applyLang();

    // ── ЗАДАЧА 30: Praxis-Direktlink ──────────────────────────────
    // Unterstützte Formate:
    //   index.html?praxis=petersen-niebull
    //   index.html?p=petersen-niebull
    //   index.html#petersen-niebull
    //   (Redirect von /petersen-niebull via .htaccess / Netlify _redirects)
    const _directPraxis = _resolveDirectPraxisSlug();
    if (_directPraxis) {
        // Slug gefunden → Praxis vorab auswählen
        selPraxis = _directPraxis;
        // URL sauber halten (ohne Parameter-Müll)
        _cleanDirectUrl(_directPraxis.slug);
    }
    // ─────────────────────────────────────────────────────────────

    const nav = document.getElementById('nav-info');
    if (cu && cu.role === 'patient') {
        if (nav) nav.innerHTML = `<div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:.83rem;color:var(--text-muted);">${cu.name}</span>
            <button class="btn btn-outline" style="padding:6px 13px;width:auto;margin:0;" onclick="logout()">Abmelden</button>
        </div>`;
        showPage('panel-patient');
        skeletons('p-upcoming'); skeletons('p-past');
        setTimeout(() => {
            renderPatient();
            // Wenn Direktlink → sofort zur Buchung scrollen
            if (_directPraxis) {
                setTimeout(() => {
                    const bookEl = document.getElementById('booking-section');
                    if (bookEl) bookEl.scrollIntoView({ behavior: 'smooth' });
                    selectPraxis(_directPraxis.id);
                }, 600);
            }
        }, 500);
        setTimeout(() => {
            initPushButton();
            checkTomorrowReminder();
            startReminderAutoTimer();
        }, 1000);
    } else {
        if (_directPraxis) {
            // Nicht eingeloggt + Direktlink → Praxis-Landing zeigen
            showPage('page-welcome');
            setTimeout(() => _showPraxisLanding(_directPraxis), 300);
        } else {
            showPage('page-welcome');
        }
    }
})();


// ── ЗАДАЧА 19: Живая очередь (waiting_queue) ─────────────────────────────────
function showQueueModal(praxis, doctor, date, time, type, reason) {
    var existing = document.getElementById('queue-modal-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id  = 'queue-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';

    overlay.innerHTML =
        '<div style="background:var(--card);border-radius:var(--r);max-width:420px;width:100%;padding:28px 24px;box-shadow:0 24px 80px rgba(44,27,105,.3);text-align:center;">' +
            '<div style="font-size:2.5rem;margin-bottom:10px;">🪑</div>' +
            '<h3 style="font-family:\'Fraunces\',serif;margin:0 0 8px;color:var(--text);">Live-Warteschlange</h3>' +
            '<p style="font-size:.85rem;color:var(--text-muted);line-height:1.6;margin-bottom:16px;">' +
                'Für <strong>' + time + ' Uhr</strong> bei <strong>' + doctor.name + '</strong> sind aktuell keine Online-Slots mehr frei.<br>' +
                'Möchten Sie sich in die Warteschlange eintragen?' +
            '</p>' +
            '<div style="background:var(--primary-light);border-radius:var(--r-sm);padding:12px 14px;margin-bottom:20px;font-size:.8rem;color:var(--text-muted);text-align:left;">' +
                '✅ Sie werden sofort benachrichtigt wenn ein Platz frei wird<br>' +
                '⏰ Ihre Position bleibt für 30 Minuten reserviert<br>' +
                '📧 Bestätigung per E-Mail' +
            '</div>' +
            '<div style="display:flex;gap:10px;justify-content:center;">' +
                '<button onclick="document.getElementById(\'queue-modal-overlay\').remove()" style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px 20px;cursor:pointer;font-family:\'DM Sans\',sans-serif;font-size:.85rem;">Abbrechen</button>' +
                '<button id="queue-confirm-btn" style="background:var(--primary);color:#fff;border:none;border-radius:10px;padding:10px 24px;cursor:pointer;font-family:\'DM Sans\',sans-serif;font-weight:700;font-size:.85rem;">🪑 In Warteschlange</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    document.getElementById('queue-confirm-btn').onclick = function() {
        overlay.remove();
        confirmQueueBooking(praxis, doctor, date, time, type, reason);
    };
}

function confirmQueueBooking(praxis, doctor, date, time, type, reason) {
    const queueAppt = {
        id: generateID(),
        patientId: cu.id, patientName: cu.name, patientEmail: cu.email,
        doctorId: doctor.id, doctorName: doctor.name,
        praxisId: praxis.id, praxisName: praxis.name,
        date, time, status: 'waiting_queue',
        apptType: type, reason, note: '', rating: null, urgent: false, docs: [],
        createdAt: new Date().toISOString(),
        queuedAt:  new Date().toISOString()
    };
    appts.push(queueAppt);
    saveAll();
    // ── ЗАДАЧА 22: Deep Audit — лимит-отказ ──────────────────────────────────
    writeAudit(
        '🪑 LIMIT-ABLEHNUNG: ' + cu.name + ' → Warteschlange bei ' + doctor.name +
        ' am ' + date + ' um ' + time + ' (' + (praxis.maxOnlineSlotsPerHour || 10) + '/Std-Limit erreicht)',
        praxis.id,
        {
            category: 'limit',
            severity:  'warn',
            meta: {
                patientName:  cu.name,
                patientEmail: cu.email,
                doctorName:   doctor.name,
                date,
                time,
                limitValue:   praxis.maxOnlineSlotsPerHour || 10,
                apptType:     type
            }
        }
    );
    showToast('🪑 In Warteschlange eingetragen! Sie werden benachrichtigt.', 'success');
    selSlot = '';
    renderPatient();
}

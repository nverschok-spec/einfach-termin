// ================================================================
//  EINFACH-TERMIN — shared.js  (Lavender Edition v2.1)
//  Gemeinsames Kern-Modul für index.html und admin.html
//
//  Enthält:
//    - DB-Layer (localStorage)
//    - Live-Datenarrays (praxen, doctors, patients, appts)
//    - saveAll() / generateID()
//    - seedDemo()
//    - generateSlots()
//    - Gemeinsame UI-Helfer (showToast, statusBadge, getTypeBadge, …)
//    - Dark-Mode, GDPR
//    - SoundUX
//    - writeAudit()
// ================================================================

'use strict';

/* ──────────────────────────────────────────────────────────────
   1.  DB-LAYER
   ────────────────────────────────────────────────────────────── */
const DB = {
    arr: (key) => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
    get: (key) => { try { return JSON.parse(localStorage.getItem(key)); }      catch { return null; } },
    set: (key, val) => localStorage.setItem(key, JSON.stringify(val))
};

/* ──────────────────────────────────────────────────────────────
   2.  LIVE-DATENARRAYS  (werden von beiden HTML-Dateien genutzt)
   ────────────────────────────────────────────────────────────── */
let praxen   = DB.arr('et2_praxen');
let doctors  = DB.arr('et2_doctors');
let patients = DB.arr('et2_patients');
let appts    = DB.arr('et2_appts');

/* ──────────────────────────────────────────────────────────────
   3.  SPEICHERN & ID
   ────────────────────────────────────────────────────────────── */

/**
 * Prüft wie viel localStorage noch frei ist.
 * Gibt { usedKB, totalKB, freeKB, pct } zurück.
 * Browser-Limit ist ca. 5MB pro Domain.
 */
function getStorageUsage() {
    let used = 0;
    for (const key in localStorage) {
        if (!localStorage.hasOwnProperty(key)) continue;
        used += (localStorage.getItem(key) || '').length * 2; // UTF-16: 2 bytes pro Zeichen
    }
    const totalBytes = 5 * 1024 * 1024; // 5MB Standardlimit
    return {
        usedKB:  Math.round(used / 1024),
        totalKB: Math.round(totalBytes / 1024),
        freeKB:  Math.round((totalBytes - used) / 1024),
        pct:     Math.round(used / totalBytes * 100)
    };
}

/**
 * Speichert alle Arrays in localStorage.
 * Prüft VOR dem Speichern ob genug Platz vorhanden ist.
 * Bei > 85% Auslastung → Warnung.
 * Bei > 95% Auslastung → Speichern abbrechen + Fehlermeldung.
 *
 * @returns {boolean} true wenn erfolgreich, false wenn abgebrochen
 */
function saveAll() {
    // ── Quota-Prüfung ─────────────────────────────────────────
    const usage = getStorageUsage();

    if (usage.pct >= 95) {
        // Kritisch: Speichern stoppen
        showToast(
            `🚨 Speicher fast voll (${usage.pct}% belegt, ${usage.freeKB} KB frei). ` +
            `Bitte alte Termine oder Dokumente löschen!`,
            'error'
        );
        console.error('[saveAll] Abgebrochen — localStorage zu voll:', usage);
        return false;
    }

    if (usage.pct >= 85) {
        // Warnung: Speichern erlaubt, aber User informieren
        showToast(
            `⚠️ Speicher zu ${usage.pct}% voll (${usage.freeKB} KB frei). ` +
            `Bald aufräumen!`,
            'warning'
        );
    }

    // ── Tatsächlich speichern ─────────────────────────────────
    try {
        DB.set('et2_praxen',   praxen);
        DB.set('et2_doctors',  doctors);
        DB.set('et2_patients', patients);
        DB.set('et2_appts',    appts);
        return true;
    } catch (e) {
        // QuotaExceededError — Browser hat das Speichern verweigert
        showToast(
            '🚨 Speicher voll! Daten konnten nicht gespeichert werden. ' +
            'Bitte Dokumente oder alte Einträge entfernen.',
            'error'
        );
        console.error('[saveAll] QuotaExceededError:', e);
        return false;
    }
}

const generateID = () =>
    crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// Alias für Rückwärtskompatibilität
const uid = generateID;

/* ──────────────────────────────────────────────────────────────
   3b. PASSWORT-HASHING  (SHA-256 via Web Crypto API)
   ────────────────────────────────────────────────────────────── */
/**
 * Gibt den SHA-256-Hash des Passworts als Hex-String zurück.
 * Wird bei Registrierung und Login verwendet.
 * Niemals das Klartext-Passwort in localStorage speichern!
 *
 * @param  {string} pw  — Klartext-Passwort
 * @returns {Promise<string>} — Hex-Hash z.B. "a3f2c1..."
 */
async function hashPassword(pw) {
    const buf  = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(pw)
    );
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Prüft ob ein Passwort mit einem gespeicherten Hash übereinstimmt.
 * Gibt true/false zurück (Promise).
 *
 * @param  {string} pw    — Eingegebenes Klartext-Passwort
 * @param  {string} hash  — Gespeicherter SHA-256-Hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(pw, hash) {
    // Legacy-Unterstützung: Falls der gespeicherte Wert noch kein Hash ist
    // (z.B. alte Demo-Daten), direkt vergleichen und dann migrieren
    if (hash && hash.length < 60) return pw === hash;
    const h = await hashPassword(pw);
    return h === hash;
}

/* ──────────────────────────────────────────────────────────────
   4.  DEMO-DATEN  (nur einmalig, wenn DB leer)
   ────────────────────────────────────────────────────────────── */
async function seedDemo() {
    if (praxen.length && doctors.length) return;

    const p1 = generateID(), p2 = generateID(), p3 = generateID();

    // Demo-Passwort hashen (einmalig beim ersten Start)
    const demoHash = await hashPassword('demo123');

    praxen = [
        { id: p1, name: 'Praxis am Sonnenplatz',  slug: 'praxis-sonnenplatz',  city: 'Berlin',  address: 'Sonnenallee 42, 12045 Berlin',          phone: '+49 30 1234567', email: 'sonne@demo.de',    pass: demoHash, logo: '🌞', region: 'ost'  },
        { id: p2, name: 'Medizin Zentrum Nord',    slug: 'mz-nord',             city: 'Hamburg', address: 'Alsterstraße 8, 20099 Hamburg',          phone: '+49 40 9876543', email: 'nord@demo.de',     pass: demoHash, logo: '🏥', region: 'nord' },
        { id: p3, name: 'Lavender Klinik',         slug: 'lavender-klinik',     city: 'München', address: 'Maximilianstr. 12, 80539 München',       phone: '+49 89 3456789', email: 'lavender@demo.de', pass: demoHash, logo: '💜', region: 'sued' },
    ];

    doctors = [
        { id: generateID(), praxisId: p1, name: 'Dr. med. Anna Hoffmann', spec: 'Allgemeinmedizin', status: 'active', slotDuration: 15, breakStart: '13:00', breakEnd: '14:00', color: '#7c5cbf' },
        { id: generateID(), praxisId: p1, name: 'Dr. Thomas Klein',        spec: 'Kardiologie',      status: 'active', slotDuration: 30, breakStart: '12:00', breakEnd: '13:00', color: '#27ae60' },
        { id: generateID(), praxisId: p2, name: 'Dr. Elena Müller',        spec: 'Dermatologie',     status: 'active', slotDuration: 15, breakStart: '12:30', breakEnd: '13:30', color: '#c0392b' },
        { id: generateID(), praxisId: p2, name: 'Dr. Kai Bauer',           spec: 'Orthopädie',       status: 'urlaub', slotDuration: 30, breakStart: '13:00', breakEnd: '14:00', color: '#2060a0' },
        { id: generateID(), praxisId: p3, name: 'Dr. Sophie Weber',        spec: 'Psychologie',      status: 'active', slotDuration: 50, breakStart: '13:00', breakEnd: '14:00', color: '#967BB6' },
        { id: generateID(), praxisId: p3, name: 'Dr. Max Schulz',          spec: 'Zahnarzt',         status: 'active', slotDuration: 20, breakStart: '12:00', breakEnd: '13:00', color: '#e67e22' },
    ];

    saveAll();
}

/* ──────────────────────────────────────────────────────────────
   5.  SLOT-GENERIERUNG  (dynamisch, mit harten Pausen)
   ────────────────────────────────────────────────────────────── */
/**
 * Gibt ein Array von { time: 'HH:MM', isBreak: bool, isPast: bool } zurück.
 * Schritt  = doctor.slotDuration  (dynamisch)
 * Pause    = doctor.breakStart … breakEnd  (hart gesperrt)
 * isPast   = true wenn das Datum heute ist UND die Uhrzeit bereits vergangen ist
 *            → wird im UI als gesperrter Slot dargestellt (wie "taken")
 *
 * @param {object} doctor   — Arzt-Objekt
 * @param {string} date     — Datum im Format 'YYYY-MM-DD' (optional)
 *                            Wenn übergeben und == heute → vergangene Slots sperren
 */
function generateSlots(doctor, date) {
    const dur = parseInt(doctor.slotDuration) || 15;
    const slots = [];

    // ── Pause berechnen ────────────────────────────────────────
    const bsStr = doctor.breakStart || '';
    const beStr = doctor.breakEnd   || '';
    const [bsh = 0, bsm = 0] = bsStr.includes(':') ? bsStr.split(':').map(Number) : [];
    const [beh = 0, bem = 0] = beStr.includes(':') ? beStr.split(':').map(Number) : [];
    const breakStartMin = bsStr.includes(':') ? bsh * 60 + bsm : -1;
    const breakEndMin   = beStr.includes(':') ? beh * 60 + bem : -1;

    // ── Prüfen ob das gewählte Datum heute ist ─────────────────
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday  = date === todayStr;

    // ── Aktuelle Uhrzeit in Minuten (nur relevant wenn heute) ──
    const now        = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // ── Slots generieren ───────────────────────────────────────
    for (let h = 8; h < 18; h++) {
        for (let m = 0; m < 60; m += dur) {
            const totalMin = h * 60 + m;
            if (totalMin >= 18 * 60) break;

            const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

            const isBreak = breakStartMin >= 0 && breakEndMin > breakStartMin
                && totalMin >= breakStartMin
                && totalMin <  breakEndMin;

            // Slot ist vergangen wenn: Datum = heute UND Uhrzeit <= jetzt
            // Wir sperren auch den aktuellen Slot (z.B. 14:00 wenn es 14:05 ist)
            const isPast = isToday && totalMin <= nowMinutes;

            // Slot ist im Puffer wenn: Datum = heute UND Slot ist weniger als 2h entfernt
            // (aber nicht schon vergangen — das wird separat behandelt)
            const isBuffer = isToday && !isPast && (totalMin - nowMinutes) < 120;

            slots.push({ time: t, isBreak, isPast, isBuffer });
        }
    }
    return slots;
}

/* ──────────────────────────────────────────────────────────────
   6.  GEMEINSAME UI-HELFER
   ────────────────────────────────────────────────────────────── */

/** Initialen aus vollem Namen */
function initials(name) {
    return (name || '').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
}

/** Toast-Nachricht (unten rechts) */
function showToast(text, type = '') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' t-' + type : '');
    t.innerText = text;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3100);
}

/** Status-Badge HTML */
function statusBadge(s) {
    if (s === 'confirmed') return '<span class="badge b-confirmed">✓ Bestätigt</span>';
    if (s === 'cancelled') return '<span class="badge b-cancelled">✗ Abgesagt</span>';
    return '<span class="badge b-pending">⏳ Ausstehend</span>';
}

/** Termintyp-Badge HTML */
function getTypeBadge(type) {
    const map = {
        exam:      '🔵 Untersuchung',
        consult:   '🟣 Konsultation',
        procedure: '🟤 Behandlung',
        operation: '⚫ Operation'
    };
    return `<span class="type-badge type-${type || 'exam'}">${map[type] || '🔵 Untersuchung'}</span>`;
}

/** CSS-Klasse für Termintyp (Seitenstreifen) */
function getTypeClass(type) {
    return 'appt-type-' + (type || 'exam');
}

/** Durchschnittsbewertung für einen Arzt */
function getAvgRating(doctorId) {
    const rated = appts.filter(a => a.doctorId === doctorId && a.rating);
    if (!rated.length) return null;
    return Math.round(rated.reduce((s, a) => s + a.rating, 0) / rated.length * 10) / 10;
}

/** Skeleton-Loader in ein Element einfügen */
function skeletons(id, count = 3) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<div class="skeleton" style="height:64px;margin-bottom:10px;"></div>`.repeat(count);
}

/** Prüfen ob Stornierung möglich (> 24h vor Termin) */
function canCancel(dateStr) {
    return (new Date(dateStr) - new Date()) / (1000 * 60 * 60) >= 24;
}

/** Link in Zwischenablage kopieren */
function copyLink(link) {
    const txt = `https://${link}`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(() => showToast('🔗 Link kopiert!', 'success'));
    } else {
        showToast('🔗 ' + txt);
    }
}

/* ──────────────────────────────────────────────────────────────
   7.  PASSWORT-STÄRKE
   ────────────────────────────────────────────────────────────── */
function checkPwStrength(pw, barId) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    let score = 0;
    if (pw.length >= 8)          score++;
    if (/[A-Z]/.test(pw))        score++;
    if (/[0-9]/.test(pw))        score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const colors = ['#ddd', '#e74c3c', '#f39c12', '#27ae60', '#1a7a3f'];
    const widths  = ['0%',  '25%',     '50%',     '75%',     '100%'];
    bar.style.width      = widths[score];
    bar.style.background = colors[score];
}

/* ──────────────────────────────────────────────────────────────
   8.  DARK-MODE
   ────────────────────────────────────────────────────────────── */
function toggleDark() {
    const isDark = document.body.classList.toggle('dark-mode');
    DB.set('et2_dark', isDark);
}
// Beim Laden sofort anwenden
if (DB.get('et2_dark')) document.body.classList.add('dark-mode');

/* ──────────────────────────────────────────────────────────────
   9.  GDPR
   ────────────────────────────────────────────────────────────── */
function acceptGDPR() {
    DB.set('et2_gdpr', 'yes');
    const el = document.getElementById('gdpr-box');
    if (el) el.style.display = 'none';
}

function openDsgvo() {
    const el = document.getElementById('dsgvo-modal');
    if (el) el.classList.add('open');
}

function closeDsgvo() {
    const el = document.getElementById('dsgvo-modal');
    if (el) el.classList.remove('open');
}

// Cookie-Banner anzeigen falls noch nicht akzeptiert
window.addEventListener('DOMContentLoaded', () => {
    if (DB.get('et2_gdpr') !== 'yes') {
        const el = document.getElementById('gdpr-box');
        if (el) el.style.display = 'block';
    }
});

/* ──────────────────────────────────────────────────────────────
   10.  AUDIT-LOG
   ────────────────────────────────────────────────────────────── */
function writeAudit(msg) {
    const log = DB.arr('et2_audit');
    const now = new Date();
    log.unshift({
        time: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
             + ' ' + now.toLocaleDateString('de-DE'),
        message: msg
    });
    if (log.length > 80) log.pop();
    DB.set('et2_audit', log);
}

/* ──────────────────────────────────────────────────────────────
   11.  SOUND UX
   ────────────────────────────────────────────────────────────── */
const SoundUX = {
    _ctx: null,
    _get() {
        if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        return this._ctx;
    },
    _play(freq, dur, type = 'sine') {
        try {
            const c = this._get(), o = c.createOscillator(), g = c.createGain();
            o.connect(g); g.connect(c.destination);
            o.frequency.value = freq; o.type = type;
            g.gain.setValueAtTime(0.15, c.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
            o.start(); o.stop(c.currentTime + dur);
        } catch (e) { /* AudioContext blocked – silent fail */ }
    },
    success()   { this._play(520, .15); setTimeout(() => this._play(680, .15), 150); },
    confirm()   { this._play(440, .10); setTimeout(() => this._play(550, .10), 110); setTimeout(() => this._play(660, .15), 220); },
    cancel()    { this._play(300, .20, 'sawtooth'); },
    emergency() { [0, 100, 200, 300, 400].forEach(d => setTimeout(() => this._play(880, .08, 'square'), d)); }
};

/* ──────────────────────────────────────────────────────────────
   12.  SPRACHE (i18n-Basis)
   ────────────────────────────────────────────────────────────── */
const LANG = {
    de: { welcome: 'Willkommen bei Einfach-Termin', sub: 'Ihre Gesundheitstermine — sicher und einfach.', login: 'Einloggen', register: 'Noch kein Konto? Registrieren →' },
    ru: { welcome: 'Добро пожаловать в Einfach-Termin', sub: 'Ваши медицинские записи — безопасно и просто.', login: 'Войти', register: 'Нет аккаунта? Зарегистрироваться →' },
    en: { welcome: 'Welcome to Einfach-Termin', sub: 'Your medical appointments — safe and easy.', login: 'Log in', register: 'No account? Register →' },
    tr: { welcome: "Einfach-Termin'e Hoş Geldiniz", sub: 'Sağlık randevularınız — güvenli ve kolay.', login: 'Giriş Yap', register: 'Hesap yok mu? Kayıt Ol →' }
};

let curLang = DB.get('et2_lang') || 'de';

function applyLang() {
    const L = LANG[curLang] || LANG.de;
    const s = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
    s('txt-welcome',      L.welcome);
    s('txt-sub',          L.sub);
    s('txt-btn-login',    L.login);
    s('txt-btn-register', L.register);
    const ls = document.getElementById('lang-select');
    if (ls) ls.value = curLang;
}

function switchLang(l) {
    curLang = l;
    DB.set('et2_lang', l);
    applyLang();
}

/* ──────────────────────────────────────────────────────────────
   13.  WOCHENTAGS-CHART  (geteilt von Patient & Admin)
   ────────────────────────────────────────────────────────────── */
function renderWeekChart(list, prefix) {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    list.forEach(a => {
        if (a.date) { const d = new Date(a.date); counts[d.getDay()]++; }
    });
    const max = Math.max(...counts, 1);
    const peakIdx = counts.indexOf(Math.max(...counts));
    [0, 1, 2, 3, 4, 5, 6].forEach(i => {
        const bar = document.getElementById(prefix + i); if (!bar) return;
        bar.style.height = Math.max(4, Math.round(counts[i] / max * 56)) + 'px';
        bar.classList.toggle('peak', counts[i] > 0 && i === peakIdx);
        const col = bar.parentElement;
        const oldLbl = col?.querySelector('.week-bar-peak-lbl');
        if (counts[i] > 0 && i === peakIdx && !oldLbl) {
            const l = document.createElement('div'); l.className = 'week-bar-peak-lbl'; l.innerText = '★'; col.appendChild(l);
        } else if ((counts[i] === 0 || i !== peakIdx) && oldLbl) {
            oldLbl.remove();
        }
    });
}

function renderExtraStats(list, elId) {
    const el = document.getElementById(elId); if (!el) return;
    const total = list.length;
    const conf  = list.filter(a => a.status === 'confirmed').length;
    const canc  = list.filter(a => a.status === 'cancelled').length;
    const cp = total ? Math.round(conf / total * 100) : 0;
    const kp = total ? Math.round(canc / total * 100) : 0;
    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:5px;">
        <div>✅ Bestätigungsrate: <strong>${cp}%</strong></div>
        <div>❌ Absagerate: <strong>${kp}%</strong></div>
        <div>📋 Gesamt: <strong>${total}</strong></div>
    </div>`;
}

/* ──────────────────────────────────────────────────────────────
   14.  SEITEN-NAVIGATION  (SPA-Helfer)
   ────────────────────────────────────────────────────────────── */
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

/* ──────────────────────────────────────────────────────────────
   15.  TICKET-DRUCK  (geteilt)
   ────────────────────────────────────────────────────────────── */
function qrAscii(id) {
    const p = ['█','▓','▒','░','■','□','▪','▫','◆','◇'];
    let o = '';
    for (let i = 0; i < 9; i++) {
        o += p[id.charCodeAt(i % id.length) % p.length];
        if ((i + 1) % 3 === 0 && i < 8) o += '<br>';
    }
    return o;
}

function printTicket(a) {
    const tc = document.getElementById('ticket-content'); if (!tc) return;
    tc.innerHTML = `
        <div class="t-header"><div class="t-logo">Einfach-Termin</div><div style="margin-top:6px;font-size:.9rem;">Terminbestätigung</div></div>
        <div class="t-row"><span class="t-label">Patient</span><span class="t-val">${a.patientName}</span></div>
        <div class="t-row"><span class="t-label">Arzt</span><span class="t-val">${a.doctorName}</span></div>
        <div class="t-row"><span class="t-label">Praxis</span><span class="t-val">${a.praxisName || '—'}</span></div>
        <div class="t-row"><span class="t-label">Datum</span><span class="t-val">${a.date}</span></div>
        <div class="t-row"><span class="t-label">Uhrzeit</span><span class="t-val">${a.time} Uhr</span></div>
        <div class="t-row"><span class="t-label">Typ</span><span class="t-val">${a.apptType || '—'}</span></div>
        <div class="t-qr">${qrAscii(a.id)}</div>
        <div class="t-footer">ID: ${a.id.slice(0, 10).toUpperCase()} · einfach-termin.de · Bitte rechtzeitig erscheinen!</div>`;
    document.getElementById('print-area').style.display = 'block';
    setTimeout(() => {
        window.print();
        setTimeout(() => document.getElementById('print-area').style.display = 'none', 800);
    }, 100);
}

function downloadICS(a) {
    const ds = a.date.replace(/-/g, '');
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${ds}T${a.time.replace(':', '')}00\nSUMMARY:Termin: ${a.doctorName}\nDESCRIPTION:${a.praxisName} - ${a.apptType}\nEND:VEVENT\nEND:VCALENDAR`;
    const b = new Blob([ics], { type: 'text/calendar' });
    const l = document.createElement('a');
    l.href = URL.createObjectURL(b); l.download = `termin-${a.date}.ics`; l.click();
}

/* ──────────────────────────────────────────────────────────────
   EXPORT-MARKER  (Konsole zeigt, dass shared.js geladen ist)
   ────────────────────────────────────────────────────────────── */
console.info('[shared.js] Einfach-Termin core loaded ✓');

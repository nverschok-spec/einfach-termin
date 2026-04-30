// ================================================================
//  EINFACH-TERMIN — shared.js  (Lavender Edition v2.2)
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
   5.  WOCHENPLAN-SYSTEM  (Nr.13 — Arbeitstage + kustom-Pausen)
   ────────────────────────────────────────────────────────────── */

/** Hilfsfunktionen: Zeit <-> Minuten */
function timeToMin(t) {
    if (!t || !t.includes(':')) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}
function minToTime(min) {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * Gibt ein Standard-Wochenplan-Objekt zurück.
 * Mo-Fr: 08:00-18:00 (aktiv), Sa+So: inaktiv.
 * Eine Standard-Mittagspause 13:00-14:00.
 */
function defaultSchedule() {
    return {
        workDays: [
            { day: 0, label: 'So', enabled: false, start: '08:00', end: '18:00' },
            { day: 1, label: 'Mo', enabled: true,  start: '08:00', end: '18:00' },
            { day: 2, label: 'Di', enabled: true,  start: '08:00', end: '18:00' },
            { day: 3, label: 'Mi', enabled: true,  start: '08:00', end: '18:00' },
            { day: 4, label: 'Do', enabled: true,  start: '08:00', end: '18:00' },
            { day: 5, label: 'Fr', enabled: true,  start: '08:00', end: '18:00' },
            { day: 6, label: 'Sa', enabled: false, start: '08:00', end: '13:00' },
        ],
        breaks: [
            { start: '13:00', end: '14:00', label: 'Mittagspause' }
        ]
    };
}

/**
 * Migriert alte doctor-Objekte (breakStart/breakEnd) in das neue schedule-Format.
 * Idempotent — kann beliebig oft aufgerufen werden.
 */
function ensureSchedule(doctor) {
    if (doctor.schedule && doctor.schedule.workDays) return doctor;
    const sched = defaultSchedule();
    if (doctor.breakStart && doctor.breakEnd) {
        sched.breaks = [{ start: doctor.breakStart, end: doctor.breakEnd, label: 'Mittagspause' }];
    }
    doctor.schedule = sched;
    return doctor;
}

/**
 * Gibt den Tagesplan fuer ein bestimmtes Datum zurueck.
 * @returns {object|null}  { enabled, start, end } oder null
 */
function getDaySchedule(doctor, dateStr) {
    ensureSchedule(doctor);
    const dow = new Date(dateStr).getDay();
    return doctor.schedule.workDays.find(d => d.day === dow) || null;
}

/**
 * Prueft ob totalMin (Min seit Mitternacht) in einer der definierten Pausen liegt.
 */
function isInBreak(doctor, totalMin) {
    ensureSchedule(doctor);
    return doctor.schedule.breaks.some(b => {
        const bs = timeToMin(b.start);
        const be = timeToMin(b.end);
        return bs < be && totalMin >= bs && totalMin < be;
    });
}

/**
 * Gibt die Pause-Bezeichnung zurueck wenn der Slot in einer Pause liegt.
 */
function getBreakLabel(doctor, totalMin) {
    ensureSchedule(doctor);
    const brk = doctor.schedule.breaks.find(b => {
        const bs = timeToMin(b.start);
        const be = timeToMin(b.end);
        return bs < be && totalMin >= bs && totalMin < be;
    });
    return brk ? (brk.label || 'Pause') : '';
}

/**
 * Kurze Text-Zusammenfassung des Wochenplans fuer die Arzt-Liste.
 */
function scheduleToString(doctor) {
    ensureSchedule(doctor);
    const active = doctor.schedule.workDays.filter(d => d.enabled);
    if (!active.length) return 'Kein Arbeitstag';
    const first = active[0], last = active[active.length - 1];
    const range = active.length > 2 ? `${first.label}-${last.label}` : active.map(d => d.label).join(', ');
    const times = [...new Set(active.map(d => `${d.start}-${d.end}`))];
    const timeStr = times.length === 1 ? times[0] : 'Variabel';
    return `${range} ${timeStr}`;
}

/* ──────────────────────────────────────────────────────────────
   5b.  SLOT-GENERIERUNG  (dynamisch, mit Wochenplan + multi-Pausen)
   ────────────────────────────────────────────────────────────── */
/**
 * Gibt ein Array von Slot-Objekten zurueck:
 *   { time, isBreak, breakLabel, isPast, isBuffer, dayDisabled }
 *
 * Wenn der Tag gesperrt ist (dayDisabled) => Array mit einem einzigen
 * { dayDisabled: true } Element.
 *
 * @param {object} doctor   - Arzt-Objekt (wird ggf. migriert)
 * @param {string} date     - 'YYYY-MM-DD'
 */
function generateSlots(doctor, date) {
    ensureSchedule(doctor);
    const dur = parseInt(doctor.slotDuration) || 15;
    const slots = [];

    let startMin = 8 * 60;
    let endMin   = 18 * 60;

    if (date) {
        const daySched = getDaySchedule(doctor, date);
        if (!daySched || !daySched.enabled) {
            return [{ dayDisabled: true }];
        }
        startMin = timeToMin(daySched.start);
        endMin   = timeToMin(daySched.end);
    }

    const todayStr   = new Date().toISOString().split('T')[0];
    const isToday    = date === todayStr;
    const now        = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (let totalMin = startMin; totalMin < endMin; totalMin += dur) {
        const t        = minToTime(totalMin);
        const inBreak  = isInBreak(doctor, totalMin);
        const brkLabel = inBreak ? getBreakLabel(doctor, totalMin) : '';
        const isPast   = isToday && totalMin <= nowMinutes;
        const isBuffer = isToday && !isPast && (totalMin - nowMinutes) < 120;

        slots.push({
            time: t,
            isBreak: inBreak,
            breakLabel: brkLabel,
            isPast,
            isBuffer,
            dayDisabled: false
        });
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
function writeAudit(msg, praxisId) {
    const log = DB.arr('et2_audit');
    const now = new Date();
    log.unshift({
        time: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
             + ' ' + now.toLocaleDateString('de-DE'),
        message: msg,
        praxisId: praxisId || null  // ← praxisId für Filterung
    });
    if (log.length > 200) log.pop(); // erhöht auf 200 da jetzt gefiltert wird
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
    const typeLabels = {
        exam: 'Untersuchung', consult: 'Konsultation',
        procedure: 'Behandlung', operation: 'Operation'
    };
    const statusLabel = a.status === 'confirmed' ? '✓ Bestätigt' : '⏳ Ausstehend';
    tc.innerHTML = `<div style="font-family:'DM Sans',sans-serif;max-width:400px;margin:30px auto;
        border:2px solid #2d1b69;border-radius:16px;padding:28px;color:#2d1b69;">
        <div style="text-align:center;border-bottom:1px dashed #ddd;padding-bottom:14px;margin-bottom:16px;">
            <div style="font-family:'Fraunces',serif;font-weight:900;font-size:1.4rem;color:#7c5cbf;">
                Einfach<span style="color:#967BB6;font-style:italic;">-Termin</span>
            </div>
            <div style="font-size:.85rem;color:#888;margin-top:4px;">Terminbestätigung</div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.88rem;"><span style="color:#888;">Patient</span><span style="font-weight:700;">${a.patientName}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.88rem;"><span style="color:#888;">Arzt</span><span style="font-weight:700;">${a.doctorName}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.88rem;"><span style="color:#888;">Praxis</span><span style="font-weight:700;">${a.praxisName || '—'}</span></div>
        <hr style="border:none;border-top:1px dashed #ddd;margin:12px 0;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:1rem;"><span style="color:#888;">📅 Datum</span><span style="font-weight:800;color:#7c5cbf;">${a.date}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:1rem;"><span style="color:#888;">🕐 Uhrzeit</span><span style="font-weight:800;color:#7c5cbf;">${a.time} Uhr</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.88rem;"><span style="color:#888;">Typ</span><span style="font-weight:700;">${typeLabels[a.apptType] || a.apptType || '—'}</span></div>
        ${a.reason ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.88rem;"><span style="color:#888;">Grund</span><span style="font-weight:700;max-width:60%;text-align:right;">${a.reason}</span></div>` : ''}
        <hr style="border:none;border-top:1px dashed #ddd;margin:12px 0;">
        <div style="text-align:center;margin:10px 0;">
            <span style="display:inline-block;padding:4px 16px;border-radius:20px;font-size:.78rem;font-weight:700;
                background:${a.status==='confirmed'?'#edf7f0':'#fff3cd'};
                color:${a.status==='confirmed'?'#1a7a3f':'#7a4800'};">${statusLabel}</span>
        </div>
        <div style="text-align:center;margin:14px 0 8px;font-family:monospace;font-size:1rem;
            letter-spacing:2px;line-height:1.5;background:#f5f3fc;padding:10px;border-radius:8px;">
            ${qrAscii(a.id)}
        </div>
        <div style="text-align:center;font-size:.64rem;color:#aaa;margin-top:12px;line-height:1.6;
            border-top:1px dashed #ddd;padding-top:10px;">
            ID: ${a.id.slice(0, 10).toUpperCase()}<br>
            einfach-termin.de · Bitte 5 Min. vor Termin erscheinen
        </div>
    </div>`;
    document.getElementById('print-area').style.display = 'block';
    setTimeout(() => {
        window.print();
        setTimeout(() => document.getElementById('print-area').style.display = 'none', 800);
    }, 150);
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

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

// ── ЗАДАЧА 7: Master PIN — Obsidian & Gold ────────────────────────────────
const MASTER_PIN = '70947396';
let _pinBuffer    = '';
let _pinAttempts  = 0;

function promptMasterPin() {
    // Если уже разблокировано в этой сессии — сразу открываем
    if (sessionStorage.getItem('et2_master_unlocked') === '1') {
        _activateMaster();
        return;
    }
    _pinBuffer = '';
    _pinAttempts = 0;
    _updatePinDots();
    const overlay = document.getElementById('master-pin-overlay');
    const modal   = document.getElementById('master-pin-modal');
    const errEl   = document.getElementById('pin-error');
    if (errEl) { errEl.innerText = ''; errEl.style.opacity = '0'; }
    overlay.style.display = 'block';
    modal.style.display   = 'block';
    requestAnimationFrame(() => {
        modal.style.opacity   = '1';
        modal.style.transform = 'translate(-50%,-50%) scale(1)';
    });
}

function closeMasterPin() {
    const modal   = document.getElementById('master-pin-modal');
    const overlay = document.getElementById('master-pin-overlay');
    modal.style.opacity   = '0';
    modal.style.transform = 'translate(-50%,-50%) scale(.94)';
    setTimeout(() => { modal.style.display = 'none'; overlay.style.display = 'none'; }, 250);
    _pinBuffer = '';
    _updatePinDots();
}

function pinPress(digit) {
    if (_pinBuffer.length >= MASTER_PIN.length) return;
    _pinBuffer += digit;
    _updatePinDots();
    if (_pinBuffer.length === MASTER_PIN.length) {
        setTimeout(_checkPin, 120);
    }
}

function pinDelete() {
    _pinBuffer = _pinBuffer.slice(0, -1);
    _updatePinDots();
}

function pinClear() {
    _pinBuffer = '';
    _updatePinDots();
}

function _updatePinDots() {
    for (let i = 0; i < MASTER_PIN.length; i++) {
        const dot = document.getElementById('pin-dot-' + i);
        if (!dot) continue;
        dot.classList.toggle('filled', i < _pinBuffer.length);
    }
}

function _checkPin() {
    const errEl = document.getElementById('pin-error');
    const numpad = document.getElementById('pin-numpad');
    if (_pinBuffer === MASTER_PIN) {
        // Успех
        if (errEl) { errEl.innerText = '✅ Zugang gewährt'; errEl.style.color = '#ffd700'; errEl.style.opacity = '1'; }
        if (numpad) numpad.style.opacity = '.4';
        sessionStorage.setItem('et2_master_unlocked', '1');
        setTimeout(() => {
            closeMasterPin();
            setTimeout(_activateMaster, 280);
        }, 600);
    } else {
        // Ошибка
        _pinAttempts++;
        _pinBuffer = '';
        _updatePinDots();
        const numpadEl = document.getElementById('pin-dots-wrap');
        if (numpadEl) {
            numpadEl.style.animation = 'pinShake .4s ease';
            setTimeout(() => { numpadEl.style.animation = ''; }, 400);
        }
        if (errEl) {
            errEl.innerText = _pinAttempts >= 3
                ? '⚠️ Zu viele Versuche — warte 10 Sek.'
                : '❌ Falscher PIN (' + _pinAttempts + '/3)';
            errEl.style.color = '#ff6b6b';
            errEl.style.opacity = '1';
        }
        if (_pinAttempts >= 3) {
            const keys = document.querySelectorAll('.pin-key');
            keys.forEach(k => k.disabled = true);
            setTimeout(() => {
                keys.forEach(k => k.disabled = false);
                _pinAttempts = 0;
                if (errEl) errEl.style.opacity = '0';
            }, 10000);
        }
    }
}

function _activateMaster() {
    const btn  = document.getElementById('sidebar-master-btn');
    const lock = document.getElementById('sidebar-master-lock');
    if (btn)  { btn.style.display  = 'flex'; btn.style.animation  = 'fi .4s ease'; }
    if (lock) lock.style.display = 'none';
    switchSection('section-master', btn);
    showToast('👑 Master-Zugang freigeschaltet!', 'success');
    renderMasterDashboard();
    startLiveFeed();
}



// ── ЗАДАЧА 10: Login as Admin — просмотр прaxen от Master ────────────────────
function masterLoginAs(praxisId) {
    var p = praxen.find(function(x) { return x.id === praxisId; });
    if (!p) return;

    // Сохраняем master-сессию отдельно
    sessionStorage.setItem('et2_master_impersonating', '1');
    sessionStorage.setItem('et2_master_original_cu', JSON.stringify(cu));

    // Переключаемся на praxis
    cu = p;
    DB.set('et2_admin_sess', p);

    // Показываем banner
    var banner = document.getElementById('impersonation-banner');
    var nameEl = document.getElementById('imp-praxis-name');
    if (banner) {
        banner.style.display = 'block';
        requestAnimationFrame(function() { banner.classList.add('visible'); });
    }
    if (nameEl) nameEl.innerText = (p.logo || '🏥') + ' ' + p.name;

    // Сдвигаем main-content вниз под баннер
    var mc = document.querySelector('.main-content');
    if (mc) mc.classList.add('has-imp-banner');

    // Переключаем на Обзор и рендерим
    var overviewBtn = document.querySelector('[data-section="section-overview"]');
    switchSection('section-overview', overviewBtn);
    renderDashboard();

    writeAudit('👁 Master: Login als ' + p.name, 'master');
    showToast('👁 Jetzt als ' + p.name + ' eingeloggt', 'info');
}

function exitImpersonation() {
    // Восстанавливаем master
    var origStr = sessionStorage.getItem('et2_master_original_cu');
    if (origStr) {
        try {
            var origCu = JSON.parse(origStr);
            cu = origCu;
            DB.set('et2_admin_sess', origCu);
        } catch(e) {}
    }

    sessionStorage.removeItem('et2_master_impersonating');
    sessionStorage.removeItem('et2_master_original_cu');

    // Скрываем banner
    var banner = document.getElementById('impersonation-banner');
    if (banner) {
        banner.classList.remove('visible');
        setTimeout(function() { banner.style.display = 'none'; }, 300);
    }

    var mc = document.querySelector('.main-content');
    if (mc) mc.classList.remove('has-imp-banner');

    // Возвращаемся в Master секцию
    var masterBtn = document.getElementById('sidebar-master-btn');
    switchSection('section-master', masterBtn);
    renderMasterDashboard();
    showToast('👑 Zurück zu Master-Dashboard', 'success');
}

// Восстанавливаем impersonation при перезагрузке если была активна
function checkImpersonationOnLoad() {
    if (sessionStorage.getItem('et2_master_impersonating') === '1') {
        var banner = document.getElementById('impersonation-banner');
        var nameEl = document.getElementById('imp-praxis-name');
        var mc     = document.querySelector('.main-content');
        if (banner) { banner.style.display = 'block'; requestAnimationFrame(function() { banner.classList.add('visible'); }); }
        if (mc) mc.classList.add('has-imp-banner');
        if (nameEl && cu) nameEl.innerText = (cu.logo || '🏥') + ' ' + cu.name;
    }
}

// ── ЗАДАЧА 9: Approve / Block / Delete прaxen ────────────────────────────────
function masterApproveBlock(praxisId, block) {
    var p = praxen.find(function(x) { return x.id === praxisId; });
    if (!p) return;
    if (block) {
        masterConfirm(
            '🚫 Praxis sperren?',
            'Die Praxis <strong>' + p.name + '</strong> wird gesperrt.<br>Login wird sofort deaktiviert.',
            'Sperren',
            'danger',
            function() {
                p.accountStatus = 'blocked';
                saveAll();
                writeAudit('🚫 Praxis gesperrt: ' + p.name, 'master');
                showToast('🚫 ' + p.name + ' gesperrt', 'warning');
                renderMasterDashboard();
            }
        );
    } else {
        // ЗАДАЧА 14: approve из pending → active
        var wasPending = p.accountStatus === 'pending';
        p.accountStatus = 'active';
        p.verifiedAt = new Date().toISOString();
        saveAll();
        writeAudit((wasPending ? '✅ Praxis verifiziert: ' : '✅ Praxis freigeschaltet: ') + p.name, 'master');
        showToast('✅ ' + p.name + (wasPending ? ' verifiziert & freigeschaltet!' : ' freigeschaltet'), 'success');
        renderMasterDashboard();
    }
}

function masterDeletePraxis(praxisId) {
    var p = praxen.find(function(x) { return x.id === praxisId; });
    if (!p) return;
    var docCount  = doctors.filter(function(d) { return d.praxisId === praxisId; }).length;
    var apptCount = appts.filter(function(a) { return a.praxisId === praxisId; }).length;
    masterConfirm(
        '🗑 Praxis löschen?',
        'Die Praxis <strong>' + p.name + '</strong> wird <strong>endgültig gelöscht</strong>.<br>' +
        docCount + ' Ärzte und ' + apptCount + ' Termine werden ebenfalls entfernt.<br>' +
        '<span style="color:#ff6b6b;">Diese Aktion kann nicht rückgängig gemacht werden!</span>',
        'Endgültig löschen',
        'destroy',
        function() {
            praxen  = praxen.filter(function(x) { return x.id !== praxisId; });
            doctors = doctors.filter(function(d) { return d.praxisId !== praxisId; });
            appts   = appts.filter(function(a) { return a.praxisId !== praxisId; });
            saveAll();
            writeAudit('🗑 Praxis gelöscht: ' + p.name, 'master');
            showToast('🗑 ' + p.name + ' gelöscht', 'error');
            renderMasterDashboard();
        }
    );
}

// ── Красивый confirm-диалог в Obsidian & Gold стиле ─────────────────────────
function masterConfirm(title, bodyHtml, confirmLabel, variant, onConfirm) {
    var overlay = document.getElementById('master-confirm-overlay');
    var modal   = document.getElementById('master-confirm-modal');
    if (!overlay || !modal) return;

    document.getElementById('mc-title').innerText     = title;
    document.getElementById('mc-body').innerHTML      = bodyHtml;
    document.getElementById('mc-confirm-btn').innerText = confirmLabel;

    var btn = document.getElementById('mc-confirm-btn');
    btn.className = 'master-confirm-btn ' + (variant === 'destroy' ? 'destroy' : variant === 'danger' ? 'danger' : 'ok');
    btn.onclick = function() {
        closeMasterConfirm();
        onConfirm();
    };

    overlay.style.display = 'block';
    modal.style.display   = 'block';
    requestAnimationFrame(function() {
        modal.style.opacity   = '1';
        modal.style.transform = 'translate(-50%,-50%) scale(1)';
    });
}

function closeMasterConfirm() {
    var modal   = document.getElementById('master-confirm-modal');
    var overlay = document.getElementById('master-confirm-overlay');
    if (!modal) return;
    modal.style.opacity   = '0';
    modal.style.transform = 'translate(-50%,-50%) scale(.94)';
    setTimeout(function() { modal.style.display = 'none'; overlay.style.display = 'none'; }, 220);
}

function lockMaster() {
    sessionStorage.removeItem('et2_master_unlocked');
    stopLiveFeed();
    const btn  = document.getElementById('sidebar-master-btn');
    const lock = document.getElementById('sidebar-master-lock');
    if (btn)  btn.style.display  = 'none';
    if (lock) lock.style.display = 'flex';
    switchSection('section-overview', document.querySelector('[data-section="section-overview"]'));
    showToast('🔒 Master gesperrt', 'info');
}

// ── ЗАДАЧА 8: Глобальная статистика Master Dashboard ────────────────────────
function renderMasterDashboard() {
    var txt = function(id, v) { var e = document.getElementById(id); if (e) e.innerText = v; };
    var todayStr = new Date().toISOString().split('T')[0];

    // ── 1. Основные метрики ──────────────────────────────────────────────────
    var totalAppts     = appts.length;
    var confirmed      = appts.filter(function(a) { return a.status === 'confirmed'; }).length;
    var cancelled      = appts.filter(function(a) { return a.status === 'cancelled'; }).length;
    var todayAppts     = appts.filter(function(a) { return a.date === todayStr && a.status !== 'cancelled'; }).length;
    var confirmRate    = totalAppts > 0 ? Math.round((confirmed / totalAppts) * 100) : 0;

    // Средний рейтинг
    var rated = appts.filter(function(a) { return a.rating && a.rating > 0; });
    var avgRating = rated.length > 0
        ? (rated.reduce(function(s, a) { return s + a.rating; }, 0) / rated.length).toFixed(1)
        : '—';

    txt('ms-praxen',       praxen.length);
    txt('ms-doctors',      doctors.length);
    txt('ms-appts',        totalAppts);
    txt('ms-confirmed',    confirmed);
    txt('ms-today',        todayAppts);
    txt('ms-cancelled',    cancelled);
    txt('ms-rating',       avgRating !== '—' ? avgRating + ' ★' : '—');
    txt('ms-confirm-rate', confirmRate + '%');

    var badge = document.getElementById('ms-praxen-badge');
    if (badge) badge.innerText = praxen.length + ' aktiv';

    // ── 2. Топ прaxen по кол-ву записей ─────────────────────────────────────
    var praxenStats = praxen.map(function(p) {
        var cnt = appts.filter(function(a) { return a.praxisId === p.id; }).length;
        var con = appts.filter(function(a) { return a.praxisId === p.id && a.status === 'confirmed'; }).length;
        return { name: p.name, logo: p.logo || '🏥', city: p.city, cnt: cnt, con: con };
    }).sort(function(a, b) { return b.cnt - a.cnt; });

    var maxPraxCnt = praxenStats.length ? praxenStats[0].cnt || 1 : 1;
    var topPraxEl = document.getElementById('ms-top-praxen');
    if (topPraxEl) {
        if (!praxenStats.length) {
            topPraxEl.innerHTML = '<div class="master-rank-empty">Keine Daten</div>';
        } else {
            topPraxEl.innerHTML = praxenStats.slice(0, 5).map(function(p, i) {
                var pct = Math.round((p.cnt / maxPraxCnt) * 100);
                var medals = ['🥇','🥈','🥉','4.','5.'];
                return '<div class="master-rank-row">' +
                    '<span class="master-rank-pos">' + medals[i] + '</span>' +
                    '<span class="master-rank-icon">' + p.logo + '</span>' +
                    '<div class="master-rank-info">' +
                        '<div class="master-rank-name">' + p.name + '</div>' +
                        '<div class="master-rank-bar-wrap"><div class="master-rank-bar" style="width:' + pct + '%;"></div></div>' +
                    '</div>' +
                    '<span class="master-rank-val">' + p.cnt + '</span>' +
                '</div>';
            }).join('');
        }
    }

    // ── 3. Топ врачи по кол-ву подтверждённых записей ───────────────────────
    var docStats = doctors.map(function(d) {
        var con = appts.filter(function(a) { return a.doctorId === d.id && a.status === 'confirmed'; }).length;
        var tot = appts.filter(function(a) { return a.doctorId === d.id; }).length;
        var praxis = praxen.find(function(p) { return p.id === d.praxisId; });
        return { name: d.name, spec: d.spec, color: d.color || '#7c5cbf', con: con, tot: tot, praxis: praxis ? praxis.name : '—' };
    }).sort(function(a, b) { return b.con - a.con; });

    var maxDocCnt = docStats.length ? docStats[0].con || 1 : 1;
    var topDocEl = document.getElementById('ms-top-doctors');
    if (topDocEl) {
        if (!docStats.length) {
            topDocEl.innerHTML = '<div class="master-rank-empty">Keine Daten</div>';
        } else {
            topDocEl.innerHTML = docStats.slice(0, 5).map(function(d, i) {
                var pct = Math.round((d.con / maxDocCnt) * 100);
                var medals = ['🥇','🥈','🥉','4.','5.'];
                return '<div class="master-rank-row">' +
                    '<span class="master-rank-pos">' + medals[i] + '</span>' +
                    '<span class="master-rank-dot" style="background:' + d.color + ';"></span>' +
                    '<div class="master-rank-info">' +
                        '<div class="master-rank-name">' + d.name.replace('Dr. med. ','Dr. ') + '</div>' +
                        '<div class="master-rank-bar-wrap"><div class="master-rank-bar" style="width:' + pct + '%;"></div></div>' +
                    '</div>' +
                    '<span class="master-rank-val">' + d.con + '</span>' +
                '</div>';
            }).join('');
        }
    }

    // ── 4. Тренд 4 месяца (gold bar chart) ──────────────────────────────────
    var now = new Date();
    var months = [];
    for (var m = 3; m >= 0; m--) {
        var d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        var y = d.getFullYear(), mo = d.getMonth();
        var label = d.toLocaleString('de', { month: 'short' }) + ' ' + String(y).slice(2);
        var cnt = appts.filter(function(a) {
            var ad = new Date(a.date);
            return ad.getFullYear() === y && ad.getMonth() === mo;
        }).length;
        months.push({ label: label, cnt: cnt });
    }
    var maxMonth = Math.max.apply(null, months.map(function(m) { return m.cnt; })) || 1;
    var trendEl = document.getElementById('ms-trend-chart');
    if (trendEl) {
        trendEl.innerHTML = '<div class="master-trend-bars">' +
            months.map(function(m, i) {
                var pct = Math.round((m.cnt / maxMonth) * 100);
                var isLast = i === months.length - 1;
                return '<div class="master-trend-col">' +
                    '<div class="master-trend-val">' + m.cnt + '</div>' +
                    '<div class="master-trend-bar-wrap">' +
                        '<div class="master-trend-bar' + (isLast ? ' current' : '') + '" style="height:' + Math.max(pct, 4) + '%;"></div>' +
                    '</div>' +
                    '<div class="master-trend-lbl">' + m.label + '</div>' +
                '</div>';
            }).join('') +
        '</div>';
    }

    // ── 5. Детальная таблица прaxen ──────────────────────────────────────────
    var listEl = document.getElementById('master-praxen-list');
    if (listEl) {
        if (!praxen.length) {
            listEl.innerHTML = '<div style="color:rgba(255,215,0,.4);font-size:.82rem;padding:16px;">Keine Praxen registriert.</div>';
        } else {
            listEl.innerHTML = praxen.map(function(p) {
                var myDocs   = doctors.filter(function(d) { return d.praxisId === p.id; });
                var myAppts  = appts.filter(function(a) { return a.praxisId === p.id; });
                var pending  = myAppts.filter(function(a) { return a.status === 'pending'; }).length;
                var conFrac  = myAppts.length > 0 ? Math.round((myAppts.filter(function(a){return a.status==='confirmed';}).length / myAppts.length) * 100) : 0;
                var activDoc = myDocs.filter(function(d) { return d.status === 'active'; }).length;
                var isPending = p.accountStatus === 'pending';
                var isBlocked = p.accountStatus === 'blocked';
                var statusHtml = isPending
                    ? '<span class="master-praxis-status pending">⏳ Ausstehend</span>'
                    : isBlocked
                        ? '<span class="master-praxis-status blocked">Gesperrt</span>'
                        : '<span class="master-praxis-status ok">Aktiv</span>';
                var blockFn  = 'masterApproveBlock(\'' + p.id + '\',' + (isBlocked ? 'false' : 'true') + ')';
                var verifyFn = 'masterApproveBlock(\'' + p.id + '\',false)';
                var deleteFn = 'masterDeletePraxis(\'' + p.id + '\')';
                var loginFn  = 'masterLoginAs(\'' + p.id + '\')';
                var scanFn   = 'masterViewAppro(\'' + p.id + '\')';
                var hasScan  = !!(p.approbationScan && p.approbationScan.base64);
                var actionBtns =
                    (isPending
                        ? '<button class="master-action-btn master-action-verify" onclick="' + verifyFn + '" title="Verifizieren & freischalten" style="color:#2ecc71;font-size:.75rem;padding:4px 10px;">✅ Verify</button>'
                        : (!isBlocked ? '<button class="master-action-btn master-action-login" onclick="' + loginFn + '" title="Als Admin einloggen" style="color:#a78bfa;">👁</button>' : '')
                    ) +
                    (hasScan ? '<button class="master-action-btn" onclick="' + scanFn + '" title="Approbation ansehen" style="color:rgba(255,215,0,.8);">📄</button>' : '<span class="master-action-btn" title="Kein Scan" style="color:rgba(255,215,0,.25);cursor:default;">📄</span>') +
                    (!isPending ? '<button class="master-action-btn" onclick="' + blockFn + '" title="' + (isBlocked ? 'Freischalten' : 'Sperren') + '" style="color:' + (isBlocked ? '#2ecc71' : '#f39c12') + ';">' + (isBlocked ? '✅' : '🚫') + '</button>' : '') +
                    '<button class="master-action-btn" onclick="' + deleteFn + '" title="Löschen" style="color:#ff6b6b;">🗑</button>';
                return '<div class="master-praxis-row' + (isPending ? ' row-pending' : '') + '">' +
                    '<div class="master-praxis-logo" style="' + (isBlocked ? 'opacity:.45;filter:grayscale(1);' : isPending ? 'opacity:.7;' : '') + '">' + (p.logo || '🏥') + '</div>' +
                    '<div class="master-praxis-info">' +
                        '<div class="master-praxis-name" style="' + (isBlocked ? 'opacity:.55;text-decoration:line-through;' : '') + '">' + p.name + (isPending ? ' <span style="font-size:.65rem;color:rgba(255,215,0,.5);font-weight:400;">(ausstehend)</span>' : '') + '</div>' +
                        '<div class="master-praxis-meta">' +
                            p.city +
                            (p.bsnr ? ' · <span class="lanr-badge">BSNR ' + p.bsnr + '</span>' : ' · <span class="lanr-badge warn">⚠️ Keine BSNR</span>') +
                            (p.lanrDirector ? ' · LANR ' + p.lanrDirector : '') +
                            ' · ' + p.email +
                            ' · <span style="color:rgba(255,215,0,.7);">' + activDoc + '/' + myDocs.length + ' Ärzte</span>' +
                            ' · ' + myAppts.length + ' Termine' +
                            (pending > 0 ? ' · <span style="color:#ffd700;font-weight:700;">' + pending + ' ⏳</span>' : '') +
                        '</div>' +
                        '<div class="master-praxis-progress">' +
                            '<div class="master-praxis-prog-bar" style="width:' + conFrac + '%;' + (isBlocked ? 'background:rgba(231,76,60,.5);' : '') + '"></div>' +
                        '</div>' +
                        '<div style="font-size:.67rem;color:rgba(255,215,0,.35);margin-top:2px;">' + conFrac + '% bestätigt</div>' +
                    '</div>' +
                    '<div class="master-praxis-actions" style="display:flex;align-items:center;gap:6px;">' +
                        statusHtml + actionBtns +
                    '</div>' +
                '</div>';
            }).join('');
        }
    }

    // ЗАДАЧА 17: Global Blacklist
    renderGlobalBlacklist();
    // ЗАДАЧА 18: Patient Monitor
    renderPatientMonitor();

    // ── ЗАДАЧА 11: Виджеты аналитики ────────────────────────────────────────────
    renderCitiesChart();
    renderPopularDoctors();
    renderPeakHours();

    // ── 6. Activity feed — рендерится через renderLiveFeed (Задача 12) ─────────
    renderLiveFeed();
}


// ── ЗАДАЧА 11: Виджет 1 — Активность по городам ────────────────────────────
function renderCitiesChart() {
    var el = document.getElementById('ms-cities-chart');
    if (!el) return;

    // Считаем записи по городам через praxis
    var cityMap = {};
    appts.forEach(function(a) {
        var p = praxen.find(function(x) { return x.id === a.praxisId; });
        if (!p) return;
        var city = p.city || 'Unbekannt';
        cityMap[city] = (cityMap[city] || 0) + 1;
    });

    var cities = Object.keys(cityMap).map(function(city) {
        return { city: city, cnt: cityMap[city] };
    }).sort(function(a, b) { return b.cnt - a.cnt; }).slice(0, 7);

    var badge = document.getElementById('ms-cities-badge');
    if (badge) badge.innerText = cities.length + ' Städte';

    if (!cities.length) {
        el.innerHTML = '<div class="master-rank-empty">Keine Daten</div>';
        return;
    }

    var maxCnt = cities[0].cnt || 1;
    // Цвета для городов
    var colors = ['#ffd700','#ffec8b','#daa520','#b8860b','#f0c040','#e8b800','#c8a000'];

    el.innerHTML = '<div class="master-cities-list">' +
        cities.map(function(c, i) {
            var pct = Math.round((c.cnt / maxCnt) * 100);
            var color = colors[i % colors.length];
            return '<div class="master-city-row">' +
                '<div class="master-city-name">' + c.city + '</div>' +
                '<div class="master-city-bar-wrap">' +
                    '<div class="master-city-bar" style="width:' + pct + '%;background:' + color + ';opacity:' + (1 - i * 0.1) + ';"></div>' +
                '</div>' +
                '<div class="master-city-val">' + c.cnt + '</div>' +
            '</div>';
        }).join('') +
    '</div>';
}

// ── ЗАДАЧА 11: Виджет 2 — Популярные врачи по рейтингу ─────────────────────
function renderPopularDoctors() {
    var el = document.getElementById('ms-popular-doctors');
    if (!el) return;

    var docRatings = doctors.map(function(d) {
        var docAppts = appts.filter(function(a) { return a.doctorId === d.id; });
        var rated    = docAppts.filter(function(a) { return a.rating && a.rating > 0; });
        var avgRat   = rated.length > 0
            ? (rated.reduce(function(s, a) { return s + a.rating; }, 0) / rated.length)
            : 0;
        var praxis = praxen.find(function(p) { return p.id === d.praxisId; });
        return {
            name:    d.name,
            spec:    d.spec,
            color:   d.color || '#7c5cbf',
            avg:     avgRat,
            count:   docAppts.length,
            rated:   rated.length,
            city:    praxis ? praxis.city : '—'
        };
    })
    .filter(function(d) { return d.count > 0; })
    .sort(function(a, b) {
        if (b.avg !== a.avg) return b.avg - a.avg;
        return b.count - a.count;
    })
    .slice(0, 5);

    if (!docRatings.length) {
        el.innerHTML = '<div class="master-rank-empty">Keine Bewertungen</div>';
        return;
    }

    var medals = ['🥇','🥈','🥉','4.','5.'];
    el.innerHTML = docRatings.map(function(d, i) {
        var stars = d.avg > 0
            ? '<span class="master-doc-stars">' +
                [1,2,3,4,5].map(function(s) {
                    return '<span style="color:' + (s <= Math.round(d.avg) ? '#ffd700' : 'rgba(255,215,0,.2)') + ';">★</span>';
                }).join('') +
              '</span>'
            : '<span style="color:rgba(255,215,0,.3);font-size:.7rem;">Keine Bewertung</span>';
        return '<div class="master-rank-row">' +
            '<span class="master-rank-pos">' + medals[i] + '</span>' +
            '<span class="master-rank-dot" style="background:' + d.color + ';width:12px;height:12px;border-radius:50%;flex-shrink:0;"></span>' +
            '<div class="master-rank-info">' +
                '<div class="master-rank-name">' + d.name.replace('Dr. med. ', 'Dr. ') + '</div>' +
                '<div style="display:flex;align-items:center;gap:6px;margin-top:3px;">' +
                    stars +
                    (d.avg > 0 ? '<span style="font-size:.68rem;color:rgba(255,215,0,.5);">' + d.avg.toFixed(1) + ' (' + d.rated + ')</span>' : '') +
                '</div>' +
            '</div>' +
            '<span class="master-rank-val" style="font-size:.75rem;">' + d.count + '<br><span style="font-size:.62rem;color:rgba(255,215,0,.4);">' + d.city + '</span></span>' +
        '</div>';
    }).join('');
}

// ── ЗАДАЧА 11: Виджет 3 — Пиковые часы ─────────────────────────────────────
function renderPeakHours() {
    var el = document.getElementById('ms-peak-hours');
    if (!el) return;

    // Считаем записи по часам (8-18)
    var hourMap = {};
    for (var h = 8; h <= 18; h++) hourMap[h] = 0;

    appts.forEach(function(a) {
        if (!a.time) return;
        var hour = parseInt(a.time.split(':')[0]);
        if (hour >= 8 && hour <= 18) hourMap[hour]++;
    });

    var hours = Object.keys(hourMap).map(function(h) {
        return { hour: parseInt(h), cnt: hourMap[h] };
    });

    var maxCnt = Math.max.apply(null, hours.map(function(h) { return h.cnt; })) || 1;

    // Находим пиковый час
    var peakHour = hours.reduce(function(best, h) {
        return h.cnt > best.cnt ? h : best;
    }, hours[0]);

    if (!appts.length) {
        el.innerHTML = '<div class="master-rank-empty">Keine Termine</div>';
        return;
    }

    el.innerHTML =
        '<div class="master-peak-label">Pik: <span style="color:#ffd700;font-weight:700;">' +
            peakHour.hour + ':00–' + (peakHour.hour + 1) + ':00</span>' +
            ' (' + peakHour.cnt + ' Termine)' +
        '</div>' +
        '<div class="master-peak-grid">' +
            hours.map(function(h) {
                var pct  = h.cnt / maxCnt;
                var isPeak = h.hour === peakHour.hour;
                // Тепловая карта: от тёмного к золотому
                var alpha = 0.08 + pct * 0.85;
                var bg = isPeak
                    ? 'linear-gradient(180deg,#ffd700,#b8860b)'
                    : 'rgba(255,215,0,' + alpha.toFixed(2) + ')';
                var height = Math.max(Math.round(pct * 80), 4);
                return '<div class="master-peak-col">' +
                    '<div class="master-peak-cnt" style="opacity:' + (h.cnt > 0 ? '1' : '.3') + ';">' + (h.cnt || '') + '</div>' +
                    '<div class="master-peak-bar-wrap">' +
                        '<div class="master-peak-bar' + (isPeak ? ' peak' : '') + '" style="height:' + height + 'px;background:' + bg + ';' + (isPeak ? 'box-shadow:0 0 12px rgba(255,215,0,.4);' : '') + '"></div>' +
                    '</div>' +
                    '<div class="master-peak-hour">' + h.hour + '</div>' +
                '</div>';
            }).join('') +
        '</div>';
}


// ── ЗАДАЧА 12: Live Feed — лента событий с авто-обновлением ─────────────────
let _liveFeedTimer    = null;
let _liveFeedLastSeen = 0;   // timestamp последнего известного события
let _liveFeedTick     = 0;   // секунды с последнего обновления

// Иконки по ключевым словам в сообщении
function _feedIcon(msg) {
    if (!msg) return '📋';
    var m = msg.toLowerCase();
    if (m.includes('notfall'))   return '🚨';
    if (m.includes('manuell'))   return '📝';
    if (m.includes('gesperrt') || m.includes('blocked')) return '🚫';
    if (m.includes('freigesch')) return '✅';
    if (m.includes('gelöscht') || m.includes('entfernt')) return '🗑';
    if (m.includes('login als')) return '👁';
    if (m.includes('hinzugef'))  return '➕';
    if (m.includes('bearbeitet')) return '✏️';
    if (m.includes('bestätigt') || m.includes('confirmed')) return '✅';
    if (m.includes('abgesagt') || m.includes('cancelled')) return '❌';
    if (m.includes('emailjs') || m.includes('e-mail')) return '📧';
    if (m.includes('arzt'))      return '👨‍⚕️';
    if (m.includes('praxis'))    return '🏥';
    if (m.includes('notiz'))     return '📌';
    if (m.includes('slot') || m.includes('zeit')) return '⏰';
    return '📋';
}

// Цвет строки по типу
function _feedColor(msg) {
    if (!msg) return '';
    var m = msg.toLowerCase();
    if (m.includes('notfall') || m.includes('gesperrt') || m.includes('gelöscht')) return 'danger';
    if (m.includes('freigesch') || m.includes('bestätigt') || m.includes('hinzugef')) return 'success';
    if (m.includes('login als') || m.includes('master')) return 'gold';
    if (m.includes('abgesagt') || m.includes('entfernt')) return 'warn';
    return '';
}

// Парсим время из строки "HH:MM DD.MM.YYYY"
function _feedTimestamp(timeStr) {
    if (!timeStr) return 0;
    try {
        var parts = timeStr.split(' ');
        var time  = parts[0]; // "HH:MM"
        var date  = parts[1]; // "DD.MM.YYYY"
        if (!date) return 0;
        var dp = date.split('.');
        var tp = time.split(':');
        return new Date(+dp[2], +dp[1]-1, +dp[0], +tp[0], +tp[1]).getTime();
    } catch(e) { return 0; }
}

function renderLiveFeed() {
    var el      = document.getElementById('master-activity-feed');
    var filterEl = document.getElementById('feed-filter-praxis');
    if (!el) return;

    // Обновляем фильтр прaxen
    if (filterEl && filterEl.options.length <= 1) {
        praxen.forEach(function(p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.logo || '🏥') + ' ' + p.name;
            filterEl.appendChild(opt);
        });
    }

    var filterPraxis = filterEl ? filterEl.value : '';
    var logs = DB.get('et2_audit') || [];

    // Фильтруем
    if (filterPraxis) {
        logs = logs.filter(function(l) { return l.praxisId === filterPraxis; });
    }

    // Берём последние 25
    var recent = logs.slice(0, 25);

    if (!recent.length) {
        el.innerHTML = '<div class="feed-empty">Noch keine Aktivitäten.</div>';
        return;
    }

    // Определяем новые записи (появились после последнего render)
    var prevSeen = _liveFeedLastSeen;
    var newCount = 0;
    recent.forEach(function(l) {
        var ts = _feedTimestamp(l.time);
        if (ts > prevSeen) newCount++;
    });

    // Запоминаем timestamp самой свежей записи
    if (recent.length && recent[0].time) {
        _liveFeedLastSeen = _feedTimestamp(recent[0].time) || Date.now();
    }

    el.innerHTML = recent.map(function(l, i) {
        var msg   = l.message || l.msg || '—';
        var icon  = _feedIcon(msg);
        var color = _feedColor(msg);
        var ts    = _feedTimestamp(l.time);
        var isNew = ts > prevSeen && i < newCount;

        // Имя praxis
        var praxisName = '';
        if (!filterPraxis && l.praxisId && l.praxisId !== 'master') {
            var prx = praxen.find(function(p) { return p.id === l.praxisId; });
            if (prx) praxisName = prx.name;
        }

        return '<div class="live-feed-row' + (color ? ' feed-' + color : '') + (isNew ? ' feed-new' : '') + '">' +
            '<span class="feed-icon">' + icon + '</span>' +
            '<div class="feed-content">' +
                '<div class="feed-msg">' + msg + '</div>' +
                (praxisName ? '<div class="feed-praxis">' + praxisName + '</div>' : '') +
            '</div>' +
            '<div class="feed-time-wrap">' +
                '<span class="feed-time">' + (l.time ? l.time.slice(0,5) : '—') + '</span>' +
                (isNew ? '<span class="feed-new-dot"></span>' : '') +
            '</div>' +
        '</div>';
    }).join('');
}

function refreshLiveFeed() {
    // Анимируем кнопку
    var btn = document.querySelector('.feed-refresh-btn');
    if (btn) {
        btn.style.transform = 'rotate(360deg)';
        btn.style.transition = 'transform .4s ease';
        setTimeout(function() { btn.style.transform = ''; btn.style.transition = ''; }, 400);
    }
    _liveFeedTick = 0;
    renderLiveFeed();
    _updateFeedTimestamp();
}

function _updateFeedTimestamp() {
    var el = document.getElementById('feed-last-update');
    if (!el) return;
    if (_liveFeedTick === 0) {
        el.textContent = 'Gerade aktualisiert';
    } else if (_liveFeedTick < 60) {
        el.textContent = 'vor ' + _liveFeedTick + ' Sek.';
    } else {
        el.textContent = 'vor ' + Math.floor(_liveFeedTick/60) + ' Min.';
    }
}

function startLiveFeed() {
    // Очищаем старый интервал если есть
    if (_liveFeedTimer) clearInterval(_liveFeedTimer);

    renderLiveFeed();
    _liveFeedTick = 0;
    _updateFeedTimestamp();

    _liveFeedTimer = setInterval(function() {
        _liveFeedTick += 5;
        _updateFeedTimestamp();

        // Каждые 30 сек — реальное обновление
        if (_liveFeedTick % 30 === 0) {
            // Перечитываем данные из localStorage
            var freshLogs = DB.get('et2_audit') || [];
            var latestTs  = freshLogs.length ? _feedTimestamp(freshLogs[0].time) : 0;

            if (latestTs > _liveFeedLastSeen) {
                // Есть новые записи — обновляем с анимацией
                renderLiveFeed();
                var badge = document.getElementById('feed-last-update');
                if (badge) {
                    badge.style.background = 'rgba(255,215,0,.35)';
                    setTimeout(function() { badge.style.background = ''; }, 1000);
                }
            }
            _liveFeedTick = 0;
            _updateFeedTimestamp();
        }
    }, 5000); // тик каждые 5 сек для плавного счётчика
}

function stopLiveFeed() {
    if (_liveFeedTimer) { clearInterval(_liveFeedTimer); _liveFeedTimer = null; }
}




// ── ЗАДАЧА 15: Approbation Upload ────────────────────────────────────────────
var _approBase64 = null;
var _approMeta   = null;

function approDragOver(e) {
    e.preventDefault();
    document.getElementById('appro-drop-zone').classList.add('drag-over');
}
function approDragLeave(e) {
    document.getElementById('appro-drop-zone').classList.remove('drag-over');
}
function approDrop(e) {
    e.preventDefault();
    document.getElementById('appro-drop-zone').classList.remove('drag-over');
    var file = e.dataTransfer.files[0];
    if (file) approFileSelected(file);
}

function approFileSelected(file) {
    if (!file) return;
    var statusEl = document.getElementById('appro-status');
    var allowed  = ['application/pdf','image/jpeg','image/jpg','image/png'];
    if (!allowed.includes(file.type)) {
        statusEl.innerHTML = '❌ Nur PDF, JPG oder PNG erlaubt';
        statusEl.className = 'lanr-status error';
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        statusEl.innerHTML = '❌ Datei zu groß (max. 5 MB). Aktuelle Größe: ' + (file.size / 1024 / 1024).toFixed(1) + ' MB';
        statusEl.className = 'lanr-status error';
        return;
    }

    statusEl.innerHTML = '⏳ Wird geladen…';
    statusEl.className = 'lanr-status pending';

    var reader = new FileReader();
    reader.onload = function(ev) {
        _approBase64 = ev.target.result;
        _approMeta   = { name: file.name, size: _formatFileSize(file.size), type: file.type };

        // Показываем превью
        var preview = document.getElementById('appro-preview');
        var content = document.getElementById('appro-drop-content');
        if (preview && content) {
            content.style.display = 'none';
            preview.style.display = 'block';
            if (file.type === 'application/pdf') {
                preview.innerHTML =
                    '<div class="appro-preview-pdf">' +
                        '<div class="appro-preview-icon">📄</div>' +
                        '<div class="appro-preview-name">' + file.name + '</div>' +
                        '<div class="appro-preview-size">' + _approMeta.size + '</div>' +
                    '</div>';
            } else {
                preview.innerHTML =
                    '<img src="' + _approBase64 + '" class="appro-preview-img" alt="Vorschau">' +
                    '<div class="appro-preview-name">' + file.name + ' · ' + _approMeta.size + '</div>';
            }
        }

        statusEl.innerHTML = '✅ Datei bereit: ' + file.name + ' (' + _approMeta.size + ')';
        statusEl.className = 'lanr-status ok';
    };
    reader.onerror = function() {
        statusEl.innerHTML = '❌ Fehler beim Lesen der Datei';
        statusEl.className = 'lanr-status error';
    };
    reader.readAsDataURL(file);
}

function _formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// Открыть просмотр скана (из pending overlay — для текущего пользователя)
function viewApproScan() {
    if (!cu || !cu.approbationScan) return;
    openApproViewer(cu.approbationScan, cu.name);
}

// Открыть просмотр скана для конкретной praxis (из Master)
function masterViewAppro(praxisId) {
    var p = praxen.find(function(x) { return x.id === praxisId; });
    if (!p || !p.approbationScan) { showToast('Kein Scan vorhanden', 'warning'); return; }
    openApproViewer(p.approbationScan, p.name);
}

function openApproViewer(scan, praxisName) {
    var overlay = document.getElementById('appro-overlay');
    var modal   = document.getElementById('appro-modal');
    var titleEl = document.getElementById('appro-modal-title');
    var subEl   = document.getElementById('appro-modal-sub');
    var bodyEl  = document.getElementById('appro-modal-body');
    var dlBtn   = document.getElementById('appro-download-btn');
    if (!modal) return;

    if (titleEl) titleEl.textContent = 'Approbationsurkunde';
    if (subEl)   subEl.textContent   = praxisName + ' · ' + scan.name + ' · ' + scan.size;
    if (dlBtn)   { dlBtn.href = scan.base64; dlBtn.download = scan.name; }

    if (bodyEl) {
        if (scan.type === 'application/pdf') {
            bodyEl.innerHTML = '<iframe src="' + scan.base64 + '" style="width:100%;height:60vh;border:1px solid var(--border);border-radius:8px;" title="Approbation"></iframe>';
        } else {
            bodyEl.innerHTML = '<img src="' + scan.base64 + '" style="width:100%;max-height:65vh;object-fit:contain;border-radius:8px;border:1px solid var(--border);" alt="Approbationsurkunde">';
        }
    }

    overlay.style.display = 'block';
    modal.style.display   = 'flex';
    requestAnimationFrame(function() {
        modal.style.opacity   = '1';
        modal.style.transform = 'translate(-50%,-50%) scale(1)';
    });
}

function closeApproViewer() {
    var modal   = document.getElementById('appro-modal');
    var overlay = document.getElementById('appro-overlay');
    if (!modal) return;
    modal.style.opacity   = '0';
    modal.style.transform = 'translate(-50%,-50%) scale(.95)';
    setTimeout(function() { modal.style.display = 'none'; overlay.style.display = 'none'; }, 220);
}

// ── ЗАДАЧА 14: Pending verification overlay ──────────────────────────────────
function showPendingOverlay(prx) {
    var overlay = document.getElementById('pending-overlay');
    if (!overlay) return;

    // Заполняем данные
    var nameEl = document.getElementById('pending-praxis-name');
    var bsnrEl = document.getElementById('pending-bsnr');
    var lanrEl = document.getElementById('pending-lanr');
    if (nameEl) nameEl.textContent = prx.name + ' · ' + (prx.city || '');
    if (bsnrEl) bsnrEl.textContent = prx.bsnr ? prx.bsnr.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : '— (nicht angegeben)';
    if (lanrEl) lanrEl.textContent = prx.lanrDirector ? prx.lanrDirector.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : '— (nicht angegeben)';

    // Approbation статус
    var approStatusEl = document.getElementById('pending-appro-status');
    var approBtnEl    = document.getElementById('pending-appro-btn');
    if (approStatusEl) {
        if (prx.approbationScan) {
            approStatusEl.textContent = '✅ Hochgeladen: ' + prx.approbationScan.name;
            if (approBtnEl) approBtnEl.style.display = 'inline-block';
        } else {
            approStatusEl.textContent = '⚠️ Kein Scan vorhanden';
        }
    }

    // Вычисляем прошедшее время с регистрации
    if (prx.registeredAt) {
        var elapsed = Date.now() - new Date(prx.registeredAt).getTime();
        var hoursLeft = Math.max(0, Math.ceil(24 - elapsed / 3600000));
        var timeEl = overlay.querySelector('.pending-info-value:last-child');
        if (timeEl) timeEl.textContent = hoursLeft > 0
            ? 'Noch ca. ' + hoursLeft + ' Stunden'
            : 'In Bearbeitung — bitte warten';
    }

    overlay.style.display = 'flex';

    // Автопроверка каждые 30 сек — вдруг Master approved
    setInterval(function() {
        var updated = praxen.find(function(p) { return p.id === prx.id; });
        if (updated && updated.accountStatus === 'active') {
            overlay.style.display = 'none';
            DB.set('et2_admin_sess', updated);
            cu = updated;
            initEmailJS();
            renderDashboard();
        }
    }, 30000);
}

// ── ЗАДАЧА 13: LANR + BSNR валидация ────────────────────────────────────────
function validateLANR(input, statusId, label) {
    var val = input.value.replace(/\D/g, ''); // только цифры
    input.value = val; // убираем нецифровые символы на лету
    var statusEl = document.getElementById(statusId);
    if (!statusEl) return false;

    if (val.length === 0) {
        statusEl.innerHTML = '';
        statusEl.className = 'lanr-status';
        return false;
    }
    if (val.length < 9) {
        statusEl.innerHTML = '⏳ Noch ' + (9 - val.length) + ' Ziffern';
        statusEl.className = 'lanr-status pending';
        return false;
    }
    if (val.length === 9) {
        // Проверяем уникальность LANR среди врачей (только для врача)
        if (label === 'LANR') {
            var editId = document.getElementById('doc-form-id') ? document.getElementById('doc-form-id').value : '';
            var exists = doctors.find(function(d) {
                return d.lanr === val && d.id !== editId;
            });
            if (exists) {
                statusEl.innerHTML = '❌ LANR bereits vergeben (' + exists.name + ')';
                statusEl.className = 'lanr-status error';
                return false;
            }
        }
        // Проверяем уникальность BSNR среди praxen
        if (label === 'BSNR') {
            var editPraxisId = ''; // при регистрации нет редактирования
            var bsnrExists = praxen.find(function(p) { return p.bsnr === val; });
            if (bsnrExists) {
                statusEl.innerHTML = '❌ BSNR bereits registriert';
                statusEl.className = 'lanr-status error';
                return false;
            }
        }
        statusEl.innerHTML = '✅ ' + label + ' gültig';
        statusEl.className = 'lanr-status ok';
        return true;
    }
    return false;
}

function isLANRValid(val) {
    return /^\d{9}$/.test(val);
}

// ── ЗАДАЧА 16: Детектор подозрительных записей ──────────────────────────────
const SUSPICIOUS_THRESHOLD    = 3;    // 3+ записей за 1 час → suspicious
const SUSPICIOUS_WINDOW_MS    = 3600000; // 1 час в миллисекундах

/**
 * Проверяет email/телефон на спам — вызывается при каждом новом бронировании.
 * Возвращает { isSuspicious, count, reason }
 */
function checkSuspiciousBooking(email, patientName) {
    if (!email || email === 'walk-in@praxis.local') return { isSuspicious: false };
    var now      = Date.now();
    var windowMs = SUSPICIOUS_WINDOW_MS;
    var normEmail = email.trim().toLowerCase();

    // Ищем записи с тем же email за последний час
    var recentByEmail = appts.filter(function(a) {
        if ((a.patientEmail || '').trim().toLowerCase() !== normEmail) return false;
        if (a.status === 'cancelled') return false;
        // Сравниваем по дате+времени записи (поле createdAt или fallback через дату+время)
        var ts = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        if (!ts) {
            // Fallback: если createdAt нет — считаем за сегодня (консервативно)
            var today = new Date().toISOString().split('T')[0];
            if (a.date === today) ts = now - 1800000; // считаем как 30 мин назад
        }
        return (now - ts) < windowMs;
    });

    var count = recentByEmail.length;
    if (count >= SUSPICIOUS_THRESHOLD) {
        return {
            isSuspicious: true,
            count: count,
            reason: count + ' Buchungen von ' + email + ' in der letzten Stunde'
        };
    }
    return { isSuspicious: false, count: count };
}

/**
 * Помечает запись как suspicious и логирует
 */
function markSuspicious(appt, reason) {
    appt.suspicious = true;
    appt.suspiciousReason = reason;
    writeAudit('[SUSPICIOUS] ' + appt.patientName + ' (' + appt.patientEmail + '): ' + reason, appt.praxisId);
    // Badge в sidebar
    updateSuspiciousBadge();
}

/**
 * Обновляет счётчик suspicious в sidebar (если есть badge)
 */
function updateSuspiciousBadge() {
    var myDocIds = new Set(doctors.filter(function(d) { return d.praxisId === (cu && cu.id); }).map(function(d) { return d.id; }));
    var count = appts.filter(function(a) {
        return a.suspicious && a.status !== 'cancelled' && myDocIds.has(a.doctorId);
    }).length;
    var badge = document.getElementById('badge-suspicious');
    if (badge) {
        badge.innerText  = count;
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
        badge.className = 'sidebar-nav-badge danger';
    }
}

/**
 * Рендерит панель suspicious в разделе Обзор
 */
function renderSuspiciousPanel() {
    var wrap = document.getElementById('suspicious-panel-wrap');
    if (!wrap) return;

    var myDocIds = new Set(doctors.filter(function(d) { return d.praxisId === (cu && cu.id); }).map(function(d) { return d.id; }));
    var suspList = appts.filter(function(a) {
        return a.suspicious && a.status !== 'cancelled' && myDocIds.has(a.doctorId);
    });

    if (!suspList.length) { wrap.innerHTML = ''; return; }

    var rows = suspList.slice(0, 8).map(function(a) {
        return '<div class="suspicious-row">' +
            '<div class="suspicious-icon">🚨</div>' +
            '<div class="suspicious-info">' +
                '<div class="suspicious-name">' + a.patientName + '</div>' +
                '<div class="suspicious-reason">' + (a.suspiciousReason || 'Verdächtige Buchungsaktivität') + '</div>' +
                '<div class="suspicious-meta">📅 ' + a.date + ' · ' + a.time + ' · ' + a.doctorName + '</div>' +
            '</div>' +
            '<div class="suspicious-actions">' +
                '<button class="btn-sm btn-cancel" onclick="dismissSuspicious(\'' + a.id + '\')" title="Markierung entfernen">✓ OK</button>' +
                '<button class="btn-sm" onclick="updateStatusWithNoShow(\'' + a.id + '\',\'cancelled\')" style="border-color:var(--danger);color:var(--danger);" title="Termin absagen">✗ Absagen</button>' +
                '<button class="btn-sm" onclick="toggleBlacklist(\'' + a.patientEmail + '\');renderSuspiciousPanel();renderKanban();" style="border-color:var(--danger);color:var(--danger);" title="Blacklisten">🚫</button>' +
            '</div>' +
        '</div>';
    }).join('');

    wrap.innerHTML =
        '<div class="suspicious-panel">' +
            '<div class="suspicious-panel-header">' +
                '<span>🚨 Verdächtige Buchungen <span class="suspicious-count">' + suspList.length + '</span></span>' +
                '<button class="btn-text" style="font-size:.75rem;" onclick="dismissAllSuspicious()">Alle OK</button>' +
            '</div>' +
            rows +
        '</div>';
}

function dismissSuspicious(apptId) {
    var a = appts.find(function(x) { return x.id === apptId; });
    if (a) { a.suspicious = false; delete a.suspiciousReason; saveAll(); }
    renderSuspiciousPanel();
    renderKanban();
    updateSuspiciousBadge();
}

function dismissAllSuspicious() {
    var myDocIds = new Set(doctors.filter(function(d) { return d.praxisId === (cu && cu.id); }).map(function(d) { return d.id; }));
    appts.forEach(function(a) {
        if (a.suspicious && myDocIds.has(a.doctorId)) { a.suspicious = false; delete a.suspiciousReason; }
    });
    saveAll();
    renderSuspiciousPanel();
    renderKanban();
    updateSuspiciousBadge();
}


// ── ЗАДАЧА 17: Global Blacklist Master ───────────────────────────────────────

// Ключи хранилища
const BL_KEY      = 'et2_blacklist';       // массив email (совместимость с index.js)
const BL_META_KEY = 'et2_blacklist_meta';  // массив объектов с деталями

function _getBlMeta() { return DB.arr(BL_META_KEY); }
function _saveBlMeta(meta) { DB.set(BL_META_KEY, meta); }

/** Добавить в blacklist из Master */
function masterAddBlacklist() {
    var email  = (document.getElementById('bl-email')?.value  || '').trim().toLowerCase();
    var phone  = (document.getElementById('bl-phone')?.value  || '').trim();
    var name   = (document.getElementById('bl-name')?.value   || '').trim();
    var reason = (document.getElementById('bl-reason')?.value || '').trim();
    var errEl  = document.getElementById('bl-err');

    if (!email) {
        errEl.textContent = 'E-Mail ist Pflichtfeld!';
        errEl.style.display = 'block';
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = 'Ungültige E-Mail-Adresse!';
        errEl.style.display = 'block';
        return;
    }
    errEl.style.display = 'none';

    var bl   = DB.arr(BL_KEY);
    var meta = _getBlMeta();

    // Проверяем дубли
    if (bl.includes(email)) {
        errEl.textContent = 'Diese E-Mail ist bereits gesperrt!';
        errEl.style.display = 'block';
        return;
    }

    // Добавляем в оба хранилища
    bl.push(email);
    DB.set(BL_KEY, bl);

    meta.push({
        email:     email,
        phone:     phone || null,
        name:      name  || null,
        reason:    reason || 'Manuell gesperrt durch Master',
        blockedAt: new Date().toISOString(),
        blockedBy: 'master'
    });
    _saveBlMeta(meta);

    // Отменяем все pending/confirmed записи этого пациента по всей системе
    var cancelCount = 0;
    appts.forEach(function(a) {
        if ((a.patientEmail || '').toLowerCase() === email && (a.status === 'pending' || a.status === 'confirmed')) {
            a.status = 'cancelled';
            cancelCount++;
        }
    });
    saveAll();

    writeAudit('🚫 Blacklist: ' + email + (name ? ' (' + name + ')' : '') + (cancelCount > 0 ? ' · ' + cancelCount + ' Termine abgesagt' : ''), 'master');
    showToast('🚫 ' + email + ' gesperrt' + (cancelCount > 0 ? ' · ' + cancelCount + ' Termine abgesagt' : ''), 'warning');

    // Очищаем поля
    ['bl-email','bl-phone','bl-name','bl-reason'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });

    renderGlobalBlacklist();
    renderMasterDashboard();
}

/** Убрать из blacklist */
function masterRemoveBlacklist(email) {
    var bl   = DB.arr(BL_KEY);
    var meta = _getBlMeta();
    DB.set(BL_KEY, bl.filter(function(e) { return e !== email; }));
    _saveBlMeta(meta.filter(function(m) { return m.email !== email; }));
    saveAll();
    writeAudit('✅ Blacklist entfernt: ' + email, 'master');
    showToast('✅ ' + email + ' entsperrt', 'success');
    renderGlobalBlacklist();
    renderMasterDashboard();
}

/** Обновлённый toggleBlacklist — теперь синхронизирует meta тоже */
function toggleBlacklist(email) {
    var bl = DB.arr(BL_KEY);
    if (bl.includes(email)) {
        masterRemoveBlacklist(email);
    } else {
        // Быстрое добавление без подробностей (из Kanban/NoShow)
        bl.push(email);
        DB.set(BL_KEY, bl);
        var meta = _getBlMeta();
        // Находим имя пациента если есть
        var appt = appts.find(function(a) { return (a.patientEmail || '').toLowerCase() === email.toLowerCase(); });
        meta.push({
            email:     email.toLowerCase(),
            phone:     null,
            name:      appt ? appt.patientName : null,
            reason:    'Aus Kanban/NoShow gesperrt',
            blockedAt: new Date().toISOString(),
            blockedBy: cu ? cu.id : 'admin'
        });
        _saveBlMeta(meta);
        saveAll();
        showToast('🚫 Patient blockiert!', 'warning');
    }
    renderKanban();
    // Если мы в Master — обновляем список
    if (document.getElementById('master-blacklist')) renderGlobalBlacklist();
}

/** Рендер списка blacklist в Master */
function renderGlobalBlacklist() {
    var el     = document.getElementById('master-blacklist');
    var badge  = document.getElementById('ms-bl-count');
    if (!el) return;

    var meta = _getBlMeta();
    var bl   = DB.arr(BL_KEY);

    // Синхронизируем: добавляем записи без meta (legacy)
    bl.forEach(function(email) {
        if (!meta.find(function(m) { return m.email === email; })) {
            meta.push({ email: email, phone: null, name: null, reason: 'Gesperrt', blockedAt: null, blockedBy: null });
        }
    });

    if (badge) badge.textContent = meta.length + ' gesperrt';

    if (!meta.length) {
        el.innerHTML = '<div style="color:rgba(255,215,0,.35);font-size:.82rem;padding:16px 20px;">Keine gesperrten Nutzer.</div>';
        return;
    }

    el.innerHTML = meta.map(function(m) {
        var dateStr = m.blockedAt
            ? new Date(m.blockedAt).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
            : '—';
        var source = m.blockedBy === 'master' ? '👑 Master' : (m.blockedBy ? '🏥 Praxis' : '—');
        // Считаем сколько записей было отменено
        var cancelledCount = appts.filter(function(a) {
            return (a.patientEmail||'').toLowerCase() === m.email && a.status === 'cancelled';
        }).length;

        return '<div class="master-bl-row">' +
            '<div class="master-bl-icon">🚫</div>' +
            '<div class="master-bl-info">' +
                '<div class="master-bl-email">' + m.email + (m.name ? ' · <span style="opacity:.7;">' + m.name + '</span>' : '') + '</div>' +
                '<div class="master-bl-meta">' +
                    (m.phone ? '📞 ' + m.phone + ' · ' : '') +
                    source + ' · ' + dateStr +
                    (cancelledCount > 0 ? ' · <span style="color:#ff6b6b;">' + cancelledCount + ' Termine abgesagt</span>' : '') +
                '</div>' +
                '<div class="master-bl-reason">' + (m.reason || '—') + '</div>' +
            '</div>' +
            '<button class="master-action-btn" onclick="masterRemoveBlacklist(\'' + m.email.replace(/'/g, "\\'") + '\')" title="Entsperren" style="color:#2ecc71;flex-shrink:0;">✅</button>' +
        '</div>';
    }).join('');
}


// ── ЗАДАЧА 18: Patient Monitor ────────────────────────────────────────────────
var _pmPage = 0;
var _pmPageSize = 15;
var _pmAllRows = [];

function renderPatientMonitor() {
    _pmPage = 0;
    _buildPatientMonitor();
}

function pmLoadMore() {
    _pmPage++;
    _buildPatientMonitor(true);
}

function _buildPatientMonitor(append) {
    var el      = document.getElementById('patient-monitor-list');
    var badge   = document.getElementById('ms-pat-count');
    var moreBtn = document.getElementById('pm-load-more');
    if (!el) return;

    var search      = (document.getElementById('pm-search')?.value || '').trim().toLowerCase();
    var filterPraxis= document.getElementById('pm-filter-praxis')?.value || '';
    var filterIns   = document.getElementById('pm-filter-ins')?.value   || '';
    var sort        = document.getElementById('pm-sort')?.value || 'name';

    // Заполняем фильтр прaxen при первом вызове
    var praxisSel = document.getElementById('pm-filter-praxis');
    if (praxisSel && praxisSel.options.length <= 1) {
        praxen.forEach(function(p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.logo || '🏥') + ' ' + p.name;
            praxisSel.appendChild(opt);
        });
    }

    var bl = DB.arr('et2_blacklist');

    // Строим карту пациентов из appts (включаем walk-in без аккаунта)
    var patMap = {};

    // Зарегистрированные пациенты
    patients.forEach(function(p) {
        patMap[p.email.toLowerCase()] = {
            id:        p.id,
            name:      p.name || (p.fname + ' ' + p.lname),
            email:     p.email,
            phone:     p.phone || null,
            ins:       p.ins   || '—',
            isRegistered: true,
            appts:     [],
            praxenSet: new Set()
        };
    });

    // Добавляем walk-in пациентов из appts
    appts.forEach(function(a) {
        var em = (a.patientEmail || '').toLowerCase();
        if (!em || em === 'walk-in@praxis.local') return;
        if (!patMap[em]) {
            patMap[em] = {
                id:        a.patientId,
                name:      a.patientName,
                email:     a.patientEmail,
                phone:     null,
                ins:       '—',
                isRegistered: false,
                appts:     [],
                praxenSet: new Set()
            };
        }
        patMap[em].appts.push(a);
        patMap[em].praxenSet.add(a.praxisId);
    });

    // Для зарегистрированных: добавляем их записи
    patients.forEach(function(p) {
        var em = p.email.toLowerCase();
        if (patMap[em]) {
            patMap[em].appts = appts.filter(function(a) {
                return (a.patientEmail || '').toLowerCase() === em || a.patientId === p.id;
            });
            patMap[em].appts.forEach(function(a) { patMap[em].praxenSet.add(a.praxisId); });
        }
    });

    // Фильтруем
    var rows = Object.values(patMap).filter(function(p) {
        if (search && !p.name.toLowerCase().includes(search) && !p.email.toLowerCase().includes(search)) return false;
        if (filterPraxis && !p.praxenSet.has(filterPraxis)) return false;
        if (filterIns && p.ins !== filterIns) return false;
        return true;
    });

    // Вычисляем статистику
    rows = rows.map(function(p) {
        var total     = p.appts.length;
        var confirmed = p.appts.filter(function(a) { return a.status === 'confirmed'; }).length;
        var cancelled = p.appts.filter(function(a) { return a.status === 'cancelled'; }).length;
        var noShowPct = total > 0 ? Math.round((cancelled / total) * 100) : 0;
        var lastAppt  = p.appts.filter(function(a) { return a.date; }).sort(function(a,b) { return b.date.localeCompare(a.date); })[0];
        var rated     = p.appts.filter(function(a) { return a.rating > 0; });
        var avgRating = rated.length > 0 ? (rated.reduce(function(s,a) { return s+a.rating; },0)/rated.length).toFixed(1) : null;
        return Object.assign({}, p, {
            total: total, confirmed: confirmed, cancelled: cancelled,
            noShowPct: noShowPct, lastDate: lastAppt ? lastAppt.date : null,
            avgRating: avgRating, isBlocked: bl.includes(p.email.toLowerCase())
        });
    });

    // Сортировка
    rows.sort(function(a, b) {
        if (sort === 'appts')  return b.total - a.total;
        if (sort === 'noshow') return b.noShowPct - a.noShowPct;
        if (sort === 'last')   return (b.lastDate || '').localeCompare(a.lastDate || '');
        return a.name.localeCompare(b.name, 'de');
    });

    _pmAllRows = rows;
    if (badge) badge.textContent = rows.length + ' Patienten';

    var slice = rows.slice(0, (_pmPage + 1) * _pmPageSize);

    if (!rows.length) {
        el.innerHTML = '<div style="color:rgba(255,215,0,.35);font-size:.82rem;padding:16px 20px;">Keine Patienten gefunden.</div>';
        if (moreBtn) moreBtn.style.display = 'none';
        return;
    }

    var html = slice.map(function(p) {
        var insColor = p.ins === 'PKV' ? '#f39c12' : p.ins === 'GKV' ? '#27ae60' : 'rgba(255,215,0,.4)';
        var noShowColor = p.noShowPct >= 30 ? '#ff6b6b' : p.noShowPct >= 15 ? '#f39c12' : 'rgba(255,215,0,.5)';
        var praxenNames = Array.from(p.praxenSet).map(function(pid) {
            var prx = praxen.find(function(x) { return x.id === pid; });
            return prx ? (prx.logo || '🏥') + ' ' + prx.city : '—';
        }).join(', ');

        return '<div class="pm-row' + (p.isBlocked ? ' pm-blocked' : '') + '">' +
            // Аватар
            '<div class="pm-avatar" style="background:' + (p.isBlocked ? '#c0392b' : '#4a2d8a') + ';">' +
                (p.isBlocked ? '🚫' : p.name.charAt(0).toUpperCase()) +
            '</div>' +
            // Основная инфо
            '<div class="pm-info">' +
                '<div class="pm-name">' + p.name +
                    (p.isBlocked ? ' <span class="suspicious-badge">BLOCKED</span>' : '') +
                    (!p.isRegistered ? ' <span style="font-size:.62rem;color:rgba(255,215,0,.3);margin-left:4px;">Walk-in</span>' : '') +
                '</div>' +
                '<div class="pm-email">' + p.email + (p.phone ? ' · ' + p.phone : '') + '</div>' +
                (praxenNames ? '<div class="pm-praxis">' + praxenNames + '</div>' : '') +
            '</div>' +
            // Статистика
            '<div class="pm-stats">' +
                '<div class="pm-stat"><div class="pm-stat-val">' + p.total + '</div><div class="pm-stat-lbl">Termine</div></div>' +
                '<div class="pm-stat"><div class="pm-stat-val" style="color:' + noShowColor + ';">' + p.noShowPct + '%</div><div class="pm-stat-lbl">No-Show</div></div>' +
                (p.avgRating ? '<div class="pm-stat"><div class="pm-stat-val" style="color:#ffd700;">' + p.avgRating + '★</div><div class="pm-stat-lbl">Ø Rat.</div></div>' : '') +
                '<div class="pm-stat"><div class="pm-stat-val" style="color:' + insColor + ';font-size:.72rem;">' + p.ins + '</div><div class="pm-stat-lbl">Vers.</div></div>' +
            '</div>' +
            // Действия
            '<div class="pm-actions">' +
                (p.lastDate ? '<div style="font-size:.65rem;color:rgba(255,215,0,.35);text-align:right;margin-bottom:4px;">' + p.lastDate + '</div>' : '') +
                '<div style="display:flex;gap:5px;justify-content:flex-end;">' +
                    '<button class="master-action-btn" onclick="openEHR(\'' + p.id + '\',\'' + p.name.replace(/'/g, "\\'") + '\')" title="Akte ansehen" style="color:#a78bfa;">📋</button>' +
                    '<button class="master-action-btn" onclick="toggleBlacklist(\'' + p.email.replace(/'/g, "\\'") + '\');renderPatientMonitor();" title="' + (p.isBlocked ? 'Entsperren' : 'Sperren') + '" style="color:' + (p.isBlocked ? '#2ecc71' : '#ff6b6b') + ';">' + (p.isBlocked ? '✅' : '🚫') + '</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }).join('');

    if (append) {
        el.innerHTML += html;
    } else {
        el.innerHTML = html;
    }

    if (moreBtn) {
        moreBtn.style.display = slice.length < rows.length ? 'block' : 'none';
    }
}


// ── ЗАДАЧА 19: Online-Buchungslimit (maxOnlineSlotsPerHour) ──────────────────

function updateSlotLimitDisplay(val) {
    var el = document.getElementById('slot-limit-display');
    if (el) el.textContent = val;
    // Цвет по значению
    var color = val <= 3 ? 'var(--danger)' : val <= 7 ? 'var(--warning)' : 'var(--success)';
    if (el) el.style.color = color;
}

function saveSlotLimit() {
    var val = parseInt(document.getElementById('slot-limit-slider')?.value || 10);
    if (!cu) return;

    // Обновляем в praxen массиве и в сессии
    var prx = praxen.find(function(p) { return p.id === cu.id; });
    if (prx) prx.maxOnlineSlotsPerHour = val;
    cu.maxOnlineSlotsPerHour = val;
    DB.set('et2_admin_sess', cu);
    saveAll();

    writeAudit('🎯 Slot-Limit auf ' + val + '/Std gesetzt', cu.id);
    showToast('✅ Limit gespeichert: max. ' + val + ' Buchungen/Std', 'success');

    var statusEl = document.getElementById('slot-limit-status');
    if (statusEl) {
        statusEl.innerHTML = '✅ Gespeichert: <strong>' + val + ' Buchungen/Stunde</strong>';
        statusEl.style.color = 'var(--success)';
    }

    renderOverviewWidgets(
        appts.filter(function(a) { return a.praxisId === cu.id; }),
        doctors.filter(function(d) { return d.praxisId === cu.id; })
    );
    loadSlotLimitSettings();
}

function loadSlotLimitSettings() {
    if (!cu) return;
    var limit  = cu.maxOnlineSlotsPerHour || 10;
    var slider = document.getElementById('slot-limit-slider');
    if (slider) slider.value = limit;
    updateSlotLimitDisplay(limit);

    // Показываем текущую нагрузку
    var todayStr = new Date().toISOString().split('T')[0];
    var nowHour  = new Date().getHours();
    var thisHour = appts.filter(function(a) {
        if (a.praxisId !== cu.id) return false;
        if (a.date !== todayStr) return false;
        if (a.status === 'cancelled') return false;
        var h = parseInt((a.time || '0:0').split(':')[0]);
        return h === nowHour;
    }).length;

    var queueCount = appts.filter(function(a) {
        return a.praxisId === cu.id && a.status === 'waiting_queue';
    }).length;

    var pct = Math.min(100, Math.round((thisHour / limit) * 100));
    var color = pct >= 100 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)';
    var currentEl = document.getElementById('slot-limit-current');
    if (currentEl) {
        currentEl.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
                '<span style="color:var(--text-muted);">Diese Stunde (' + nowHour + ':00–' + (nowHour+1) + ':00):</span>' +
                '<strong style="color:' + color + ';">' + thisHour + ' / ' + limit + ' Buchungen (' + pct + '%)</strong>' +
            '</div>' +
            '<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">' +
                '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:3px;transition:width .4s;"></div>' +
            '</div>' +
            (queueCount > 0 ? '<div style="margin-top:8px;color:var(--warning);font-size:.75rem;">🪑 ' + queueCount + ' Patienten in der Live-Warteschlange</div>' : '') +
            (pct >= 100 ? '<div style="margin-top:6px;color:var(--danger);font-size:.75rem;">🔴 Limit erreicht — neue Patienten sehen die Warteschlange</div>' : '');
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
        // Задача 9: проверяем статус аккаунта
        if (prx.accountStatus === 'blocked') {
            errEl.innerHTML = '🚫 <strong>Konto gesperrt.</strong> Bitte kontaktieren Sie den Administrator.';
            errEl.style.display = 'block';
            return;
        }
        // ЗАДАЧА 14: pending → входим, но показываем экран ожидания
        if (prx.accountStatus === 'pending') {
            if (prx.pass.length < 60) { prx.pass = await hashPassword(pass); saveAll(); }
            DB.set('et2_admin_sess', prx);
            DB.set('et2_admin_login_time', Date.now());
            location.reload(); return;
        }
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
    // ЗАДАЧА 13: LANR + BSNR
    const bsnr  = (document.getElementById('r-bsnr')?.value || '').replace(/\D/g,'');
    const lanr  = (document.getElementById('r-lanr')?.value || '').replace(/\D/g,'');

    if (!name || !city || !email || !pw) { errEl.innerText = 'Pflichtfelder ausfüllen!'; errEl.style.display = 'block'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.innerText = 'Bitte gültige E-Mail eingeben!'; errEl.style.display = 'block'; return; }
    if (pw !== pc) { errEl.innerText = 'Passwörter stimmen nicht überein!'; errEl.style.display = 'block'; return; }
    if (pw.length < 8) { errEl.innerText = 'Passwort mindestens 8 Zeichen!'; errEl.style.display = 'block'; return; }
    // ЗАДАЧА 13: валидация BSNR + LANR
    if (!isLANRValid(bsnr)) { errEl.innerHTML = '❌ <strong>BSNR</strong> muss genau 9 Ziffern haben!'; errEl.style.display = 'block'; document.getElementById('r-bsnr')?.focus(); return; }
    if (!isLANRValid(lanr)) { errEl.innerHTML = '❌ <strong>LANR</strong> muss genau 9 Ziffern haben!'; errEl.style.display = 'block'; document.getElementById('r-lanr')?.focus(); return; }
    if (praxen.find(p => p.bsnr === bsnr)) { errEl.innerHTML = '❌ Diese <strong>BSNR</strong> ist bereits registriert!'; errEl.style.display = 'block'; return; }
    if (praxen.find(p => p.email.toLowerCase() === email)) { errEl.innerText = 'E-Mail bereits registriert!'; errEl.style.display = 'block'; return; }
    if (patients.find(p => p.email.toLowerCase() === email)) { errEl.innerText = 'E-Mail bereits als Patient registriert!'; errEl.style.display = 'block'; return; }
    const hashedPw = await hashPassword(pw);
    const slug = name.toLowerCase().replace(/[äÄ]/g,'ae').replace(/[öÖ]/g,'oe').replace(/[üÜ]/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,32);
    // ЗАДАЧА 15: Approbation обязательна
    if (!_approBase64 || !_approMeta) {
        errEl.innerHTML = '❌ Bitte laden Sie Ihre <strong>Approbationsurkunde</strong> hoch (PDF oder Bild)!';
        errEl.style.display = 'block';
        document.getElementById('appro-drop-zone')?.scrollIntoView({ behavior: 'smooth' });
        return;
    }
    var approbationScan = { base64: _approBase64, name: _approMeta.name, size: _approMeta.size, type: _approMeta.type, uploadedAt: new Date().toISOString() };
    praxen.push({ id: generateID(), name, slug, city, address: addr, phone, email, pass: hashedPw, logo, region, bsnr, lanrDirector: lanr, accountStatus: 'pending', verifiedAt: null, registeredAt: new Date().toISOString(), approbationScan: approbationScan });
    saveAll();
    // Сбрасываем скан
    _approBase64 = null; _approMeta = null;
    showToast('✅ Registrierung eingereicht! Wir prüfen Ihre Unterlagen.', 'success');
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
    const newAppt = { id: generateID(), patientId: 'walk-in-' + generateID(), patientName: name, patientEmail: phone || 'walk-in@praxis.local', doctorId: docId, doctorName: doc.name, praxisId: cu.id, praxisName: cu.name, date, time: mbSelSlot, status: 'confirmed', apptType: type, reason: reason || phone, note: phone ? `Tel: ${phone}` : 'Manuelle Buchung (Walk-in)', rating: null, urgent: false, docs: [], isManual: true, createdAt: new Date().toISOString() };
    // ЗАДАЧА 16: проверяем suspicious
    const suspCheck = checkSuspiciousBooking(newAppt.patientEmail, name);
    if (suspCheck.isSuspicious) markSuspicious(newAppt, suspCheck.reason);
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
    // Задача 6: обновляем footer user-block
    const avatarEl = document.getElementById('sidebar-avatar');
    const footerNameEl = document.getElementById('sidebar-praxis-name-footer');
    if (avatarEl) avatarEl.innerText = cu.logo || '🏥';
    if (footerNameEl) footerNameEl.innerText = cu.name;

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

    renderOverviewWidgets(myAppts, myDocs);
    renderSuspiciousPanel();
    updateSuspiciousBadge();
    renderKanban();
    renderDoctorsList();
    renderAuditLog();
    updateStats();
    initManualBooking();
    renderNoShowPanel();
    loadEJSConfigFields();
    renderAuslastung();
}

// ── ЗАДАЧА 4: Виджеты-карточки раздела Обзор ────────────────────────────────
function renderOverviewWidgets(myAppts, myDocs) {
    const wrap = document.getElementById('overview-widgets');
    if (!wrap || !cu) return;

    const todayStr   = new Date().toISOString().split('T')[0];
    const todayApts  = myAppts.filter(a => a.date === todayStr && a.status !== 'cancelled');
    const todayDone  = todayApts.filter(a => a.status === 'confirmed').length;
    const todayLeft  = todayApts.length - todayDone;

    const subActive  = cu.subscriptionActive !== false;
    const subExpires = cu.subscriptionExpires || null;
    const subPlan    = cu.subscriptionPlan || 'Demo';
    let subDaysLeft  = null;
    if (subExpires) subDaysLeft = Math.ceil((new Date(subExpires) - new Date()) / 86400000);
    const subWarn    = subActive && subDaysLeft !== null && subDaysLeft <= 7 && subDaysLeft > 0;
    const subExpired = !subActive || (subDaysLeft !== null && subDaysLeft <= 0);

    const maxSlots  = cu.maxOnlineSlotsPerHour || 10;
    const usedSlots = myAppts.filter(a => a.date === todayStr && a.status !== 'cancelled').length;
    const slotPct   = Math.min(100, Math.round((usedSlots / (maxSlots * 8)) * 100));
    const slotWarn  = slotPct >= 70 && slotPct < 90;
    const slotFull  = slotPct >= 90;

    const activeDocs = myDocs.filter(d => d.status === 'active').length;
    const totalDocs  = myDocs.length;
    const vacDocs    = myDocs.filter(d => d.status === 'urlaub').length;

    const todayBadge  = todayLeft > 0 ? '<div class="ow-badge info">' + todayLeft + ' ausstehend</div>' : '<div class="ow-badge ok">✅ Alles erledigt</div>';
    const subBadge    = subExpired ? '<div class="ow-badge danger">❌ Abgelaufen</div>' : subWarn ? '<div class="ow-badge warn">⚠️ Noch ' + subDaysLeft + ' Tage</div>' : '<div class="ow-badge ok">✅ Aktiv</div>';
    const slotColor   = slotFull ? 'var(--danger)' : slotWarn ? 'var(--warning)' : 'var(--success)';
    const slotBadge   = slotFull ? '<div class="ow-badge danger">🔴 Fast voll</div>' : slotWarn ? '<div class="ow-badge warn">🟡 Auslastung hoch</div>' : '<div class="ow-badge ok">🟢 Kapazität frei</div>';
    const docBadge    = activeDocs === 0 ? '<div class="ow-badge danger">⚠️ Keine aktiven Ärzte</div>' : vacDocs > 0 ? '<div class="ow-badge warn">🌴 ' + vacDocs + ' im Urlaub</div>' : '<div class="ow-badge ok">✅ Alle verfügbar</div>';
    const subClass    = subExpired ? 'ow-card ow-subscription expired' : 'ow-card ow-subscription';
    const subSubtext  = subExpires ? 'Läuft ab: ' + subExpires : 'Unbegrenzt (Demo)';

    wrap.innerHTML =
        '<div class="ow-card ow-today">' +
            '<div class="ow-icon">📅</div>' +
            '<div class="ow-value">' + todayLeft + '</div>' +
            '<div class="ow-label">Heute noch</div>' +
            '<div class="ow-sub">' + todayApts.length + ' gesamt &middot; ' + todayDone + ' erledigt</div>' +
            todayBadge +
        '</div>' +
        '<div class="' + subClass + '">' +
            '<div class="ow-icon">💳</div>' +
            '<div class="ow-value">' + subPlan + '</div>' +
            '<div class="ow-label">Abonnement</div>' +
            '<div class="ow-sub">' + subSubtext + '</div>' +
            subBadge +
        '</div>' +
        '<div class="ow-card ow-slots">' +
            '<div class="ow-icon">🎯</div>' +
            '<div class="ow-value">' + usedSlots + '</div>' +
            '<div class="ow-label">Slots heute</div>' +
            '<div class="ow-sub">Max ' + maxSlots + '/Std &middot; ' + slotPct + '% ausgelastet</div>' +
            slotBadge +
            '<div class="ow-progress"><div class="ow-progress-bar" style="width:' + slotPct + '%;background:' + slotColor + ';"></div></div>' +
        '</div>' +
        '<div class="ow-card ow-doctors">' +
            '<div class="ow-icon">👨‍⚕️</div>' +
            '<div class="ow-value">' + activeDocs + '</div>' +
            '<div class="ow-label">Aktive Ärzte</div>' +
            '<div class="ow-sub">' + totalDocs + ' gesamt' + (vacDocs > 0 ? ' &middot; ' + vacDocs + ' im Urlaub' : '') + '</div>' +
            docBadge +
        '</div>';
}

function loadSettingsDropdowns() {
    if (!cu) return;
    loadSlotLimitSettings(); // ЗАДАЧА 19
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
                    <div class="di-spec">${d.spec} · ${d.slotDuration}Min-Slots${d.lanr ? '<span class="lanr-badge">LANR ' + d.lanr + '</span>' : '<span class="lanr-badge warn">⚠️ Keine LANR</span>'}</div>
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
                <button class="btn-sm" onclick="openEditDoctorModal('${d.id}')" style="border-color:var(--primary);color:var(--primary);" title="Bearbeiten">✏️</button>
                <button class="btn-sm btn-cancel" onclick="removeDoctor('${d.id}')" title="Entfernen">✕</button>
            </div>
        </div>`;
    }).join('');
}

// ── ЗАДАЧА 5: Модальные окна добавления / редактирования врача ──────────────
const DOC_PALETTE = ['#7c5cbf','#27ae60','#c0392b','#2060a0','#967BB6','#e67e22','#8e44ad','#16a085','#1abc9c','#e74c3c'];
let _docFormColor = DOC_PALETTE[0];

function _renderColorPicker(selected) {
    const wrap = document.getElementById('doc-form-colors');
    if (!wrap) return;
    wrap.innerHTML = DOC_PALETTE.map(function(c) {
        var border = c === selected ? '3px solid #fff' : '3px solid transparent';
        var shadow = c === selected ? '0 0 0 2px ' + c : 'none';
        return '<div onclick="_pickColor(\'' + c + '\')" style="width:28px;height:28px;border-radius:50%;background:' + c + ';cursor:pointer;border:' + border + ';box-shadow:' + shadow + ';transition:all .15s;" title="' + c + '"></div>';
    }).join('');
}

function _pickColor(c) {
    _docFormColor = c;
    _renderColorPicker(c);
}

function _openDocModal(titleText, subtitleText, docData) {
    _docFormColor = docData ? (docData.color || DOC_PALETTE[0]) : DOC_PALETTE[doctors.filter(d => d.praxisId === cu.id).length % DOC_PALETTE.length];
    document.getElementById('doc-form-title').innerText    = titleText;
    document.getElementById('doc-form-subtitle').innerText = subtitleText;
    document.getElementById('doc-form-id').value           = docData ? docData.id : '';
    document.getElementById('doc-form-name').value         = docData ? docData.name : '';
    document.getElementById('doc-form-spec').value         = docData ? docData.spec : '';
    document.getElementById('doc-form-err').style.display  = 'none';
    const durSel = document.getElementById('doc-form-duration');
    if (durSel) durSel.value = docData ? String(docData.slotDuration || 15) : '15';
    const brkSel = document.getElementById('doc-form-break');
    if (brkSel) {
        const brk = docData ? ((docData.breakStart && docData.breakEnd) ? docData.breakStart + '-' + docData.breakEnd : '') : '13:00-14:00';
        brkSel.value = brk || '';
    }
    // ЗАДАЧА 13: LANR поле
    const lanrInput = document.getElementById('doc-form-lanr');
    const lanrStatus = document.getElementById('doc-lanr-status');
    if (lanrInput) {
        lanrInput.value = docData ? (docData.lanr || '') : '';
        if (lanrStatus) lanrStatus.innerHTML = '';
        if (lanrInput.value) validateLANR(lanrInput, 'doc-lanr-status', 'LANR');
    }
    _renderColorPicker(_docFormColor);
    const overlay = document.getElementById('doc-form-overlay');
    const modal   = document.getElementById('doc-form-modal');
    overlay.style.display = 'block';
    modal.style.display   = 'block';
    requestAnimationFrame(() => {
        modal.style.opacity   = '1';
        modal.style.transform = 'translate(-50%,-50%) scale(1)';
    });
    setTimeout(() => document.getElementById('doc-form-name').focus(), 100);
}

function openAddDoctorModal() {
    _openDocModal('➕ Arzt hinzufügen', 'Neues Teammitglied anlegen', null);
}

function openEditDoctorModal(id) {
    const d = doctors.find(x => x.id === id && x.praxisId === cu.id);
    if (!d) return;
    _openDocModal('✏️ Arzt bearbeiten', d.spec, d);
}

function closeDocFormModal() {
    const modal   = document.getElementById('doc-form-modal');
    const overlay = document.getElementById('doc-form-overlay');
    modal.style.opacity   = '0';
    modal.style.transform = 'translate(-50%,-50%) scale(.96)';
    setTimeout(() => { modal.style.display = 'none'; overlay.style.display = 'none'; }, 220);
}

function saveDocFormModal() {
    const id   = document.getElementById('doc-form-id').value;
    const name = document.getElementById('doc-form-name').value.trim();
    const spec = document.getElementById('doc-form-spec').value.trim();
    const dur  = document.getElementById('doc-form-duration').value || '15';
    const brk  = document.getElementById('doc-form-break').value || '';
    // ЗАДАЧА 13: LANR врача
    const lanr = (document.getElementById('doc-form-lanr')?.value || '').replace(/\D/g,'');
    const errEl = document.getElementById('doc-form-err');

    if (!name || !spec) {
        errEl.innerText = 'Bitte Name und Fachrichtung eingeben!';
        errEl.style.display = 'block';
        return;
    }
    // Валидация LANR — обязательна при добавлении нового врача
    if (!id && !isLANRValid(lanr)) {
        errEl.innerHTML = '❌ <strong>LANR</strong> muss genau 9 Ziffern haben! (Lebenslange Arztnummer)';
        errEl.style.display = 'block';
        document.getElementById('doc-form-lanr')?.focus();
        return;
    }
    // Проверяем уникальность LANR
    if (lanr && isLANRValid(lanr)) {
        const duplicate = doctors.find(d => d.lanr === lanr && d.id !== id);
        if (duplicate) {
            errEl.innerHTML = '❌ Diese <strong>LANR</strong> ist bereits vergeben (' + duplicate.name + ')';
            errEl.style.display = 'block';
            return;
        }
    }
    errEl.style.display = 'none';
    const [bs, be] = brk ? brk.split('-') : ['', ''];
    if (id) {
        // Редактирование
        const d = doctors.find(x => x.id === id);
        if (d) {
            d.name = name; d.spec = spec; d.slotDuration = parseInt(dur);
            d.breakStart = bs || ''; d.breakEnd = be || ''; d.color = _docFormColor;
            if (lanr && isLANRValid(lanr)) d.lanr = lanr;
        }
        writeAudit('Arzt ' + name + ' bearbeitet' + (lanr ? ' (LANR: ' + lanr + ')' : ''), cu.id);
        showToast('✅ ' + name + ' aktualisiert!', 'success');
    } else {
        // Добавление — LANR обязателен
        doctors.push({ id: generateID(), praxisId: cu.id, name, spec, status: 'active',
            slotDuration: parseInt(dur), breakStart: bs || '', breakEnd: be || '',
            color: _docFormColor, lanr: lanr });
        writeAudit('Arzt ' + name + ' (' + spec + ', LANR: ' + lanr + ') hinzugefügt', cu.id);
        showToast('✅ ' + name + ' zum Team hinzugefügt!', 'success');
    }
    saveAll();
    closeDocFormModal();
    renderDashboard();
}

// Совместимость: старый addDoctor() больше не нужен, но оставляем заглушку
function addDoctor() { openAddDoctorModal(); }

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
    const pending  = sorted.filter(a => a.status === 'pending' || a.status === 'waiting_queue');
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
    const suspBadge  = a.suspicious ? '<span class="suspicious-badge">🚨 SUSPICIOUS</span>' : '';
    const queueBadge = a.status === 'waiting_queue' ? '<span class="queue-badge">🪑 Warteschlange</span>' : '';
    const docsBadge = (a.docs && a.docs.length) ? `<div style="margin-top:4px;"><button onclick="openDocPreview('${a.id}');event.stopPropagation()" style="background:var(--primary-light);border:1px solid var(--lavender-deep);color:var(--primary);border-radius:8px;padding:3px 9px;font-size:.72rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">📎 ${a.docs.length} Dokument${a.docs.length > 1 ? 'e' : ''} ansehen</button></div>` : '';
    return `<div class="kanban-card${a.urgent ? ' urgent-card' : ''}${a.suspicious ? ' suspicious-card' : ''}${a.status === 'waiting_queue' ? ' queue-card' : ''}" draggable="true" data-id="${a.id}">
        <div class="kc-name">${a.status === 'waiting_queue' ? '<span style="color:var(--warning);">🪑 </span>' : ''}${a.suspicious ? '<span class="suspicious-badge">🚨</span> ' : ''}${a.urgent ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--danger);margin-right:5px;animation:urgentDot 1s infinite;vertical-align:middle;"></span>⚠️ ` : ''}${a.patientName}${isBlocked ? ' 🚫' : ''}${nsBadge}${suspBadge}</div>
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

// toggleBlacklist заменён в ЗАДАЧА 17 — см. masterAddBlacklist

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
        // Задача 9+14: проверяем актуальный статус praxis из базы
        var freshPrx = praxen.find(function(p) { return p.id === cu.id; });
        if (freshPrx) cu = freshPrx; // обновляем cu свежими данными

        if (freshPrx && freshPrx.accountStatus === 'blocked') {
            DB.remove('et2_admin_sess');
            document.getElementById('auth-shell').style.display    = 'flex';
            document.getElementById('dashboard-shell').style.display = 'none';
            setTimeout(function() {
                var errEl = document.getElementById('login-err');
                if (errEl) { errEl.innerHTML = '🚫 <strong>Konto gesperrt.</strong> Bitte kontaktieren Sie den Administrator.'; errEl.style.display = 'block'; }
            }, 200);
        } else if (freshPrx && freshPrx.accountStatus === 'pending') {
            // ЗАДАЧА 14: показываем dashboard-shell но с pending overlay
            document.getElementById('auth-shell').style.display    = 'none';
            document.getElementById('dashboard-shell').style.display = 'flex';
            showPendingOverlay(freshPrx);
            startSessionTimer();
        } else {
            document.getElementById('auth-shell').style.display    = 'none';
            document.getElementById('dashboard-shell').style.display = 'flex';
            initEmailJS();
            checkImpersonationOnLoad();
            setTimeout(renderDashboard, 300);
            startSessionTimer();
        }
    } else {
        document.getElementById('auth-shell').style.display    = 'flex';
        document.getElementById('dashboard-shell').style.display = 'none';
    }

    // GDPR
    if (!DB.get('et2_gdpr')) { setTimeout(() => { const b = document.getElementById('gdpr-box'); if(b) b.style.display = 'block'; }, 1500); }
})();

function acceptGDPR() { DB.set('et2_gdpr', true); const b = document.getElementById('gdpr-box'); if(b) b.style.display = 'none'; }
// ==========================================
// 1. CONFIGURATION & DATA
// ==========================================

const API_BASE_URL = "http://10.30.12.145:8000/api"; 

const STORAGE_KEY_DATA = 'presensi_app_data_final';
const STORAGE_KEY_USER = 'presensi_user_session_final';
const STORAGE_KEY_TOKEN = 'presensi_user_token_dynamic';

let currentCalendarDate = new Date(); 
let currentUserLat = null, currentUserLon = null, activeUser = null;
let currentNotifMessage = "Tidak ada notifikasi baru.";

// Clock Variables
let appClockOffset = 0; 
let isClockSynced = false;
let lastTickTime = Date.now(); 

// Data Libur (Dinamis dari API)
let HOLIDAYS_DATA = {}; 

// Daftar Tanggal yang WAJIB dianggap Cuti Bersama (Override API)
const FORCED_CUTI_DATES = [
    "2026-02-16", "2026-03-18", "2026-03-20", "2026-03-23", 
    "2026-03-24", "2026-05-15", "2026-05-28", "2026-12-26"
];

// --- HELPER BARU: Format Hanya Jam (HH:mm:ss) ---
// Solusi Masalah #1: Menghilangkan tanggal, sisa jam saja
function formatTimeOnly(dateTimeStr) {
    // Cek jika kosong atau default
    if (!dateTimeStr || dateTimeStr === '--:--:--' || dateTimeStr === '-' || dateTimeStr === null) {
        return '--:--:--';
    }
    // Jika formatnya "YYYY-MM-DD HH:mm:ss", ambil bagian setelah spasi
    if (dateTimeStr.includes(' ')) {
        return dateTimeStr.split(' ')[1];
    }
    // Jika sudah format jam saja, kembalikan langsung
    return dateTimeStr;
}

// ==========================================
// 2. INITIALIZATION & LOGIN
// ==========================================

function onAppReady() {
    const savedUser = localStorage.getItem(STORAGE_KEY_USER);
    const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN);

    if (savedUser && savedToken) {
        try { 
            activeUser = JSON.parse(savedUser);
            activeUser.token = savedToken; 
            initDashboard(); 
        } catch (e) { forceLocalLogout(); }
    } else { 
        switchView('login'); 
        const lastEmail = localStorage.getItem('presensi_last_email');
        const inputUser = document.getElementById('inputUser'); 
        if (lastEmail && inputUser) inputUser.value = lastEmail;
    }

    const loginForm = document.getElementById('loginForm');
    if(loginForm) {
        const newForm = loginForm.cloneNode(true);
        loginForm.parentNode.replaceChild(newForm, loginForm);
        newForm.addEventListener('submit', handleLogin);
    }

    const btn = document.getElementById('btnAbsen');
    if(btn) btn.onclick = processAttendance;
    
    document.addEventListener("resume", () => { syncTimeWithServer(); }, false);
}

// --- FUNGSI LOGIN ---
async function handleLogin(e) {
    e.preventDefault();
    const emailEl = document.getElementById('inputUser') || document.getElementById('email');
    const passEl = document.getElementById('inputPass') || document.getElementById('password');
    const email = emailEl.value.trim();
    const password = passEl.value.trim();
    
    if (!email || !password) return showAppModal("Gagal", "Email dan Password wajib diisi", "error");

    showAppModal("Memproses", "Menghubungi Server...", "info");

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); 

        const response = await fetch(`${API_BASE_URL}/login.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const result = await response.json();

        if (!response.ok || (result.status && result.status !== 'success')) {
            throw new Error(result.message || "Login Gagal");
        }

        const userToken = result.data.token;
        const userData = result.data.user;
        localStorage.setItem(STORAGE_KEY_TOKEN, userToken);

        const profileResponse = await fetch(`${API_BASE_URL}/profile.php`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${userToken}`, 'Content-Type': 'application/json' }
        });
        
        let finalUserData = userData;
        if (profileResponse.ok) {
            const profileResult = await profileResponse.json();
            if(profileResult.data) finalUserData = profileResult.data;
        }

        let formattedTTL = "-";
        if (finalUserData.tempat_lahir && finalUserData.tanggal_lahir) {
            try {
                const d = new Date(finalUserData.tanggal_lahir);
                formattedTTL = `${finalUserData.tempat_lahir}, ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
            } catch(e) { formattedTTL = `${finalUserData.tempat_lahir}, ${finalUserData.tanggal_lahir}`; }
        }

        activeUser = {
            username: email,
            fullname: finalUserData.name || finalUserData.nama || "User", 
            nip: finalUserData.nip || "-",                 
            ttl: formattedTTL,
            address: finalUserData.alamat || "-",          
            status: finalUserData.jabatan || "PNS",        
            token: userToken 
        };

        localStorage.setItem('presensi_last_email', email);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(activeUser));
        
        document.getElementById('appModal').classList.add('d-none');
        startLoadingToDashboard();

    } catch (error) {
        showAppModal("Gagal Masuk", error.message, "error");
    }
}

function startLoadingToDashboard() {
    const loginView = document.getElementById('viewLogin');
    loginView.classList.add('d-none');
    const loadingView = document.getElementById('viewLoading');
    loadingView.classList.remove('d-none');

    let percent = 0;
    const percentText = document.getElementById('loadingPercent');
    const interval = setInterval(() => {
        percent += 20;
        if (percent >= 100) {
            clearInterval(interval);
            loadingView.classList.add('d-none');
            initDashboard();
            document.getElementById('mainLayout').classList.add('fade-in');
        }
        percentText.innerText = percent + "%";
    }, 50);
}

// ==========================================
// 3. DASHBOARD & SYSTEM
// ==========================================

function initDashboard() {
    document.querySelectorAll('.user-fullname-text').forEach(el => el.innerText = activeUser.fullname);
    if(document.getElementById('profName')) document.getElementById('profName').innerText = activeUser.fullname;
    if(document.getElementById('profNIP')) document.getElementById('profNIP').innerText = activeUser.nip;
    if(document.getElementById('profTTL')) document.getElementById('profTTL').innerText = activeUser.ttl;
    if(document.getElementById('profAddress')) document.getElementById('profAddress').innerText = activeUser.address;
    
    const nameParts = activeUser.fullname.trim().split(/\s+/);
    let initials = '';
    for (let i = 0; i < Math.min(nameParts.length, 3); i++) initials += nameParts[i][0].toUpperCase();
    document.querySelectorAll('.user-initials').forEach(el => el.innerText = initials);
    if(document.getElementById('profInitials')) document.getElementById('profInitials').innerText = initials;

    const elStatus = document.getElementById('profStatus');
    if(elStatus) {
        elStatus.innerText = activeUser.status;
        if (activeUser.status.includes('PNS')) elStatus.className = 'badge bg-primary rounded-pill px-3 py-2';
        else if (activeUser.status.includes('PPPK')) elStatus.className = 'badge bg-success rounded-pill px-3 py-2';
        else elStatus.className = 'badge bg-secondary rounded-pill px-3 py-2';
    }

    syncTimeWithServer(); 
    getLocation(); 

    setInterval(() => {
        detectTimeTampering(); 
        updateDateDisplay(); 
        updateLiveClock(); 
        checkNotification(); 
    }, 1000);

    setInterval(syncTimeWithServer, 60000);

    renderCalendar();
    checkTodayStatus();     
    loadAttendanceHistory(); 
    
    const now = new Date();
    fetchHolidays(now.getMonth() + 1, now.getFullYear());
    
    switchView('dashboard');
}

// ==========================================
// 4. API IMPLEMENTATION
// ==========================================

async function checkTodayStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/today.php`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${activeUser.token}`, 'Content-Type': 'application/json' }
        });

        if (!response.ok) return;
        const result = await response.json();
        const data = result.data;

        if (data) {
            const elIn = document.getElementById('clockInDisplay');
            const elOut = document.getElementById('clockOutDisplay');
            
            // --- FIX MASALAH #1: Format Jam Saja (Buang Tanggal) ---
            const rawIn = data.clock_in_time || data.jam_masuk;
            const rawOut = data.clock_out_time || data.jam_keluar || data.jam_pulang;

            const inTime = formatTimeOnly(rawIn);
            const outTime = formatTimeOnly(rawOut);

            if (elIn) elIn.innerText = inTime;
            if (elOut) elOut.innerText = outTime;

            // --- FIX MASALAH #3: Force update bubble dengan status hari ini ---
            forceUpdateTodayBubble(inTime !== '--:--:--');
        }
    } catch (e) { console.warn("Gagal cek status hari ini:", e); }
}

async function fetchHolidays(month, year) {
    try {
        if (!month) month = currentCalendarDate.getMonth() + 1;
        if (!year) year = currentCalendarDate.getFullYear();

        const response = await fetch(`${API_BASE_URL}/calendar.php?month=${month}&year=${year}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${activeUser.token}`, 'Content-Type': 'application/json' }
        });

        if (!response.ok) return; 
        
        const result = await response.json();
        
        if (result.status === 'success' && result.data && result.data.holidays) {
            const holidaysFromApi = result.data.holidays;
            for (const [dateKey, holidayData] of Object.entries(holidaysFromApi)) {
                let type = holidayData.type; 
                if (FORCED_CUTI_DATES.includes(dateKey)) {
                    type = 'cuti';
                }
                HOLIDAYS_DATA[dateKey] = { name: holidayData.name, type: type };
            }
            renderCalendar();
        }
    } catch (e) { console.warn("Gagal ambil data kalender:", e); }
}

// ==========================================
// 5. UTILS (Time & Location)
// ==========================================

async function syncTimeWithServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/login.php`, { method: 'HEAD' });
        const dateHeader = response.headers.get('Date');
        if (dateHeader) {
            const serverTime = new Date(dateHeader).getTime();
            const now = Date.now();
            appClockOffset = serverTime - now;
            isClockSynced = true;
            return; 
        }
    } catch (e) { }

    try {
        const response = await fetch("https://worldtimeapi.org/api/timezone/Asia/Jakarta");
        if (response.ok) {
            const data = await response.json();
            appClockOffset = new Date(data.datetime).getTime() - Date.now();
            isClockSynced = true;
            return;
        }
    } catch (e) { }
}

function getAppTime() {
    return isClockSynced ? new Date(new Date().getTime() + appClockOffset) : new Date();
}

function updateLiveClock() {
    const now = getAppTime(); 
    const timeStr = now.toLocaleTimeString('en-GB', { hour12: false }); 
    const clockEl = document.getElementById('liveServerClock');
    if (clockEl) clockEl.innerText = timeStr;
}

function detectTimeTampering() {
    const currentTick = Date.now();
    if (Math.abs(currentTick - lastTickTime) > 60000) syncTimeWithServer();
    lastTickTime = currentTick;
}

function getLocation() {
    if (navigator.geolocation) {
        const textEls = document.querySelectorAll('.locationTextShort');
        textEls.forEach(el => { el.innerText = "Mencari lokasi..."; el.style.color = '#0088CC'; });

        navigator.geolocation.getCurrentPosition(
            (p) => {
                currentUserLat = p.coords.latitude;
                currentUserLon = p.coords.longitude;
                fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${currentUserLat}&longitude=${currentUserLon}&localityLanguage=id`)
                    .then(res => res.json())
                    .then(data => {
                        const locName = (data.locality || '') + ", " + (data.city || data.principalSubdivision || '');
                        textEls.forEach(el => { el.innerText = locName || "Lokasi ditemukan"; el.style.color = '#0088CC'; el.classList.remove('text-danger'); });
                    })
                    .catch(() => { textEls.forEach(el => { el.innerText = "Lokasi ditemukan"; el.style.color = '#0088CC'; }); });
            },
            (err) => {
                let msg = "GPS Error";
                if (err.code === 1) msg = "Izin Ditolak"; 
                else if (err.code === 2) msg = "GPS Mati"; 
                else if (err.code === 3) msg = "Timeout"; 
                textEls.forEach(el => { el.innerText = msg; el.style.color = 'red'; });
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
    } else {
        document.querySelectorAll('.locationTextShort').forEach(el => { el.innerText = "Tidak Support GPS"; el.style.color = 'red'; });
    }
}

function refreshLocation() {
    const icons = document.querySelectorAll('.fa-sync-alt');
    icons.forEach(i => i.classList.add('fa-spin'));
    getLocation();
    setTimeout(() => { icons.forEach(i => i.classList.remove('fa-spin')); }, 2000);
}

// ==========================================
// 6. ATTENDANCE LOGIC
// ==========================================

async function processAttendance() {
    if(!currentUserLat || !currentUserLon) {
        return showAppModal("Gagal", "Lokasi belum ditemukan. Pastikan GPS aktif.", "error");
    }
    
    const now = getAppTime();
    const currentHour = now.getHours();
    const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });

    const elIn = document.getElementById('clockInDisplay').innerText;
    const elOut = document.getElementById('clockOutDisplay').innerText;
    
    const isClockIn = (elIn === '--:--:--');
    
    // Logika Validasi Jam Masuk/Pulang
    if (isClockIn) {
        if (currentHour < 7) {
            return showAppModal("Belum Waktunya", `Presensi Masuk baru dibuka pukul <b>07:00</b>.<br>Sekarang: <b>${timeStr}</b>`, "error");
        }
    } else {
        if (elOut !== '--:--:--') {
            return showAppModal("Info", "Anda sudah selesai presensi hari ini.");
        }
        if (currentHour < 16) {
            return showAppModal("Belum Waktunya", `Anda belum bisa absen pulang.<br>Jam Pulang: <b>16:00</b><br>Sekarang: <b>${timeStr}</b>`, "error");
        }
    }

    showAppModal("Memproses", "Mencatat Presensi ke Server...", "info");

    try {
        const response = await fetch(`${API_BASE_URL}/clock.php`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${activeUser.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                latitude: currentUserLat,
                longitude: currentUserLon,
                type: 'KDK'
            })
        });

        const result = await response.json();

        if (response.ok && result.status === 'success') {
            showAppModal("Berhasil", result.message || "Presensi Berhasil Dicatat");
            
            // --- FIX MASALAH #2: Update Data Secara Berurutan ---
            // 1. Cek status hari ini (update icon di dashboard)
            await checkTodayStatus();
            
            // 2. Load ulang history (agar tabel dan list terupdate data baru)
            // Penting: Kita beri delay sedikit agar server selesai memproses
            setTimeout(() => {
                loadAttendanceHistory(); 
            }, 500);

            renderCalendar();
        } else {
            throw new Error(result.message || "Gagal melakukan presensi");
        }

    } catch (e) {
        showAppModal("Gagal", e.message || "Terjadi kesalahan koneksi.", "error");
    }
}

// --- LOAD HISTORY & UPDATE BUBBLES ---
async function loadAttendanceHistory() {
    try {
        const response = await fetch(`${API_BASE_URL}/history.php`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${activeUser.token}`, 'Content-Type': 'application/json' }
        });

        if (!response.ok) return; 
        const result = await response.json();
        const apiData = result.data || [];

        const uiData = apiData.map(item => {
            const d = new Date(item.tanggal);
            const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
            const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
            
            return {
                rawDate: new Date(item.tanggal).toDateString(),
                dayIndo: days[d.getDay()],
                dateIndo: `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`,
                type: item.status || 'KDK',
                // --- FIX MASALAH #1: Format History Jam Saja ---
                inTime: formatTimeOnly(item.jam_masuk),
                outTime: formatTimeOnly(item.jam_keluar || item.jam_pulang)
            };
        });

        localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(uiData));

        renderHistoryUI(uiData);
        updateWeeklyStatusBubbles(uiData); 
        renderCalendar(); 

    } catch (e) { 
        console.warn("Gagal load history API", e); 
        updateWeeklyStatusBubbles([]); 
    }
}

function renderHistoryUI(historyData) {
    const sortedData = [...historyData].sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

    let kdk = 0, kdm = 0, dashHTML = '', fullHTML = '';
    
    sortedData.forEach((rec, idx) => {
        if(rec.type === 'KDK') kdk++; else kdm++;
        
        if (idx < 2) {
            dashHTML += `<div class="hist-item-gradient mb-2"><div><div class="fw-bold small">${rec.dayIndo}, ${rec.dateIndo}</div><div class="d-flex gap-3 mt-1" style="font-size:0.75rem"><span><i class="fas fa-door-open text-success"></i> ${rec.inTime}</span><span><i class="fas fa-door-closed text-danger"></i> ${rec.outTime}</span></div></div><span class="badge ${rec.type==='KDK'?'badge-kdk':'badge-kdm'} shadow-sm">${rec.type}</span></div>`;
        }
        fullHTML += `<tr><td class="ps-4 fw-bold text-truncate"><div class="d-flex flex-column"><span>${rec.dayIndo}</span><small class="text-muted" style="font-size:0.7rem">${rec.dateIndo}</small></div></td><td class="text-start ps-2 align-middle"><span class="badge ${rec.type==='KDK'?'badge-kdk':'badge-kdm'}">${rec.type}</span></td><td class="text-start ps-2 small font-monospace text-dark align-middle">${rec.inTime}</td><td class="text-start ps-2 small font-monospace text-dark align-middle">${rec.outTime}</td></tr>`;
    });

    if(document.getElementById('dashboardHistoryList')) document.getElementById('dashboardHistoryList').innerHTML = dashHTML;
    if(document.getElementById('fullHistoryList')) document.getElementById('fullHistoryList').innerHTML = fullHTML;
    if(document.getElementById('countKDK')) document.getElementById('countKDK').innerText = kdk;
    if(document.getElementById('countKDM')) document.getElementById('countKDM').innerText = kdm;
}

// --- FUNGSI STATUS MINGGU INI (BUBBLES) FIXED V2 ---
function updateWeeklyStatusBubbles(allHist) {
    const weeklyContainer = document.getElementById('weeklyBubbles');
    if (!weeklyContainer) return;
    if (!allHist) allHist = [];

    const now = getAppTime(); 
    const currentDay = now.getDay(); 
    const todayDateStr = now.toDateString(); // Tanggal hari ini string

    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() - distanceToMonday);

    let bubblesHTML = '';
    
    for (let i = 0; i < 5; i++) {
        const checkDate = new Date(mondayDate);
        checkDate.setDate(mondayDate.getDate() + i);
        const checkDateStr = checkDate.toDateString(); 
        
        // 1. Cek dari History API
        const record = allHist.find(h => h.rawDate === checkDateStr);
        let isPresent = record && record.inTime && record.inTime !== '--:--:--';
        
        // --- FIX MASALAH #3: Logika Hybrid (Cek Layar Hari Ini) ---
        // Jika tanggal yang sedang diloop adalah HARI INI, cek juga elemen DOM.
        // Ini memastikan bubble aktif meski history API belum update.
        if (checkDateStr === todayDateStr) {
            const elIn = document.getElementById('clockInDisplay');
            if (elIn && elIn.innerText !== '--:--:--') {
                isPresent = true;
            }
        }
        
        const dayLetter = ['S','S','R','K','J'][i]; 

        if (isPresent) {
            bubblesHTML += `<div class="bubble active"><i class="fas fa-check"></i></div>`;
        } else {
            bubblesHTML += `<div class="bubble" style="font-size: 0.6rem; opacity: 0.7;">${dayLetter}</div>`;
        }
    }
    
    weeklyContainer.innerHTML = bubblesHTML;
}

function forceUpdateTodayBubble(isTodayPresent) {
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA) || '[]');
    updateWeeklyStatusBubbles(savedData);
}

// ==========================================
// 7. UI HELPERS & CALENDAR
// ==========================================

function updateDateDisplay() {
    const d = getAppTime();
    document.getElementById('deskHeaderDate').innerText = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const dNum = d.getDate();
    let suffix = 'th'; if(dNum==1||dNum==21||dNum==31) suffix='st'; else if(dNum==2||dNum==22) suffix='nd'; else if(dNum==3||dNum==23) suffix='rd';
    document.getElementById('dashDateNum').innerHTML = `${dNum}<sup class="fs-4">${suffix}</sup>`;
    document.getElementById('dashDateDay').innerText = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
    document.getElementById('dashDateMonth').innerText = ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getMonth()] + ' ' + d.getFullYear();
}

function checkNotification() {
    const now = getAppTime();
    const hour = now.getHours();
    const elIn = document.getElementById('clockInDisplay').innerText;
    const elOut = document.getElementById('clockOutDisplay').innerText;
    const isClockIn = (elIn !== '--:--:--');
    const isClockOut = (elOut !== '--:--:--');

    let show = false;
    if (hour === 7 && !isClockIn) {
        show = true;
        currentNotifMessage = "🔔 <b>Pengingat Masuk</b><br>Halo! Sudah waktunya melakukan presensi Masuk.";
    }
    else if (hour === 16 && isClockIn && !isClockOut) {
        show = true;
        currentNotifMessage = "🔔 <b>Pengingat Pulang</b><br>Halo! Sudah waktunya melakukan presensi Pulang.";
    }
    document.querySelectorAll('.notif-badge').forEach(el => show ? el.classList.remove('d-none') : el.classList.add('d-none'));
}

function changeMonth(step) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + step);
    fetchHolidays(currentCalendarDate.getMonth() + 1, currentCalendarDate.getFullYear());
    renderCalendar();
}

function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    
    const elTitle = document.getElementById('calendarTitle');
    if(!elTitle) return;
    elTitle.innerText = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate(); 
    const today = getAppTime();

    let html = '';
    let holidaysInMonth = []; 

    for (let i = 0; i < firstDay; i++) html += `<div class="calendar-day faded"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateCheck = new Date(year, month, day);
        const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        
        let classes = 'calendar-day';
        let clickAttr = '';
        
        const holiday = HOLIDAYS_DATA[dateKey];
        const isWeekend = dateCheck.getDay() === 0 || dateCheck.getDay() === 6;

        if (holiday) {
            holidaysInMonth.push({ date: day, name: holiday.name, type: holiday.type }); 
            if (holiday.type === 'cuti' || holiday.type.includes('cuti')) {
                classes += ' text-warning fw-bold';
            } else {
                classes += ' text-danger fw-bold';
            }
            const safeName = holiday.name.replace(/'/g, "");
            clickAttr = `onclick="showHolidayInfo('${safeName}', '${day} ${monthNames[month]}', '${holiday.type}')"`;
        } else if (isWeekend) {
            classes += ' text-danger';
        }

        if (today.getDate() === day && today.getMonth() === month && today.getFullYear() === year) {
            classes += ' today';
            if(holiday || isWeekend) classes = classes.replace('text-danger','text-white').replace('text-warning','text-white');
        }

        const rawDate = dateCheck.toDateString();
        const record = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)||'[]').find(r => r.rawDate === rawDate);
        const isCompleted = record && record.outTime !== '--:--:--' && record.outTime !== null;
        let dotHtml = '';
        if (isCompleted) dotHtml = `<div style="height:4px;width:4px;background-color:#10b981;border-radius:50%;margin-top:2px"></div>`;

        const style = clickAttr ? 'cursor:pointer' : '';
        html += `<div class="${classes}" ${clickAttr} style="${style}"><div class="d-flex flex-column align-items-center justify-content-center w-100 h-100">${day}${dotHtml}</div></div>`;
    }
    document.getElementById('calendarGrid').innerHTML = html;

    let holidayHtml = '';
    if (holidaysInMonth.length > 0) {
        holidayHtml += `<h6 class="small text-muted fw-bold ps-2 mb-2 mt-3">Daftar Libur Bulan Ini:</h6>`;
        holidaysInMonth.forEach(h => {
            let badgeColor = 'bg-danger';
            let typeLabel = 'Nasional';
            
            if (h.type === 'cuti' || h.type.includes('cuti')) {
                badgeColor = 'bg-warning text-dark';
                typeLabel = 'Cuti Bersama';
            }

            holidayHtml += `<div class="d-flex align-items-center gap-3 bg-white p-3 rounded-4 shadow-sm border-0 mb-2"><div class="d-flex flex-column align-items-center justify-content-center bg-light rounded-3" style="width: 45px; height: 45px;"><span class="fw-bold text-dark fs-5 mb-0" style="line-height:1;">${h.date}</span><small class="text-muted" style="font-size: 0.55rem;">${monthNames[month].substr(0,3).toUpperCase()}</small></div><div class="flex-grow-1"><h6 class="fw-bold text-dark mb-0" style="font-size: 0.8rem;">${h.name}</h6><span class="badge ${badgeColor} rounded-pill mt-1" style="font-size: 0.6rem;">${typeLabel}</span></div></div>`;
        });
    }
    const holidayListEl = document.getElementById('holidayList');
    if (holidayListEl) holidayListEl.innerHTML = holidayHtml;
}

function showHolidayInfo(name, date, type) {
    const isCuti = type === 'cuti' || type.includes('cuti');
    showAppModal(isCuti ? "Cuti Bersama" : "Libur Nasional", `<h6 class="fw-bold">${date}</h6><p class="${isCuti ? 'text-warning' : 'text-danger'} mb-0">${name}</p>`);
}

function switchView(v) {
    ['viewLogin','mainLayout','viewDashboard','viewHistory','viewCalendar','viewProfile'].forEach(id => {
        const el = document.getElementById(id); if(el) el.classList.add('d-none');
    });

    if(v === 'login') {
        document.getElementById('viewLogin').classList.remove('d-none');
    } else {
        document.getElementById('mainLayout').classList.remove('d-none');
        if(v === 'dashboard') document.getElementById('viewDashboard').classList.remove('d-none');
        else if(v === 'history') document.getElementById('viewHistory').classList.remove('d-none');
        else if(v === 'calendar') { document.getElementById('viewCalendar').classList.remove('d-none'); setTimeout(renderCalendar, 50); }
        else if(v === 'profile') document.getElementById('viewProfile').classList.remove('d-none');
        updateActiveNav(v);
    }
}

function updateActiveNav(viewName) {
    const allNavs = document.querySelectorAll('.nav-link-desk, .mob-item');
    allNavs.forEach(el => el.classList.remove('active'));

    let deskId = '', mobId = '';
    if (viewName === 'dashboard') { deskId = 'deskNavDash'; mobId = 'mobNavDash'; }
    else if (viewName === 'history') { deskId = 'deskNavHist'; mobId = 'mobNavHist'; }
    else if (viewName === 'calendar') { deskId = 'deskNavCal'; mobId = 'mobNavCal'; }
    else if (viewName === 'profile') { deskId = 'deskNavProf'; mobId = 'mobNavProf'; }

    if(deskId && document.getElementById(deskId)) document.getElementById(deskId).classList.add('active');
    if(mobId && document.getElementById(mobId)) document.getElementById(mobId).classList.add('active');
}

function showAppModal(t, m, type='success') {
    document.getElementById('modalTitle').innerText = t;
    document.getElementById('modalMessage').innerHTML = m;
    const icon = document.getElementById('modalIcon');
    const bg = document.getElementById('modalIconBg');
    
    if (type === 'error') {
        icon.className = 'fas fa-times';
        bg.style.background = '#fee2e2'; bg.style.color = '#ef4444';
    } else if (type === 'warning') { 
        icon.className = 'fas fa-exclamation-triangle';
        bg.style.background = '#fef3c7'; bg.style.color = '#d97706';
    } else {
        icon.className = 'fas fa-check'; 
        bg.style.background = '#e0f2fe'; bg.style.color = '#0ea5e9';
    }
    document.getElementById('appModal').classList.remove('d-none');
}
function closeAppModal() { document.getElementById('appModal').classList.add('d-none'); }

function handleNotificationClick() { showAppModal("Notifikasi", currentNotifMessage); }
function handleLogout() { document.getElementById('logoutModal').classList.remove('d-none'); }
function closeLogoutModal() { document.getElementById('logoutModal').classList.add('d-none'); }

async function confirmLogout() { 
    closeLogoutModal(); 
    await new Promise(r => setTimeout(r, 200)); 
    showAppModal("Memproses", "Sedang logout...", "info");
    await new Promise(r => setTimeout(r, 1500)); 

    try {
        const token = localStorage.getItem(STORAGE_KEY_TOKEN);
        if (token) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); 

            await fetch(`${API_BASE_URL}/logout.php`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
        }
    } catch(e) { console.log("Logout server failed/skipped, force local logout"); }
    
    forceLocalLogout();
}

function forceLocalLogout() {
    localStorage.removeItem(STORAGE_KEY_USER); 
    localStorage.removeItem(STORAGE_KEY_TOKEN); 
    location.reload(); 
}

function logout() { document.getElementById('logoutModal').classList.remove('d-none'); }

// --- EXPOSE FUNCTION KE GLOBAL ---
window.changeMonth = changeMonth;
window.showHolidayInfo = showHolidayInfo;

if (window.cordova) document.addEventListener('deviceready', onAppReady, false);
else document.addEventListener('DOMContentLoaded', onAppReady);
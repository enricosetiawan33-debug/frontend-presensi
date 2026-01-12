// ==========================================
// 1. CONFIGURATION & DATA
// ==========================================

const USERS = [{ 
    username: 'enrico', 
    password: '123', 
    fullname: 'Muhammad Enrico Setiawan',
    nip: '19950817 202401 1 001',
    ttl: 'Jakarta, 17 Agustus 1995',
    address: 'Jl. Jenderal Sudirman, Senayan, Jakarta Pusat',
    status: 'PNS'
}];

// --- DATABASE LIBUR NASIONAL & CUTI BERSAMA 2026 ---
// Sumber: SKB 3 Menteri (Proyeksi 2026)
const HOLIDAYS_2026 = {
    // JANUARI
    "2026-01-01": { name: "Tahun Baru 2026 Masehi", type: "nasional" },
    "2026-01-16": { name: "Isra Mi'raj Nabi Muhammad SAW", type: "nasional" },

    // FEBRUARI
    "2026-02-16": { name: "Cuti Bersama Tahun Baru Imlek", type: "cuti" },
    "2026-02-17": { name: "Tahun Baru Imlek 2577 Kongzili", type: "nasional" },

    // MARET
    "2026-03-18": { name: "Cuti Bersama Hari Suci Nyepi", type: "cuti" },
    "2026-03-19": { name: "Hari Suci Nyepi (Tahun Baru Saka 1948)", type: "nasional" },
    "2026-03-20": { name: "Cuti Bersama Idul Fitri 1447 H", type: "cuti" },
    "2026-03-21": { name: "Hari Raya Idul Fitri 1447 H", type: "nasional" },
    "2026-03-22": { name: "Hari Raya Idul Fitri 1447 H", type: "nasional" },
    "2026-03-23": { name: "Cuti Bersama Idul Fitri 1447 H", type: "cuti" },
    "2026-03-24": { name: "Cuti Bersama Idul Fitri 1447 H", type: "cuti" },

    // APRIL
    "2026-04-03": { name: "Wafat Yesus Kristus", type: "nasional" },
    "2026-04-05": { name: "Kebangkitan Yesus Kristus (Paskah)", type: "nasional" },

    // MEI
    "2026-05-01": { name: "Hari Buruh Internasional", type: "nasional" },
    "2026-05-14": { name: "Kenaikan Yesus Kristus", type: "nasional" },
    "2026-05-15": { name: "Cuti Bersama Kenaikan Yesus Kristus", type: "cuti" },
    "2026-05-27": { name: "Hari Raya Idul Adha 1447 H", type: "nasional" },
    "2026-05-28": { name: "Cuti Bersama Idul Adha 1447 H", type: "cuti" },
    "2026-05-31": { name: "Hari Raya Waisak 2570 BE", type: "nasional" },

    // JUNI
    "2026-06-01": { name: "Hari Lahir Pancasila", type: "nasional" },
    "2026-06-16": { name: "Tahun Baru Islam 1448 Hijriah", type: "nasional" },

    // AGUSTUS
    "2026-08-17": { name: "Hari Kemerdekaan Republik Indonesia", type: "nasional" },
    "2026-08-25": { name: "Maulid Nabi Muhammad SAW", type: "nasional" },

    // DESEMBER
    "2026-12-24": { name: "Cuti Bersama Hari Raya Natal", type: "cuti" },
    "2026-12-25": { name: "Hari Raya Natal", type: "nasional" }
};

const STORAGE_KEY_DATA = 'presensi_app_data_final';
const STORAGE_KEY_USER = 'presensi_user_session_final';

let currentCalendarDate = new Date(); // Menyimpan bulan yang sedang dilihat
let currentUserLat = null, currentUserLon = null, activeUser = null;

// Clock Variables
let appClockOffset = 0; 
let isClockSynced = false;
let lastTickTime = Date.now(); // Untuk deteksi lompatan waktu

// ==========================================
// 2. INITIALIZATION
// ==========================================

function onAppReady() {
    const saved = localStorage.getItem(STORAGE_KEY_USER);
    if (saved) {
        try { 
            const savedUser = JSON.parse(saved);
            const freshUser = USERS.find(u => u.username === savedUser.username);
            activeUser = freshUser || savedUser;
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(activeUser));
            initDashboard(); 
        } 
        catch (e) { 
            localStorage.removeItem(STORAGE_KEY_USER); 
            switchView('login'); 
        }
    } else { 
        switchView('login'); 
    }

    if(document.getElementById('loginForm')) {
        const f = document.getElementById('loginForm').cloneNode(true);
        document.getElementById('loginForm').replaceWith(f);
        f.addEventListener('submit', handleLogin);
    }
    const btn = document.getElementById('btnAbsen');
    if(btn) btn.onclick = processAttendance;
}

function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('inputUser').value.trim();
    const p = document.getElementById('inputPass').value.trim();
    const found = USERS.find(x => x.username.toLowerCase() === u.toLowerCase() && x.password === p);
    
    if(found) {
        activeUser = found; 
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(activeUser));
        document.getElementById('appModal').classList.add('d-none');

        const loginView = document.getElementById('viewLogin');
        loginView.classList.add('d-none');
        const loadingView = document.getElementById('viewLoading');
        loadingView.classList.remove('d-none');

        let percent = 0;
        const percentText = document.getElementById('loadingPercent');
        
        const interval = setInterval(() => {
            percent += Math.floor(Math.random() * 5) + 1;
            if (percent >= 100) {
                percent = 100;
                clearInterval(interval);
                setTimeout(() => {
                    loadingView.classList.add('fade-out');
                    setTimeout(() => {
                        loadingView.classList.add('d-none');
                        loadingView.classList.remove('fade-out');
                        initDashboard();
                        document.getElementById('mainLayout').classList.add('fade-in');
                    }, 500);
                }, 300);
            }
            percentText.innerText = percent + "%";
        }, 30);
    } else {
        showAppModal("Gagal", "Username atau Password salah", "error");
    }
}

function initDashboard() {
    // 1. ISI DATA USER (NAMA, NIP, DLL)
    document.querySelectorAll('.user-fullname-text').forEach(el => el.innerText = activeUser.fullname);
    document.getElementById('profName').innerText = activeUser.fullname;
    document.getElementById('profNIP').innerText = activeUser.nip;
    document.getElementById('profTTL').innerText = activeUser.ttl;
    document.getElementById('profAddress').innerText = activeUser.address;
    document.getElementById('profStatus').innerText = activeUser.status;

    // --- LOGIKA INISIAL BARU (MES, BS, dll) ---
    // Pecah nama berdasarkan spasi
    const nameParts = activeUser.fullname.trim().split(/\s+/); // Pisahkan kata per spasi
    let initials = '';

    // Ambil huruf pertama dari setiap kata (maksimal 3 kata)
    for (let i = 0; i < Math.min(nameParts.length, 3); i++) {
        initials += nameParts[i][0].toUpperCase();
    }

    // Tampilkan Inisial di semua elemen avatar (Desktop, Mobile, Profil)
    // Class 'user-initials' ada di 3 tempat: Navbar Desktop, Navbar Mobile, Halaman Profil
    document.querySelectorAll('.user-initials').forEach(el => {
        el.innerText = initials;
    });
    
    // Khusus untuk Halaman Profil (karena ID-nya spesifik 'profInitials')
    // Jika elemen ini tidak pakai class 'user-initials', kita set manual juga
    const elProfInitials = document.getElementById('profInitials');
    if(elProfInitials) elProfInitials.innerText = initials;


    // 2. BADGE STATUS (PNS / PPPK / ALIH DAYA)
    const elStatus = document.getElementById('profStatus');
    
    if (activeUser.status === 'PNS') {
        // PNS: Warna Biru
        elStatus.className = 'badge bg-primary rounded-pill px-3 py-2';
    } 
    else if (activeUser.status === 'PPPK') {
        // PPPK: Warna Hijau
        elStatus.className = 'badge bg-success rounded-pill px-3 py-2';
    } 
    else if (activeUser.status === 'Alih Daya') {
        // Alih Daya: Warna Kuning (Teks Hitam agar terbaca)
        elStatus.className = 'badge bg-warning text-dark rounded-pill px-3 py-2';
    } 
    else {
        // Default/Lainnya: Warna Abu-abu
        elStatus.className = 'badge bg-secondary rounded-pill px-3 py-2';
    }

    // 3. START SYSTEM (WAKTU & LOKASI)
    syncTimeWithServer(); 
    getLocation(); 

    // Update UI setiap detik
    setInterval(() => {
        detectTimeTampering(); 
        updateDateDisplay(); 
        checkNotification(); 
    }, 1000);

    // Re-sync waktu setiap 60 detik
    setInterval(syncTimeWithServer, 60000);

    renderCalendar();
    loadAttendanceHistory();
    switchView('dashboard');
}

// ==========================================
// 3. TIME SYNC & ANTI-TAMPER LOGIC
// ==========================================

async function syncTimeWithServer() {
    try {
        const response = await fetch("https://timeapi.io/api/Time/current/zone?timeZone=Asia/Jakarta&_t=" + new Date().getTime());
        if (!response.ok) return; 
        
        const data = await response.json();
        const serverTime = new Date(data.dateTime).getTime();
        const deviceTime = new Date().getTime();
        
        appClockOffset = serverTime - deviceTime; 
        isClockSynced = true;
        
        console.log("Clock Synced. Offset:", appClockOffset);
        updateDateDisplay(); 

    } catch (e) {
        console.warn("Time sync failed:", e);
    }
}

function getAppTime() {
    if (isClockSynced) {
        return new Date(new Date().getTime() + appClockOffset);
    }
    return new Date();
}

// --- FITUR BARU: DETEKSI LOMPATAN WAKTU ---
function detectTimeTampering() {
    const currentTick = Date.now();
    // Hitung selisih waktu nyata sejak detik terakhir
    const delta = currentTick - lastTickTime;
    
    // Normalnya delta sekitar 1000ms (1 detik).
    // Jika delta > 5000ms (5 detik) ATAU delta < -1000ms (mundur),
    // Berarti user mengubah jam sistem atau mem-pause aplikasi lama.
    
    // Kita beri toleransi agak besar (misal 60 detik) untuk lag sistem wajar.
    // Tapi jika berubah jam/menit secara manual, pasti lebih dari itu.
    if (Math.abs(delta) > 60000) { 
        console.warn("Time Jump Detected! Resyncing...");
        // Paksa Sync Ulang segera agar tampilan kembali benar
        syncTimeWithServer();
    }
    
    lastTickTime = currentTick;
}

// ==========================================
// 4. UI UPDATE
// ==========================================

function updateDateDisplay() {
    const d = getAppTime();

    const dateStr = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const elDesk = document.getElementById('deskHeaderDate'); 
    if(elDesk) elDesk.innerText = dateStr;

    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    
    const dNum = d.getDate();
    let suffix = 'th'; 
    if(dNum===1||dNum===21||dNum===31) suffix='st'; 
    else if(dNum===2||dNum===22) suffix='nd'; 
    else if(dNum===3||dNum===23) suffix='rd';
    
    const elNum = document.getElementById('dashDateNum');
    if(elNum) elNum.innerHTML = `${dNum}<sup class="fs-4">${suffix}</sup>`;
    
    const elDay = document.getElementById('dashDateDay');
    if(elDay) elDay.innerText = days[d.getDay()];
    
    const elMonth = document.getElementById('dashDateMonth');
    if(elMonth) elMonth.innerText = `${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ==========================================
// 5. ATTENDANCE LOGIC (STRICT BLOCKING)
// ==========================================

// --- LOGIKA PRESENSI (VERSI OFFLINE TIME / DEVICE TIME) ---
async function processAttendance() {
    // 1. Cek Lokasi (TETAP AKTIF)
    if(!currentUserLat || !currentUserLon) {
        return showAppModal("Gagal", "Lokasi belum ditemukan. Pastikan GPS aktif.", "error");
    }

    // Tampilkan modal loading sebentar (opsional, biar ada efek proses)
    showAppModal("Memproses", "Mencatat Presensi...");

    try {
        // --- BYPASS SERVER TIME (PAKAI WAKTU HP) ---
        // Kita tidak lagi fetch ke server, langsung pakai waktu perangkat
        const now = new Date(); 
        
        // --- SIMPAN DATA ---
        const rawDate = now.toDateString();
        const timeStr = now.toLocaleTimeString('en-GB', { hour12: false }); // Format: 16:30:00
        
        let hist = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)||'[]');
        let today = hist.find(i => i.username === activeUser.username && i.rawDate === rawDate);
        const type = 'KDK'; 

        // --- SIMULASI DELAY (OPSIONAL) ---
        // Agar tidak terlalu instan, kita beri jeda 500ms seolah-olah sedang "menyimpan"
        await new Promise(r => setTimeout(r, 500));

        if(!today) {
            // --- PRESENSI MASUK ---
            hist.push({
                username: activeUser.username, 
                rawDate: rawDate, 
                dayIndo: now.toLocaleDateString('id-ID', {weekday:'long'}),
                dateIndo: now.toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'}),
                type: type, 
                inTime: timeStr, 
                outTime: '--:--:--'
            });
            localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(hist));
            showAppModal("Berhasil", "Presensi Masuk Berhasil");
        
        } else if(today.outTime === '--:--:--') {
            // --- PRESENSI PULANG (VALIDASI JAM 16:00 - PAKAI JAM HP) ---
            
            const currentHour = now.getHours();   
            const currentMinute = now.getMinutes(); 
            
            // ATURAN: Boleh pulang mulai 16:00
            const minHourOut = 16; 
            const minMinuteOut = 0; 

            if (currentHour < minHourOut || (currentHour === minHourOut && currentMinute < minMinuteOut)) {
                return showAppModal(
                    "Belum Waktunya", 
                    `Anda belum bisa absen pulang.<br>
                     Jam Pulang: <b>${minHourOut}:${minMinuteOut.toString().padStart(2, '0')}</b><br>
                     Sekarang: <b>${timeStr}</b>`, 
                    "error"
                );
            }

            // Simpan Data Pulang
            today.outTime = timeStr; 
            localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(hist));
            showAppModal("Berhasil", "Presensi Pulang Berhasil");
        
        } else {
            showAppModal("Info", "Sudah selesai hari ini");
        }
        
        loadAttendanceHistory();

    } catch (e) {
        console.error("Attendance Error:", e);
        showAppModal("Gagal", `Terjadi kesalahan saat menyimpan data.`, "error");
    }
}

// ==========================================
// 6. HELPERS
// ==========================================

function checkNotification() {
    const now = getAppTime(); // Use corrected time
    const hour = now.getHours(); 
    const rawDate = now.toDateString();
    
    const hist = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)||'[]');
    const todayRec = hist.find(i => i.username === activeUser.username && i.rawDate === rawDate);

    let showRedDot = false;
    currentNotifMessage = "Tidak ada notifikasi saat ini.";

    if (hour >= 7 && hour < 9 && !todayRec) {
        showRedDot = true;
        currentNotifMessage = "🔔 <b>Pengingat Masuk</b><br>Halo! Sudah Masuk Jam kerja (07:00 - 08:00). Segera lakukan presensi Masuk.";
    }
    else if (hour >= 16 && hour < 18 && todayRec && todayRec.outTime === '--:--:--') {
        showRedDot = true;
        currentNotifMessage = "🔔 <b>Pengingat Pulang</b><br>Jam kerja usai (16:00 - 17:00). Segera lakukan presensi Pulang.";
    }

    const badges = document.querySelectorAll('.notif-badge');
    badges.forEach(el => {
        if(showRedDot) el.classList.remove('d-none');
        else el.classList.add('d-none');
    });
}

function loadAttendanceHistory() {
    const hist = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA) || '[]');
    const myHist = hist.filter(i => i.username === activeUser.username)
        .sort((a, b) => { return new Date(b.rawDate) - new Date(a.rawDate); });

    let kdk = 0, kdm = 0, dashHTML = '', fullHTML = '';
    
    // Update data dashboard (jam masuk/keluar hari ini)
    const todayStr = getAppTime().toDateString(); 
    const todayRec = myHist.find(i => i.rawDate === todayStr);
    
    const elClockIn = document.getElementById('clockInDisplay');
    const elClockOut = document.getElementById('clockOutDisplay');
    if(elClockIn) elClockIn.innerText = todayRec ? todayRec.inTime : "--:--:--";
    if(elClockOut) elClockOut.innerText = todayRec ? todayRec.outTime : "--:--:--";

    myHist.forEach((rec, idx) => {
        // Logika Badge
        if (rec.type === 'KDK') kdk++; else kdm++;
        const badge = rec.type === 'KDK' ? 'badge-kdk' : 'badge-kdm';

        // HTML untuk Dashboard (Card)
        if (idx < 2) {
            dashHTML += `
            <div class="hist-item-gradient mb-2">
                <div>
                    <div class="fw-bold small">${rec.dayIndo}, ${rec.dateIndo}</div>
                    <div class="d-flex gap-3 mt-1" style="font-size:0.75rem">
                        <span class="d-flex align-items-center gap-2">
                            <i class="fas fa-door-open text-success"></i> ${rec.inTime}
                        </span>
                        <span class="d-flex align-items-center gap-2">
                            <i class="fas fa-door-closed text-danger"></i> ${rec.outTime}
                        </span>
                    </div>
                </div>
                <span class="${badge} shadow-sm">${rec.type}</span>
            </div>`;
        }

        // HTML untuk Tabel Full (Sederhana tanpa width, karena ikut Header)
        // Kita tambahkan text-truncate agar jika teks kepanjangan tidak merusak layout
        fullHTML += `
        <tr>
            <td class="ps-4 fw-bold text-truncate">
                <div class="d-flex flex-column">
                    <span>${rec.dayIndo}</span>
                    <small class="fw-normal text-muted" style="font-size: 0.75rem;">${rec.dateIndo}</small>
                </div>
            </td>
            
            <td class="text-start ps-2 align-middle">
                <span class="${badge} px-2 py-1" style="min-width: 60px; display: inline-block; text-align: center;">${rec.type}</span>
            </td>
            
            <td class="text-start ps-2 font-monospace small text-dark align-middle">
                ${rec.inTime}
            </td>
            
            <td class="text-start ps-2 font-monospace small text-dark align-middle">
                ${rec.outTime}
            </td>
        </tr>`;
    });

    // Render ke HTML
    const dList = document.getElementById('dashboardHistoryList'); if(dList) dList.innerHTML = dashHTML;
    const fList = document.getElementById('fullHistoryList'); if(fList) fList.innerHTML = fullHTML;
    
    const elKDK = document.getElementById('countKDK'); if(elKDK) elKDK.innerText = kdk;
    const elKDM = document.getElementById('countKDM'); if(elKDM) elKDM.innerText = kdm;

    updateWeeklyStatusBubbles(hist);
}

function updateWeeklyStatusBubbles(allHist) {
    const weeklyContainer = document.getElementById('weeklyBubbles');
    if (!weeklyContainer) return;

    const now = getAppTime(); // Corrected Time
    const currentDay = now.getDay(); 
    
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() - distanceToMonday);

    let bubblesHTML = '';

    for (let i = 0; i < 5; i++) {
        const checkDate = new Date(mondayDate);
        checkDate.setDate(mondayDate.getDate() + i);
        const checkDateStr = checkDate.toDateString();

        const record = allHist.find(h => h.username === activeUser.username && h.rawDate === checkDateStr);
        const isCompleted = record && record.outTime !== '--:--:--';

        if (isCompleted) bubblesHTML += `<div class="bubble active"><i class="fas fa-check"></i></div>`;
        else bubblesHTML += `<div class="bubble"></div>`;
    }
    weeklyContainer.innerHTML = bubblesHTML;
}

function refreshLocation() {
    const icons = document.querySelectorAll('.fa-sync-alt');
    icons.forEach(i => i.classList.add('fa-spin'));
    document.querySelectorAll('.locationTextShort').forEach(el => el.innerText = "Mencari lokasi...");
    getLocation();
    setTimeout(() => { icons.forEach(i => i.classList.remove('fa-spin')); }, 2000);
}

function getLocation() {
    if(navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (p) => {
                currentUserLat = p.coords.latitude; 
                currentUserLon = p.coords.longitude;
                try {
                    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${currentUserLat}&longitude=${currentUserLon}&localityLanguage=id`);
                    const data = await response.json();
                    if(data) {
                        const locality = data.locality || ''; 
                        const city = data.city || data.principalSubdivision || ''; 
                        let formattedAddress = "";
                        if(locality) formattedAddress += `${locality}, `;
                        if(city) formattedAddress += `${city}`;
                        document.querySelectorAll('.locationTextShort').forEach(el => {
                            el.innerText = formattedAddress || "Lokasi terdeteksi";
                        });
                    }
                } catch (error) {
                    document.querySelectorAll('.locationTextShort').forEach(el => el.innerText = "Gagal memuat alamat");
                }
            },
            (err) => {
                let msg = "GPS Error";
                if(err.code === 1) msg = "Izin GPS Ditolak";
                else if(err.code === 2) msg = "GPS Tidak Aktif";
                else if(err.code === 3) msg = "Koneksi Lemah";
                document.querySelectorAll('.locationTextShort').forEach(el => {
                    el.innerText = msg;
                    el.style.color = 'red'; 
                });
                if(err.code === 1 || err.code === 2) showAppModal("Masalah GPS", "Mohon aktifkan GPS.");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        document.querySelectorAll('.locationTextShort').forEach(el => el.innerText = "Perangkat tidak dukung GPS");
    }
}

function handleNotificationClick() {
    const isRedDotVisible = !document.getElementById('mobNotifBadge').classList.contains('d-none');
    if(isRedDotVisible) showAppModal("Notifikasi", currentNotifMessage);
    else showAppModal("Info", "Tidak ada notifikasi baru.");
}

function handleLogout() {
    document.getElementById('logoutModal').classList.remove('d-none');
}
function closeLogoutModal() {
    document.getElementById('logoutModal').classList.add('d-none');
}
function confirmLogout() {
    localStorage.removeItem(STORAGE_KEY_USER); 
    location.reload();
}

function switchView(v) {
    document.getElementById('viewLogin').classList.add('d-none');
    document.getElementById('mainLayout').classList.add('d-none');
    document.getElementById('viewDashboard').classList.add('d-none');
    document.getElementById('viewHistory').classList.add('d-none');
    document.getElementById('viewCalendar').classList.add('d-none');
    document.getElementById('viewProfile').classList.add('d-none');

    if(v === 'login') {
        document.getElementById('viewLogin').classList.remove('d-none');
    } else {
        document.getElementById('mainLayout').classList.remove('d-none');
        if(v === 'dashboard') document.getElementById('viewDashboard').classList.remove('d-none');
        else if(v === 'history') document.getElementById('viewHistory').classList.remove('d-none');
        else if(v === 'calendar') document.getElementById('viewCalendar').classList.remove('d-none');
        else if(v === 'profile') document.getElementById('viewProfile').classList.remove('d-none');
        updateActiveNav(v);
    }
}

function updateActiveNav(viewName) {
    const allNavs = document.querySelectorAll('.nav-link-desk, .mob-item');
    allNavs.forEach(el => el.classList.remove('active'));

    if (viewName === 'dashboard') {
        if(document.getElementById('deskNavDash')) document.getElementById('deskNavDash').classList.add('active');
        if(document.getElementById('mobNavDash')) document.getElementById('mobNavDash').classList.add('active');
    } 
    else if (viewName === 'history') {
        if(document.getElementById('deskNavHist')) document.getElementById('deskNavHist').classList.add('active');
        if(document.getElementById('mobNavHist')) document.getElementById('mobNavHist').classList.add('active');
    } 
    else if (viewName === 'calendar') {
        if(document.getElementById('deskNavCal')) document.getElementById('deskNavCal').classList.add('active');
        if(document.getElementById('mobNavCal')) document.getElementById('mobNavCal').classList.add('active');
    }
    else if (viewName === 'profile') { 
        if(document.getElementById('deskNavProf')) document.getElementById('deskNavProf').classList.add('active');
        if(document.getElementById('mobNavProf')) document.getElementById('mobNavProf').classList.add('active');
    }
}

// ==========================================
// 7. CALENDAR LOGIC (UPDATED)
// ==========================================

function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    // Set Judul
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    document.getElementById('calendarTitle').innerText = `${monthNames[month]} ${year}`;

    // Hitung tanggal
    const firstDay = new Date(year, month, 1).getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate(); 
    
    const currentRealDate = getAppTime(); 
    const isCurrentMonth = currentRealDate.getMonth() === month && currentRealDate.getFullYear() === year;

    let html = '';
    let holidaysInMonth = []; // Array untuk menampung libur bulan ini

    // Sel Kosong
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="calendar-day faded"></div>`;
    }

    // Sel Tanggal (1 - 31)
    for (let day = 1; day <= daysInMonth; day++) {
        const currentCheck = new Date(year, month, day);
        const dayOfWeek = currentCheck.getDay();
        
        // Format Key YYYY-MM-DD
        const monthStr = (month + 1).toString().padStart(2, '0');
        const dayStr = day.toString().padStart(2, '0');
        const dateKey = `${year}-${monthStr}-${dayStr}`;

        // Cek Libur di Database
        const holidayInfo = HOLIDAYS_2026[dateKey];
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        let classes = 'calendar-day';
        
        if (holidayInfo) {
            // Simpan info libur untuk ditampilkan di bawah
            holidaysInMonth.push({ date: day, name: holidayInfo.name, type: holidayInfo.type });

            if (holidayInfo.type === 'nasional') {
                classes += ' text-danger fw-bold'; 
            } else {
                classes += ' text-warning fw-bold'; 
            }
        } else if (isWeekend) {
            classes += ' text-danger'; 
        }

        if (isCurrentMonth && day === currentRealDate.getDate()) {
            classes += ' today'; 
            if (holidayInfo || isWeekend) classes = classes.replace('text-danger', 'text-white').replace('text-warning', 'text-white');
        }

        // Dot Hadir
        const rawDate = currentCheck.toDateString();
        const record = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA) || '[]')
            .find(r => r.username === activeUser.username && r.rawDate === rawDate);
        
        let dotHtml = '';
        if (record) {
            dotHtml = `<div style="height:4px; width:4px; background-color:#10b981; border-radius:50%; margin-top:2px;"></div>`;
        }

        html += `
        <div class="${classes}">
            <div class="d-flex flex-column align-items-center justify-content-center" style="height: 100%; width: 100%;">
                ${day}
                ${dotHtml}
            </div>
        </div>`;
    }

    document.getElementById('calendarGrid').innerHTML = html;

    // --- RENDER DAFTAR LIBUR DI BAWAH KALENDER ---
    let holidayHtml = '';
    if (holidaysInMonth.length > 0) {
        holidayHtml += `<h6 class="small text-muted fw-bold ps-2 mb-2">Libur Nasional dan Cuti Bersama:</h6>`;
        holidaysInMonth.forEach(h => {
            const badgeColor = h.type === 'nasional' ? 'bg-danger' : 'bg-warning text-dark';
            const typeLabel = h.type === 'nasional' ? 'Nasional' : 'Cuti Bersama';
            
            holidayHtml += `
            <div class="d-flex align-items-start gap-3 bg-white p-3 rounded-4 shadow-sm border-0">
                <div class="d-flex flex-column align-items-center justify-content-center bg-light rounded-3" style="width: 50px; height: 50px;">
                    <span class="fw-bold text-dark fs-5 mb-0" style="line-height:1;">${h.date}</span>
                    <small class="text-muted" style="font-size: 0.6rem;">${monthNames[month].substr(0,3)}</small>
                </div>
                <div>
                    <h6 class="fw-bold text-dark mb-1" style="font-size: 0.85rem;">${h.name}</h6>
                    <span class="badge ${badgeColor} rounded-pill" style="font-size: 0.65rem;">${typeLabel}</span>
                </div>
            </div>`;
        });
    }
    document.getElementById('holidayList').innerHTML = holidayHtml;
}

function changeMonth(step) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + step);
    renderCalendar();
}

function showAppModal(t, m, type='success') {
    const w = document.getElementById('modalIconBg');
    const iconEl = document.getElementById('modalIcon'); 
    document.getElementById('modalTitle').innerText = t;
    document.getElementById('modalMessage').innerHTML = m;
    w.style.background = type === 'error' ? '#fee2e2' : '#e0f2fe';
    w.style.color = type === 'error' ? '#ef4444' : '#0ea5e9';
    if (type === 'error') iconEl.className = 'fas fa-times';
    else iconEl.className = 'fas fa-check';
    document.getElementById('appModal').classList.remove('d-none');
}
function closeAppModal() { document.getElementById('appModal').classList.add('d-none'); }

if (window.cordova) document.addEventListener('deviceready', onAppReady, false);
else document.addEventListener('DOMContentLoaded', onAppReady);
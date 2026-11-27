# SukaPOS (PinkPOS) — Cloud Point of Sale

Aplikasi kasir (Point of Sale) modern berbasis React 19, TypeScript, Vite, dan Tailwind CSS dengan autentikasi sesi terenkripsi (`scrypt` + signed `HttpOnly` cookie), backend proxy Vercel Serverless (`/api/*`), dan penyimpanan cloud Google Sheets melalui Google Apps Script.

## Fitur Utama

- **Autentikasi & Perlindungan Bruteforce**: Hash password `scrypt` dengan salt acak per akun, cookie sesi `HttpOnly`, `Secure`, signed HMAC-SHA256 berdurasi 12 jam, rate-limit ganda (per IP terpercaya `x-vercel-forwarded-for` / `x-real-ip` DAN per username maksimal 5 gagal / 5 menit dengan penyimpanan bersama Upstash Redis REST + penundaan ~300 ms).
- **Proxy Cloud Aman**: Browser hanya berkomunikasi dengan `/api/cloud`; URL `/exec` dan `APPS_SCRIPT_TOKEN` disimpan di server (`process.env` atau file konfigurasi eksternal). Token Apps Script dikirim lewat **body POST** (tidak pernah lewat query string URL) dan diverifikasi dengan perbandingan waktu-konstan di `Code.gs`.
- **Sinkronisasi Per Transaksi & Indikator Koneksi**: Setiap checkout mengirim `addOrder` dan memperbarui stok secara atomik via `LockService.getScriptLock()`. Pojok kanan atas layar menampilkan status koneksi real-time (`Online · Google Sheet Aktif` vs `Offline / Sheet Terputus · Antrean Lokal`).
- **Fitur Kasir Lengkap**: Scanner barcode USB/Bluetooth HID, cetak struk thermal 80mm, laporan PDF penjualan, manajemen produk & kategori, kustomisasi warna/font/logo toko, dan dukungan bahasa Indonesia/Inggris.

---

## Checklist Deploy Aman (Vercel & Production)

Pastikan seluruh langkah berikut terpenuhi sebelum membagikan URL production:

### 1. Environment Variables di Vercel
Tambahkan di **Vercel Project Settings → Environment Variables**:

| Variabel | Wajib | Keterangan |
| :--- | :---: | :--- |
| `SESSION_SECRET` | **Ya** | String acak minimal **32 karakter**. Di production, seluruh endpoint auth akan mengembalikan `500` (`SESSION_SECRET belum dikonfigurasi`) jika kosong atau `< 32` karakter. |
| `ADMIN_USERNAME` | **Ya** | Username/email admin untuk login (contoh: `admin@tokoanda.id`). |
| `ADMIN_PASSWORD_HASH` | **Ya** | Hash `scrypt` format `<saltHex>:<keyHex>` hasil `npm run hash-password -- "<password>"`. |
| `APPS_SCRIPT_URL` | **Ya** | URL Web App Google Apps Script berakhiran `/exec`. |
| `APPS_SCRIPT_TOKEN` | **Ya** | Token rahasia panjang acak yang nilainya sama persis dengan `API_TOKEN` di Script Properties Apps Script. |
| `SETUP_TOKEN` | Opsional | Token sekali pakai (header `x-setup-token`) jika mengizinkan `/api/setup-admin` di production saat env admin belum diisi. Tanpa `SETUP_TOKEN`, setup awal di production dinonaktifkan (`403`). |
| `UPSTASH_REDIS_REST_URL` | Disarankan | URL REST Redis Upstash agar batas rate-limit login berlaku lintas instance serverless Vercel. |
| `UPSTASH_REDIS_REST_TOKEN` | Disarankan | Bearer token REST Redis Upstash. |
| `DATABASE_CONFIG_PATH` | Opsional | Path custom ke file JSON pengaturan database di luar folder aplikasi (khusus hosting server/container non-Vercel). |

### 2. Membuat `ADMIN_PASSWORD_HASH`
Jalankan perintah berikut di terminal (password minimal 8 karakter):

```bash
npm run hash-password -- "PasswordKuatAnda"
```

Salin output `<salt>:<hash>` ke `ADMIN_PASSWORD_HASH` di Vercel atau `.env` lokal.  
*(Catatan: di production Vercel, mengubah password secara permanen dilakukan dengan membuat hash baru lewat perintah di atas lalu memperbarui env `ADMIN_PASSWORD_HASH` dan redeploy.)*

### 3. Merotasi Secret & Token
- **Rotasi `SESSION_SECRET`**: Buat string acak baru minimal 32 karakter (`openssl rand -hex 32`), perbarui di Vercel Environment Variables, lalu redeploy. Semua sesi lama otomatis tidak valid sehingga admin harus login ulang.
- **Rotasi `APPS_SCRIPT_TOKEN` / `API_TOKEN`**:
  1. Buat token acak baru minimal 32 karakter (`openssl rand -hex 24`).
  2. Perbarui Script Property `API_TOKEN` di Google Apps Script.
  3. Perbarui `APPS_SCRIPT_TOKEN` di Vercel Environment Variables (atau di menu Setting / `database.config.json` untuk server lokal) lalu redeploy.
- **Rotasi `ADMIN_PASSWORD_HASH`**: Jalankan `npm run hash-password -- "<password-baru>"`, perbarui `ADMIN_PASSWORD_HASH` di Vercel, lalu redeploy.

### 4. Kebersihan Git & Penghapusan Riwayat File Sensitif
File `.gitignore` sudah mengecualikan `.env`, `.env.*` (kecuali `.env.example`), `.data/`, `.aistudio/`, dan `database.config.json` (gunakan `database.config.example.json` sebagai template kosong).  
Jika folder `.data/`, `.aistudio/`, `.env`, atau `database.config.json` berisi secret **pernah ter-commit ke Git**:

```bash
# Hapus dari tracking index git saat ini
git rm -r --cached .data .aistudio database.config.json .env

# Opsional: bersihkan dari seluruh riwayat commit dengan git-filter-repo
git filter-repo --invert-paths --path .data --path .aistudio --path database.config.json --path .env
```

> **Penting:** Jika file-file tersebut pernah ter-commit ke repository (terutama repository publik/bersama), **segera ganti semua secret dan token** (`SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, `API_TOKEN` / `APPS_SCRIPT_TOKEN`, `SETUP_TOKEN`).

---

## Arsitektur Server (`server.ts` vs Vercel `/api/*`)

- **Deploy ke Vercel**: Vercel otomatis menjalankan serverless function di folder `/api/*` (`vercel.json`) dan melayani frontend statis hasil `npm run build` (`dist/`). File `server.ts` tidak dijalankan oleh Vercel.
- **Hosting Lokal / Node Container Lain (`server.ts`, `express`, `dotenv`)**: File `server.ts`, paket `express`, dan `dotenv` sengaja dipertahankan untuk development lokal (`npm run dev` di port 3000) dan hosting Node/Docker non-Vercel (`npm start`).

---

## Cara Deploy Google Apps Script (Database Privat)

1. Buka [script.google.com](https://script.google.com) → **New project**.
2. Buka menu **Setting** (atau tab **Setting Database** di halaman login) untuk menyalin template `Code.gs`, lalu tempel ke editor Apps Script.
3. Di Apps Script, buka **Project Settings (ikon roda gigi) → Script Properties → Add script property**:
   - **Property**: `API_TOKEN`
   - **Value**: token rahasia acak minimal 32 karakter (samakan dengan `APPS_SCRIPT_TOKEN`).
4. Klik **Deploy → New deployment**:
   - **Type**: Web app
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` (keamanan dijaga melalui verifikasi konstanta-waktu `API_TOKEN` di body POST; Spreadsheet tetap **Privat** tanpa akses publik, hanya folder foto Drive yang `VIEW`-only).
   - **Saat memperbarui `Code.gs`**: wajib klik **Deploy → Manage deployments → ikon Edit → Version: New version → Deploy** agar perubahan kode aktif pada URL `/exec` yang sama.
5. Salin URL `/exec` ke `APPS_SCRIPT_URL` di Vercel (atau isi via menu Setting untuk hosting non-Vercel).
6. Setelah terhubung, aplikasi otomatis menginisialisasi tab `Products`, `Orders`, `Categories`, dan `StoreSettings`.

---

## Menjalankan Secara Lokal & Pengujian

```bash
# Install dependencies
npm install

# Salin template environment & config (opsional untuk non-Vercel)
cp .env.example .env
cp database.config.example.json database.config.json

# Jalankan server dev (port 3000)
npm run dev

# Cek TypeScript types
npm run lint

# Jalankan seluruh unit & security test (Vitest)
npm test

# Build produksi
npm run build
```

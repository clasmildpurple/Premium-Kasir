# PinkPOS — Cloud Point of Sale

Aplikasi kasir (Point of Sale) modern berbasis React 19, TypeScript, Vite, dan Tailwind CSS dengan autentikasi sesi terenkripsi (`scrypt` + signed `HttpOnly` cookie), backend proxy Vercel Serverless (`/api/*`), dan penyimpanan cloud Google Sheets melalui Google Apps Script.

## Fitur Utama

- **Autentikasi Aman**: Hash password `scrypt` dengan salt acak per akun, cookie sesi `HttpOnly`, `Secure`, `SameSite=Lax` berdurasi 12 jam, rate-limit login (maksimal 5 kali gagal, tunggu 5 menit), serta form ganti password di menu **Setting**.
- **Proxy Cloud Aman**: Browser hanya berkomunikasi dengan `/api/cloud`; URL `/exec` dan `APPS_SCRIPT_TOKEN` disimpan di environment variable server, sementara Google Apps Script memverifikasi `API_TOKEN` dari Script Properties.
- **Sinkronisasi Per Transaksi & LockService**: Setiap checkout mengirim `addOrder` (bukan `syncAll`) dan mengurangi stok secara atomik memakai `LockService.getScriptLock()`. Penghapusan transaksi (`deleteOrder`) mengembalikan stok di aplikasi dan di Google Sheets.
- **Antrean Offline & Batas Cache Lokal**: Jika koneksi terputus, transaksi masuk ke antrean offline `localStorage` dan dikirim ulang otomatis saat online. Cache riwayat lokal dibatasi 500 transaksi terbaru (sisanya tetap tersimpan di Google Sheets) dengan notifikasi error jika penyimpanan penuh/gagal.
- **Fitur Kasir Lengkap**: Scanner barcode USB/Bluetooth HID, cetak struk thermal 80mm, laporan PDF penjualan, manajemen produk & kategori, kustomisasi branding/pajak, dan dukungan bahasa Indonesia/Inggris.

---

## Setup Environment Variables (Vercel & Lokal)

Salin `.env.example` menjadi `.env` untuk pengembangan lokal, atau tambahkan variabel berikut di **Vercel Project Settings → Environment Variables**:

| Variabel | Wajib | Keterangan |
| :--- | :---: | :--- |
| `SESSION_SECRET` | Ya | String acak minimal 32 karakter untuk menandatangani cookie sesi HMAC-SHA256. |
| `ADMIN_USERNAME` | Ya | Username/email kasir atau admin untuk login (contoh: `kasir@tokoanda.id`). |
| `ADMIN_PASSWORD_HASH` | Ya | Hash `scrypt` format `<saltHex>:<keyHex>`. Buat dengan perintah Node di bawah. |
| `APPS_SCRIPT_URL` | Opsional | URL Web App Google Apps Script berakhiran `/exec` (bisa juga diisi via `database.config.json` atau menu **Setting**). |
| `APPS_SCRIPT_TOKEN` | Opsional | Token rahasia yang nilainya harus sama persis dengan `API_TOKEN` di Script Properties Apps Script (bisa juga diisi via `database.config.json` atau menu **Setting**). |
| `DATABASE_CONFIG_PATH` | Opsional | Path custom ke file JSON pengaturan database di luar folder aplikasi (contoh: `../pinkpos-database.config.json`). |

### File Pengaturan Database Eksternal (Untuk Distribusi / Multi-Pembeli)

Agar setiap pembeli/pengguna aplikasi dapat mengganti URL Google Apps Script dan database Google Sheets miliknya sendiri **tanpa menyentuh folder `src/` atau melakukan build ulang**:

1. **Via Menu Setting di Aplikasi**: Setelah login, buka menu **Setting → Sinkronisasi Database 2 Arah**, lalu masukkan **URL Web App Google Apps Script (`/exec`)** dan **API Token (`API_TOKEN`)**, lalu klik **Simpan & Hubungkan Database**. Pengaturan otomatis disimpan ke file eksternal di luar `src/` & `dist/` (prioritas ke `DATABASE_CONFIG_PATH` atau `../pinkpos-database.config.json`, fallback ke `database.config.json` di root).
2. **Edit File Secara Langsung**: Pengguna dapat langsung mengedit file `database.config.json` (di luar `src/` & `dist/`) atau membuat file `pinkpos-database.config.json` satu level di luar folder aplikasi (atau menentukan lokasi custom lewat env `DATABASE_CONFIG_PATH`).
   - Demi keamanan, `appsScriptToken` tidak pernah dikirim kembali ke browser maupun dibundel ke dalam `dist/`.

### Cara Membuat `ADMIN_PASSWORD_HASH`

Jalankan perintah berikut di terminal (ganti `PasswordKuatAnda` dengan password minimal 8 karakter):

```bash
node -e "const c=require('crypto'),s=c.randomBytes(16).toString('hex'),h=c.scryptSync('PasswordKuatAnda',s,64).toString('hex');console.log(s+':'+h)"
```

Tempel output `<salt>:<hash>` ke `ADMIN_PASSWORD_HASH` di Vercel atau `.env`.

> **Catatan setup awal:** Jika `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` belum diisi pada saat deploy pertama, halaman login akan menampilkan form inisialisasi akun admin pertama kali sebelum masuk.

---

## Cara Deploy Google Apps Script (Database Privat)

1. Buka [script.google.com](https://script.google.com) → **New project**.
2. Buka menu **Setting** di PinkPOS (atau salin template `Code.gs` dari `src/data/posData.ts` melalui panel **Google Cloud Integration**), lalu tempel ke editor `Code.gs`.
3. Di Apps Script, buka **Project Settings (ikon roda gigi) → Script Properties → Add script property**:
   - **Property**: `API_TOKEN`
   - **Value**: token rahasia acak (samakan persis dengan `APPS_SCRIPT_TOKEN` di `database.config.json` / menu Setting / Vercel).
4. Klik **Deploy → New deployment**:
   - **Type**: Web app
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` (keamanan dijaga melalui verifikasi `API_TOKEN` dan Spreadsheet tetap **Privat** tanpa `ANYONE_WITH_LINK + EDIT`; hanya folder foto produk Drive yang `VIEW`-only).
5. Salin URL `/exec` hasil deploy ke menu **Setting** di PinkPOS, file `database.config.json` / `pinkpos-database.config.json`, atau environment variable `APPS_SCRIPT_URL` di Vercel.
6. Setelah masuk ke PinkPOS, buka menu **Setting → Kirim Semua (Aplikasi → Sheet)** satu kali untuk membuat tab `Products`, `Orders`, `Categories`, dan `StoreSettings` secara otomatis.

---

## Menjalankan Secara Lokal & Pengujian

```bash
# Install dependencies
npm install

# Jalankan server dev (port 3000)
npm run dev

# Cek TypeScript types
npm run lint

# Jalankan unit test (Vitest)
npm test

# Build produksi
npm run build
```

export interface PermanentGoogleConfig {
  GOOGLE_SHEET_URL: string;
  GOOGLE_DRIVE_FOLDER_URL: string;
  SHEET_NAME_PRODUCTS: string;
  SHEET_NAME_ORDERS: string;
  LAST_SYNCED?: string;
}

/**
 * NON-SECRET CLOUD DISPLAY CONFIGURATION
 * Apps Script URL (/exec) and API token live strictly on the server (Vercel env vars).
 */
export const PERMANENT_GOOGLE_CONFIG: PermanentGoogleConfig = {
  GOOGLE_SHEET_URL: '',
  GOOGLE_DRIVE_FOLDER_URL: '',
  SHEET_NAME_PRODUCTS: 'Products',
  SHEET_NAME_ORDERS: 'Orders',
};

export function isDatabaseConfigured(config: PermanentGoogleConfig): boolean {
  return extractValidSpreadsheetId(config.GOOGLE_SHEET_URL) !== null;
}

export type CategoryId = string;

export interface CategoryItem {
  id: CategoryId;
  name: string;
  nameEn?: string;
}

export const INITIAL_CATEGORIES: CategoryItem[] = [
  { id: 'hot', name: 'Populer', nameEn: 'Hot' },
  { id: 'burger', name: 'Burger', nameEn: 'Burger' },
  { id: 'pizza', name: 'Pizza', nameEn: 'Pizza' },
  { id: 'snack', name: 'Camilan', nameEn: 'Snack' },
  { id: 'soft_drink', name: 'Minuman', nameEn: 'Soft Drink' },
  { id: 'coffee', name: 'Kopi', nameEn: 'Coffee' },
  { id: 'ice_cream', name: 'Es Krim', nameEn: 'Ice Cream' },
];

export interface ProductItem {
  id: string;
  name: string;
  barcode: string;
  price: number; // Stored in Indonesian Rupiah (IDR)
  categories: CategoryId[];
  isNew?: boolean;
  isHidden?: boolean;
  popularity: number;
  imageUrl: string;
  driveFileId?: string;
  stock: number;
  lowStockThreshold: number;
}

export interface CartItem {
  product: ProductItem;
  quantity: number;
  note?: string;
}

export interface OrderRecord {
  orderId: string;
  createdAt: string;
  cashierName?: string;
  customerName?: string;
  paymentMethod?: string;
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
  }[];
  subTotal: number;
  taxPbf: number;
  total: number;
  syncedToSheet?: boolean;
  customerNote?: string;
}

/**
 * Formats a number as Indonesian Rupiah (e.g. Rp 45.000)
 */
export function formatRupiah(amount: number): string {
  const rounded = Math.round(Number(amount) || 0);
  return 'Rp ' + rounded.toLocaleString('id-ID');
}

/**
 * Parses numbers or formatted Rupiah strings (e.g. "Rp 25.000", "25,000", 25000) into integer IDR
 */
export function normalizePriceToIdr(price: number | string): number {
  if (typeof price === 'string') {
    const cleaned = price.replace(/rp/gi, '').trim();
    // If string has thousand separators like "25.000" or "25,000"
    if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) {
      const digitsOnly = Number(cleaned.replace(/[.,]/g, '')) || 0;
      return Math.round(digitsOnly);
    }
    const stripped = Number(cleaned.replace(/[^0-9.-]/g, '')) || 0;
    if (stripped > 0 && stripped < 500) {
      return Math.round(stripped * 10000);
    }
    return Math.round(stripped);
  }
  const num = Number(price) || 0;
  if (num > 0 && num < 500) {
    return Math.round(num * 10000);
  }
  return Math.round(num);
}

/**
 * Resolves any Google Drive link or file ID into a direct displayable image URL,
 * while passing through data:image SVGs or standard HTTPS URLs untouched.
 */
export function resolveGoogleDriveImageUrl(urlOrId: string): string {
  if (!urlOrId || !urlOrId.trim()) {
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';
  }
  const trimmed = urlOrId.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;

  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch && fileMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${fileMatch[1]}=w600`;
  }

  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${idParamMatch[1]}=w600`;
  }

  if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) {
    return `https://lh3.googleusercontent.com/d/${trimmed}=w600`;
  }

  return trimmed;
}

export const FOOD_ILLUSTRATIONS = {
  tripleBurger:
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
  doubleCheese:
    'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=600&q=80',
  originBurger:
    'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80',
  cheeseBurger:
    'https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=600&q=80',
  cheeseggBurger:
    'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=600&q=80',
  burgerDeluxe:
    'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=600&q=80',
  chickenPop:
    'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=600&q=80',
  kebabKatsu:
    'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80',
  chickenNugget:
    'https://images.unsplash.com/photo-1562967916-eb82221dfb92?auto=format&fit=crop&w=600&q=80',
  frenchFries:
    'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80',
  onionRings:
    'https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=600&q=80',
  coffeeLatte:
    'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=600&q=80',
  hazelnutLatte:
    'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=600&q=80',
  vanillaLatte:
    'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=600&q=80',
  caramelLatte:
    'https://images.unsplash.com/photo-1485808191679-5f86510681a2?auto=format&fit=crop&w=600&q=80',
  hotCappucino:
    'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=600&q=80',
  hotChocolate:
    'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=600&q=80',
  pizzaSlice:
    'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=600&q=80',
  margheritaPizza:
    'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80',
  bbqChickenPizza:
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80',
  trufflePizza:
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
  softDrink:
    'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80',
  berrySoda:
    'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
  lemonMint:
    'https://images.unsplash.com/photo-1556881286-fc6915169721?auto=format&fit=crop&w=600&q=80',
  iceCreamCone:
    'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=80',
  matchaCone:
    'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=600&q=80',
  chocoCone:
    'https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=600&q=80',
};

export const INITIAL_PRODUCTS: ProductItem[] = [
  {
    id: 'prod-triple-burger',
    name: 'Triple Burger',
    barcode: '899100210001',
    price: 45000,
    categories: ['hot', 'burger'],
    isNew: false,
    popularity: 99,
    imageUrl: FOOD_ILLUSTRATIONS.tripleBurger,
    stock: 24,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-double-cheese',
    name: 'Double Cheese',
    barcode: '899100210002',
    price: 38000,
    categories: ['hot', 'burger'],
    isNew: false,
    popularity: 96,
    imageUrl: FOOD_ILLUSTRATIONS.doubleCheese,
    stock: 18,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-origin-burger',
    name: 'Origin Burger',
    barcode: '899100210003',
    price: 35000,
    categories: ['hot', 'burger'],
    isNew: true,
    popularity: 94,
    imageUrl: FOOD_ILLUSTRATIONS.originBurger,
    stock: 3, // Below threshold of 5 -> Shows Low Stock badge!
    lowStockThreshold: 5,
  },
  {
    id: 'prod-chicken-pop3',
    name: 'Chicken Pop3',
    barcode: '899100210004',
    price: 28000,
    categories: ['hot', 'snack'],
    isNew: true,
    popularity: 91,
    imageUrl: FOOD_ILLUSTRATIONS.chickenPop,
    stock: 15,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-kebab-katsu',
    name: 'Kebab Katsu',
    barcode: '899100210005',
    price: 32000,
    categories: ['hot', 'snack'],
    isNew: false,
    popularity: 89,
    imageUrl: FOOD_ILLUSTRATIONS.kebabKatsu,
    stock: 4, // Below threshold of 5 -> Shows Low Stock badge!
    lowStockThreshold: 5,
  },
  {
    id: 'prod-chicken-nugget',
    name: 'Chicken Nugget',
    barcode: '899100210006',
    price: 25000,
    categories: ['hot', 'snack'],
    isNew: false,
    popularity: 88,
    imageUrl: FOOD_ILLUSTRATIONS.chickenNugget,
    stock: 20,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-cheese-burger',
    name: 'Cheese Burger',
    barcode: '899100210007',
    price: 30000,
    categories: ['burger'],
    isNew: false,
    popularity: 92,
    imageUrl: FOOD_ILLUSTRATIONS.cheeseBurger,
    stock: 16,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-cheesegg-burger',
    name: 'Cheesegg Burger',
    barcode: '899100210008',
    price: 26000,
    categories: ['burger'],
    isNew: true,
    popularity: 85,
    imageUrl: FOOD_ILLUSTRATIONS.cheeseggBurger,
    stock: 3, // Low Stock
    lowStockThreshold: 5,
  },
  {
    id: 'prod-burger-deluxe',
    name: 'Burger Deluxe',
    barcode: '899100210009',
    price: 34000,
    categories: ['burger'],
    isNew: false,
    popularity: 83,
    imageUrl: FOOD_ILLUSTRATIONS.burgerDeluxe,
    stock: 14,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-coffee-latte',
    name: 'Coffee Latte',
    barcode: '899100210010',
    price: 18000,
    categories: ['coffee'],
    isNew: true,
    popularity: 97,
    imageUrl: FOOD_ILLUSTRATIONS.coffeeLatte,
    stock: 25,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-hazelnut-latte',
    name: 'Hazelnut Latte',
    barcode: '899100210011',
    price: 20000,
    categories: ['coffee'],
    isNew: false,
    popularity: 90,
    imageUrl: FOOD_ILLUSTRATIONS.hazelnutLatte,
    stock: 19,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-vanilla-latte',
    name: 'Vanilla Latte',
    barcode: '899100210012',
    price: 20000,
    categories: ['coffee'],
    isNew: false,
    popularity: 87,
    imageUrl: FOOD_ILLUSTRATIONS.vanillaLatte,
    stock: 12,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-caramel-latte',
    name: 'Caramel Latte',
    barcode: '899100210013',
    price: 22000,
    categories: ['coffee'],
    isNew: true,
    popularity: 93,
    imageUrl: FOOD_ILLUSTRATIONS.caramelLatte,
    stock: 4, // Low Stock
    lowStockThreshold: 5,
  },
  {
    id: 'prod-hot-cappucino',
    name: 'Hot Cappucino',
    barcode: '899100210014',
    price: 16000,
    categories: ['coffee'],
    isNew: false,
    popularity: 86,
    imageUrl: FOOD_ILLUSTRATIONS.hotCappucino,
    stock: 22,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-hot-chocolate',
    name: 'Hot Chocolate',
    barcode: '899100210015',
    price: 18000,
    categories: ['coffee'],
    isNew: false,
    popularity: 84,
    imageUrl: FOOD_ILLUSTRATIONS.hotChocolate,
    stock: 18,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-pepperoni-pizza',
    name: 'Pepperoni Supreme',
    barcode: '899100210016',
    price: 55000,
    categories: ['pizza'],
    isNew: true,
    popularity: 95,
    imageUrl: FOOD_ILLUSTRATIONS.pizzaSlice,
    stock: 10,
    lowStockThreshold: 4,
  },
  {
    id: 'prod-margherita-pizza',
    name: 'Margherita Classic',
    barcode: '899100210017',
    price: 48000,
    categories: ['pizza'],
    isNew: false,
    popularity: 88,
    imageUrl: FOOD_ILLUSTRATIONS.margheritaPizza,
    stock: 12,
    lowStockThreshold: 4,
  },
  {
    id: 'prod-bbq-chicken-pizza',
    name: 'BBQ Chicken Pizza',
    barcode: '899100210018',
    price: 52000,
    categories: ['pizza'],
    isNew: false,
    popularity: 86,
    imageUrl: FOOD_ILLUSTRATIONS.bbqChickenPizza,
    stock: 3, // Low Stock
    lowStockThreshold: 4,
  },
  {
    id: 'prod-truffle-cheese-pizza',
    name: 'Four Cheese Truffle',
    barcode: '899100210019',
    price: 60000,
    categories: ['pizza'],
    isNew: true,
    popularity: 91,
    imageUrl: FOOD_ILLUSTRATIONS.trufflePizza,
    stock: 9,
    lowStockThreshold: 4,
  },
  {
    id: 'prod-french-fries',
    name: 'Crispy French Fries',
    barcode: '899100210020',
    price: 18000,
    categories: ['snack'],
    isNew: false,
    popularity: 90,
    imageUrl: FOOD_ILLUSTRATIONS.frenchFries,
    stock: 30,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-onion-rings',
    name: 'Cheese Onion Rings',
    barcode: '899100210021',
    price: 20000,
    categories: ['snack'],
    isNew: true,
    popularity: 85,
    imageUrl: FOOD_ILLUSTRATIONS.onionRings,
    stock: 14,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-cola-float',
    name: 'Classic Cola Float',
    barcode: '899100210022',
    price: 15000,
    categories: ['soft_drink'],
    isNew: true,
    popularity: 94,
    imageUrl: FOOD_ILLUSTRATIONS.softDrink,
    stock: 28,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-berry-soda',
    name: 'Sparkling Berry Soda',
    barcode: '899100210023',
    price: 16000,
    categories: ['soft_drink'],
    isNew: false,
    popularity: 89,
    imageUrl: FOOD_ILLUSTRATIONS.berrySoda,
    stock: 20,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-lemon-mint',
    name: 'Fresh Lemon Mint',
    barcode: '899100210024',
    price: 14000,
    categories: ['soft_drink'],
    isNew: false,
    popularity: 86,
    imageUrl: FOOD_ILLUSTRATIONS.lemonMint,
    stock: 18,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-strawberry-sundae',
    name: 'Strawberry Sundae',
    barcode: '899100210025',
    price: 18000,
    categories: ['ice_cream'],
    isNew: true,
    popularity: 95,
    imageUrl: FOOD_ILLUSTRATIONS.iceCreamCone,
    stock: 15,
    lowStockThreshold: 5,
  },
  {
    id: 'prod-matcha-cone',
    name: 'Matcha Soft Serve',
    barcode: '899100210026',
    price: 20000,
    categories: ['ice_cream'],
    isNew: false,
    popularity: 91,
    imageUrl: FOOD_ILLUSTRATIONS.matchaCone,
    stock: 4, // Low Stock
    lowStockThreshold: 5,
  },
  {
    id: 'prod-choco-cone',
    name: 'Belgian Choco Cone',
    barcode: '899100210027',
    price: 18000,
    categories: ['ice_cream'],
    isNew: false,
    popularity: 89,
    imageUrl: FOOD_ILLUSTRATIONS.chocoCone,
    stock: 16,
    lowStockThreshold: 5,
  },
];

export function generateAppsScriptCode(config: PermanentGoogleConfig): string {
  return `/**
 * ============================================================================
 * PINKPOS — GOOGLE APPS SCRIPT BACKEND (Code.gs)
 * KEAMANAN WAJIB:
 * 1. Buka Project Settings -> Script Properties di Google Apps Script.
 * 2. Tambahkan Property: API_TOKEN = <token_rahasia_panjang_anda>
 * 3. Spreadsheet dibuat PRIVAT (hanya pemilik/Apps Script yang dapat mengakses).
 *    Hanya folder foto produk di Drive yang bersifat VIEW-only agar foto tampil.
 * ============================================================================
 */

const PERMANENT_CONFIG = {
  GOOGLE_SHEET_URL: "${config.GOOGLE_SHEET_URL || ''}",
  GOOGLE_DRIVE_FOLDER_URL: "${config.GOOGLE_DRIVE_FOLDER_URL || ''}",
  SHEET_PRODUCTS: "${config.SHEET_NAME_PRODUCTS}",
  SHEET_ORDERS: "${config.SHEET_NAME_ORDERS}",
  SHEET_SETTINGS: "StoreSettings",
  SHEET_CATEGORIES: "Categories"
};

function verifyToken(providedToken) {
  const expectedToken = PropertiesService.getScriptProperties().getProperty("API_TOKEN");
  if (!expectedToken || !providedToken) return false;
  return String(providedToken).trim() === String(expectedToken).trim();
}

function extractIdFromUrl(url) {
  if (!url) return "";
  const match = String(url).match(/[-\\w]{25,}/);
  return match ? match[0] : "";
}

/**
 * Otomatis membuka Spreadsheet dari link, atau membuat Spreadsheet baru yang PRIVAT
 * jika belum ada, lalu menyimpan ID-nya di ScriptProperties.
 */
function getOrCreateSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const configuredId = extractIdFromUrl(PERMANENT_CONFIG.GOOGLE_SHEET_URL);

  if (configuredId) {
    try {
      return SpreadsheetApp.openById(configuredId);
    } catch (e) {}
  }

  const savedAutoId = props.getProperty("AUTO_CREATED_SHEET_ID");
  if (savedAutoId) {
    try {
      return SpreadsheetApp.openById(savedAutoId);
    } catch (e) {}
  }

  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      props.setProperty("AUTO_CREATED_SHEET_ID", active.getId());
      return active;
    }
  } catch (e) {}

  // Otomatis buat Google Spreadsheet baru yang tetap PRIVAT (hanya pemilik)
  const created = SpreadsheetApp.create("PinkPOS — Database Privat");
  props.setProperty("AUTO_CREATED_SHEET_ID", created.getId());
  return created;
}

function getDriveFolder() {
  const folderId = extractIdFromUrl(PERMANENT_CONFIG.GOOGLE_DRIVE_FOLDER_URL);
  if (folderId && folderId.indexOf("Permanent_ID") === -1) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {}
  }
  const props = PropertiesService.getScriptProperties();
  const savedFolderId = props.getProperty("AUTO_CREATED_FOLDER_ID");
  if (savedFolderId) {
    try {
      return DriveApp.getFolderById(savedFolderId);
    } catch (e) {}
  }
  const folder = DriveApp.createFolder("PinkPOS_Product_Images");
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty("AUTO_CREATED_FOLDER_ID", folder.getId());
  return folder;
}

function styleSheetHeader(sheet, headers) {
  sheet.appendRow(headers);
  sheet.setFrozenRows(1);
  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setFontWeight("bold");
  range.setBackground("#1E293B");
  range.setFontColor("#FFFFFF");
}

/**
 * Otomatis membuat keempat tab Sheet (Products, Orders, Categories, StoreSettings)
 * apabila belum ada di dalam Google Spreadsheet.
 */
function ensureSheets(ss) {
  let prodSheet = ss.getSheetByName(PERMANENT_CONFIG.SHEET_PRODUCTS);
  if (!prodSheet) {
    prodSheet = ss.insertSheet(PERMANENT_CONFIG.SHEET_PRODUCTS);
    styleSheetHeader(prodSheet, [
      "id", "name", "barcode", "price", "categories",
      "isNew", "popularity", "imageUrl", "driveFileId",
      "stock", "lowStockThreshold"
    ]);
  }

  let ordSheet = ss.getSheetByName(PERMANENT_CONFIG.SHEET_ORDERS);
  if (!ordSheet) {
    ordSheet = ss.insertSheet(PERMANENT_CONFIG.SHEET_ORDERS);
    styleSheetHeader(ordSheet, [
      "orderId", "createdAt", "itemsJson", "subTotal",
      "taxPbf", "total", "customerName", "paymentMethod", "cashierName"
    ]);
  }

  let catSheet = ss.getSheetByName(PERMANENT_CONFIG.SHEET_CATEGORIES);
  if (!catSheet) {
    catSheet = ss.insertSheet(PERMANENT_CONFIG.SHEET_CATEGORIES);
    styleSheetHeader(catSheet, ["id", "name", "nameEn"]);
  }

  let setSheet = ss.getSheetByName(PERMANENT_CONFIG.SHEET_SETTINGS);
  if (!setSheet) {
    setSheet = ss.insertSheet(PERMANENT_CONFIG.SHEET_SETTINGS);
    styleSheetHeader(setSheet, ["key", "valueJson", "updatedAt"]);
  }

  return { prodSheet, ordSheet, catSheet, setSheet };
}

function doGet(e) {
  const token = e && e.parameter ? e.parameter.token : "";
  if (!verifyToken(token)) {
    return jsonResponse({ status: "error", error: "unauthorized" });
  }

  const ss = getOrCreateSpreadsheet();
  const { prodSheet, ordSheet, catSheet, setSheet } = ensureSheets(ss);

  const prodRows = prodSheet.getDataRange().getValues();
  const prodHeaders = (prodRows.shift() || []).map(h => String(h || "").trim());
  const products = prodRows.filter(r => r[0] !== "" || r[1] !== "").map((row, idx) => {
    const raw = {};
    prodHeaders.forEach((h, i) => {
      raw[h] = row[i];
      raw[h.toLowerCase()] = row[i];
    });
    const idVal = raw.id ?? raw.kode ?? ("prod-" + (idx + 1));
    const nameVal = raw.name ?? raw.nama ?? raw["nama produk"] ?? raw.menu ?? ("Produk " + (idx + 1));
    const barcodeVal = raw.barcode ?? raw.sku ?? ("89910021" + String(idx + 1).padStart(4, "0"));
    const priceRaw = raw.price ?? raw.harga ?? 0;
    const stockRaw = raw.stock ?? raw.stok ?? raw.jumlah;
    const thresholdRaw = raw.lowStockThreshold ?? raw.lowstockthreshold ?? raw["batas stok"] ?? raw["min stok"];
    const catRaw = raw.categories ?? raw.category ?? raw.kategori ?? "hot";
    const imgRaw = raw.imageUrl ?? raw.imageurl ?? raw.image ?? raw.foto ?? raw.gambar ?? "";
    const driveRaw = raw.driveFileId ?? raw.drivefileid ?? "";
    const isNewRaw = raw.isNew ?? raw.isnew;
    const popRaw = raw.popularity ?? raw.popularitas ?? 90;

    return {
      id: String(idVal).trim(),
      name: String(nameVal).trim(),
      barcode: String(barcodeVal).trim(),
      price: Number(String(priceRaw).replace(/[^0-9.-]/g, "") || 0),
      popularity: Number(popRaw || 90),
      stock: stockRaw !== undefined && stockRaw !== "" ? Number(stockRaw) : 20,
      lowStockThreshold: thresholdRaw !== undefined && thresholdRaw !== "" ? Number(thresholdRaw) : 5,
      isNew: isNewRaw === true || String(isNewRaw).toLowerCase() === "true" || isNewRaw === 1 || isNewRaw === "1",
      categories: String(catRaw || "hot").split(",").map(s => s.trim()).filter(Boolean),
      imageUrl: String(imgRaw || "").trim(),
      driveFileId: driveRaw ? String(driveRaw).trim() : undefined
    };
  });

  const ordRows = ordSheet.getDataRange().getValues();
  ordRows.shift();
  const orders = ordRows.filter(r => r[0]).reverse().slice(0, 2000).map(r => {
    let parsedItems = [];
    try { parsedItems = JSON.parse(r[2] || "[]"); } catch (err) {}
    return {
      orderId: String(r[0]),
      createdAt: String(r[1]),
      items: parsedItems,
      subTotal: Number(r[3] || 0),
      taxPbf: Number(r[4] || 0),
      total: Number(r[5] || 0),
      customerName: r[6] ? String(r[6]) : undefined,
      paymentMethod: r[7] ? String(r[7]) : undefined,
      cashierName: r[8] ? String(r[8]) : undefined
    };
  });

  // Prioritaskan membaca langsung dari tab Categories agar edit di tabel Sheet langsung masuk ke Aplikasi (2 Arah)
  let categories = null;
  const catRows = catSheet.getDataRange().getValues();
  catRows.shift();
  const validCatRows = catRows.filter(r => r[0] && r[1]);
  if (validCatRows.length > 0) {
    categories = validCatRows.map(r => ({
      id: String(r[0]).trim(),
      name: String(r[1]).trim(),
      nameEn: String(r[2] || r[1]).trim()
    }));
  }

  // Baca StoreSettings dari JSON maupun baris key-value individual (agar diedit di Sheet langsung terupdate di Aplikasi)
  const setRows = setSheet.getDataRange().getValues();
  setRows.shift();
  let storeSettings = null;
  const flatOverrides = {};

  setRows.forEach(r => {
    const k = String(r[0] || "").trim();
    const v = r[1];
    if (!k) return;
    if (k === "storeBranding") {
      try {
        storeSettings = JSON.parse(v);
        if (storeSettings && typeof storeSettings === "object") {
          delete storeSettings.loginUsername;
          delete storeSettings.loginPassword;
        }
      } catch (err) {}
    } else if (k === "categoriesList" && !categories) {
      try { categories = JSON.parse(v); } catch (err) {}
    } else if (
      [
        "storeName", "storeTagline", "primaryColor", "fontFamily", "language",
        "logoType", "customLogoUrl", "taxEnabled", "taxName",
        "taxRate"
      ].indexOf(k) !== -1
    ) {
      if (k === "taxEnabled") {
        flatOverrides[k] = v === true || String(v).toLowerCase() === "true";
      } else if (k === "taxRate") {
        flatOverrides[k] = Number(v || 0);
      } else {
        flatOverrides[k] = String(v);
      }
    }
  });

  if (Object.keys(flatOverrides).length > 0) {
    storeSettings = Object.assign({}, storeSettings || {}, flatOverrides);
  }

  return jsonResponse({
    status: "ok",
    initialized: true,
    sheetUrl: ss.getUrl(),
    serverTime: new Date().toISOString(),
    products,
    orders,
    storeSettings,
    categories
  });
}

function writeProductsTable(prodSheet, productsList) {
  prodSheet.clearContents();
  const prodRows = [
    ["id", "name", "barcode", "price", "categories", "isNew", "popularity", "imageUrl", "driveFileId", "stock", "lowStockThreshold"],
    ...productsList.map(p => [
      p.id, p.name, p.barcode || "", Number(p.price || 0),
      (p.categories || ["hot"]).join(","), Boolean(p.isNew),
      Number(p.popularity || 90), p.imageUrl || "", p.driveFileId || "",
      Number(p.stock ?? 20), Number(p.lowStockThreshold ?? 5)
    ])
  ];
  prodSheet.getRange(1, 1, prodRows.length, prodRows[0].length).setValues(prodRows);
}

function adjustStockForOrderItems(prodSheet, items, multiplier) {
  if (!Array.isArray(items) || items.length === 0) return;
  const qtyById = {};
  items.forEach(it => {
    const idKey = String(it && it.id ? it.id : "").trim();
    const qty = Number(it && it.quantity ? it.quantity : 0);
    if (idKey && qty > 0) {
      qtyById[idKey] = (qtyById[idKey] || 0) + qty;
    }
  });

  const prodData = prodSheet.getDataRange().getValues();
  for (let i = 1; i < prodData.length; i++) {
    const rowId = String(prodData[i][0] || "").trim();
    if (qtyById[rowId]) {
      const currentStock = Number(prodData[i][9] ?? 20);
      const nextStock = Math.max(0, currentStock + multiplier * qtyById[rowId]);
      prodSheet.getRange(i + 1, 10).setValue(nextStock);
    }
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  try {
    const payload = JSON.parse(e && e.postData ? e.postData.contents : "{}");
    if (!verifyToken(payload && payload.token)) {
      return jsonResponse({ status: "error", error: "unauthorized" });
    }

    lock.waitLock(15000);
    lockAcquired = true;

    const action = payload.action;
    const ss = getOrCreateSpreadsheet();
    const { prodSheet, ordSheet, catSheet, setSheet } = ensureSheets(ss);

    // Bulk Sync All Data to Sheets (hanya untuk sinkronisasi awal / manual)
    if (action === "syncAll") {
      if (Array.isArray(payload.products)) {
        writeProductsTable(prodSheet, payload.products);
      }

      if (Array.isArray(payload.categories)) {
        catSheet.clearContents();
        const catRows = [
          ["id", "name", "nameEn"],
          ...payload.categories.map(c => [c.id, c.name, c.nameEn || c.name])
        ];
        catSheet.getRange(1, 1, catRows.length, 3).setValues(catRows);
        upsertKeySetting(setSheet, "categoriesList", payload.categories);
      }

      if (Array.isArray(payload.orders)) {
        ordSheet.clearContents();
        const chronological = [...payload.orders].reverse();
        const ordRows = [
          ["orderId", "createdAt", "itemsJson", "subTotal", "taxPbf", "total", "customerName", "paymentMethod", "cashierName"],
          ...chronological.map(o => [
            o.orderId, o.createdAt, JSON.stringify(o.items || []),
            Number(o.subTotal || 0), Number(o.taxPbf || 0), Number(o.total || 0),
            o.customerName || "", o.paymentMethod || "", o.cashierName || ""
          ])
        ];
        ordSheet.getRange(1, 1, ordRows.length, ordRows[0].length).setValues(ordRows);
      }

      if (payload.storeSettings) {
        saveStoreBrandingRows(setSheet, payload.storeSettings);
      }

      SpreadsheetApp.flush();
      return jsonResponse({ status: "ok", initialized: true, sheetUrl: ss.getUrl() });
    }

    if (action === "saveProduct" || action === "upsertProduct") {
      let imageUrl = payload.imageUrl || "";
      let driveFileId = payload.driveFileId || "";

      if (payload.base64Data && payload.fileName) {
        const folder = getDriveFolder();
        const contentType = payload.mimeType || "image/png";
        const bytes = Utilities.base64Decode(payload.base64Data.split(",").pop());
        const blob = Utilities.newBlob(bytes, contentType, payload.fileName);
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        driveFileId = file.getId();
        imageUrl = "https://lh3.googleusercontent.com/d/" + driveFileId + "=w600";
      }

      const data = prodSheet.getDataRange().getValues();
      let updatedRowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (
          String(data[i][0]).trim() === String(payload.id).trim() ||
          (payload.barcode && String(data[i][2]).trim() === String(payload.barcode).trim())
        ) {
          updatedRowIndex = i + 1;
          break;
        }
      }

      const rowValues = [
        payload.id,
        payload.name,
        payload.barcode || "",
        payload.price,
        (payload.categories || ["hot"]).join(","),
        Boolean(payload.isNew),
        payload.popularity || 90,
        imageUrl,
        driveFileId,
        payload.stock !== undefined ? Number(payload.stock) : 20,
        payload.lowStockThreshold !== undefined ? Number(payload.lowStockThreshold) : 5
      ];

      if (updatedRowIndex > 0) {
        prodSheet.getRange(updatedRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        prodSheet.appendRow(rowValues);
      }

      SpreadsheetApp.flush();
      return jsonResponse({ status: "ok", id: payload.id, imageUrl, driveFileId, sheetUrl: ss.getUrl() });
    }

    if (action === "deleteProduct") {
      const data = prodSheet.getDataRange().getValues();
      for (let i = data.length - 1; i >= 1; i--) {
        if (
          String(data[i][0]).trim() === String(payload.id).trim() ||
          (payload.name && String(data[i][1]).trim() === String(payload.name).trim())
        ) {
          prodSheet.deleteRow(i + 1);
        }
      }
      SpreadsheetApp.flush();
      return jsonResponse({ status: "ok", deletedId: payload.id, sheetUrl: ss.getUrl() });
    }

    if (action === "addOrder" || action === "saveOrder") {
      const orderIdStr = String(payload.orderId || "").trim();
      const existingOrders = ordSheet.getDataRange().getValues();
      for (let i = 1; i < existingOrders.length; i++) {
        if (String(existingOrders[i][0]).trim() === orderIdStr) {
          return jsonResponse({
            status: "ok",
            orderId: orderIdStr,
            duplicateIgnored: true,
            sheetUrl: ss.getUrl()
          });
        }
      }

      ordSheet.appendRow([
        orderIdStr,
        payload.createdAt,
        JSON.stringify(payload.items || []),
        Number(payload.subTotal || 0),
        Number(payload.taxPbf || 0),
        Number(payload.total || 0),
        payload.customerName || "",
        payload.paymentMethod || "",
        payload.cashierName || ""
      ]);

      adjustStockForOrderItems(prodSheet, payload.items || [], -1);

      SpreadsheetApp.flush();
      return jsonResponse({ status: "ok", orderId: orderIdStr, sheetUrl: ss.getUrl() });
    }

    if (action === "deleteOrder") {
      const targetId = String(payload.orderId || "").trim();
      const data = ordSheet.getDataRange().getValues();
      let itemsToRestore = [];

      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][0]).trim() === targetId) {
          try {
            const parsed = JSON.parse(data[i][2] || "[]");
            if (Array.isArray(parsed)) {
              itemsToRestore = itemsToRestore.concat(parsed);
            }
          } catch (err) {}
          ordSheet.deleteRow(i + 1);
        }
      }

      if (itemsToRestore.length === 0 && Array.isArray(payload.items)) {
        itemsToRestore = payload.items;
      }
      adjustStockForOrderItems(prodSheet, itemsToRestore, 1);

      SpreadsheetApp.flush();
      return jsonResponse({ status: "ok", deletedOrderId: targetId, sheetUrl: ss.getUrl() });
    }

    if (action === "saveStoreSettings") {
      const settingsObj = Object.assign({}, payload.settings || {});
      if (payload.logoBase64 && payload.logoFileName) {
        const folder = getDriveFolder();
        const contentType = payload.logoMimeType || "image/png";
        const bytes = Utilities.base64Decode(payload.logoBase64.split(",").pop());
        const blob = Utilities.newBlob(bytes, contentType, payload.logoFileName);
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        const driveLogoUrl = "https://lh3.googleusercontent.com/d/" + file.getId() + "=w600";
        settingsObj.customLogoUrl = driveLogoUrl;
      }
      saveStoreBrandingRows(setSheet, settingsObj);
      SpreadsheetApp.flush();
      return jsonResponse({
        status: "ok",
        key: "storeBranding",
        customLogoUrl: settingsObj.customLogoUrl,
        sheetUrl: ss.getUrl()
      });
    }

    if (action === "saveCategories") {
      upsertKeySetting(setSheet, "categoriesList", payload.categories);

      if (Array.isArray(payload.categories)) {
        catSheet.clearContents();
        const catRows = [
          ["id", "name", "nameEn"],
          ...payload.categories.map(c => [c.id, c.name, c.nameEn || c.name])
        ];
        catSheet.getRange(1, 1, catRows.length, 3).setValues(catRows);
      }

      SpreadsheetApp.flush();
      return jsonResponse({ status: "ok", key: "categoriesList", sheetUrl: ss.getUrl() });
    }

    return jsonResponse({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  } finally {
    if (lockAcquired) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}

function saveStoreBrandingRows(setSheet, settingsObj) {
  const cleanSettings = Object.assign({}, settingsObj || {});
  delete cleanSettings.loginUsername;
  delete cleanSettings.loginPassword;
  upsertKeySetting(setSheet, "storeBranding", cleanSettings);
  const readableKeys = [
    "storeName", "storeTagline", "primaryColor", "fontFamily", "language",
    "logoType", "customLogoUrl", "taxEnabled", "taxName",
    "taxRate"
  ];
  readableKeys.forEach(k => {
    if (cleanSettings[k] !== undefined) {
      upsertRawSetting(setSheet, k, cleanSettings[k]);
    }
  });
}

function upsertRawSetting(setSheet, keyName, rawVal) {
  const data = setSheet.getDataRange().getValues();
  let foundIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === keyName) {
      foundIdx = i + 1;
      break;
    }
  }
  const row = [keyName, rawVal, new Date().toISOString()];
  if (foundIdx > 0) {
    setSheet.getRange(foundIdx, 1, 1, 3).setValues([row]);
  } else {
    setSheet.appendRow(row);
  }
}

function upsertKeySetting(setSheet, keyName, valObj) {
  upsertRawSetting(setSheet, keyName, JSON.stringify(valObj));
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
}

/**
 * Extracts a real Google Spreadsheet ID from a Google Sheet URL.
 */
export function extractValidSpreadsheetId(sheetUrl: string): string | null {
  if (!sheetUrl) return null;
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{15,})/);
  if (!match || !match[1]) return null;
  return match[1];
}



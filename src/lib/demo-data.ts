export type DemoProduct = {
  id: string;
  name: string;
  sku: string;
  category: "HUMAN" | "VETERINARY";
  unitType: string;
  unitsPerBox: number;
  defaultPrice: number;
  costPrice: number;
  manufacturer: string;
  country: string;
  lowStockThreshold: number;
  availableQty: number;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
};

export type DemoBatch = {
  id: string;
  productId: string;
  productName: string;
  category: "HUMAN" | "VETERINARY";
  batchNumber: string;
  quantity: number;
  costPrice: number;
  expiryDate: string;
  location: "WAREHOUSE" | "PHARMACY";
  manufacturer: string;
  country: string;
  unitType: string;
};

export type DemoOrder = {
  id: string;
  orderNumber: string;
  type: "PHARMACY_TO_WAREHOUSE" | "WAREHOUSE_TO_ADMIN" | "PROCUREMENT";
  status: "PENDING" | "APPROVED" | "DISPATCHED" | "CONFIRMED" | "REJECTED";
  notes?: string;
  createdAt: string;
  items: { productName: string; quantity: number; unitType: string }[];
};

export type DemoSale = {
  id: string;
  receiptNumber: string;
  total: number;
  profit: number;
  paymentMethod: "CASH" | "BANK_APP";
  bankAppName?: string;
  createdAt: string;
  itemsCount: number;
};

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

export const DEMO_PHARMACY_ID = "demo-pharmacy";
export const DEMO_WAREHOUSE_ID = "demo-warehouse";

export const demoProducts: DemoProduct[] = [
  {
    id: "prod-1",
    name: "باراسيتامول 500 مجم",
    sku: "HUM-PAR-500",
    category: "HUMAN",
    unitType: "STRIP",
    unitsPerBox: 10,
    defaultPrice: 2500,
    costPrice: 1500,
    manufacturer: "أمون",
    country: "مصر",
    lowStockThreshold: 20,
    availableQty: 120,
    batchId: "batch-1",
    batchNumber: "B2026-001",
    expiryDate: new Date(now + 200 * day).toISOString(),
  },
  {
    id: "prod-2",
    name: "أموكسيسيلين 250 مجم",
    sku: "HUM-AMX-250",
    category: "HUMAN",
    unitType: "BOTTLE",
    unitsPerBox: 1,
    defaultPrice: 8500,
    costPrice: 5200,
    manufacturer: "جلاكسو",
    country: "بريطانيا",
    lowStockThreshold: 15,
    availableQty: 8,
    batchId: "batch-2",
    batchNumber: "B2026-014",
    expiryDate: new Date(now + 45 * day).toISOString(),
  },
  {
    id: "prod-3",
    name: "إنسولين سريع المفعول",
    sku: "HUM-INS-R",
    category: "HUMAN",
    unitType: "VIAL",
    unitsPerBox: 1,
    defaultPrice: 45000,
    costPrice: 32000,
    manufacturer: "نوفو نورديسك",
    country: "الدنمارك",
    lowStockThreshold: 10,
    availableQty: 18,
    batchId: "batch-3",
    batchNumber: "B2025-088",
    expiryDate: new Date(now + 20 * day).toISOString(),
  },
  {
    id: "prod-4",
    name: "إيفرمكتين بيطري",
    sku: "VET-IVM-01",
    category: "VETERINARY",
    unitType: "INJECTABLE",
    unitsPerBox: 1,
    defaultPrice: 12000,
    costPrice: 7500,
    manufacturer: "فايزر بيطري",
    country: "الولايات المتحدة",
    lowStockThreshold: 12,
    availableQty: 35,
    batchId: "batch-4",
    batchNumber: "V2026-003",
    expiryDate: new Date(now + 300 * day).toISOString(),
  },
  {
    id: "prod-5",
    name: "فيتامينات متعددة للماشية",
    sku: "VET-VIT-M",
    category: "VETERINARY",
    unitType: "BOTTLE",
    unitsPerBox: 1,
    defaultPrice: 9800,
    costPrice: 6100,
    manufacturer: "باير",
    country: "ألمانيا",
    lowStockThreshold: 10,
    availableQty: 4,
    batchId: "batch-5",
    batchNumber: "V2025-221",
    expiryDate: new Date(now - 5 * day).toISOString(),
  },
  {
    id: "prod-6",
    name: "أوميبرازول 20 مجم",
    sku: "HUM-OME-20",
    category: "HUMAN",
    unitType: "BOX",
    unitsPerBox: 14,
    defaultPrice: 15000,
    costPrice: 9200,
    manufacturer: "أسترازينيكا",
    country: "السويد",
    lowStockThreshold: 15,
    availableQty: 56,
    batchId: "batch-6",
    batchNumber: "B2026-040",
    expiryDate: new Date(now + 400 * day).toISOString(),
  },
  {
    id: "prod-7",
    name: "محلول ملحي 500 مل",
    sku: "HUM-SAL-500",
    category: "HUMAN",
    unitType: "ML",
    unitsPerBox: 1,
    defaultPrice: 3200,
    costPrice: 1800,
    manufacturer: "محلي",
    country: "السودان",
    lowStockThreshold: 30,
    availableQty: 90,
    batchId: "batch-7",
    batchNumber: "B2026-077",
    expiryDate: new Date(now + 180 * day).toISOString(),
  },
  {
    id: "prod-8",
    name: "مضاد حيوي دواجن",
    sku: "VET-ABX-P",
    category: "VETERINARY",
    unitType: "CARTON",
    unitsPerBox: 12,
    defaultPrice: 22000,
    costPrice: 14000,
    manufacturer: "زويتيس",
    country: "الولايات المتحدة",
    lowStockThreshold: 8,
    availableQty: 22,
    batchId: "batch-8",
    batchNumber: "V2026-019",
    expiryDate: new Date(now + 60 * day).toISOString(),
  },
];

export const demoBatches: DemoBatch[] = demoProducts.map((p) => ({
  id: p.batchId,
  productId: p.id,
  productName: p.name,
  category: p.category,
  batchNumber: p.batchNumber,
  quantity: p.availableQty,
  costPrice: p.costPrice,
  expiryDate: p.expiryDate,
  location: p.availableQty > 20 ? "WAREHOUSE" : "PHARMACY",
  manufacturer: p.manufacturer,
  country: p.country,
  unitType: p.unitType,
}));

export let demoOrders: DemoOrder[] = [
  {
    id: "ord-1",
    orderNumber: "ORD-20260320-1001",
    type: "PHARMACY_TO_WAREHOUSE",
    status: "PENDING",
    notes: "طلب تعويض مخزون منخفض",
    createdAt: new Date(now - 2 * day).toISOString(),
    items: [
      { productName: "أموكسيسيلين 250 مجم", quantity: 20, unitType: "BOTTLE" },
      { productName: "فيتامينات متعددة للماشية", quantity: 15, unitType: "BOTTLE" },
    ],
  },
  {
    id: "ord-2",
    orderNumber: "ORD-20260318-0882",
    type: "PHARMACY_TO_WAREHOUSE",
    status: "APPROVED",
    createdAt: new Date(now - 4 * day).toISOString(),
    items: [{ productName: "باراسيتامول 500 مجم", quantity: 50, unitType: "STRIP" }],
  },
  {
    id: "ord-3",
    orderNumber: "ORD-20260315-0744",
    type: "WAREHOUSE_TO_ADMIN",
    status: "DISPATCHED",
    notes: "طلب شراء من المورد",
    createdAt: new Date(now - 7 * day).toISOString(),
    items: [{ productName: "إنسولين سريع المفعول", quantity: 30, unitType: "VIAL" }],
  },
  {
    id: "ord-4",
    orderNumber: "ORD-20260310-0611",
    type: "PROCUREMENT",
    status: "CONFIRMED",
    createdAt: new Date(now - 12 * day).toISOString(),
    items: [{ productName: "محلول ملحي 500 مل", quantity: 100, unitType: "ML" }],
  },
];

export let demoSales: DemoSale[] = [
  {
    id: "sale-1",
    receiptNumber: "RCP-20260320-4401",
    total: 17500,
    profit: 6800,
    paymentMethod: "CASH",
    createdAt: new Date(now - 0.2 * day).toISOString(),
    itemsCount: 3,
  },
  {
    id: "sale-2",
    receiptNumber: "RCP-20260320-4402",
    total: 45000,
    profit: 13000,
    paymentMethod: "BANK_APP",
    bankAppName: "بنكك",
    createdAt: new Date(now - 0.5 * day).toISOString(),
    itemsCount: 1,
  },
  {
    id: "sale-3",
    receiptNumber: "RCP-20260319-4388",
    total: 27800,
    profit: 9200,
    paymentMethod: "CASH",
    createdAt: new Date(now - 1.2 * day).toISOString(),
    itemsCount: 4,
  },
  {
    id: "sale-4",
    receiptNumber: "RCP-20260318-4301",
    total: 64000,
    profit: 21000,
    paymentMethod: "BANK_APP",
    bankAppName: "فوري",
    createdAt: new Date(now - 2.1 * day).toISOString(),
    itemsCount: 2,
  },
  {
    id: "sale-5",
    receiptNumber: "RCP-20260315-4100",
    total: 33200,
    profit: 11400,
    paymentMethod: "CASH",
    createdAt: new Date(now - 5 * day).toISOString(),
    itemsCount: 5,
  },
];

export function getAnalyticsSummary() {
  const totalSales = demoSales.reduce((s, x) => s + x.total, 0);
  const totalProfit = demoSales.reduce((s, x) => s + x.profit, 0);
  const lowStock = demoProducts.filter((p) => p.availableQty <= p.lowStockThreshold);
  const nearExpiry = demoProducts.filter((p) => {
    const days = (new Date(p.expiryDate).getTime() - now) / day;
    return days <= 90;
  });
  const topSelling = [...demoProducts]
    .sort((a, b) => b.defaultPrice * (100 - b.availableQty) - a.defaultPrice * (100 - a.availableQty))
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      category: p.category,
      estimatedSold: Math.max(5, 100 - p.availableQty),
      revenue: p.defaultPrice * Math.max(5, 100 - p.availableQty),
    }));

  const daily = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date(now - (6 - i) * day);
    const daySales = demoSales.filter((s) => {
      const d = new Date(s.createdAt);
      return d.toDateString() === date.toDateString();
    });
    return {
      date: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("ar-SD", { weekday: "short" }),
      sales: daySales.reduce((sum, s) => sum + s.total, 0) || Math.round(15000 + Math.random() * 40000),
      profit: daySales.reduce((sum, s) => sum + s.profit, 0) || Math.round(5000 + Math.random() * 15000),
    };
  });

  return {
    totalSales,
    totalProfit,
    salesCount: demoSales.length,
    lowStockCount: lowStock.length,
    nearExpiryCount: nearExpiry.length,
    lowStock,
    nearExpiry,
    topSelling,
    daily,
    cashTotal: demoSales.filter((s) => s.paymentMethod === "CASH").reduce((s, x) => s + x.total, 0),
    bankTotal: demoSales.filter((s) => s.paymentMethod === "BANK_APP").reduce((s, x) => s + x.total, 0),
  };
}

export function addDemoSale(sale: DemoSale) {
  demoSales = [sale, ...demoSales];
}

export function updateDemoOrderStatus(
  id: string,
  status: DemoOrder["status"]
): DemoOrder | null {
  const idx = demoOrders.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  demoOrders[idx] = { ...demoOrders[idx], status };
  return demoOrders[idx];
}

export function addDemoOrder(order: DemoOrder) {
  demoOrders = [order, ...demoOrders];
}

export function decrementDemoStock(productId: string, qty: number) {
  const p = demoProducts.find((x) => x.id === productId);
  if (p) {
    p.availableQty = Math.max(0, p.availableQty - qty);
  }
  const b = demoBatches.find((x) => x.productId === productId);
  if (b) {
    b.quantity = Math.max(0, b.quantity - qty);
  }
}

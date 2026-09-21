import Dexie, { type EntityTable } from "dexie";

export type OfflineSaleItem = {
  productId: string;
  productName: string;
  batchId?: string;
  quantity: number;
  unitType: string;
  unitPrice: number;
  costPrice: number;
  lineTotal: number;
  lineProfit: number;
};

export type OfflineSale = {
  id?: number;
  clientId: string;
  pharmacyId: string;
  cashierId?: string;
  paymentMethod: "CASH" | "BANK_APP";
  bankAppName?: string;
  transactionRef?: string;
  subtotal: number;
  total: number;
  totalCost: number;
  profit: number;
  items: OfflineSaleItem[];
  createdAt: string;
  synced: boolean;
  syncError?: string;
};

export type CachedProduct = {
  id: string;
  name: string;
  sku?: string;
  category: string;
  unitType: string;
  unitsPerBox: number;
  defaultPrice: number;
  costPrice: number;
  manufacturer?: string;
  country?: string;
  availableQty: number;
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
  updatedAt: string;
};

export type SyncMeta = {
  id: string;
  lastSyncAt?: string;
  pendingCount: number;
};

class PharmacyOfflineDB extends Dexie {
  offlineSales!: EntityTable<OfflineSale, "id">;
  cachedProducts!: EntityTable<CachedProduct, "id">;
  syncMeta!: EntityTable<SyncMeta, "id">;

  constructor() {
    super("SmartPharmacyDB");
    this.version(1).stores({
      offlineSales: "++id, clientId, synced, createdAt, pharmacyId",
      cachedProducts: "id, name, category, updatedAt",
      syncMeta: "id",
    });
  }
}

export const offlineDb = typeof window !== "undefined" ? new PharmacyOfflineDB() : null;

export function createClientId(): string {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveOfflineSale(
  sale: Omit<OfflineSale, "id" | "synced" | "clientId"> & { clientId?: string }
): Promise<OfflineSale> {
  if (!offlineDb) throw new Error("Offline DB unavailable");

  const record: OfflineSale = {
    ...sale,
    clientId: sale.clientId ?? createClientId(),
    synced: false,
  };

  const id = await offlineDb.offlineSales.add(record);
  return { ...record, id };
}

export async function getPendingSales(): Promise<OfflineSale[]> {
  if (!offlineDb) return [];
  return offlineDb.offlineSales.filter((s) => !s.synced).toArray();
}

export async function getPendingCount(): Promise<number> {
  if (!offlineDb) return 0;
  return offlineDb.offlineSales.filter((s) => !s.synced).count();
}

export async function markSaleSynced(id: number): Promise<void> {
  if (!offlineDb) return;
  await offlineDb.offlineSales.update(id, { synced: true, syncError: undefined });
}

export async function markSaleSyncError(id: number, error: string): Promise<void> {
  if (!offlineDb) return;
  await offlineDb.offlineSales.update(id, { syncError: error });
}

export async function cacheProducts(products: CachedProduct[]): Promise<void> {
  if (!offlineDb) return;
  await offlineDb.cachedProducts.bulkPut(products);
}

export async function searchCachedProducts(query: string): Promise<CachedProduct[]> {
  if (!offlineDb) return [];
  const all = await offlineDb.cachedProducts.toArray();
  if (!query.trim()) return all.slice(0, 50);
  const q = query.toLowerCase();
  return all.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      (p.sku?.toLowerCase().includes(q) ?? false) ||
      (p.manufacturer?.toLowerCase().includes(q) ?? false)
  );
}

export type SyncResult = {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
};

let syncInProgress = false;

export async function syncOfflineSales(): Promise<SyncResult> {
  if (!offlineDb || syncInProgress) {
    return { success: true, synced: 0, failed: 0, errors: [] };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { success: false, synced: 0, failed: 0, errors: ["Offline"] };
  }

  syncInProgress = true;
  const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] };

  try {
    const pending = await getPendingSales();
    if (pending.length === 0) {
      await offlineDb.syncMeta.put({ id: "main", lastSyncAt: new Date().toISOString(), pendingCount: 0 });
      return result;
    }

    for (const sale of pending) {
      try {
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sale }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }

        if (sale.id != null) {
          await markSaleSynced(sale.id);
        }
        result.synced += 1;
      } catch (err) {
        result.failed += 1;
        result.success = false;
        const message = err instanceof Error ? err.message : "Unknown sync error";
        result.errors.push(message);
        if (sale.id != null) {
          await markSaleSyncError(sale.id, message);
        }
      }
    }

    const remaining = await getPendingCount();
    await offlineDb.syncMeta.put({
      id: "main",
      lastSyncAt: new Date().toISOString(),
      pendingCount: remaining,
    });
  } finally {
    syncInProgress = false;
  }

  return result;
}

export function isSyncing(): boolean {
  return syncInProgress;
}

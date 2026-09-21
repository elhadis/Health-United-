import { create } from "zustand";

export type CartItem = {
  productId: string;
  productName: string;
  batchId?: string;
  batchNumber?: string;
  unitType: string;
  unitsPerBox: number;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  availableQty: number;
  sellAsUnit: boolean;
};

type PaymentMethod = "CASH" | "BANK_APP";

type CartState = {
  items: CartItem[];
  paymentMethod: PaymentMethod;
  bankAppName: string;
  transactionRef: string;
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (productId: string, batchId?: string) => void;
  updateQuantity: (productId: string, quantity: number, batchId?: string) => void;
  updatePrice: (productId: string, unitPrice: number, batchId?: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setBankDetails: (appName: string, ref: string) => void;
  clearCart: () => void;
  subtotal: () => number;
  totalCost: () => number;
  profit: () => number;
  itemCount: () => number;
};

function itemKey(productId: string, batchId?: string) {
  return `${productId}::${batchId ?? "none"}`;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  paymentMethod: "CASH",
  bankAppName: "",
  transactionRef: "",

  addItem: (item) => {
    const qty = item.quantity ?? 1;
    const maxQty =
      typeof item.availableQty === "number" && item.availableQty > 0
        ? item.availableQty
        : Number.MAX_SAFE_INTEGER;

    set((state) => {
      const key = itemKey(item.productId, item.batchId);
      const existing = state.items.find(
        (i) => itemKey(i.productId, i.batchId) === key
      );
      if (existing) {
        return {
          items: state.items.map((i) =>
            itemKey(i.productId, i.batchId) === key
              ? {
                  ...i,
                  quantity: Math.min(i.quantity + qty, maxQty),
                  availableQty: maxQty === Number.MAX_SAFE_INTEGER ? i.availableQty : maxQty,
                }
              : i
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            ...item,
            availableQty: maxQty === Number.MAX_SAFE_INTEGER ? item.availableQty : maxQty,
            quantity: Math.min(qty, maxQty),
          },
        ],
      };
    });
  },

  removeItem: (productId, batchId) => {
    set((state) => ({
      items: state.items.filter(
        (i) => itemKey(i.productId, i.batchId) !== itemKey(productId, batchId)
      ),
    }));
  },

  updateQuantity: (productId, quantity, batchId) => {
    set((state) => ({
      items: state.items
        .map((i) =>
          itemKey(i.productId, i.batchId) === itemKey(productId, batchId)
            ? { ...i, quantity: Math.max(0, Math.min(quantity, i.availableQty)) }
            : i
        )
        .filter((i) => i.quantity > 0),
    }));
  },

  updatePrice: (productId, unitPrice, batchId) => {
    set((state) => ({
      items: state.items.map((i) =>
        itemKey(i.productId, i.batchId) === itemKey(productId, batchId)
          ? { ...i, unitPrice: Math.max(0, unitPrice) }
          : i
      ),
    }));
  },

  setPaymentMethod: (method) => set({ paymentMethod: method }),

  setBankDetails: (bankAppName, transactionRef) =>
    set({ bankAppName, transactionRef }),

  clearCart: () =>
    set({
      items: [],
      paymentMethod: "CASH",
      bankAppName: "",
      transactionRef: "",
    }),

  subtotal: () => get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
  totalCost: () => get().items.reduce((sum, i) => sum + i.costPrice * i.quantity, 0),
  profit: () => get().subtotal() - get().totalCost(),
  itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}));

/**
 * Merge duplicate warehouse inventory rows.
 *
 *   npx tsx scripts/consolidate-warehouse.ts          # dry run (report only)
 *   npx tsx scripts/consolidate-warehouse.ts --apply  # write changes
 *
 * 1. Duplicate products (same name ignoring case/spaces + category + unit):
 *    batches, order items and sale items move to the oldest product, then the
 *    duplicates are deleted.
 * 2. Duplicate warehouse batches (pharmacyId = null, same product + batch
 *    number + expiry day): quantities are summed into the oldest batch, sale
 *    items are re-pointed, then the duplicates are deleted.
 * Pharmacy-held stock is never touched.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

async function mergeProducts() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, category: true, unitType: true },
  });

  const groups = new Map<string, typeof products>();
  for (const p of products) {
    const key = `${norm(p.name)}|${p.category}|${p.unitType}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  let merged = 0;
  const canonical = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [keep, ...dupes] = group;
    const dupeIds = dupes.map((d) => d.id);
    for (const id of dupeIds) canonical.set(id, keep.id);
    console.log(
      `product "${keep.name}" (${keep.category}/${keep.unitType}): merging ${dupes.length} duplicate(s) into ${keep.id}`
    );
    merged += dupes.length;
    if (!apply) continue;

    await prisma.$transaction([
      prisma.stockBatch.updateMany({
        where: { productId: { in: dupeIds } },
        data: { productId: keep.id },
      }),
      prisma.orderItem.updateMany({
        where: { productId: { in: dupeIds } },
        data: { productId: keep.id },
      }),
      prisma.saleItem.updateMany({
        where: { productId: { in: dupeIds } },
        data: { productId: keep.id },
      }),
      prisma.product.deleteMany({ where: { id: { in: dupeIds } } }),
    ]);
  }
  return { merged, canonical };
}

async function mergeWarehouseBatches(canonical: Map<string, string>) {
  const batches = await prisma.stockBatch.findMany({
    where: { pharmacyId: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      productId: true,
      batchNumber: true,
      expiryDate: true,
      quantity: true,
      product: { select: { name: true } },
    },
  });

  const groups = new Map<string, typeof batches>();
  for (const b of batches) {
    const day = b.expiryDate.toISOString().slice(0, 10);
    const productId = canonical.get(b.productId) ?? b.productId;
    const key = `${productId}|${norm(b.batchNumber)}|${day}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }

  let merged = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [keep, ...dupes] = group;
    const dupeIds = dupes.map((d) => d.id);
    const total = group.reduce((s, b) => s + b.quantity, 0);
    console.log(
      `batch "${keep.batchNumber}" of "${keep.product.name}": ${group.length} rows -> 1 (qty ${group
        .map((b) => b.quantity)
        .join(" + ")} = ${total})`
    );
    merged += dupes.length;
    if (!apply) continue;

    await prisma.$transaction([
      prisma.saleItem.updateMany({
        where: { batchId: { in: dupeIds } },
        data: { batchId: keep.id },
      }),
      prisma.stockBatch.update({
        where: { id: keep.id },
        data: { quantity: total },
      }),
      prisma.stockBatch.deleteMany({ where: { id: { in: dupeIds } } }),
    ]);
  }
  return merged;
}

async function main() {
  console.log(apply ? "== APPLY MODE ==" : "== DRY RUN (use --apply to write) ==");
  const { merged: products, canonical } = await mergeProducts();
  const batches = await mergeWarehouseBatches(canonical);
  console.log(
    `${apply ? "merged" : "would merge"}: ${products} duplicate product(s), ${batches} duplicate warehouse batch row(s)`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

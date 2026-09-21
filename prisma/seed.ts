import { PrismaClient, Role, ProductCategory, UnitType, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Smart Pharmacy database...");

  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.stockBatch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
  await prisma.pharmacy.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.supplier.deleteMany();

  const warehouse = await prisma.warehouse.create({
    data: { name: "المستودع المركزي", location: "الخرطوم" },
  });

  const pharmacy = await prisma.pharmacy.create({
    data: { name: "صيدلية النيل", location: "بحري" },
  });

  const superAdminHash = await bcrypt.hash("AdminPassword123", 12);
  const managerHash = await bcrypt.hash("Manager123!", 12);
  const cashierHash = await bcrypt.hash("Cashier123!", 12);

  const superadmin = await prisma.user.create({
    data: {
      name: "المسؤول الأعلى",
      username: "superadmin",
      email: "superadmin@pharmacy.local",
      passwordHash: superAdminHash,
      role: Role.ADMINISTRATOR,
    },
  });

  const manager = await prisma.user.create({
    data: {
      name: "مدير المستودع",
      username: "warehouse_admin",
      email: "warehouse@pharmacy.local",
      passwordHash: managerHash,
      role: Role.ADMIN,
      warehouseId: warehouse.id,
    },
  });

  const cashier = await prisma.user.create({
    data: {
      name: "كاشير الصيدلية",
      username: "cashier",
      email: "cashier@pharmacy.local",
      passwordHash: cashierHash,
      role: Role.USER,
      pharmacyId: pharmacy.id,
    },
  });

  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "باراسيتامول 500 مجم",
        sku: "HUM-PAR-500",
        category: ProductCategory.HUMAN,
        unitType: UnitType.STRIP,
        unitsPerBox: 10,
        defaultPrice: 2500,
        costPrice: 1500,
        manufacturer: "أمون",
        country: "مصر",
        lowStockThreshold: 20,
        warehouseId: warehouse.id,
        batches: {
          create: {
            batchNumber: "B2026-001",
            quantity: 120,
            costPrice: 1500,
            expiryDate: new Date(Date.now() + 200 * 86400000),
            pharmacyId: pharmacy.id,
            manufacturer: "أمون",
            country: "مصر",
          },
        },
      },
    }),
    prisma.product.create({
      data: {
        name: "أموكسيسيلين 250 مجم",
        sku: "HUM-AMX-250",
        category: ProductCategory.HUMAN,
        unitType: UnitType.BOTTLE,
        defaultPrice: 8500,
        costPrice: 5200,
        manufacturer: "جلاكسو",
        country: "بريطانيا",
        lowStockThreshold: 15,
        warehouseId: warehouse.id,
        batches: {
          create: {
            batchNumber: "B2026-014",
            quantity: 8,
            costPrice: 5200,
            expiryDate: new Date(Date.now() + 45 * 86400000),
            pharmacyId: pharmacy.id,
            manufacturer: "جلاكسو",
            country: "بريطانيا",
          },
        },
      },
    }),
    prisma.product.create({
      data: {
        name: "إيفرمكتين بيطري",
        sku: "VET-IVM-01",
        category: ProductCategory.VETERINARY,
        unitType: UnitType.INJECTABLE,
        defaultPrice: 12000,
        costPrice: 7500,
        manufacturer: "فايزر بيطري",
        country: "الولايات المتحدة",
        lowStockThreshold: 12,
        warehouseId: warehouse.id,
        batches: {
          create: {
            batchNumber: "V2026-003",
            quantity: 35,
            costPrice: 7500,
            expiryDate: new Date(Date.now() + 300 * 86400000),
            warehouseId: warehouse.id,
            manufacturer: "فايزر بيطري",
            country: "الولايات المتحدة",
          },
        },
      },
    }),
  ]);

  await prisma.order.create({
    data: {
      orderNumber: `ORD-SEED-${Date.now()}`,
      type: OrderType.PHARMACY_TO_WAREHOUSE,
      status: OrderStatus.PENDING,
      notes: "طلب تعويض مخزون منخفض",
      pharmacyId: pharmacy.id,
      warehouseId: warehouse.id,
      requesterId: cashier.id,
      items: {
        create: {
          productId: products[1].id,
          quantity: 20,
          unitType: UnitType.BOTTLE,
        },
      },
    },
  });

  await prisma.supplier.create({
    data: {
      name: "مورد الأدوية العالمي",
      country: "الإمارات",
      phone: "+971500000000",
      payments: {
        create: {
          type: "SUPPLIER",
          amount: 250000,
          method: PaymentMethod.BANK_APP,
          bankName: "Emirates NBD",
          bankCountry: "UAE",
          transactionRef: "TX-SEED-001",
          notes: "دفعة جزئية لتوريد إنسولين",
        },
      },
    },
  });

  console.log("✅ Seed complete");
  console.log({
    superadmin: { username: superadmin.username, password: "AdminPassword123" },
    manager: { username: manager.username, password: "Manager123!" },
    cashier: { username: cashier.username, password: "Cashier123!" },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

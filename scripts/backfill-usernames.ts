import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    if (!u.username) {
      const base = (u.email || u.name || u.id)
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_");
      await prisma.user.update({
        where: { id: u.id },
        data: { username: `${base}_${u.id.slice(-4)}` },
      });
    }
  }
  console.log("backfilled", users.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { DEFAULT_SETTINGS } from "../src/lib/settings";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

async function main() {
  const password = process.env.OWNER_PASSWORD;
  if (!password || password.length < 12) {
    console.error("Set OWNER_PASSWORD to at least 12 characters before seeding production.");
    process.exit(1);
  }
  const email = (process.env.OWNER_EMAIL || "owner@mighty-movers.example").toLowerCase();
  const tenant = await prisma.tenant.upsert({
    where: { slug: "mighty-movers" },
    create: { slug: "mighty-movers", name: "Mighty Movers", settings: DEFAULT_SETTINGS },
    update: {},
  });
  const existing = await prisma.user.findFirst({ where: { tenantId: tenant.id, email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        name: process.env.OWNER_NAME || "Owner",
        role: "OWNER",
        passwordHash: hashPassword(password),
      },
    });
    console.log(`Created owner ${email} for mighty-movers.`);
  } else {
    console.log(`Owner ${email} already exists. Password was left unchanged.`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Seed failed");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

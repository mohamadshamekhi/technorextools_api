/**
 * Idempotent seed. Run with:  pnpm prisma:seed
 *
 * Seeds the permission catalog, the system roles (superadmin / accountant /
 * customer), one superadmin user, and baseline site settings. Safe to re-run.
 */
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, SYSTEM_ROLES } from '../src/modules/access/permission.catalog';
import { generateReferralCode } from '../src/modules/auth/referral-code.util';
import { normalizeMobile } from '../src/modules/auth/mobile.util';

const prisma = new PrismaClient();

const SUPERADMIN_MOBILE = normalizeMobile(process.env.SEED_SUPERADMIN_MOBILE ?? '09120000000');

async function main(): Promise<void> {
  // 1. permissions
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { group: p.group, description: p.description },
      create: p,
    });
  }
  const permByCode = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));
  console.log(`permissions: ${permByCode.size}`);

  // 2. system roles + their permission grants
  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { slug: r.slug },
      update: { title: r.title, description: r.description, isSystem: true },
      create: { slug: r.slug, title: r.title, description: r.description, isSystem: true },
    });

    if (r.permissions === 'all') {
      continue; // superadmin is granted everything implicitly at runtime
    }
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (r.permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: r.permissions
          .map((code) => permByCode.get(code))
          .filter((id): id is string => Boolean(id))
          .map((permissionId) => ({ roleId: role.id, permissionId })),
      });
    }
    console.log(`role ${r.slug}: ${r.permissions.length} permissions`);
  }

  // 3. superadmin user
  const superRole = await prisma.role.findUniqueOrThrow({ where: { slug: 'superadmin' } });
  await prisma.user.upsert({
    where: { mobile: SUPERADMIN_MOBILE },
    update: { roleId: superRole.id, isActive: true },
    create: {
      mobile: SUPERADMIN_MOBILE,
      fullName: 'مدیر سیستم',
      roleId: superRole.id,
      referralCode: generateReferralCode(),
    },
  });
  console.log(`superadmin: ${SUPERADMIN_MOBILE}`);

  // 4. baseline settings
  for (const [key, value] of Object.entries({
    stock_hold_minutes: '10',
    loyalty_points_per_toman: '0.001',
    loyalty_redeem_max_percent: '50',
    referral_reward_points: '5000',
    abandoned_cart_hours: '24',
    site_title: 'فروشگاه ابزار',
  })) {
    await prisma.siteSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // 5. a default shipping method
  const shippingCount = await prisma.shippingMethod.count();
  if (shippingCount === 0) {
    await prisma.shippingMethod.create({
      data: { title: 'پست پیشتاز', cost: 60_000, sortOrder: 1 },
    });
  }

  console.log('seed complete');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());

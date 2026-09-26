/**
 * The canonical list of permission codes. `pnpm prisma:seed` writes exactly these
 * into the `permissions` collection; guards reference them via `@RequirePermissions`.
 *
 * Convention: `<group>.<action>` where action is one of view / create / edit /
 * delete / manage (manage = full control of the group).
 */
export interface PermissionDef {
  code: string;
  group: string;
  description: string;
}

export const PERMISSIONS = [
  // catalog
  { code: 'products.view', group: 'catalog', description: 'مشاهده محصولات' },
  { code: 'products.manage', group: 'catalog', description: 'ایجاد/ویرایش/حذف محصول' },
  { code: 'categories.view', group: 'catalog', description: 'مشاهده دسته‌بندی‌ها' },
  { code: 'categories.manage', group: 'catalog', description: 'مدیریت دسته‌بندی و ویژگی‌ها' },
  { code: 'brands.manage', group: 'catalog', description: 'مدیریت برندها' },
  { code: 'inventory.manage', group: 'catalog', description: 'تغییر موجودی و قیمت واریانت' },
  {
    code: 'spare-parts.manage',
    group: 'catalog',
    description: 'مدیریت قطعات یدکی و سازگاری با محصولات',
  },

  // orders
  { code: 'orders.view', group: 'orders', description: 'مشاهده سفارش‌ها و فاکتورها' },
  { code: 'orders.manage', group: 'orders', description: 'تغییر وضعیت سفارش' },
  { code: 'payments.view', group: 'orders', description: 'مشاهده تراکنش‌ها و وضعیت پرداخت' },
  { code: 'shipping.manage', group: 'orders', description: 'مدیریت روش‌های ارسال' },
  { code: 'payment-methods.manage', group: 'orders', description: 'مدیریت روش‌های پرداخت' },

  // marketing
  { code: 'discounts.view', group: 'marketing', description: 'مشاهده کدهای تخفیف' },
  {
    code: 'discounts.manage',
    group: 'marketing',
    description: 'مدیریت کدهای تخفیف و محصول شگفت‌انگیز',
  },
  { code: 'loyalty.manage', group: 'marketing', description: 'تنظیم دستی امتیاز وفاداری' },
  { code: 'bundles.manage', group: 'marketing', description: 'مدیریت پکیج‌های محصول' },

  // content & support
  { code: 'comments.moderate', group: 'content', description: 'تأیید/رد نظرات' },
  {
    code: 'product-questions.moderate',
    group: 'content',
    description: 'پاسخ و تأیید/رد پرسش‌های محصول',
  },
  { code: 'contact.view', group: 'content', description: 'مشاهده پیام‌های فرم تماس' },
  { code: 'newsletter.view', group: 'content', description: 'مشاهده مشترکین خبرنامه' },
  { code: 'tickets.handle', group: 'content', description: 'پاسخ به تیکت‌های پشتیبانی' },
  { code: 'articles.manage', group: 'content', description: 'مدیریت وبلاگ' },
  { code: 'media.manage', group: 'content', description: 'آپلود تصویر و رسانه' },
  { code: 'branches.manage', group: 'content', description: 'مدیریت شعب و اطلاعات تماس' },
  { code: 'repairs.manage', group: 'content', description: 'مدیریت درخواست‌های تعمیر' },
  { code: 'warranties.manage', group: 'content', description: 'صدور و مدیریت گارانتی' },

  // reports
  { code: 'reports.view', group: 'reports', description: 'مشاهده گزارش‌های مالی و فروش' },

  // access control
  { code: 'users.view', group: 'access', description: 'مشاهده کاربران' },
  { code: 'users.manage', group: 'access', description: 'ویرایش کاربر و تخصیص نقش' },
  { code: 'roles.manage', group: 'access', description: 'تعریف نقش و تخصیص مجوز' },
  { code: 'settings.manage', group: 'access', description: 'تنظیمات سراسری سایت' },
] as const satisfies readonly PermissionDef[];

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

export const ALL_PERMISSION_CODES: PermissionCode[] = PERMISSIONS.map((p) => p.code);

/** System roles seeded on first run. `superadmin` is granted every permission implicitly. */
export const SYSTEM_ROLES: Array<{
  slug: string;
  title: string;
  description: string;
  permissions: PermissionCode[] | 'all';
}> = [
  {
    slug: 'superadmin',
    title: 'سوپرادمین',
    description: 'دسترسی کامل به همه بخش‌ها',
    permissions: 'all',
  },
  {
    slug: 'accountant',
    title: 'حسابدار',
    description: 'فقط مشاهده بخش مالی و سفارش‌ها',
    permissions: ['orders.view', 'payments.view', 'reports.view'],
  },
  {
    slug: 'customer',
    title: 'مشتری',
    description: 'حساب کاربری فروشگاه — بدون دسترسی پنل مدیریت',
    permissions: [],
  },
];

export const CUSTOMER_ROLE_SLUG = 'customer';
export const SUPERADMIN_ROLE_SLUG = 'superadmin';

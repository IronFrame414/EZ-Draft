// EZD-005b (vault/plans/EZD-005b.md section 3): fixed ids of the seeded tenant 1 and its owner.
// Values: EZD-005.md Step 1.2 (fixed, uuid v4 shaped).
// EZD-016c (vault/plans/EZD-016c.md section 3): the second tenant, its owner and the 200 tenant 1
// seed projects. EZD-016a re-exports these.
export const TENANT_1_ID = '00000000-0000-4000-8000-000000000001';
export const JOSH_USER_ID = '00000000-0000-4000-8000-000000001001';
export const TENANT_2_ID = '00000000-0000-4000-8000-000000000002';
export const TENANT_2_OWNER_USER_ID = '00000000-0000-4000-8000-000000002001';
export const JOSH_EMAIL = 'josh@example.com';
export const TENANT_2_OWNER_EMAIL = 'tenant2-owner@example.com';
export const SEED_PROJECT_COUNT = 200;

export function seedProjectId(i: number): string {
  if (!Number.isInteger(i) || i < 1 || i > SEED_PROJECT_COUNT) {
    throw new RangeError(`seedProjectId: ${i} is not an integer from 1 to ${SEED_PROJECT_COUNT}`);
  }
  return '00000000-0000-4000-8000-' + String(100000 + i).padStart(12, '0');
}

/**
 * Billing abstraction for AFEtm Safety Check.
 *
 * The mobile app monetizes through NATIVE store subscriptions:
 *   • iOS  → Apple In-App Purchase / StoreKit 2
 *   • Android → Google Play Billing
 *
 * Stripe / any web checkout is intentionally out of scope. This module
 * currently talks to the Emergent backend as a *placeholder* so the rest
 * of the app can be built end-to-end. When we switch to real receipts:
 *
 *   1. Add `expo-in-app-purchases` (or `react-native-iap`).
 *   2. Replace the body of `purchaseMonthly` / `purchaseYearly` /
 *      `restore` with calls to the native store, then forward the
 *      validated receipt/token to `/api/subscription/purchase`.
 *   3. Keep the shape of the return value identical so the UI (Paywall
 *      and Manage Subscription) does not need to change.
 *
 * The subscription state that gates access is always fetched from
 * `/api/subscription` (backend-owned mirror), never inferred locally.
 */

import { Platform } from 'react-native';
import { req, getDeviceId } from './api';

/**
 * IOS_PAYWALL_ENABLED — feature flag for the v1.0 App Store launch.
 *
 * While we complete the real StoreKit integration (Apple IAP Product IDs
 * pending), the iOS build must NOT display any priced subscription
 * tile, Restore Purchases button, or Manage Subscription entry. The
 * user experiences the app as free access. This flag intentionally
 * lives in this module so every call site can read a single source of
 * truth without hunting for Platform.OS branches.
 *
 * Android and web keep the full paywall UX intact until the same
 * migration path is completed for Google Play Billing.
 */
export const IOS_PAYWALL_ENABLED = Platform.OS !== 'ios';

export const BILLING = {
  freeTrialDays: 30,
  monthly: {
    plan: 'monthly' as const,
    productId: {
      apple: 'afetm_personal_monthly',
      android: 'afetm_personal_monthly',
    },
    priceUsd: 19.99,
    priceLabel: '$19.99',
    periodLabel: 'month',
  },
  yearly: {
    plan: 'yearly' as const,
    productId: {
      apple: 'afetm_personal_yearly',
      android: 'afetm_personal_yearly',
    },
    priceUsd: 199.99,
    priceLabel: '$199.99',
    periodLabel: 'year',
    // Yearly savings vs 12 × monthly, rounded down to whole percent.
    savingsPercent: Math.round((1 - 199.99 / (19.99 * 12)) * 100),
  },
};

export type SubscriptionStatus =
  | 'none'
  | 'trial'
  | 'active'
  | 'expired';

export type Subscription = {
  status: SubscriptionStatus;
  plan: 'trial' | 'monthly' | 'yearly' | null;
  platform: 'apple' | 'google' | 'mock' | null;
  product_id: string | null;
  started_at: string | null;
  expires_at: string | null;
  canceled_at: string | null;
  last_verified_at: string | null;
};

/**
 * Read current subscription from the backend mirror. This is the ONLY
 * source of truth for gating access to the assessment flow.
 */
export async function fetchSubscription(deviceId: string) {
  return req<Subscription>(
    `/subscription?device_id=${encodeURIComponent(deviceId)}`
  );
}

/**
 * Grants the 30-day free trial once per device. Backend refuses to
 * grant a second one (HTTP 409 TRIAL_ALREADY_USED).
 */
export async function startFreeTrial(deviceId: string) {
  return req<Subscription>('/subscription/start-trial', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId }),
  });
}

/**
 * Placeholder monthly purchase — TODO: swap for real StoreKit /
 * Google Play Billing call and forward the validated receipt.
 */
export async function purchaseMonthly(deviceId: string) {
  // TODO: replace with real store purchase call.
  return req<Subscription>('/subscription/purchase', {
    method: 'POST',
    body: JSON.stringify({
      device_id: deviceId,
      plan: 'monthly',
      platform: 'mock',
      product_id: BILLING.monthly.productId.apple,
    }),
  });
}

/**
 * Placeholder yearly purchase — TODO: swap for real StoreKit /
 * Google Play Billing call and forward the validated receipt.
 */
export async function purchaseYearly(deviceId: string) {
  // TODO: replace with real store purchase call.
  return req<Subscription>('/subscription/purchase', {
    method: 'POST',
    body: JSON.stringify({
      device_id: deviceId,
      plan: 'yearly',
      platform: 'mock',
      product_id: BILLING.yearly.productId.apple,
    }),
  });
}

/**
 * Placeholder restore — will ask the native store for entitlements and
 * push them back to the backend once wired for real.
 */
export async function restorePurchases(deviceId: string) {
  return req<Subscription>('/subscription/restore', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId }),
  });
}

/**
 * Marks the subscription as canceled (still valid until `expires_at`).
 * When wired to native stores, this triggers the platform's Manage
 * Subscription deep link.
 */
export async function cancelSubscription(deviceId: string) {
  return req<Subscription>('/subscription/cancel', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId }),
  });
}

/** Helper: does the athlete currently have access? */
export function hasActiveAccess(sub: Subscription | null | undefined): boolean {
  if (!sub) return false;
  return sub.status === 'trial' || sub.status === 'active';
}

/** Helper: days remaining until expiry (or 0 if already gone). */
export function daysUntilExpiry(sub: Subscription | null | undefined): number {
  if (!sub?.expires_at) return 0;
  const ms = new Date(sub.expires_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

/**
 * v1.0 iOS App Store launch — free-access guarantee.
 *
 * The iOS build MUST NOT expose any priced subscription tile or mocked
 * purchase button. To keep the backend gate happy while the paywall is
 * hidden, we silently ensure a trial is active on iOS the first time
 * the app opens. Idempotent: if a trial (or any active state) already
 * exists we no-op. Never throws — a failure here should not block the
 * UI, the backend gate simply stays as-is.
 */
export async function ensureIOSFreeAccess(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const id = await getDeviceId();
    const sub = await fetchSubscription(id);
    if (hasActiveAccess(sub)) return;
    // TRIAL_ALREADY_USED (409) is fine — nothing more we can do
    // silently. The user's app stays reachable because Emergent
    // treats an expired trial identically until we ship real IAP.
    await startFreeTrial(id).catch(() => undefined);
  } catch {
    // Network / auth transient failure — retry next launch.
  }
}

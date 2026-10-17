# payment

Real payments with PayOS (VietQR bank transfer): ⭐ Pro membership and paid coin packs.

## Owned tables
- `orders` (migration `20261021000000_payments.sql`): `id`, `order_code` (bigint, unique, PayOS's number for the order, ≤ `Number.MAX_SAFE_INTEGER`), `user_id` (→ `auth.users`), `amount` (VND), `status` ('PENDING' | 'PAID' | 'CANCELLED'), `plan_type` ('PRO_1M' | 'PRO_LIFETIME' | 'COIN_PACK'), `product_id`, `coins` (> 0 only for a coin pack), `payment_link_id`, `paid_at`, `created_at`, `updated_at`. RLS: the buyer reads their own; players write nothing (service role only).
- `users.pro_until` (same migration): end of the Pro membership; `'infinity'` = lifetime; null = never Pro. Written only by `fulfill_order()`.
- Functions (service role only): `fulfill_order(order_code, amount_paid)` (marks PAID and grants, exactly once; `ORDER_NOT_FOUND`, `AMOUNT_MISMATCH` when paid less than the price; a CANCELLED order reported paid by PayOS is still fulfilled), `cancel_order(order_code)` (PENDING → CANCELLED; returns the status).

## Environment
`PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` (server only, never `NEXT_PUBLIC_`), plus `SUPABASE_SERVICE_ROLE_KEY`. Optional `APP_URL` (e.g. `https://mindgarden.vn`) for PayOS's return URL behind a proxy; else the request's origin. Without the PayOS keys the Upgrade button is hidden, checkout answers `PAYMENT_UNAVAILABLE` (503) and the webhook 503. Register `https://<domain>/api/payment/webhook` as the webhook URL in the PayOS dashboard.

## Routes (`app/api/payment`, thin: they call `server.ts`)
| Route | Notes |
|-------|-------|
| `POST /api/payment/create { productId }` | Auth: Required. Zod (`dto/PaymentDto.ts` `CreatePaymentDto`: a product id only) → `ActionResult<Checkout>` `{ orderCode, productId, amount, description, checkoutUrl, qrCode, accountName, accountNumber, bin, expiresAt }`. Prices from `lib/plans.ts`; inserts the PENDING order (service role; a colliding order code is retried), then `payOS.paymentRequests.create` (return and cancel URL `/payment/result`, link open 15 min). PayOS failure → the order is cancelled, `PAYMENT_FAILED` (502). Status codes: 400 `VALIDATION_FAILED`, 401 `AUTH_UNAUTHORIZED`, 503 `PAYMENT_UNAVAILABLE`, 502 `PAYMENT_FAILED`, 500 `INTERNAL_ERROR` |
| `POST /api/payment/webhook` | No session. Shape (`PayOSWebhookDto`), then the signature (`payOS.webhooks.verify`, HMAC with the checksum key): invalid → 400, nothing changes. `code === '00'` (and the data's code) → `fulfill_order(orderCode, amount)`. 200 when handled, already fulfilled, ignored (not a success), an unknown order (PayOS's confirmation call) or an underpayment (logged); 500 on a database failure so PayOS retries; 503 without PayOS |

## Exports
| From | Export | Notes |
|------|--------|-------|
| `index.ts` | `getPaymentStatus({ orderCode })` | Server Action. Auth: Required. The buyer's order (RLS), settled with PayOS when still PENDING (`paymentRequests.get`: PAID → `fulfill_order`, CANCELLED / EXPIRED / FAILED → `cancel_order`), plus `totalCoins` and the `membership`. Works where the webhook can't reach (localhost). Errors: `VALIDATION_FAILED`, `AUTH_UNAUTHORIZED`, `ORDER_NOT_FOUND`, `PAYMENT_UNAVAILABLE`, `INTERNAL_ERROR` |
| `index.ts` | `getMembership()` | Server Action. Auth: Optional. `{ isPro, lifetime, proUntil, paymentsEnabled }` (signed out: not Pro). The root layout loads it with the HUD |
| `index.ts` | `PaymentModal({ signedIn, paymentsEnabled, membership })` | Client, mounted once in the root layout, opened through `shared/stores/PaymentDialogProvider` (`usePaymentDialog().open(productId?)`). Pick Pro (1 month / lifetime; lifetime members see coins only) or a coin pack → "Pay … with VietQR" → the QR code (`react-qr-code` from PayOS's `qrCode`), amount, account, transfer message, order code, and "Open PayOS checkout". Polls `getPaymentStatus` every 3 s (`POLL_MS`): PAID → gold burst, purse updated (`CoinsProvider`), `router.refresh()` (header ⭐ Pro); CANCELLED → "Choose again" |
| `index.ts` | `UpgradeButton({ membership, paymentsEnabled })` | Client header pill: "⭐ Pro" (tooltip: until when / for life) or "⭐ Upgrade"; hidden when payments are off and the gardener isn't Pro |
| `index.ts` | `PaymentResult({ orderCode, cancelledHint, initial })` | Client body of `/payment/result` (PayOS's return / cancel page): re-checks a pending order up to 15 times, 3 s apart; never trusts PayOS's query string for the outcome |
| `index.ts` | `PAYMENT_PRODUCTS`, `PRO_PRODUCTS`, `COIN_PRODUCTS`, `findProduct`, `membershipOf`, types | Pure catalogue (`lib/plans.ts`): Pro 1 month 49.000 ₫ (`PRO_MONTH_DAYS` = 30, added from today or from the current end), Pro lifetime 499.000 ₫, the Coin Shop's four packages at their shop prices. Transfer descriptions ≤ 9 characters (some banks keep only 9). `makeOrderCode(nowMs, random3)` = ms × 1000 + 3 random digits |
| `server.ts` | `startCheckout`, `httpStatusOf`, `handlePayOSWebhook`, `isPaymentConfigured` | For the route handlers |

## Other pieces
- `services/payos.ts`: the PayOS v2 client (`@payos/node` 2.x: `paymentRequests.create / get`, `webhooks.verify`; the v1 names `createPaymentLink` / `verifyPaymentWebhookData` no longer exist). `services/orders.ts` is the only module here that uses the service-role client (allow-listed in `decks/__tests__/answerSecrecy.test.ts`).
- The Coin Shop (`shared/components/game/CoinShopModal`, prop `paymentsEnabled`) shows "Buy with VietQR · price", which opens the payment dialog on the picked package; the dev-only "Simulate Top-up" stays beside it outside production.
- **Pro has no gameplay benefit yet**: it is a supporter membership with the header badge. Decide what Pro unlocks before selling it.

## Tests
`__tests__/plans.test.ts` (catalogue, SQL sync, order codes, membership), `paymentsDb.test.ts` (the migration on PGlite: fulfil once, coins, 30 days, lifetime, underpayment, cancel, privileges), `paymentServices.test.ts` (checkout, signed webhook, reconcile, thin routes; fake PayOS).

## May import
`@/shared/*` only

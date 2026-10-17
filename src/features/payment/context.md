# payment

Real payments with PayOS (VietQR bank transfer): coin packs only ("Nạp Xu"). The only way in is the Coin
Shop's "Buy Coins via VietQR" button. (A ⭐ Pro membership existed briefly; it was removed by migration
`20261022000000_coin_only_payments.sql` before anyone bought it.)

## Owned tables
- `orders` (migration `20261021000000_payments.sql`; coin packs only since `20261022000000`): `id`, `order_code` (bigint, unique, PayOS's number for the order, ≤ `Number.MAX_SAFE_INTEGER`), `user_id` (→ `auth.users`), `amount` (VND), `status` ('PENDING' | 'PAID' | 'CANCELLED'), `plan_type` ('COIN_PACK' only), `product_id` ('coins-10' …), `coins` (> 0), `payment_link_id`, `paid_at`, `created_at`, `updated_at`. RLS: the buyer reads their own; players write nothing (service role only).
- Functions (service role only): `fulfill_order(order_code, amount_paid)` → `(fulfilled, status, user_id, coins_added, total_coins)`: marks the order PAID and adds its coins to `users.coins`, exactly once (`ORDER_NOT_FOUND`; `AMOUNT_MISMATCH` when paid less than the price; `NOT_A_COIN_PACK` for a legacy non-coin order; a CANCELLED order PayOS reports paid is still credited). `cancel_order(order_code)`: PENDING → CANCELLED; returns the status.

## Environment
`PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` (server only, never `NEXT_PUBLIC_`), plus `SUPABASE_SERVICE_ROLE_KEY`. Optional `APP_URL` (e.g. `https://mindgarden.vn`) for PayOS's return URL behind a proxy; else the request's origin. Without the PayOS keys the Coin Shop's VietQR button is hidden, checkout answers `PAYMENT_UNAVAILABLE` (503) and the webhook 503. Register `https://<domain>/api/payment/webhook` as the webhook URL in the PayOS dashboard.

## Routes (`app/api/payment`, thin: they call `server.ts`)
| Route | Notes |
|-------|-------|
| `POST /api/payment/create { productId }` | Auth: Required. Zod (`dto/PaymentDto.ts` `CreatePaymentDto`: a coin pack id, 'coins-10' \| 'coins-20' \| 'coins-50' \| 'coins-100'; anything else, Pro ids included, is 400) → `ActionResult<Checkout>` `{ orderCode, productId, amount, description, checkoutUrl, qrCode, accountName, accountNumber, bin, expiresAt }`. Prices from `lib/plans.ts`; inserts the PENDING order (service role; a colliding order code is retried), then `payOS.paymentRequests.create` (return and cancel URL `/payment/result`, link open 15 min). PayOS failure → the order is cancelled, `PAYMENT_FAILED` (502). Status codes: 400 `VALIDATION_FAILED`, 401 `AUTH_UNAUTHORIZED`, 503 `PAYMENT_UNAVAILABLE`, 502 `PAYMENT_FAILED`, 500 `INTERNAL_ERROR` |
| `POST /api/payment/webhook` | No session. Shape (`PayOSWebhookDto`), then the signature (`payOS.webhooks.verify`, HMAC with the checksum key): invalid → 400, nothing changes. `code === '00'` (and the data's code) → `fulfill_order(orderCode, amount)` (credits the coins). 200 when handled, already fulfilled, ignored (not a success), an unknown order (PayOS's confirmation call), an underpayment or a non-coin order (logged); 500 on a database failure so PayOS retries; 503 without PayOS |

## Exports
| From | Export | Notes |
|------|--------|-------|
| `index.ts` | `getPaymentStatus({ orderCode })` | Server Action. Auth: Required. The buyer's order (RLS) `{ orderCode, status, productId, amount, coins, totalCoins }`, settled with PayOS when still PENDING (`paymentRequests.get`: PAID → `fulfill_order`, CANCELLED / EXPIRED / FAILED → `cancel_order`). Works where the webhook can't reach (localhost). Errors: `VALIDATION_FAILED`, `AUTH_UNAUTHORIZED`, `ORDER_NOT_FOUND`, `PAYMENT_UNAVAILABLE`, `INTERNAL_ERROR` |
| `index.ts` | `PaymentModal({ signedIn, paymentsEnabled })` | Client, mounted once in the root layout, opened only by the Coin Shop through `shared/stores/PaymentDialogProvider` (`usePaymentDialog().open(packId)`). "🪙 Nạp Xu": the four packs → "Pay … · +N 🪙" → the QR code (`react-qr-code` from PayOS's `qrCode`), amount, account, transfer message, order code, and "Open PayOS checkout". Polls `getPaymentStatus` every 3 s (`POLL_MS`): PAID → gold burst, purse updated (`CoinsProvider`), `router.refresh()`; CANCELLED → "Choose again" |
| `index.ts` | `PaymentResult({ orderCode, cancelledHint, initial })` | Client body of `/payment/result` (PayOS's return / cancel page): re-checks a pending order up to 15 times, 3 s apart; never trusts PayOS's query string for the outcome; shows the coins added and the purse |
| `index.ts` | `COIN_PRODUCTS`, `findProduct`, types | Pure catalogue (`lib/plans.ts`): the Coin Shop's four packages (`shared/lib/economy` `COIN_PACKAGES`) at their shop prices. Transfer descriptions ≤ 9 characters (some banks keep only 9). `makeOrderCode(nowMs, random3)` = ms × 1000 + 3 random digits |
| `server.ts` | `startCheckout`, `httpStatusOf`, `handlePayOSWebhook`, `isPaymentConfigured` | For the route handlers; the root layout reads `isPaymentConfigured()` to show the Coin Shop's VietQR button |

## Other pieces
- `services/payos.ts`: the PayOS v2 client (`@payos/node` 2.x: `paymentRequests.create / get`, `webhooks.verify`). `services/orders.ts` is the only module here that uses the service-role client (allow-listed in `decks/__tests__/answerSecrecy.test.ts`).
- The Coin Shop (`shared/components/game/CoinShopModal`, prop `paymentsEnabled`) shows "Buy Coins via VietQR · price", which opens the payment dialog on the picked package; the dev-only "Simulate Top-up" stays beside it outside production. There is no other payment entry point (no header button).

## Tests
`__tests__/plans.test.ts` (coin-only catalogue, Pro ids refused, SQL sync, order codes), `paymentsDb.test.ts` (both migrations on PGlite: credit once, underpayment, cancel, Pro refused, a database that already sold Pro keeps its history, privileges), `paymentServices.test.ts` (checkout, signed webhook, reconcile, thin routes; fake PayOS).

## May import
`@/shared/*` only

import { z } from 'zod'
import { COIN_PACKAGE_IDS } from '@/shared/lib/economy'

// Only a package id: the amount comes from the shop's price list on the server, never the client.
export const CoinTopUpDto = z.object({ packageId: z.enum(COIN_PACKAGE_IDS) })

export type CoinTopUpInput = z.infer<typeof CoinTopUpDto>

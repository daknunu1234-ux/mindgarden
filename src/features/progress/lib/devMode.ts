// Test top-ups ("Simulate Top-up (Dev Mode)") are for local development only: free coins must never
// be reachable in a production build. Real payments (webhooks) replace this in a later milestone.
export const isDevTopUpAllowed = (nodeEnv: string | undefined = process.env.NODE_ENV): boolean => nodeEnv !== 'production'

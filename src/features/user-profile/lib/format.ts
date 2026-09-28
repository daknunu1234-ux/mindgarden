// "Joined 26 September 2026". Fixed locale + UTC so server and client render the same text.
export function formatJoined(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Joined recently'
  return `Joined ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(date)}`
}

// Friendly name from an email: "linh.nguyen@x.com" → "linh.nguyen".
export const gardenerName = (email: string): string => email.split('@')[0] || 'Gardener'

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Database setup (Supabase)

1. Create a Supabase project and copy its keys into `.env.local` (never commit it):

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...   # server only, never NEXT_PUBLIC_
   ```

2. Run the migrations in `supabase/migrations/` **in this order**:

   | # | File | Creates |
   |---|------|---------|
   | 1 | `20260928000000_initial_schema.sql` | Tables, signup trigger, cascades, indexes, RLS policies |
   | 2 | `20260928000100_hide_knowledge_answers.sql` | Column privileges that hide drill answers |
   | 3 | `20260928000200_practice_days.sql` | Daily streak log |
   | 4 | `20260928000300_user_coins.sql` | 🪙 Gold coins (one per statement mastered for the first time) |
   | 5 | `20260928000400_mastery_scale_5.sql` | Mastery scale 0–5 (5 correct answers to master a statement) |
   | 6 | `20260928000500_seed_economy.sql` | 300 🪙 starting purse, 100 🪙 per tree seed, dev test top-ups |
   | 7 | `20260928000600_profiles_and_sharing.sql` | Starter purse for every signup (incl. Google), private-by-default trees |
   | 8 | `20260928000700_clone_deck.sql` | Clone a shared tree into your garden for min(100 + statements, 150) 🪙 |
   | 9 | `20260928000800_tree_visits.sql` | Visited Gardens: the shared trees each player has opened |

   With the Supabase CLI: `npx supabase db reset` (applies them in filename order). Without it: open the
   Supabase Dashboard → SQL Editor, and paste and run each file in the order above.
   Set `SUPABASE_SERVICE_ROLE_KEY` before running file 2: after it, answers are read only with that key.

3. Existing project from before the baseline file: don't run file 1 (its schema came from the dashboard).
   Apply only new migrations.

Details: `01.share-docx/DATABASE.md` → "Migration Rules".

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

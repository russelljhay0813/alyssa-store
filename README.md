
# Thread & Form

A responsive React storefront and private inventory dashboard backed by Supabase. Products, stock, sales, and product images are loaded from the connected Supabase project; the app does not seed or display sample inventory.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add your Supabase project URL and **publishable (anon) key**.
3. Apply [`supabase/migrations/202611240001_store.sql`](./supabase/migrations/202611240001_store.sql) to your Supabase project. For example, paste the migration into the Supabase SQL Editor and run it.
4. Create the store owner's account in **Supabase Dashboard → Authentication → Users**.
5. Grant that user dashboard access by running the following in the SQL Editor, replacing the email with the owner's account email:

   ```sql
   insert into public.admin_users (user_id)
   select id
   from auth.users
   where email = 'owner@example.com';
   ```

6. Start the development server with `npm run dev`. Use **Store owner** in the storefront footer to open the private dashboard.

Do not put a Supabase `service_role` or secret key in a `VITE_` variable. The browser uses only the publishable/anon key; database and Storage RLS policies enforce owner access. Disable public account sign-ups in Supabase Auth if accounts should only be created by the owner.

## Supabase behavior

- Products and sale snapshots are stored in `public.products` and `public.sales`.
- Anyone can read products and product images. Only a user listed in `public.admin_users` can write products, view sales, or manage images.
- The `product-images` public bucket accepts JPEG, PNG, WebP, and AVIF images up to 5 MB.
- The `record_product_sale` database function atomically records one sale and decrements stock by one. It rejects sales when stock is zero. Products with zero stock are shown as sold out; editing their stock makes them available again.
- Sale rows retain the product name and price at the time of sale if the product is later deleted.
- Dashboard revenue is the sum of recorded sales, not payment-processor settlements.

The sale action is for recording a completed sale in the dashboard. No payment processor or customer checkout is configured; connect a payment provider and a trusted server-side checkout flow before taking payments online.

## Commands

- `npm run dev` — local development
- `npm run build` — TypeScript check and production build
- `npm run lint` — Oxlint
- `npm run preview` — preview the production build

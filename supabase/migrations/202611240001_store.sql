create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  category text not null,
  price numeric(10, 2) not null check (price >= 0),
  sizes text[] not null default '{}',
  colors text[] not null default '{}',
  stock integer not null default 0 check (stock >= 0),
  status text generated always as (
    case when stock = 0 then 'sold_out' else 'available' end
  ) stored,
  image_url text,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  quantity integer not null default 1 check (quantity > 0),
  sold_at timestamptz not null default now(),
  sold_by uuid not null references auth.users (id)
);

create index if not exists products_category_idx on public.products (category);
create index if not exists products_created_at_idx on public.products (created_at desc);
create index if not exists sales_sold_at_idx on public.sales (sold_at desc);

create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;

create policy "Admins can read their own access"
  on public.admin_users for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Anyone can view products"
  on public.products for select
  to anon, authenticated
  using (true);

create policy "Admins can create products"
  on public.products for insert
  to authenticated
  with check ((select public.is_store_admin()));

create policy "Admins can update products"
  on public.products for update
  to authenticated
  using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));

create policy "Admins can delete products"
  on public.products for delete
  to authenticated
  using ((select public.is_store_admin()));

create policy "Admins can view sales"
  on public.sales for select
  to authenticated
  using ((select public.is_store_admin()));

revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;

revoke all on public.products from anon, authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

revoke all on public.sales from anon, authenticated;
grant select on public.sales to authenticated;

create or replace function public.record_product_sale(product_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_product public.products;
  recorded_sale public.sales;
begin
  if not (select public.is_store_admin()) then
    raise exception 'Only store admins can record sales';
  end if;

  update public.products
  set stock = stock - 1,
      updated_at = now()
  where id = product_id
    and stock > 0
  returning * into selected_product;

  if not found then
    raise exception 'This product is out of stock';
  end if;

  insert into public.sales (product_id, product_name, unit_price, quantity, sold_by)
  values (selected_product.id, selected_product.name, selected_product.price, 1, (select auth.uid()))
  returning * into recorded_sale;

  return recorded_sale;
end;
$$;

revoke all on function public.record_product_sale(uuid) from public, anon;
grant execute on function public.record_product_sale(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Anyone can view product images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

create policy "Admins can upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and (select public.is_store_admin()));

create policy "Admins can update product images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and (select public.is_store_admin()))
  with check (bucket_id = 'product-images' and (select public.is_store_admin()));

create policy "Admins can delete product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and (select public.is_store_admin()));

-- ============================================================================
-- v36 — Ενοποίηση «Δελτία Υλικών» στην εφαρμογή «Προμήθειες Δήμου Ρόδου»
-- ============================================================================
begin;

create extension if not exists pgcrypto;

create table if not exists public.mo_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  afm text,
  email text,
  viber_phone text,
  phone text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.mo_contracts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.mo_suppliers(id) on delete cascade,
  title text not null,
  adam text,
  protocol_no text,
  cpv text,
  start_date date,
  end_date date,
  total_amount numeric(14,2) not null default 0,
  vat_rate numeric(5,2) not null default 24,
  active boolean not null default true,
  source_study_id uuid references public.locked_studies(id) on delete set null,
  municipal_unit_id bigint references public.municipal_units(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.mo_contract_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.mo_contracts(id) on delete cascade,
  code text,
  description text not null,
  unit text,
  unit_price numeric(14,4) not null default 0,
  cpv text,
  contract_qty numeric(14,3),
  material_id uuid references public.materials(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.mo_receivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  email text,
  viber_phone text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.mo_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique,
  order_date date not null default current_date,
  supplier_id uuid references public.mo_suppliers(id) on delete set null,
  contract_id uuid references public.mo_contracts(id) on delete restrict,
  receiver_id uuid references public.mo_receivers(id) on delete set null,
  project_id uuid,
  usage_location text,
  notes text,
  vat_rate numeric(5,2) not null default 24,
  subtotal numeric(14,2) not null default 0,
  vat numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','received','cancelled')),
  sent_at date,
  received_at date,
  created_by uuid default auth.uid(),
  municipal_unit_id bigint references public.municipal_units(id) on delete restrict,
  source_study_id uuid references public.locked_studies(id) on delete restrict,
  issued_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mo_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.mo_orders(id) on delete cascade,
  description text not null,
  unit text,
  quantity numeric(14,3) not null default 0,
  unit_price numeric(14,4) not null default 0,
  line_total numeric(14,2) not null default 0,
  contract_item_id uuid references public.mo_contract_items(id) on delete set null,
  is_custom boolean not null default false,
  mapping jsonb
);

create table if not exists public.mo_counters (
  scope text primary key,
  value integer not null default 0
);

alter table public.mo_contracts
  add column if not exists source_study_id uuid references public.locked_studies(id) on delete set null,
  add column if not exists municipal_unit_id bigint references public.municipal_units(id) on delete restrict;

alter table public.mo_contract_items
  add column if not exists cpv text,
  add column if not exists contract_qty numeric(14,3),
  add column if not exists material_id uuid references public.materials(id) on delete set null;

alter table public.mo_orders
  add column if not exists municipal_unit_id bigint references public.municipal_units(id) on delete restrict,
  add column if not exists source_study_id uuid references public.locked_studies(id) on delete restrict,
  add column if not exists issued_at timestamptz;

alter table public.mo_order_items
  add column if not exists contract_item_id uuid references public.mo_contract_items(id) on delete set null,
  add column if not exists is_custom boolean not null default false,
  add column if not exists mapping jsonb;

create index if not exists idx_mo_contracts_source_study on public.mo_contracts(source_study_id);
create index if not exists idx_mo_contracts_unit on public.mo_contracts(municipal_unit_id);
create index if not exists idx_mo_contract_items_contract on public.mo_contract_items(contract_id);
create index if not exists idx_mo_contract_items_material on public.mo_contract_items(material_id);
create index if not exists idx_mo_orders_contract on public.mo_orders(contract_id);
create index if not exists idx_mo_orders_supplier on public.mo_orders(supplier_id);
create index if not exists idx_mo_orders_status on public.mo_orders(status);
create index if not exists idx_mo_orders_unit on public.mo_orders(municipal_unit_id);
create index if not exists idx_mo_orders_study on public.mo_orders(source_study_id);
create index if not exists idx_mo_order_items_order on public.mo_order_items(order_id);
create index if not exists idx_mo_order_items_contract_item on public.mo_order_items(contract_item_id);

create or replace function public.mo_next_order_number(p_scope text)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare v integer;
begin
  insert into public.mo_counters(scope,value) values (p_scope,1)
  on conflict (scope) do update set value=public.mo_counters.value+1
  returning value into v;
  return v;
end;
$fn$;

create or replace function public.mo_current_role()
returns text
language sql
stable
security definer
set search_path=public
as $$
  select role::text from public.profiles where id=auth.uid()
$$;

create or replace function public.mo_current_unit_id()
returns bigint
language sql
stable
security definer
set search_path=public
as $$
  select municipal_unit_id::bigint from public.profiles where id=auth.uid()
$$;

revoke all on function public.mo_current_role() from public, anon;
revoke all on function public.mo_current_unit_id() from public, anon;
grant execute on function public.mo_current_role() to authenticated;
grant execute on function public.mo_current_unit_id() to authenticated;

alter table public.mo_suppliers enable row level security;
alter table public.mo_contracts enable row level security;
alter table public.mo_contract_items enable row level security;
alter table public.mo_receivers enable row level security;
alter table public.mo_orders enable row level security;
alter table public.mo_order_items enable row level security;
alter table public.mo_counters enable row level security;

drop policy if exists mo_suppliers_read on public.mo_suppliers;
create policy mo_suppliers_read on public.mo_suppliers for select to authenticated using (true);
drop policy if exists mo_suppliers_manage on public.mo_suppliers;
create policy mo_suppliers_manage on public.mo_suppliers for all to authenticated
using (public.mo_current_role() in ('admin','central'))
with check (public.mo_current_role() in ('admin','central'));

drop policy if exists mo_receivers_read on public.mo_receivers;
create policy mo_receivers_read on public.mo_receivers for select to authenticated using (true);
drop policy if exists mo_receivers_manage on public.mo_receivers;
create policy mo_receivers_manage on public.mo_receivers for all to authenticated
using (public.mo_current_role() in ('admin','central'))
with check (public.mo_current_role() in ('admin','central'));

drop policy if exists mo_contracts_select on public.mo_contracts;
create policy mo_contracts_select on public.mo_contracts for select to authenticated
using (
  public.mo_current_role() in ('admin','central','viewer')
  or municipal_unit_id=public.mo_current_unit_id()
);
drop policy if exists mo_contracts_manage on public.mo_contracts;
create policy mo_contracts_manage on public.mo_contracts for all to authenticated
using (
  public.mo_current_role() in ('admin','central')
  or (public.mo_current_role()='unit_user' and municipal_unit_id=public.mo_current_unit_id())
)
with check (
  public.mo_current_role() in ('admin','central')
  or (public.mo_current_role()='unit_user' and municipal_unit_id=public.mo_current_unit_id())
);

drop policy if exists mo_contract_items_select on public.mo_contract_items;
create policy mo_contract_items_select on public.mo_contract_items for select to authenticated
using (exists (
  select 1 from public.mo_contracts c
  where c.id=contract_id
    and (public.mo_current_role() in ('admin','central','viewer') or c.municipal_unit_id=public.mo_current_unit_id())
));
drop policy if exists mo_contract_items_manage on public.mo_contract_items;
create policy mo_contract_items_manage on public.mo_contract_items for all to authenticated
using (exists (
  select 1 from public.mo_contracts c
  where c.id=contract_id
    and (public.mo_current_role() in ('admin','central') or (public.mo_current_role()='unit_user' and c.municipal_unit_id=public.mo_current_unit_id()))
))
with check (exists (
  select 1 from public.mo_contracts c
  where c.id=contract_id
    and (public.mo_current_role() in ('admin','central') or (public.mo_current_role()='unit_user' and c.municipal_unit_id=public.mo_current_unit_id()))
));

drop policy if exists mo_orders_select on public.mo_orders;
create policy mo_orders_select on public.mo_orders for select to authenticated
using (
  public.mo_current_role() in ('admin','central','viewer')
  or municipal_unit_id=public.mo_current_unit_id()
);
drop policy if exists mo_orders_insert on public.mo_orders;
create policy mo_orders_insert on public.mo_orders for insert to authenticated
with check (
  public.mo_current_role() in ('admin','central')
  or (public.mo_current_role()='unit_user' and municipal_unit_id=public.mo_current_unit_id())
);
drop policy if exists mo_orders_update on public.mo_orders;
create policy mo_orders_update on public.mo_orders for update to authenticated
using (
  public.mo_current_role() in ('admin','central')
  or (public.mo_current_role()='unit_user' and municipal_unit_id=public.mo_current_unit_id() and status='draft')
)
with check (
  public.mo_current_role() in ('admin','central')
  or (public.mo_current_role()='unit_user' and municipal_unit_id=public.mo_current_unit_id())
);
drop policy if exists mo_orders_delete on public.mo_orders;
create policy mo_orders_delete on public.mo_orders for delete to authenticated
using (
  public.mo_current_role()='admin'
  or (public.mo_current_role() in ('central','unit_user') and status='draft' and (public.mo_current_role()='central' or municipal_unit_id=public.mo_current_unit_id()))
);

drop policy if exists mo_order_items_select on public.mo_order_items;
create policy mo_order_items_select on public.mo_order_items for select to authenticated
using (exists (
  select 1 from public.mo_orders o
  where o.id=order_id
    and (public.mo_current_role() in ('admin','central','viewer') or o.municipal_unit_id=public.mo_current_unit_id())
));
drop policy if exists mo_order_items_insert on public.mo_order_items;
create policy mo_order_items_insert on public.mo_order_items for insert to authenticated
with check (exists (
  select 1 from public.mo_orders o
  where o.id=order_id
    and (public.mo_current_role() in ('admin','central') or (public.mo_current_role()='unit_user' and o.municipal_unit_id=public.mo_current_unit_id() and o.status='draft'))
));
drop policy if exists mo_order_items_update on public.mo_order_items;
create policy mo_order_items_update on public.mo_order_items for update to authenticated
using (exists (
  select 1 from public.mo_orders o
  where o.id=order_id
    and (public.mo_current_role() in ('admin','central') or (public.mo_current_role()='unit_user' and o.municipal_unit_id=public.mo_current_unit_id() and o.status='draft'))
))
with check (true);
drop policy if exists mo_order_items_delete on public.mo_order_items;
create policy mo_order_items_delete on public.mo_order_items for delete to authenticated
using (exists (
  select 1 from public.mo_orders o
  where o.id=order_id
    and (public.mo_current_role()='admin' or (public.mo_current_role() in ('central','unit_user') and o.status='draft' and (public.mo_current_role()='central' or o.municipal_unit_id=public.mo_current_unit_id())))
));

drop policy if exists mo_counters_select on public.mo_counters;
create policy mo_counters_select on public.mo_counters for select to authenticated using (true);
revoke execute on function public.mo_next_order_number(text) from public, anon;
grant execute on function public.mo_next_order_number(text) to authenticated;

comment on column public.mo_orders.source_study_id is 'Κλειδωμένη μελέτη/σύμβαση από την οποία εκδόθηκε το δελτίο.';
comment on column public.mo_orders.municipal_unit_id is 'Δημοτική Ενότητα στην οποία χρεώνεται το δελτίο.';
comment on column public.mo_order_items.mapping is 'Οικονομική αντιστοίχιση είδους εκτός μελέτης με είδη της σύμβασης: [{contract_item_id, qty}].';

commit;

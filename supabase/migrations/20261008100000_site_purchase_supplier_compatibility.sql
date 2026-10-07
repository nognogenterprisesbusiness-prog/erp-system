-- The site-purchase mobile flow collects only a store name, address and
-- contact number. These fields were made optional by the simple-purchasing
-- migration, but some deployed databases had only the later site-purchase
-- migration applied. Reassert the intended supplier schema so the RPC's
-- minimal supplier insert works regardless of that migration history.
alter table public.suppliers
  alter column business_name drop not null,
  alter column category_id drop not null,
  alter column contact_person drop not null,
  alter column email_address drop not null,
  alter column city drop not null,
  alter column province drop not null,
  alter column payment_terms drop not null;

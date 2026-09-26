insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@nognog.local', extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Alex Dela Cruz"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'engineer@nognog.local', extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Carlo Reyes"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'foreman@nognog.local', extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ramon Flores"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'warehouse@nognog.local', extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Liza Garcia"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from auth.users
where id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005'
)
on conflict (provider, id) do nothing;

-- Subsequent fixture writes are genuine audited changes attributed to the
-- seeded admin; do not insert fabricated rows into audit_logs.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

insert into public.user_roles (user_id, role, granted_by) values
  ('10000000-0000-0000-0000-000000000001', 'admin', '10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000003', 'engineer', '10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000004', 'foreman', '10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000005', 'warehouse_staff', '10000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.projects (
  id, code, name, description, client_name, client_email, client_phone, address, city_province,
  start_date, target_completion_date, contract_amount, initial_budget, status, project_manager_id, created_by, updated_by
)
values
  ('20000000-0000-0000-0000-000000000001', 'PRJ-024', 'CTU Multipurpose Building', 'Construction of a multipurpose university facility.', 'Cebu Technological University', 'facilities@ctu.local', '(032) 000 0001', 'Borbon Campus', 'Borbon, Cebu', '2026-01-15', '2026-11-18', 8400000.00, 7200000.00, 'active', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'PRJ-019', 'Barangay Road Improvement', 'Concrete road rehabilitation and drainage improvements.', 'Barangay Bingay', null, '(032) 000 0002', 'Barangay Bingay', 'Borbon, Cebu', '2026-02-01', '2026-12-02', 5100000.00, 4650000.00, 'on_hold', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000003', 'PRJ-027', 'Private Residence Phase 2', 'Second phase residential construction.', 'Private Client', null, null, 'Greenbelt Drive', 'Cebu City', '2026-06-01', '2027-02-14', 6700000.00, 6000000.00, 'active', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');

insert into public.project_assignments (project_id, user_id, assignment_role, assigned_on, assigned_by) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'engineer', '2026-01-10', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'foreman', '2026-01-10', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'engineer', '2026-01-25', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'foreman', '2026-01-25', '10000000-0000-0000-0000-000000000001')
on conflict (project_id, user_id, assignment_role) where status = 'active' do nothing;

insert into public.warehouses (id, code, name, description, address, contact_person, contact_number, status, created_by, updated_by)
values
  ('30000000-0000-0000-0000-000000000001', 'WH-MAIN', 'Main Warehouse', 'Primary storage and dispatch facility.', 'E. Sabellano Street, Cebu City', 'Liza Garcia', '(032) 401 0504', 'active', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', 'WH-NORTH', 'North Cebu Warehouse', 'Regional warehouse serving northern project sites.', 'National Road, Liloan, Cebu', 'Liza Garcia', '(032) 000 0003', 'active', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');

insert into public.warehouse_assignments (warehouse_id, user_id, assigned_on, assigned_by) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', '2026-01-01', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005', '2026-01-01', '10000000-0000-0000-0000-000000000001');

insert into public.project_sites (id, project_id, name, address, description, engineer_id, foreman_id, status, created_by, updated_by)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'CTU Borbon Main Site', 'CTU Borbon Campus, Cebu', 'Primary construction site.', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'active', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Bingay Road Site', 'Barangay Bingay, Borbon, Cebu', 'Road improvement work area.', null, '10000000-0000-0000-0000-000000000004', 'active', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');

insert into public.project_warehouses (project_id, warehouse_id, authorized_by) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');

insert into public.material_categories (id, name, description, created_by, updated_by) values
  ('50000000-0000-0000-0000-000000000001', 'Structural Materials', 'Development fixtures for structural inventory workflows.', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002', 'Finishing Materials', 'Development fixtures for finishing inventory workflows.', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');

insert into public.materials (id, code, name, description, category_id, base_unit_id, material_kind, minimum_stock_level, created_by, updated_by)
select '60000000-0000-0000-0000-000000000001', 'MAT-CEMENT', 'Portland Cement', 'General-purpose cement development fixture.', '50000000-0000-0000-0000-000000000001', id, 'consumable', 20, '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001' from public.units_of_measure where code = 'BAG';

insert into public.materials (id, code, name, description, category_id, base_unit_id, material_kind, minimum_stock_level, created_by, updated_by)
select '60000000-0000-0000-0000-000000000002', 'MAT-GRAVEL', 'Gravel', 'Bulk gravel development fixture.', '50000000-0000-0000-0000-000000000001', id, 'consumable', 5, '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001' from public.units_of_measure where code = 'M3';

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
select public.post_valued_stock_in(
  '70000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  (select id from public.inventory_locations where warehouse_id = '30000000-0000-0000-0000-000000000001'),
  100,
  (select id from public.units_of_measure where code = 'BAG'),
  10000.00,
  'DEV-OPENING-CEMENT',
  '2026-09-22',
  'Development-only opening stock fixture'
);

insert into public.asset_categories (id, asset_kind, name, description, created_by, updated_by) values
  ('80000000-0000-0000-0000-000000000001', 'equipment', 'Heavy Equipment', 'Development classification for heavy construction assets.', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000002', 'equipment', 'Power Tools', 'Development classification for powered tools.', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000003', 'vehicle', 'Dump Truck', 'Development vehicle type.', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000004', 'vehicle', 'Service Vehicle', 'Development vehicle type.', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');

insert into public.asset_locations (id, location_kind, name, address, created_by, updated_by)
values ('81000000-0000-0000-0000-000000000001', 'maintenance_facility', 'Central Maintenance Yard', 'Cebu City, Cebu', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');

select public.save_equipment(
  null, 'EQ-EXC-001', 'Excavator #001', 'Development-only equipment registry fixture.',
  '80000000-0000-0000-0000-000000000001', 'Caterpillar', '320 GC', '2025-03-15',
  'company_owned', 'available',
  (select al.id from public.asset_locations al join public.inventory_locations il on il.id = al.inventory_location_id where il.warehouse_id = '30000000-0000-0000-0000-000000000001'),
  'Operational at registration.', 'Hydraulic Excavator', 'CAT320-DEV-001', 5800000.00
);

select public.save_vehicle(
  null, 'VEH-DT-001', 'Dump Truck #001', 'Development-only vehicle registry fixture.',
  '80000000-0000-0000-0000-000000000003', 'Isuzu', 'GIGA', '2024-08-10',
  'company_owned', 'available',
  (select al.id from public.asset_locations al join public.inventory_locations il on il.id = al.inventory_location_id where il.warehouse_id = '30000000-0000-0000-0000-000000000001'),
  'Roadworthy at registration.', 'ABC 1234', 2024, 18450.50
);

insert into public.employee_categories (id, name, description, created_by, updated_by) values
  ('90000000-0000-0000-0000-000000000001', 'Skilled Worker', 'Development workforce category for qualified trades.', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('90000000-0000-0000-0000-000000000002', 'General Labor', 'Development workforce category for site support labor.', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('90000000-0000-0000-0000-000000000003', 'Site Supervision', 'Development workforce category for site leadership.', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');

select public.save_employee(null, 'EMP-001', 'Joel', '', 'Mendoza', '+63 900 000 0001', '90000000-0000-0000-0000-000000000001', 'Regular', 'active', '2025-05-12', null);
select public.save_employee(null, 'EMP-002', 'Nico', 'S.', 'Alcantara', '+63 900 000 0002', '90000000-0000-0000-0000-000000000001', 'Project-based', 'active', '2026-01-10', null);
select public.save_employee(null, 'EMP-003', 'Paolo', '', 'Mercado', '+63 900 000 0003', '90000000-0000-0000-0000-000000000002', 'Project-based', 'active', '2026-01-10', null);

select public.assign_employee_to_project((select id from public.employees where code = 'EMP-001'), '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Carpenter', '2026-01-15', 'Development-only workforce fixture');
select public.assign_employee_to_project((select id from public.employees where code = 'EMP-002'), '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Mason', '2026-01-15', 'Development-only workforce fixture');
select public.assign_employee_to_project((select id from public.employees where code = 'EMP-003'), '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'General laborer', '2026-01-15', 'Development-only workforce fixture');

select public.post_labor_rate((select id from public.employees where code = 'EMP-001'), 'daily', 750.00, '2026-01-01', null);
select public.post_labor_rate((select id from public.employees where code = 'EMP-002'), 'daily', 700.00, '2026-01-01', null);
select public.post_labor_rate((select id from public.employees where code = 'EMP-003'), 'daily', 600.00, '2026-01-01', null);
select set_config('request.jwt.claim.sub', '', false);

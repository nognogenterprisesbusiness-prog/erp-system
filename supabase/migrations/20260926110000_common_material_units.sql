-- Extend the construction material base-unit picker. These are distinct base
-- units; no stock conversion or historical quantity rewrite is implied.
insert into public.units_of_measure (code, name, symbol, dimension, decimal_scale) values
  ('BOX', 'Box', 'box', 'count', 0),
  ('ROLL', 'Roll', 'roll', 'count', 0),
  ('SET', 'Set', 'set', 'count', 0),
  ('PAIL', 'Pail', 'pail', 'count', 0),
  ('G', 'Gram', 'g', 'mass', 4),
  ('TON', 'Metric Ton', 't', 'mass', 4),
  ('ML', 'Milliliter', 'mL', 'volume', 4),
  ('CM', 'Centimeter', 'cm', 'length', 4)
on conflict do nothing;

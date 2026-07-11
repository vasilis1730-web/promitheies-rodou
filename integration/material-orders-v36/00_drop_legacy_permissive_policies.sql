-- v36 preflight: κατάργηση των παλαιών καθολικά επιτρεπτικών RLS policies
-- της αυτόνομης εφαρμογής Δελτίων Υλικού.
--
-- Τα PostgreSQL permissive policies συνδυάζονται με OR. Αν παραμείνουν τα
-- auth_all_* policies, οι νέοι περιορισμοί ανά Δημοτική Ενότητα δεν εφαρμόζονται.

do $drop_legacy$
declare t text;
begin
  foreach t in array array[
    'mo_suppliers',
    'mo_contracts',
    'mo_contract_items',
    'mo_receivers',
    'mo_orders',
    'mo_order_items',
    'mo_counters',
    'mo_projects'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format(
        'drop policy if exists %I on public.%I',
        'auth_all_' || t,
        t
      );
    end if;
  end loop;
end
$drop_legacy$;

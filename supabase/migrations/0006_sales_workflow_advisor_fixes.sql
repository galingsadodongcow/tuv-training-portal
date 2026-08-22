-- Resolve performance advisor findings introduced by the commercial workflow.

create index customers_created_by_idx on academy_v2.customers(created_by);
create index contacts_created_by_idx on academy_v2.contacts(created_by);
create index inquiries_contact_customer_idx on academy_v2.inquiries(contact_id, customer_id);
create index quotations_contact_customer_idx on academy_v2.quotations(contact_id, customer_id);
create index quotations_inquiry_customer_owner_idx on academy_v2.quotations(inquiry_id, customer_id, owner_id);
create index quotations_approved_by_idx on academy_v2.quotations(approved_by);
create index orders_contact_customer_idx on academy_v2.orders(contact_id, customer_id);
create index orders_quotation_customer_owner_idx on academy_v2.orders(quotation_id, customer_id, sales_owner_id);

drop policy profiles_read_self_or_admin on academy_v2.profiles;
drop policy profiles_active_colleague_read on academy_v2.profiles;

create policy profiles_safe_read on academy_v2.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select academy_v2_private.has_role(array['administrator']::text[]))
  or (
    is_active
    and (select academy_v2_private.has_role(array['operations', 'sales', 'manager', 'auditor']::text[]))
  )
);

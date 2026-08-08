-- ===========================================================================
-- Rebuild the simulation from the courses ALREADY in your database.
-- ===========================================================================
--
-- WHAT IT KEEPS (never touched):
--   course, course_fee, profiles, salesperson, auth.users.
--   Your uploaded course catalog and its prices stay exactly as they are.
--
-- WHAT IT REBUILDS (wiped and repopulated around your real courses):
--   A full 2026 calendar of sessions across every month, status and fill level,
--   plus trainers, venues, clients, organizations, orders across every channel,
--   payment, collection age and fulfillment stage, participants, inquiries,
--   approvals, notes, attribution, duplicates, forecasts, tasks, notifications.
--
-- SAFETY:
--   The core runs in one transaction: if anything errors, nothing is wiped.
--   Re-runnable. Paste the whole file into the Supabase SQL editor and run it.
--
-- HOW SESSIONS ARE BUILT:
--   Every active course gets several sessions spread evenly across 2026 so the
--   calendar has a roster in every month. IRCA / Lead Auditor courses (matched
--   by name) are capped at 10 seats, the rest at 20, minimum 8. Session date
--   windows never overlap, so the trainer and venue double-booking guard passes.

-- 0. There must be courses to build on.
do $$
begin
  if (select count(*) from course where active) = 0 then
    raise exception 'No active courses found. Upload your course catalog first, then run this.';
  end if;
end $$;

-- 0b. Make sure every active course has a Face-to-face and a Live Online price
--     so the catalog and order screens work. Existing prices are left untouched.
insert into course_fee(course_id, modality, fee_php)
select c.course_id, x.modality,
       case when c.course_name ~* '(IRCA|Lead Auditor)' then x.irca else x.pro end
from course c
cross join (values
  ('Face-to-face'::modality_t, 45000, 15000),
  ('Live Online Training'::modality_t, 38000, 12000)
) as x(modality, irca, pro)
where c.active
  and not exists (select 1 from course_fee f where f.course_id = c.course_id and f.modality = x.modality);

-- ===========================================================================
-- PART 1 - core business data (single transaction)
-- ===========================================================================
begin;

truncate table
  attribution, approval, participant, order_disposition, order_note,
  order_line, order_assignment, orders, session_note, duplicate_candidate,
  client_interaction, inquiry, client, organization, schedule,
  trainer_course, trainer, venue, calendar_year, assignment_log
restart identity cascade;

do $$
declare
  v_year uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid; v_t6 uuid;
  v_v1 uuid; v_v2 uuid; v_v3 uuid; v_v4 uuid; v_v5 uuid; v_v6 uuid;
  v_loop_tr uuid[]; v_loop_ve uuid[];
  v_cids uuid[]; v_names text[]; n int; k int; j int; ci int;
  cid uuid; cname text; is_irca boolean;
  v_mod modality_t; v_price numeric; v_max int; v_start date; v_end date; v_dur int; v_gap numeric;
  v_status schedule_status_t; v_go go_status_t; v_book int; v_tr uuid; v_ve uuid;
  -- scenario anchors and their course / price / cap
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid;
  ac1 uuid; ac2 uuid; ac3 uuid; ac4 uuid; ac5 uuid;
  ap1 numeric; ap2 numeric; ap3 numeric; ap4 numeric; ap5 numeric; am1 int;
  -- people already in the system
  v_sales uuid[]; v_sa uuid; v_sb uuid; v_sc uuid;
  v_u_admin uuid; v_u_ops uuid; v_u_bo uuid; v_u_sales uuid; v_u_any uuid;
  -- clients / orgs
  v_cl1 uuid; v_cl2 uuid; v_cl3 uuid; v_cl4 uuid; v_cl5 uuid; v_cl6 uuid; v_cl7 uuid; v_cl8 uuid;
  v_org1 uuid; v_org2 uuid; v_org3 uuid; v_org4 uuid;
  v_el_course uuid; v_el_price numeric;
begin
  select array_agg(sales_id) into v_sales from salesperson where active;
  v_sa := v_sales[1]; v_sb := coalesce(v_sales[2], v_sales[1]); v_sc := coalesce(v_sales[3], v_sales[1]);
  select user_id into v_u_admin from profiles where role = 'super_admin' limit 1;
  select user_id into v_u_ops   from profiles where role = 'operations' limit 1;
  select user_id into v_u_bo    from profiles where role = 'business_owner' limit 1;
  select user_id into v_u_sales from profiles where role = 'sales' limit 1;
  v_u_any := coalesce(v_u_admin, v_u_ops, v_u_bo, v_u_sales);

  insert into calendar_year(year, mode, status) values (2026, 'Rebuild', 'Active') returning year_id into v_year;

  -- Trainers. t1 is reserved for the scenario anchors; t2..t6 drive the calendar.
  insert into trainer(name, code, trainer_type, email) values ('Maria Santos','TR-01','Internal','maria@example.com') returning trainer_id into v_t1;
  insert into trainer(name, code, trainer_type, email) values ('Jose Ramos','TR-02','Internal','jose@example.com') returning trainer_id into v_t2;
  insert into trainer(name, code, trainer_type, email) values ('Lea Gomez','TR-03','Associate','lea@example.com') returning trainer_id into v_t3;
  insert into trainer(name, code, trainer_type, email) values ('Ramon Uy','TR-04','Internal','ramon@example.com') returning trainer_id into v_t4;
  insert into trainer(name, code, trainer_type, email) values ('Nina Flores','TR-05','Internal','nina@example.com') returning trainer_id into v_t5;
  insert into trainer(name, code, trainer_type, email) values ('Carlo Yap','TR-06','Associate','carlo@example.com') returning trainer_id into v_t6;

  -- Venues. v1 and v6 are reserved for the anchors; v2..v5 drive the calendar.
  insert into venue(name, city, capacity, venue_type) values ('Makati Training Center','Makati',25,'Training Room') returning venue_id into v_v1;
  insert into venue(name, city, capacity, venue_type) values ('Cebu Hub','Cebu',22,'Training Room') returning venue_id into v_v2;
  insert into venue(name, city, capacity, venue_type) values ('Virtual Classroom A',null,100,'Online') returning venue_id into v_v3;
  insert into venue(name, city, capacity, venue_type) values ('Davao Center','Davao',24,'Training Room') returning venue_id into v_v4;
  insert into venue(name, city, capacity, venue_type) values ('Clark Hall','Clark',30,'Training Room') returning venue_id into v_v5;
  insert into venue(name, city, capacity, venue_type) values ('Virtual Classroom B',null,100,'Online') returning venue_id into v_v6;

  v_loop_tr := array[v_t2, v_t3, v_t4, v_t5, v_t6];
  v_loop_ve := array[v_v2, v_v4, v_v5];

  -- Your real courses.
  select array_agg(course_id order by course_name), array_agg(course_name order by course_name)
    into v_cids, v_names from course where active;
  n := array_length(v_cids, 1);
  k := least(greatest(n * 3, 24), 96);   -- ~3 sessions per course, 24..96 total
  v_gap := 358.0 / k;                     -- even spacing keeps windows from overlapping

  -- Year-round calendar. One course after another, evenly across 2026.
  for j in 0..k-1 loop
    ci := (j % n) + 1;
    cid := v_cids[ci];
    cname := v_names[ci];
    is_irca := cname ~* '(IRCA|Lead Auditor)';
    if (j % 3) = 1 then v_mod := 'Live Online Training'; else v_mod := 'Face-to-face'; end if;
    v_max := case when is_irca then 10 else 20 end;
    select fee_php into v_price from course_fee where course_id = cid and modality = v_mod limit 1;
    if v_price is null then v_price := case when is_irca then 40000 else 12000 end; end if;

    v_start := make_date(2026,1,1) + floor((j + 0.5) * v_gap)::int;
    v_dur := case when (j % 4) = 1 then 0 else 2 end;
    v_end := v_start + v_dur;

    if v_mod = 'Live Online Training' then v_ve := v_v3; else v_ve := v_loop_ve[(j % 3) + 1]; end if;
    v_tr := v_loop_tr[(j % 5) + 1];

    if v_end < current_date then
      v_status := 'Completed'; v_go := 'Go'; v_book := 8 + (j % (greatest(v_max - 8, 1) + 1));
    elsif v_start <= current_date and v_end >= current_date then
      v_status := 'Running'; v_go := 'Go'; v_book := greatest(8, v_max - 2);
    else
      if (j % 3) = 0 then
        v_status := 'Confirmed'; v_go := 'Go'; v_book := 8 + (j % (greatest(v_max - 8, 1) + 1));
      else
        v_status := 'Tentative'; v_go := 'No-Go'; v_book := (j % 7);
        if (j % 6) = 5 then v_tr := null; end if;                       -- unstaffed
        if (j % 9) = 7 and v_mod = 'Face-to-face' then v_ve := null; end if; -- no venue
      end if;
    end if;
    if v_book > v_max then v_book := v_max; end if;

    if v_status = 'Completed' then
      insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status,
                           min_participants, max_participants, booked_participants, actual_participants, actual_revenue, trainer_id, venue_id)
        values (cid, v_year, to_char(v_start,'FMMonth'), v_start, v_end, v_mod, v_price, v_status, v_go,
                8, v_max, v_book, v_book, v_book * v_price, v_tr, v_ve);
    else
      insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status,
                           min_participants, max_participants, booked_participants, trainer_id, venue_id)
        values (cid, v_year, to_char(v_start,'FMMonth'), v_start, v_end, v_mod, v_price, v_status, v_go,
                8, v_max, v_book, v_tr, v_ve);
    end if;
  end loop;

  -- Scenario anchors. Dedicated trainer (t1) and venues (v1 face-to-face, v6
  -- online) that the calendar loop never uses, and non-overlapping dates, so no
  -- double booking. These carry the orders, participants and certificates.
  ac1 := v_cids[1]; ac2 := v_cids[least(2,n)]; ac3 := v_cids[least(3,n)]; ac4 := v_cids[least(4,n)]; ac5 := v_cids[least(5,n)];
  select coalesce((select fee_php from course_fee where course_id = ac1 and modality = 'Face-to-face'), 20000) into ap1;
  select coalesce((select fee_php from course_fee where course_id = ac2 and modality = 'Live Online Training'), 18000) into ap2;
  select coalesce((select fee_php from course_fee where course_id = ac3 and modality = 'Face-to-face'), 15000) into ap3;
  select coalesce((select fee_php from course_fee where course_id = ac4 and modality = 'Live Online Training'), 38000) into ap4;
  select coalesce((select fee_php from course_fee where course_id = ac5 and modality = 'Face-to-face'), 15000) into ap5;
  am1 := case when v_names[1] ~* '(IRCA|Lead Auditor)' then 10 else 20 end;

  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (ac1, v_year, to_char(current_date+20,'FMMonth'), current_date+20, current_date+22, 'Face-to-face', ap1, 'Confirmed', 'Go', 8, am1, 0, v_t1, v_v1) returning schedule_id into a1;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (ac2, v_year, to_char(current_date+12,'FMMonth'), current_date+12, current_date+14, 'Live Online Training', ap2, 'Tentative', 'No-Go', 8, 20, 0, v_t1, v_v6) returning schedule_id into a2;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (ac3, v_year, to_char(current_date,'FMMonth'), current_date-1, current_date+1, 'Face-to-face', ap3, 'Running', 'Go', 8, 20, 0, v_t1, v_v1) returning schedule_id into a3;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, actual_participants, actual_revenue, trainer_id, venue_id)
    values (ac4, v_year, to_char(current_date-20,'FMMonth'), current_date-20, current_date-18, 'Live Online Training', ap4, 'Completed', 'Go', 8, 20, 0, 0, 0, v_t1, v_v6) returning schedule_id into a4;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (ac5, v_year, to_char(current_date+34,'FMMonth'), current_date+34, current_date+36, 'Face-to-face', ap5, 'Confirmed', 'Go', 8, 20, 0, v_t1, v_v1) returning schedule_id into a5;
  -- One session that will be cancelled through an approved request (below).
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (ac1, v_year, to_char(current_date+5,'FMMonth'), current_date+5, current_date+6, 'Face-to-face', ap1, 'Tentative', 'No-Go', 8, am1, 3, v_t1, v_v1) returning schedule_id into a6;

  -- Forecasts (business owner).
  update schedule set forecast_revenue = ap1 * 9,  forecast_participants = 9,  forecast_by = v_u_bo where schedule_id = a1;
  update schedule set forecast_revenue = ap5 * 12, forecast_participants = 12, forecast_by = v_u_bo where schedule_id = a5;

  -- Clients.
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('Globe Telecom','Globe Telecom Inc.','Rowena Dela Cruz','rowena@globe.example','+63 2 7730 1000','Telecommunications', v_sa) returning client_id into v_cl1;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('San Miguel','San Miguel Corp.','Paolo Reyes','paolo@smc.example','+63 2 8632 3000','Manufacturing', v_sb) returning client_id into v_cl2;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('BDO Unibank','BDO Unibank Inc.','Grace Lim','grace@bdo.example','+63 2 8840 7000','Banking', v_sc) returning client_id into v_cl3;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('Jollibee','Jollibee Foods Corp.','Mark Villanueva','mark@jfc.example','+63 2 8634 1111','Food Service', v_sa) returning client_id into v_cl4;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('Meralco','Manila Electric Co.','Ella Navarro','ella@meralco.example','+63 2 1622-8000','Energy', v_sb) returning client_id into v_cl5;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('Ayala Land','Ayala Land Inc.','Ramon Ang','ramon@ali.example','+63 2 7908 3000','Real Estate', v_sc) returning client_id into v_cl6;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('Cebu Pacific','Cebu Air Inc.','Tina Soriano','tina@ceb.example','+63 2 7702 0888','Aviation', null) returning client_id into v_cl7;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('PLDT','PLDT Inc.','Jerome Tan','jerome@pldt.example','+63 2 8816 8000','Telecommunications', null) returning client_id into v_cl8;

  -- Organizations, grouping the contacts above.
  insert into organization(name, industry, country) values ('Ayala Group','Conglomerate','PH') returning org_id into v_org1;
  insert into organization(name, industry, country) values ('San Miguel Group','Conglomerate','PH') returning org_id into v_org2;
  insert into organization(name, industry, country) values ('PLDT-Smart Group','Telecommunications','PH') returning org_id into v_org3;
  insert into organization(name, industry, country) values ('Government Accounts','Public Sector','PH') returning org_id into v_org4;
  update client set org_id = v_org1 where client_id in (v_cl6, v_cl3);
  update client set org_id = v_org2 where client_id in (v_cl2);
  update client set org_id = v_org3 where client_id in (v_cl8, v_cl1);

  -- Orders across every channel, payment, collection age and fulfillment stage.
  -- a1 (Confirmed, face-to-face): fills to 8 (Go), plus a waitlisted line.
  insert into orders(order_id, sap_order_no, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('ORD-001','176152681', current_date-35, 'Webshop', 'Face-to-face', 4, ap1*4, 'Paid', 'Confirmed', 'SAP Created', ac1, a1, v_cl1, v_u_any, 4, ap1*4);
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('ORD-002', current_date-8, 'Webshop', 'Face-to-face', 4, ap1*4, 'Paid', 'New', 'New', ac1, a1, v_cl4, v_u_any, 4, ap1*4);        -- paid, not endorsed
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('ORD-003', current_date-2, 'Inside Sales', 'Face-to-face', 2, ap1*2, 'Unpaid', 'Waitlist', 'New', ac1, a1, v_cl1, v_u_any, 2, ap1*2); -- waitlisted
  -- a5 (Confirmed, face-to-face): overdue, in-progress, and an unowned order.
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('ORD-004', current_date-33, 'Field Sales', 'Face-to-face', 5, ap5*5, 'Partial', 'Confirmed', 'In Communication', ac5, a5, v_cl2, v_u_any, 5, ap5*5); -- overdue collection
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('ORD-005', current_date-4, 'Inside Sales', 'Face-to-face', 3, ap5*3, 'Unpaid', 'New', 'For Order Creation', ac5, a5, v_cl6, v_u_any, 3, ap5*3);
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('ORD-006', current_date-1, 'Webshop', 'Face-to-face', 2, ap5*2, 'Unpaid', 'New', 'New', ac5, a5, v_cl3, v_u_any, 2, ap5*2);          -- no owner
  -- a2 (Tentative, online): under minimum, and a stale no-feedback order.
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('ORD-007', current_date-6, 'Field Sales', 'Live Online Training', 3, ap2*3, 'Unpaid', 'New', 'In Communication', ac2, a2, v_cl7, v_u_any, 3, ap2*3);
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('ORD-008', current_date-50, 'Webshop', 'Live Online Training', 2, ap2*2, 'Unpaid', 'New', 'No Feedback', ac2, a2, v_cl8, v_u_any, 2, ap2*2); -- no owner
  -- a3 (Running): endorsed to ops, stalled. Names captured < seats (roster gap).
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('ORD-009', current_date-25, 'Inside Sales', 'Face-to-face', 8, ap3*8, 'Unpaid', 'Confirmed', 'Endorsed to Ops', ac3, a3, v_cl5, v_u_any, 8, ap3*8);
  -- a4 (Completed): paid, certificates issued.
  insert into orders(order_id, sap_order_no, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('ORD-010','176119002', current_date-60, 'Field Sales', 'Live Online Training', 8, ap4*8, 'Paid', 'Completed', 'SAP Created', ac4, a4, v_cl3, v_u_any, 8, ap4*8);
  -- E-learning (no session).
  v_el_course := v_cids[1];
  select coalesce((select fee_php from course_fee where course_id = v_el_course and modality = 'E-learning'), 3500) into v_el_price;
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, client_id, created_by, total_seats, total_amount, access_status, access_granted_date, went_live)
    values ('ORD-011', current_date-15, 'Webshop', 'E-learning', 5, v_el_price*5, 'Paid', 'Confirmed', 'SAP Created', v_el_course, v_cl2, v_u_any, 5, v_el_price*5, 'Granted', current_date-14, 'Yes');
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, client_id, created_by, total_seats, total_amount, access_status)
    values ('ORD-012', current_date-6, 'Webshop', 'E-learning', 2, v_el_price*2, 'Paid', 'New', 'For Order Creation', v_el_course, v_cl3, v_u_any, 2, v_el_price*2, 'Not Granted'); -- paid, awaiting access (e-learning digest)
  -- Cancelled order.
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, client_id, created_by, total_seats, total_amount)
    values ('ORD-013', current_date-20, 'Inside Sales', 'Face-to-face', 3, ap5*3, 'Unpaid', 'Cancelled', 'Cancelled', ac5, v_cl4, v_u_any, 3, ap5*3);

  -- Training lines drive each session's booked count.
  insert into order_line(order_id, line_no, course_id, schedule_id, modality, seats, amount_php, line_status) values
    ('ORD-001',1, ac1, a1, 'Face-to-face', 4, ap1*4, 'Confirmed'),
    ('ORD-002',1, ac1, a1, 'Face-to-face', 4, ap1*4, 'New'),
    ('ORD-003',1, ac1, a1, 'Face-to-face', 2, ap1*2, 'Waitlist'),
    ('ORD-004',1, ac5, a5, 'Face-to-face', 5, ap5*5, 'Confirmed'),
    ('ORD-005',1, ac5, a5, 'Face-to-face', 3, ap5*3, 'New'),
    ('ORD-006',1, ac5, a5, 'Face-to-face', 2, ap5*2, 'New'),
    ('ORD-007',1, ac2, a2, 'Live Online Training', 3, ap2*3, 'New'),
    ('ORD-008',1, ac2, a2, 'Live Online Training', 2, ap2*2, 'New'),
    ('ORD-009',1, ac3, a3, 'Face-to-face', 8, ap3*8, 'Confirmed'),
    ('ORD-010',1, ac4, a4, 'Live Online Training', 8, ap4*8, 'Completed');
  insert into order_line(order_id, line_no, course_id, modality, seats, amount_php, line_status, access_status) values
    ('ORD-011',1, v_el_course, 'E-learning', 5, v_el_price*5, 'Confirmed', 'Granted'),
    ('ORD-012',1, v_el_course, 'E-learning', 2, v_el_price*2, 'New', 'Not Granted');

  -- Completed session actuals now that its line is booked.
  update schedule set actual_participants = 8, actual_revenue = ap4*8 where schedule_id = a4;

  -- One order sat too long in its stage (timestamp only, so the stamp trigger
  -- does not reset it).
  update orders set stage_changed_at = now() - interval '22 days' where order_id = 'ORD-009';

  -- Ownership. Most assigned; a few left to the claim queue.
  if v_sa is not null then
    insert into order_assignment(order_id, sales_id, collection_status) values
      ('ORD-001', v_sa, 'Collected'),
      ('ORD-002', v_sa, 'Collected'),
      ('ORD-004', v_sb, 'Partial'),
      ('ORD-005', v_sa, 'Pending'),
      ('ORD-007', v_sb, 'Pending'),
      ('ORD-009', v_sb, 'Pending'),
      ('ORD-010', v_sc, 'Collected'),
      ('ORD-011', v_sc, 'Collected');
    -- ORD-003, ORD-006, ORD-008, ORD-012, ORD-013 left unassigned.
    insert into attribution(schedule_id, sales_id, clients_brought) values
      (a1, v_sa, 2), (a5, v_sb, 1), (a4, v_sc, 3);
  end if;

  -- Participants. Running session has a roster gap; completed has certificates.
  insert into participant(order_id, schedule_id, full_name, email, position_title, attendance_status) values
    ('ORD-009', a3, 'Andrea Lopez','andrea@meralco.example','Safety Officer','Registered'),
    ('ORD-009', a3, 'Ben Tan','ben@meralco.example','Engineer','Registered'),
    ('ORD-009', a3, 'Cara Diaz','cara@meralco.example','Supervisor','Attended');
  insert into participant(order_id, schedule_id, full_name, email, position_title, attendance_status, cert_number, cert_issued_date) values
    ('ORD-010', a4, 'Danilo Cruz','danilo@bdo.example','QA Lead','Attended','TRA-2026-000001', current_date-17),
    ('ORD-010', a4, 'Elena Reyes','elena@bdo.example','Auditor','Attended','TRA-2026-000002', current_date-17);

  -- Notes and comments.
  insert into session_note(schedule_id, author, note) values
    (a1, v_u_any, 'Venue confirmed. Awaiting final headcount.'),
    (a3, v_u_any, 'Session running. 3 of 8 attended day one.');
  insert into order_note(order_id, author, note) values
    ('ORD-004', v_u_any, 'Client asked for a revised quote. Following up this week.'),
    ('ORD-009', v_u_any, 'Endorsed to ops. Roster still short by five names.');

  -- Approvals. Two pending, two decided.
  insert into approval(object_type, schedule_id, quarter, requested_by, decision, note) values
    ('Schedule cancellation', a2, null, v_u_ops, 'Pending', 'Below minimum with no movement.');
  insert into approval(object_type, schedule_id, quarter, requested_by, decision, note) values
    ('Forecast sign-off', null, 'Q3 2026', v_u_bo, 'Pending', 'Q3 forecast for review.');
  insert into approval(object_type, schedule_id, quarter, requested_by, decided_by, decision, decision_date, note) values
    ('Schedule cancellation', a6, null, v_u_ops, v_u_bo, 'Approved', current_date-3, 'Approved, session cancelled.');
  insert into approval(object_type, schedule_id, quarter, requested_by, decided_by, decision, decision_date, note) values
    ('Forecast sign-off', null, 'Q4 2025', v_u_bo, v_u_bo, 'Rejected', current_date-30, 'Numbers too optimistic.');

  -- With the approved cancellation on record, cancel a6 (the guard now passes).
  update schedule set status = 'Cancelled', go_status = 'No-Go' where schedule_id = a6;

  -- A duplicate candidate for review.
  insert into duplicate_candidate(order_id_a, order_id_b, match_basis, status) values
    ('ORD-007', 'ORD-008', 'Same course and month', 'Open');

  -- Inquiry pipeline across every stage (needs a salesperson).
  if v_sa is not null then
    insert into inquiry(inquiry_date, sales_id, course_id, company, contact, email, phone, offering_type, pax, status) values
      (current_date-2,  v_sa, v_cids[1],          'Aboitiz Power','Liza Cruz','liza@aboitiz.example', null, 'Public',  6,  'Received'),
      (current_date-5,  v_sb, v_cids[least(2,n)], 'Maynilad','Rex Uy','rex@maynilad.example',          null, 'In-house',12, 'Responded'),
      (current_date-8,  v_sa, v_cids[least(3,n)], 'Nestle PH','Amy Tan','amy@nestle.example',           null, 'Public',  4,  'RFQ or P Sent'),
      (current_date-12, v_sc, v_cids[least(4,n)], 'Unilab','Ben Sy','ben@unilab.example',               null, 'In-house',10, 'Awaiting Feedback'),
      (current_date-20, v_sb, v_cids[least(5,n)], 'Petron','Cely Ramos','cely@petron.example',          null, 'Public',  8,  'Closed Won'),
      (current_date-3,  v_sa, v_cids[1],          'DOST','Ivan Lee','ivan@dost.example',                null, 'Public',  5,  'Received'),
      (current_date-6,  v_sc, v_cids[least(2,n)], 'SM Retail','Joan Uy','joan@sm.example',              null, 'In-house',20, 'Responded'),
      (current_date-15, v_sb, v_cids[least(3,n)], 'Converge','Ken Tan','ken@converge.example',          null, 'Public',  7,  'RFQ or P Sent');
  end if;
end $$;

commit;

-- ===========================================================================
-- PART 2 - My Work streams (tasks and notifications), separate transaction
-- ===========================================================================
begin;

truncate table task, notification restart identity cascade;

insert into task(title, detail, entity_type, status, priority, source, assigned_to, created_by)
select 'Review your open items', 'Sample task seeded to populate My Work.', 'client', 'open', 'normal', 'manual', p.user_id, p.user_id
from profiles p;

insert into task(title, detail, entity_type, entity_id, status, priority, source, reason, assigned_to, created_by)
select 'Chase overdue collection', 'ORD-004 is partial and past 30 days.', 'order', 'ORD-004', 'open', 'high', 'system', 'Overdue collection', p.user_id, p.user_id
from profiles p where p.role = 'sales';

insert into notification(recipient_id, kind, title, body, is_read)
select p.user_id, 'info', 'Sample data loaded', 'The portal is populated with demo records built from your course catalog.', false
from profiles p;

insert into notification(recipient_id, kind, title, body, entity_type, is_read)
select p.user_id, 'approval', 'Approval waiting', 'A schedule cancellation is pending your decision.', 'approval', false
from profiles p where p.role in ('business_owner','super_admin');

commit;

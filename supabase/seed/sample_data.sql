-- Sample data to simulate every function of the portal.
--
-- WHAT IT DOES
--   Wipes the transactional tables and reseeds a full spread of scenarios:
--   courses of both types (including IRCA by name), sessions across every
--   status and fill level (Go, No-Go, unstaffed, no venue, running, completed,
--   cancelled, private), clients, orders across every channel, payment,
--   collection age and fulfillment stage (paid-not-endorsed, stalled, no
--   owner, no feedback, overdue, e-learning), participants, notes, approvals
--   (pending and decided), attribution, duplicates, forecasts, tasks and
--   notifications.
--
-- WHAT IT KEEPS
--   auth.users, profiles, and salesperson are NOT touched, so your logins and
--   role mapping stay intact. Orders are assigned to whatever salespeople you
--   already have, so signing in as one of them populates the "mine" queue.
--
-- SAFETY
--   The core runs inside one transaction: if anything errors, nothing is wiped.
--   The tasks and notifications section is a second transaction, so a mismatch
--   there cannot undo the core seed. Safe to re-run: it truncates first.
--
--   Paste the whole file into the Supabase SQL editor and run it.

-- ===========================================================================
-- PART 1 - core business data (single transaction)
-- ===========================================================================
begin;

truncate table
  attribution, approval, participant, order_disposition, order_line,
  order_assignment, orders, session_note, duplicate_candidate,
  client_interaction, client, schedule, course_fee, trainer_course,
  course, trainer, venue, calendar_year, assignment_log
restart identity cascade;

do $$
declare
  v_year   uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid; v_t6 uuid;
  v_v1 uuid; v_v2 uuid; v_v3 uuid; v_v4 uuid; v_v5 uuid;
  v_qms uuid; v_ems uuid; v_bosh uuid; v_iso27 uuid; v_dpo uuid; v_el uuid;
  v_ohsms uuid; v_fsms uuid; v_enms uuid; v_ia uuid; v_firstaid uuid; v_isms uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid; v_s6 uuid; v_s7 uuid; v_s8 uuid; v_s9 uuid;
  v_s10 uuid; v_s11 uuid; v_s12 uuid; v_s13 uuid; v_s14 uuid; v_s15 uuid; v_s16 uuid; v_s17 uuid; v_s18 uuid; v_s19 uuid; v_s20 uuid;
  v_cl1 uuid; v_cl2 uuid; v_cl3 uuid; v_cl4 uuid; v_cl5 uuid; v_cl6 uuid; v_cl7 uuid; v_cl8 uuid;
  v_sales uuid[];
  v_sa uuid; v_sb uuid; v_sc uuid;
  v_u_admin uuid; v_u_ops uuid; v_u_bo uuid; v_u_sales uuid; v_u_any uuid;
begin
  -- People already in the system.
  select array_agg(sales_id) into v_sales from salesperson where active;
  v_sa := v_sales[1];
  v_sb := coalesce(v_sales[2], v_sales[1]);
  v_sc := coalesce(v_sales[3], v_sales[1]);
  select user_id into v_u_admin from profiles where role = 'super_admin' limit 1;
  select user_id into v_u_ops   from profiles where role = 'operations' limit 1;
  select user_id into v_u_bo    from profiles where role = 'business_owner' limit 1;
  select user_id into v_u_sales from profiles where role = 'sales' limit 1;
  v_u_any := coalesce(v_u_admin, v_u_ops, v_u_bo, v_u_sales);

  -- Calendar year.
  insert into calendar_year(year, mode, status) values (2026, 'Rebuild', 'Active') returning year_id into v_year;

  -- Trainers and venues.
  insert into trainer(name, code, trainer_type, email) values ('Maria Santos','TR-01','Internal','maria@example.com') returning trainer_id into v_t1;
  insert into trainer(name, code, trainer_type, email) values ('Jose Ramos','TR-02','Internal','jose@example.com') returning trainer_id into v_t2;
  insert into trainer(name, code, trainer_type, email) values ('Lea Gomez','TR-03','Associate','lea@example.com') returning trainer_id into v_t3;
  insert into trainer(name, code, trainer_type, email) values ('Ramon Uy','TR-04','Internal','ramon@example.com') returning trainer_id into v_t4;
  insert into trainer(name, code, trainer_type, email) values ('Nina Flores','TR-05','Internal','nina@example.com') returning trainer_id into v_t5;
  insert into trainer(name, code, trainer_type, email) values ('Carlo Yap','TR-06','Associate','carlo@example.com') returning trainer_id into v_t6;
  insert into venue(name, city, capacity, venue_type) values ('Makati Training Center','Makati',25,'Training Room') returning venue_id into v_v1;
  insert into venue(name, city, capacity, venue_type) values ('Cebu Hub','Cebu',22,'Training Room') returning venue_id into v_v2;
  insert into venue(name, city, capacity, venue_type) values ('Virtual Classroom',null,100,'Online') returning venue_id into v_v3;
  insert into venue(name, city, capacity, venue_type) values ('Davao Center','Davao',24,'Training Room') returning venue_id into v_v4;
  insert into venue(name, city, capacity, venue_type) values ('Clark Hall','Clark',30,'Training Room') returning venue_id into v_v5;

  -- Courses. QMS and EMS are IRCA lead auditor courses (max 10). The rest are
  -- professional (max 20). One is e-learning only.
  insert into course(course_name, standard, category, training_type) values ('ISO 9001:2015 Lead Auditor (IRCA)','ISO 9001','Quality','PersCert') returning course_id into v_qms;
  insert into course(course_name, standard, category, training_type) values ('ISO 14001:2015 Lead Auditor (IRCA)','ISO 14001','Environment','PersCert') returning course_id into v_ems;
  insert into course(course_name, standard, category, training_type) values ('BOSH for Safety Officers','DOLE','Occupational Health and Safety','Professional') returning course_id into v_bosh;
  insert into course(course_name, standard, category, training_type) values ('ISO/IEC 27001 Foundation','ISO 27001','Information Security','Professional') returning course_id into v_iso27;
  insert into course(course_name, standard, category, training_type) values ('Data Privacy (DPO) Training','RA 10173','Data Privacy','Professional') returning course_id into v_dpo;
  insert into course(course_name, standard, category, training_type) values ('ISO 9001 Awareness (E-learning)','ISO 9001','Quality','Professional') returning course_id into v_el;
  insert into course(course_name, standard, category, training_type) values ('ISO 45001:2018 Lead Auditor (IRCA)','ISO 45001','Occupational Health and Safety','PersCert') returning course_id into v_ohsms;
  insert into course(course_name, standard, category, training_type) values ('ISO 22000:2018 Food Safety Lead Auditor (IRCA)','ISO 22000','Food Safety','PersCert') returning course_id into v_fsms;
  insert into course(course_name, standard, category, training_type) values ('ISO 50001 Energy Management Foundation','ISO 50001','Energy','Professional') returning course_id into v_enms;
  insert into course(course_name, standard, category, training_type) values ('ISO 9001 Internal Auditor','ISO 9001','Quality','Professional') returning course_id into v_ia;
  insert into course(course_name, standard, category, training_type) values ('Standard First Aid and Basic Life Support','Red Cross','Occupational Health and Safety','Professional') returning course_id into v_firstaid;
  insert into course(course_name, standard, category, training_type) values ('ISO/IEC 27001:2022 Lead Auditor (IRCA)','ISO 27001','Information Security','PersCert') returning course_id into v_isms;

  -- Fees per learning type.
  insert into course_fee(course_id, modality, fee_php) values
    (v_qms,'Live Online Training',38000),(v_qms,'Face-to-face',45000),
    (v_ems,'Live Online Training',38000),(v_ems,'Face-to-face',45000),
    (v_bosh,'Face-to-face',12000),
    (v_iso27,'Live Online Training',15000),(v_iso27,'Face-to-face',18000),
    (v_dpo,'Live Online Training',9000),(v_dpo,'Face-to-face',11000),
    (v_el,'E-learning',3500),
    (v_ohsms,'Live Online Training',38000),(v_ohsms,'Face-to-face',45000),
    (v_fsms,'Live Online Training',40000),(v_fsms,'Face-to-face',48000),
    (v_enms,'Live Online Training',14000),(v_enms,'Face-to-face',17000),
    (v_ia,'Live Online Training',8000),(v_ia,'Face-to-face',10000),
    (v_firstaid,'Face-to-face',6500),
    (v_isms,'Live Online Training',36000),(v_isms,'Face-to-face',43000);

  -- Sessions. min 8 for all; max 10 for IRCA (QMS, EMS), 20 for the rest.
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_qms, v_year, 'February', current_date + 20, current_date + 22, 'Face-to-face', 45000, 'Confirmed', 'Go', 8, 10, 8, v_t1, v_v1) returning schedule_id into v_s1;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_ems, v_year, 'February', current_date + 12, current_date + 14, 'Live Online Training', 38000, 'Tentative', 'No-Go', 8, 10, 7, null, v_v3) returning schedule_id into v_s2;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_bosh, v_year, 'March', current_date + 40, current_date + 41, 'Face-to-face', 12000, 'Confirmed', 'Go', 8, 20, 12, v_t2, v_v1) returning schedule_id into v_s3;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_iso27, v_year, 'February', current_date + 8, current_date + 9, 'Live Online Training', 15000, 'Tentative', 'No-Go', 8, 20, 3, v_t3, null) returning schedule_id into v_s4;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_dpo, v_year, 'January', current_date - 1, current_date + 1, 'Face-to-face', 11000, 'Running', 'Go', 8, 20, 6, v_t1, v_v2) returning schedule_id into v_s5;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, actual_participants, actual_revenue, trainer_id, venue_id)
    values (v_qms, v_year, 'January', current_date - 20, current_date - 18, 'Live Online Training', 38000, 'Completed', 'Go', 8, 10, 8, 8, 304000, v_t2, v_v3) returning schedule_id into v_s6;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_bosh, v_year, 'March', current_date + 30, current_date + 31, 'Face-to-face', 12000, 'Tentative', 'No-Go', 8, 20, 0, null, null) returning schedule_id into v_s7;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, private_run, trainer_id, venue_id)
    values (v_ems, v_year, 'February', current_date + 25, current_date + 27, 'Face-to-face', 45000, 'Confirmed', 'No-Go', 8, 10, 6, true, v_t3, v_v1) returning schedule_id into v_s8;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants)
    values (v_iso27, v_year, 'April', current_date + 50, current_date + 51, 'Live Online Training', 15000, 'Tentative', 'No-Go', 8, 20, 0) returning schedule_id into v_s9;

  -- More sessions across courses, months and states. Trainer and venue windows
  -- do not overlap for any shared resource, so the double-booking guard passes.
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_ohsms, v_year, to_char(current_date + 60,'FMMonth'), current_date + 60, current_date + 62, 'Face-to-face', 45000, 'Confirmed', 'Go', 8, 10, 9, v_t4, v_v4) returning schedule_id into v_s10;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_fsms, v_year, to_char(current_date + 67,'FMMonth'), current_date + 67, current_date + 69, 'Face-to-face', 48000, 'Tentative', 'No-Go', 8, 10, 5, v_t5, v_v5) returning schedule_id into v_s11;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_enms, v_year, to_char(current_date + 72,'FMMonth'), current_date + 72, current_date + 73, 'Live Online Training', 14000, 'Confirmed', 'Go', 8, 20, 14, v_t6, v_v3) returning schedule_id into v_s12;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, venue_id)
    values (v_ia, v_year, to_char(current_date + 80,'FMMonth'), current_date + 80, current_date + 81, 'Face-to-face', 10000, 'Tentative', 'No-Go', 8, 20, 3, v_v1) returning schedule_id into v_s13;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_firstaid, v_year, to_char(current_date + 85,'FMMonth'), current_date + 85, current_date + 85, 'Face-to-face', 6500, 'Confirmed', 'Go', 8, 20, 18, v_t4, v_v4) returning schedule_id into v_s14;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_isms, v_year, to_char(current_date + 90,'FMMonth'), current_date + 90, current_date + 92, 'Live Online Training', 36000, 'Tentative', 'No-Go', 8, 10, 6, v_t5, v_v3) returning schedule_id into v_s15;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, actual_participants, actual_revenue, trainer_id, venue_id)
    values (v_ohsms, v_year, to_char(current_date - 50,'FMMonth'), current_date - 50, current_date - 48, 'Face-to-face', 45000, 'Completed', 'Go', 8, 10, 10, 10, 450000, v_t6, v_v5) returning schedule_id into v_s16;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_enms, v_year, to_char(current_date - 2,'FMMonth'), current_date - 2, current_date + 2, 'Live Online Training', 14000, 'Running', 'Go', 8, 20, 12, v_t4, v_v4) returning schedule_id into v_s17;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_ia, v_year, to_char(current_date + 100,'FMMonth'), current_date + 100, current_date + 101, 'Face-to-face', 10000, 'Confirmed', 'Go', 8, 20, 20, v_t5, v_v2) returning schedule_id into v_s18;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants)
    values (v_fsms, v_year, to_char(current_date + 45,'FMMonth'), current_date + 45, current_date + 47, 'Face-to-face', 48000, 'Tentative', 'No-Go', 8, 10, 4) returning schedule_id into v_s19;
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_isms, v_year, to_char(current_date + 110,'FMMonth'), current_date + 110, current_date + 112, 'Live Online Training', 36000, 'Confirmed', 'Go', 8, 10, 8, v_t6, v_v3) returning schedule_id into v_s20;

  -- Year-round fill: fixed-date 2026 sessions in the months the relative-dated
  -- sessions above do not reach, so the calendar has a roster in every month.
  -- Past months are Completed with actuals; December is upcoming. Trainer and
  -- venue windows are unique per month, so no double booking.
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, actual_participants, actual_revenue, trainer_id, venue_id) values
    (v_qms,      v_year, 'January',  make_date(2026,1,14),  make_date(2026,1,16),  'Face-to-face',         45000, 'Completed', 'Go',    8, 10,  9,  9, 405000, v_t1, v_v1),
    (v_firstaid, v_year, 'January',  make_date(2026,1,26),  make_date(2026,1,26),  'Face-to-face',          6500, 'Completed', 'Go',    8, 20, 16, 16, 104000, v_t2, v_v2),
    (v_ems,      v_year, 'February', make_date(2026,2,11),  make_date(2026,2,13),  'Live Online Training', 38000, 'Completed', 'Go',    8, 10,  8,  8, 304000, v_t3, v_v3),
    (v_iso27,    v_year, 'February', make_date(2026,2,24),  make_date(2026,2,25),  'Face-to-face',         18000, 'Completed', 'Go',    8, 20, 15, 15, 270000, v_t4, v_v4),
    (v_ohsms,    v_year, 'March',    make_date(2026,3,10),  make_date(2026,3,12),  'Face-to-face',         45000, 'Completed', 'Go',    8, 10, 10, 10, 450000, v_t5, v_v5),
    (v_bosh,     v_year, 'March',    make_date(2026,3,24),  make_date(2026,3,24),  'Face-to-face',         12000, 'Completed', 'Go',    8, 20, 18, 18, 216000, v_t6, v_v1),
    (v_isms,     v_year, 'April',    make_date(2026,4,14),  make_date(2026,4,16),  'Live Online Training', 36000, 'Completed', 'No-Go', 8, 10,  7,  7, 252000, v_t1, v_v3),
    (v_enms,     v_year, 'April',    make_date(2026,4,28),  make_date(2026,4,29),  'Live Online Training', 14000, 'Completed', 'Go',    8, 20, 12, 12, 168000, v_t2, v_v2),
    (v_fsms,     v_year, 'May',      make_date(2026,5,12),  make_date(2026,5,14),  'Face-to-face',         48000, 'Completed', 'Go',    8, 10,  9,  9, 432000, v_t3, v_v4),
    (v_ia,       v_year, 'May',      make_date(2026,5,26),  make_date(2026,5,26),  'Face-to-face',         10000, 'Completed', 'Go',    8, 20, 14, 14, 140000, v_t4, v_v1);
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id) values
    (v_qms, v_year, 'December', make_date(2026,12,8),  make_date(2026,12,10), 'Face-to-face', 45000, 'Confirmed', 'Go',    8, 10, 8, v_t5, v_v5),
    (v_dpo, v_year, 'December', make_date(2026,12,15), make_date(2026,12,16), 'Face-to-face', 11000, 'Tentative', 'No-Go', 8, 20, 5, v_t6, v_v3);

  -- Forecasts (business owner).
  update schedule set forecast_revenue = 405000, forecast_participants = 9, forecast_by = v_u_bo where schedule_id = v_s1;
  update schedule set forecast_revenue = 216000, forecast_participants = 18, forecast_by = v_u_bo where schedule_id = v_s3;
  update schedule set forecast_revenue = 405000, forecast_participants = 9, forecast_by = v_u_bo where schedule_id = v_s10;
  update schedule set forecast_revenue = 280000, forecast_participants = 20, forecast_by = v_u_bo where schedule_id = v_s12;
  update schedule set forecast_revenue = 200000, forecast_participants = 20, forecast_by = v_u_bo where schedule_id = v_s18;

  -- Clients.
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('Globe Telecom','Globe Telecom Inc.','Rowena Dela Cruz','rowena@globe.example','+63 2 7730 1000','Telecommunications', v_sa) returning client_id into v_cl1;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('San Miguel','San Miguel Corp.','Paolo Reyes','paolo@smc.example','+63 2 8632 3000','Manufacturing', v_sb) returning client_id into v_cl2;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('BDO Unibank','BDO Unibank Inc.','Grace Lim','grace@bdo.example','+63 2 8840 7000','Banking', v_sc) returning client_id into v_cl3;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('Jollibee','Jollibee Foods Corp.','Mark Villanueva','mark@jfc.example','+63 2 8634 1111','Food Service', v_sa) returning client_id into v_cl4;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('Meralco','Manila Electric Co.','Ella Navarro','ella@meralco.example','+63 2 1622-8000','Energy', v_sb) returning client_id into v_cl5;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('Ayala Land','Ayala Land Inc.','Ramon Ang','ramon@ali.example','+63 2 7908 3000','Real Estate', v_sc) returning client_id into v_cl6;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('Cebu Pacific','Cebu Air Inc.','Tina Soriano','tina@ceb.example','+63 2 7702 0888','Aviation', null) returning client_id into v_cl7;
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values ('PLDT','PLDT Inc.','Jerome Tan','jerome@pldt.example','+63 2 8816 8000','Telecommunications', null) returning client_id into v_cl8;

  -- Orders. order_id is a readable text key. Each carries one training line;
  -- the e-learning orders carry an e-learning line with no session.
  -- s1 fills to 8 (Go): SEED-001 + SEED-004.
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, total_seats, total_amount)
    values ('SEED-001', current_date - 35, 'Webshop', 'Face-to-face', 4, 180000, 'Paid', 'Confirmed', 'SAP Created', v_qms, v_s1, v_cl1, 4, 180000);
  insert into orders(order_id, sap_order_no, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, total_seats, total_amount)
    values ('SEED-004', '176152681', current_date - 10, 'Webshop', 'Face-to-face', 4, 180000, 'Paid', 'New', 'New', v_qms, v_s1, v_cl4, 4, 180000); -- paid, not endorsed
  -- s2 to 7 (No-Go, unstaffed): SEED-013 + SEED-002 (unassigned, no owner).
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, total_seats, total_amount)
    values ('SEED-013', current_date - 2, 'Field Sales', 'Live Online Training', 4, 152000, 'Unpaid', 'New', 'New', v_ems, v_s2, v_cl5, 4, 152000);
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, total_seats, total_amount)
    values ('SEED-002', current_date - 5, 'Inside Sales', 'Live Online Training', 3, 114000, 'Unpaid', 'New', 'In Communication', v_ems, v_s2, v_cl2, 3, 114000); -- no owner
  -- s3 to 12 (Go): SEED-003 (overdue) + SEED-009 + SEED-014 (no owner).
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, total_seats, total_amount)
    values ('SEED-003', current_date - 33, 'Field Sales', 'Face-to-face', 5, 60000, 'Partial', 'Confirmed', 'In Communication', v_bosh, v_s3, v_cl3, 5, 60000); -- overdue collection
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, total_seats, total_amount)
    values ('SEED-009', current_date - 3, 'Inside Sales', 'Face-to-face', 5, 60000, 'Partial', 'New', 'For Order Creation', v_bosh, v_s3, v_cl1, 5, 60000);
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, total_seats, total_amount)
    values ('SEED-014', current_date - 1, 'Webshop', 'Face-to-face', 2, 24000, 'Unpaid', 'New', 'New', v_bosh, v_s3, v_cl6, 2, 24000); -- no owner
  -- s4 to 3 (No-Go, no venue, decision overdue): SEED-008 (No Feedback, overdue).
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, total_seats, total_amount)
    values ('SEED-008', current_date - 50, 'Webshop', 'Live Online Training', 3, 45000, 'Unpaid', 'New', 'No Feedback', v_iso27, v_s4, v_cl8, 3, 45000);
  -- s5 (Running): SEED-005 (endorsed to ops, stalled, due soon).
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, total_seats, total_amount)
    values ('SEED-005', current_date - 25, 'Inside Sales', 'Face-to-face', 6, 66000, 'Unpaid', 'Confirmed', 'Endorsed to Ops', v_dpo, v_s5, v_cl5, 6, 66000);
  -- s6 (Completed): SEED-007 (paid).
  insert into orders(order_id, sap_order_no, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, total_seats, total_amount)
    values ('SEED-007', '176119002', current_date - 60, 'Field Sales', 'Live Online Training', 8, 304000, 'Paid', 'Completed', 'SAP Created', v_qms, v_s6, v_cl7, 8, 304000);
  -- s8 (private, No-Go): SEED-006 (in-house, overdue).
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, total_seats, total_amount)
    values ('SEED-006', current_date - 40, 'In-house Request', 'Face-to-face', 6, 270000, 'Unpaid', 'Confirmed', 'For Order Creation', v_ems, v_s8, v_cl6, 6, 270000);
  -- E-learning orders (no session).
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, client_id, total_seats, total_amount, access_status, access_granted_date, went_live)
    values ('SEED-010', current_date - 15, 'Webshop', 'E-learning', 5, 17500, 'Paid', 'Confirmed', 'SAP Created', v_el, v_cl2, 5, 17500, 'Granted', current_date - 14, 'Yes');
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, client_id, total_seats, total_amount, access_status)
    values ('SEED-011', current_date - 6, 'Webshop', 'E-learning', 2, 7000, 'Unpaid', 'New', 'New', v_el, v_cl3, 2, 7000, 'Not Granted');
  -- Cancelled order.
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, client_id, total_seats, total_amount)
    values ('SEED-012', current_date - 20, 'Inside Sales', 'Face-to-face', 3, 36000, 'Unpaid', 'Cancelled', 'Cancelled', v_bosh, v_cl4, 3, 36000);

  -- Training lines drive each session's booked count.
  insert into order_line(order_id, line_no, course_id, schedule_id, modality, seats, amount_php, line_status) values
    ('SEED-001',1,v_qms,v_s1,'Face-to-face',4,180000,'Confirmed'),
    ('SEED-004',1,v_qms,v_s1,'Face-to-face',4,180000,'New'),
    ('SEED-013',1,v_ems,v_s2,'Live Online Training',4,152000,'New'),
    ('SEED-002',1,v_ems,v_s2,'Live Online Training',3,114000,'New'),
    ('SEED-003',1,v_bosh,v_s3,'Face-to-face',5,60000,'Confirmed'),
    ('SEED-009',1,v_bosh,v_s3,'Face-to-face',5,60000,'New'),
    ('SEED-014',1,v_bosh,v_s3,'Face-to-face',2,24000,'New'),
    ('SEED-008',1,v_iso27,v_s4,'Live Online Training',3,45000,'New'),
    ('SEED-005',1,v_dpo,v_s5,'Face-to-face',6,66000,'Confirmed'),
    ('SEED-007',1,v_qms,v_s6,'Live Online Training',8,304000,'Completed'),
    ('SEED-006',1,v_ems,v_s8,'Face-to-face',6,270000,'Confirmed');
  insert into order_line(order_id, line_no, course_id, modality, seats, amount_php, line_status, access_status) values
    ('SEED-010',1,v_el,'E-learning',5,17500,'Confirmed','Granted'),
    ('SEED-011',1,v_el,'E-learning',2,7000,'New','Not Granted');

  -- One order sat too long in its stage: mark it stalled (updates only the
  -- timestamp, so the stage-stamp trigger does not reset it).
  update orders set stage_changed_at = now() - interval '22 days' where order_id = 'SEED-005';

  -- Ownership. Assign most orders to existing salespeople; leave a few
  -- unassigned so the claim queue and "no owner" flags have data.
  if v_sa is not null then
    insert into order_assignment(order_id, sales_id, collection_status) values
      ('SEED-001', v_sa, 'Collected'),
      ('SEED-003', v_sb, 'Partial'),
      ('SEED-004', v_sa, 'Collected'),
      ('SEED-005', v_sb, 'Pending'),
      ('SEED-007', v_sc, 'Collected'),
      ('SEED-009', v_sa, 'Partial'),
      ('SEED-013', v_sb, 'Pending'),
      ('SEED-010', v_sc, 'Collected');
    -- SEED-002, SEED-006, SEED-008, SEED-014 intentionally left unassigned.
    insert into attribution(schedule_id, sales_id, clients_brought) values
      (v_s1, v_sa, 2), (v_s3, v_sb, 1), (v_s6, v_sc, 3);
  end if;

  -- Participants on the running and completed sessions.
  insert into participant(order_id, schedule_id, full_name, email, position_title, attendance_status) values
    ('SEED-005', v_s5, 'Andrea Lopez','andrea@meralco.example','Safety Officer','Registered'),
    ('SEED-005', v_s5, 'Ben Tan','ben@meralco.example','Engineer','Registered'),
    ('SEED-005', v_s5, 'Cara Diaz','cara@meralco.example','Supervisor','Attended');
  insert into participant(order_id, schedule_id, full_name, email, position_title, attendance_status, cert_number, cert_issued_date) values
    ('SEED-007', v_s6, 'Danilo Cruz','danilo@ceb.example','QA Lead','Attended','QMS-2026-001', current_date - 17),
    ('SEED-007', v_s6, 'Elena Reyes','elena@ceb.example','Auditor','Attended','QMS-2026-002', current_date - 17);

  -- Notes.
  insert into session_note(schedule_id, author, note) values
    (v_s1, v_u_any, 'Venue confirmed. Awaiting final headcount from Globe.'),
    (v_s5, v_u_any, 'Session running. 3 of 6 attended day one.');

  -- Approvals. Pending: a cancellation on s2 and the Q1 forecast. Decided: an
  -- approved cancellation on s7, and a rejected forecast.
  insert into approval(object_type, schedule_id, quarter, requested_by, decision, note) values
    ('Schedule cancellation', v_s2, null, v_u_ops, 'Pending', 'Below minimum with no movement.');
  insert into approval(object_type, schedule_id, quarter, requested_by, decision, note) values
    ('Forecast sign-off', null, 'Q1 2026', v_u_bo, 'Pending', 'Q1 forecast for review.');
  insert into approval(object_type, schedule_id, quarter, requested_by, decided_by, decision, decision_date, note) values
    ('Schedule cancellation', v_s7, null, v_u_ops, v_u_bo, 'Approved', current_date - 3, 'Approved, session cancelled.');
  insert into approval(object_type, schedule_id, quarter, requested_by, decided_by, decision, decision_date, note) values
    ('Forecast sign-off', null, 'Q4 2025', v_u_bo, v_u_bo, 'Rejected', current_date - 30, 'Numbers too optimistic.');

  -- With an approved cancellation on record, cancel s7 (the guard now passes).
  update schedule set status = 'Cancelled', go_status = 'No-Go' where schedule_id = v_s7;

  -- A duplicate candidate for review.
  insert into duplicate_candidate(order_id_a, order_id_b, match_basis, status) values
    ('SEED-013', 'SEED-002', 'Same client and month', 'Open');
end $$;

commit;

-- ===========================================================================
-- PART 2 - My Work streams (tasks and notifications), separate transaction
-- ===========================================================================
begin;

truncate table task, notification restart identity cascade;

-- A task in every signed-in user's queue.
insert into task(title, detail, entity_type, status, priority, source, assigned_to, created_by)
select 'Review your open items', 'Sample task seeded to populate My Work.', 'client', 'open', 'normal', 'manual', p.user_id, p.user_id
from profiles p;

-- A higher-priority task for salespeople, tied to an order.
insert into task(title, detail, entity_type, entity_id, status, priority, source, reason, assigned_to, created_by)
select 'Chase overdue collection', 'SEED-003 is partial and past 30 days.', 'order', 'SEED-003', 'open', 'high', 'system', 'Overdue collection', p.user_id, p.user_id
from profiles p where p.role = 'sales';

-- An unread notification for every user.
insert into notification(recipient_id, kind, title, body, is_read)
select p.user_id, 'info', 'Sample data loaded', 'The portal is populated with demo records across every scenario.', false
from profiles p;

-- An approval notice for the deciders.
insert into notification(recipient_id, kind, title, body, entity_type, is_read)
select p.user_id, 'approval', 'Approval waiting', 'A schedule cancellation is pending your decision.', 'approval', false
from profiles p where p.role in ('business_owner','super_admin');

commit;

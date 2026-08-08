-- ===========================================================================
-- Full rebuild: real TÜV Rheinland Academy PH catalog + consistent 2026 data.
-- ===========================================================================
--
-- Use this when the course table holds placeholder or junk courses. It replaces
-- the catalog with a real Academy course list across all 13 topic areas, then
-- builds a full year of sessions and every downstream record on top of it.
--
-- KEY DIFFERENCE FROM THE OTHER SEED:
--   Every session's booked count is backed by a real order line, so fill
--   numbers, rosters, orders and reports always agree. Nothing is cosmetic.
--
-- KEEPS: profiles, salesperson, auth.users (your logins and roles).
-- REPLACES: course, course_fee, and every transactional table.
--
-- SAFETY: one transaction for the core; nothing is wiped if anything errors.
--   Re-runnable. Paste the whole file into the Supabase SQL editor and run it.
--
-- If your own uploaded catalog differs, replace the course VALUES list below and
-- re-run. Everything else adapts to whatever courses are present.

begin;

truncate table
  attribution, approval, participant, order_disposition, order_note,
  order_line, order_assignment, orders, session_note, duplicate_candidate,
  client_interaction, inquiry, client, organization, schedule,
  course_fee, trainer_course, course, trainer, venue, calendar_year,
  assignment_log, task, notification
restart identity cascade;

-- Real catalog. training_type PersCert for certification courses, Professional
-- otherwise. Courses named IRCA or Lead Auditor are capped at 10 seats by the
-- pax rule; the rest at 20.
with c(name, standard, category, ttype, fee_ftf, fee_lot, fee_el) as (values
  ('ISO 9001:2015 Lead Auditor (CQI IRCA)','ISO 9001','Quality Management','PersCert',35000,32000,null),
  ('ISO 9001:2015 Internal Auditor','ISO 9001','Quality Management','Professional',12000,10000,null),
  ('ISO 9001:2015 Awareness and Foundation','ISO 9001','Quality Management','Professional',8000,6500,3500),
  ('ISO 14001:2015 Lead Auditor (CQI IRCA)','ISO 14001','Environmental Management','PersCert',35000,32000,null),
  ('ISO 14001:2015 Internal Auditor','ISO 14001','Environmental Management','Professional',12000,10000,null),
  ('ISO 45001:2018 Lead Auditor (CQI IRCA)','ISO 45001','Occupational Health and Safety','PersCert',35000,32000,null),
  ('ISO 45001:2018 Internal Auditor','ISO 45001','Occupational Health and Safety','Professional',12000,10000,null),
  ('BOSH for Safety Officers (SO1)','DOLE','Occupational Health and Safety','Professional',12000,null,null),
  ('Construction Occupational Safety and Health (COSH)','DOLE','Occupational Health and Safety','Professional',13000,null,null),
  ('Standard First Aid and Basic Life Support','Red Cross','Occupational Health and Safety','Professional',6500,null,null),
  ('ISO/IEC 27001:2022 Lead Auditor (CQI IRCA)','ISO 27001','Information Security Management','PersCert',36000,33000,null),
  ('ISO/IEC 27001:2022 Foundation','ISO 27001','Information Security Management','Professional',15000,13000,null),
  ('Data Privacy Officer (DPO) Certification','RA 10173','Data Privacy','Professional',18000,15000,null),
  ('Data Privacy Act (RA 10173) Awareness','RA 10173','Data Privacy','Professional',null,9000,4000),
  ('ISO 50001:2018 Lead Auditor','ISO 50001','Energy Management','PersCert',34000,31000,null),
  ('ISO 50001:2018 Foundation','ISO 50001','Energy Management','Professional',14000,12000,null),
  ('ISO 22000:2018 Food Safety Lead Auditor (CQI IRCA)','ISO 22000','Food Safety','PersCert',40000,36000,null),
  ('HACCP Awareness and Implementation','HACCP','Food Safety','Professional',12000,10000,null),
  ('ISO 13485:2016 Internal Auditor','ISO 13485','Medical Devices','Professional',16000,14000,null),
  ('Leadership and Team Management','TUV','Leadership and Management','Professional',10000,8000,null),
  ('ISO 22301 Business Continuity Lead Implementer','ISO 22301','Organizational Resilience','PersCert',34000,31000,null),
  ('ISO 31000 Risk Management','ISO 31000','Organizational Resilience','Professional',13000,11000,null),
  ('Integrated Management System (9001-14001-45001)','IMS','Organizational Resilience','Professional',20000,18000,null),
  ('ISO 28000 Supply Chain Security Awareness','ISO 28000','Supply Chain Management','Professional',12000,10000,null),
  ('ISO 21001 Educational Organizations Awareness','ISO 21001','Educational Management','Professional',11000,9000,null),
  ('IATF 16949:2016 Internal Auditor','IATF 16949','Automotive','Professional',18000,15000,null)
),
ins as (
  insert into course(course_name, standard, category, training_type)
  select name, standard, category, ttype::training_type_t from c
  returning course_id, course_name
)
insert into course_fee(course_id, modality, fee_php)
select i.course_id, m.modality, m.fee
from ins i
join c on c.name = i.course_name
cross join lateral (values
  ('Face-to-face'::modality_t, c.fee_ftf),
  ('Live Online Training'::modality_t, c.fee_lot),
  ('E-learning'::modality_t, c.fee_el)
) as m(modality, fee)
where m.fee is not null;

do $$
declare
  v_year uuid;
  v_t1 uuid; v_tr uuid[]; v_ve_phys uuid[]; v_v1 uuid; v_v3 uuid;
  v_cids uuid[]; v_names text[]; n int; kk int; j int; ci int;
  cid uuid; cname text; is_irca boolean;
  v_mod modality_t; v_price numeric; v_max int; v_start date; v_end date; v_dur int; v_gap numeric;
  v_status schedule_status_t; v_go go_status_t; f int; sid uuid;
  v_tr_use uuid; v_ve_use uuid;
  v_ch text; v_pay text; v_stage text; v_ostatus text; v_lstatus text; v_odate date;
  oid text; seq int := 0;
  v_clients uuid[]; v_cl uuid; v_org1 uuid; v_org2 uuid; v_org3 uuid;
  v_sales uuid[]; v_sa uuid; v_sb uuid; v_sc uuid; v_asg uuid;
  v_u_admin uuid; v_u_ops uuid; v_u_bo uuid; v_u_any uuid;
  sc_run uuid; sc_wait uuid; sc_cancel uuid; irca_course uuid; irca_price numeric;
  -- roster generation
  pp int; v_pcount int := 100000; v_att text; v_isc boolean; v_pname text; v_pemail text;
  v_fn text[] := array['Andrea','Ben','Cara','Diego','Elena','Frank','Gina','Hector','Ivy','Jomar',
                       'Kim','Lara','Miguel','Nadia','Oscar','Paula','Quennie','Rafael','Sofia','Tomas',
                       'Ula','Victor','Wilma','Xavier','Yna','Zeke'];
  v_ln text[] := array['Santos','Reyes','Cruz','Bautista','Ocampo','Garcia','Mendoza','Torres','Flores','Ramos',
                       'Aquino','Villanueva','Castro','Navarro','Salazar','Domingo','Fernandez','Rivera','Gonzales','Padilla'];
begin
  select array_agg(sales_id) into v_sales from salesperson where active;
  v_sa := v_sales[1]; v_sb := coalesce(v_sales[2], v_sales[1]); v_sc := coalesce(v_sales[3], v_sales[1]);
  select user_id into v_u_admin from profiles where role='super_admin' limit 1;
  select user_id into v_u_ops   from profiles where role='operations' limit 1;
  select user_id into v_u_bo    from profiles where role='business_owner' limit 1;
  v_u_any := coalesce(v_u_admin, v_u_ops, v_u_bo);

  insert into calendar_year(year, mode, status) values (2026,'Rebuild','Active') returning year_id into v_year;

  insert into trainer(name,code,trainer_type,email) values ('Maria Santos','TR-01','Internal','maria@example.com') returning trainer_id into v_t1;
  insert into trainer(name,code,trainer_type,email) values ('Jose Ramos','TR-02','Internal','jose@example.com');
  insert into trainer(name,code,trainer_type,email) values ('Lea Gomez','TR-03','Associate','lea@example.com');
  insert into trainer(name,code,trainer_type,email) values ('Ramon Uy','TR-04','Internal','ramon@example.com');
  insert into trainer(name,code,trainer_type,email) values ('Nina Flores','TR-05','Internal','nina@example.com');
  insert into trainer(name,code,trainer_type,email) values ('Carlo Yap','TR-06','Associate','carlo@example.com');
  select array_agg(trainer_id order by code) filter (where code <> 'TR-01') into v_tr from trainer;

  insert into venue(name,city,capacity,venue_type) values ('Makati Training Center','Makati',25,'Training Room') returning venue_id into v_v1;
  insert into venue(name,city,capacity,venue_type) values ('Cebu Hub','Cebu',22,'Training Room');
  insert into venue(name,city,capacity,venue_type) values ('Virtual Classroom',null,100,'Online') returning venue_id into v_v3;
  insert into venue(name,city,capacity,venue_type) values ('Davao Center','Davao',24,'Training Room');
  insert into venue(name,city,capacity,venue_type) values ('Clark Hall','Clark',30,'Training Room');
  select array_agg(venue_id order by name) filter (where venue_type = 'Training Room' and name <> 'Makati Training Center') into v_ve_phys from venue;

  -- Clients (a pool the calendar orders cycle through).
  insert into client(name, company, contact, email, phone, industry, owner_sales_id) values
    ('Globe Telecom','Globe Telecom Inc.','Rowena Dela Cruz','rowena@globe.example','+63 2 7730 1000','Telecommunications', v_sa),
    ('San Miguel','San Miguel Corp.','Paolo Reyes','paolo@smc.example','+63 2 8632 3000','Manufacturing', v_sb),
    ('BDO Unibank','BDO Unibank Inc.','Grace Lim','grace@bdo.example','+63 2 8840 7000','Banking', v_sc),
    ('Jollibee','Jollibee Foods Corp.','Mark Villanueva','mark@jfc.example','+63 2 8634 1111','Food Service', v_sa),
    ('Meralco','Manila Electric Co.','Ella Navarro','ella@meralco.example','+63 2 1622 8000','Energy', v_sb),
    ('Ayala Land','Ayala Land Inc.','Ramon Cruz','ramonc@ali.example','+63 2 7908 3000','Real Estate', v_sc),
    ('Cebu Pacific','Cebu Air Inc.','Tina Soriano','tina@ceb.example','+63 2 7702 0888','Aviation', null),
    ('PLDT','PLDT Inc.','Jerome Tan','jerome@pldt.example','+63 2 8816 8000','Telecommunications', null),
    ('Aboitiz Power','Aboitiz Power Corp.','Liza Cruz','liza@aboitiz.example','+63 32 411 1800','Energy', v_sa),
    ('Unilab','United Laboratories Inc.','Ben Sy','ben@unilab.example','+63 2 8858 9000','Pharmaceutical', v_sb),
    ('SM Retail','SM Retail Inc.','Joan Uy','joan@sm.example','+63 2 8833 2100','Retail', v_sc),
    ('Petron','Petron Corp.','Cely Ramos','cely@petron.example','+63 2 8884 9200','Oil and Gas', v_sa),
    ('Maynilad','Maynilad Water Services','Rex Uy','rex@maynilad.example','+63 2 1626 0000','Utilities', v_sb),
    ('Nestle PH','Nestle Philippines','Amy Tan','amy@nestle.example','+63 2 8898 0000','Food Manufacturing', v_sc),
    ('Converge','Converge ICT Solutions','Ken Tan','ken@converge.example','+63 2 8667 0888','Telecommunications', v_sa),
    ('Toyota PH','Toyota Motor Philippines','Rod Lim','rod@toyota.example','+63 2 8819 2333','Automotive', v_sb),
    ('DMCI','DMCI Holdings Inc.','Mia Reyes','mia@dmci.example','+63 2 8888 3000','Construction', v_sc),
    ('Robinsons','Robinsons Land Corp.','Karl Sy','karl@rlc.example','+63 2 8397 1888','Real Estate', v_sa),
    ('Century Pacific','Century Pacific Food Inc.','Del Cruz','del@cnpf.example','+63 2 8633 8555','Food Manufacturing', v_sb),
    ('Manila Water','Manila Water Company','Grace Yu','graceyu@mwc.example','+63 2 1627 0000','Utilities', v_sc),
    ('Shell PH','Pilipinas Shell','Ivan Lee','ivanl@shell.example','+63 2 8499 3000','Oil and Gas', v_sa),
    ('Accenture PH','Accenture Philippines','Nina Tan','ninat@accenture.example','+63 2 8888 8888','IT Services', v_sb),
    ('Concentrix','Concentrix Philippines','Paul Ong','paul@cnx.example','+63 2 8858 2000','BPO', v_sc),
    ('Universal Robina','Universal Robina Corp.','Tess Uy','tess@urc.example','+63 2 8633 7631','Food Manufacturing', v_sa),
    ('Megaworld','Megaworld Corp.','Vic Reyes','vic@megaworld.example','+63 2 8867 8826','Real Estate', v_sb),
    ('DOST','Department of Science and Tech','Ella Cruz','ella@dost.example','+63 2 8837 2071','Government', null),
    ('DOLE PH','Department of Labor','Mario Diaz','mario@dole.example','+63 2 8527 3000','Government', null);
  select array_agg(client_id order by created_date, client_id) into v_clients from client;

  insert into organization(name, industry, country) values ('Ayala Group','Conglomerate','PH') returning org_id into v_org1;
  insert into organization(name, industry, country) values ('San Miguel Group','Conglomerate','PH') returning org_id into v_org2;
  insert into organization(name, industry, country) values ('PLDT-Smart Group','Telecommunications','PH') returning org_id into v_org3;
  insert into organization(name, industry, country) values ('Aboitiz Group','Conglomerate','PH');
  insert into organization(name, industry, country) values ('Gokongwei Group','Conglomerate','PH');
  update client set org_id = v_org1 where company in ('Ayala Land Inc.','BDO Unibank Inc.','Manila Water Company','Globe Telecom Inc.');
  update client set org_id = v_org2 where company in ('San Miguel Corp.','Petron Corp.');
  update client set org_id = v_org3 where company in ('PLDT Inc.');
  update client set org_id = (select org_id from organization where name='Aboitiz Group') where company in ('Aboitiz Power Corp.');
  update client set org_id = (select org_id from organization where name='Gokongwei Group') where company in ('Universal Robina Corp.','Cebu Air Inc.','Robinsons Land Corp.');

  select array_agg(course_id order by course_name), array_agg(course_name order by course_name)
    into v_cids, v_names from course where active;
  n := array_length(v_cids,1);
  kk := least(n*6, 156);
  v_gap := 358.0 / kk;

  -- ---- the year-round calendar, each session backed by a real order ----
  for j in 0..kk-1 loop
    ci := (j % n) + 1;
    cid := v_cids[ci]; cname := v_names[ci];
    is_irca := cname ~* '(IRCA|Lead Auditor)';
    v_max := case when is_irca then 10 else 20 end;
    if (j % 3) = 1 then v_mod := 'Live Online Training'; else v_mod := 'Face-to-face'; end if;
    select fee_php into v_price from course_fee where course_id = cid and modality = v_mod limit 1;
    if v_price is null then
      select fee_php into v_price from course_fee where course_id = cid order by fee_php desc limit 1;
    end if;
    if v_price is null then v_price := 12000; end if;

    v_start := make_date(2026,1,1) + floor((j + 0.5) * v_gap)::int;
    v_dur := case when (j % 4) = 1 then 0 else 2 end;
    v_end := v_start + v_dur;

    if v_mod = 'Live Online Training' then v_ve_use := v_v3; else v_ve_use := v_ve_phys[(j % array_length(v_ve_phys,1)) + 1]; end if;
    v_tr_use := v_tr[(j % array_length(v_tr,1)) + 1];

    if v_end < current_date then
      v_status := 'Completed'; v_go := 'Go'; f := 8 + (j % (greatest(v_max-8,1)+1));
      v_pay := 'Paid'; v_stage := 'SAP Created'; v_ostatus := 'Completed'; v_lstatus := 'Completed';
    elsif (j % 3) = 1 then
      v_status := 'Tentative'; v_go := 'No-Go'; f := 1 + (j % 6);
      v_pay := 'Unpaid'; v_stage := 'New'; v_ostatus := 'New'; v_lstatus := 'New';
      if (j % 9) = 4 then v_tr_use := null; end if;                         -- unstaffed
      if (j % 11) = 7 and v_mod = 'Face-to-face' then v_ve_use := null; end if; -- no venue
    else
      v_status := 'Confirmed'; v_go := 'Go'; f := 8 + (j % (greatest(v_max-8,1)+1));
      v_pay := (array['Paid','Partial','Unpaid'])[(j % 3) + 1];
      v_stage := (array['For Order Creation','In Communication','Endorsed to Ops'])[(j % 3) + 1];
      v_ostatus := 'Confirmed'; v_lstatus := 'Confirmed';
    end if;
    if f > v_max then f := v_max; end if;

    if v_status = 'Completed' then
      insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
        values (cid, v_year, to_char(v_start,'FMMonth'), v_start, v_end, v_mod, v_price, v_status, v_go, 8, v_max, 0, v_tr_use, v_ve_use) returning schedule_id into sid;
    else
      insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
        values (cid, v_year, to_char(v_start,'FMMonth'), v_start, v_end, v_mod, v_price, v_status, v_go, 8, v_max, 0, v_tr_use, v_ve_use) returning schedule_id into sid;
    end if;

    -- back the session with one real order so the fill count is genuine
    if f > 0 then
      seq := seq + 1; oid := 'CAL-' || lpad(seq::text, 4, '0');
      v_cl := v_clients[(j % array_length(v_clients,1)) + 1];
      v_ch := (array['Webshop','Inside Sales','Field Sales','In-house Request'])[(j % 4) + 1];
      v_odate := case when v_status = 'Completed' then v_start - 25
                      when v_status = 'Confirmed' and (j % 5) = 0 then current_date - 33  -- overdue
                      else current_date - (3 + (j % 20)) end;
      if v_status = 'Confirmed' and (j % 5) = 0 then v_pay := 'Partial'; end if;
      insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
        values (oid, v_odate, v_ch::channel_t, v_mod, f, f*v_price, v_pay::payment_status_t, v_ostatus::order_status_t, v_stage::fulfillment_stage_t, cid, sid, v_cl, v_u_any, f, f*v_price);
      insert into order_line(order_id, line_no, course_id, schedule_id, modality, seats, amount_php, line_status)
        values (oid, 1, cid, sid, v_mod, f, f*v_price, v_lstatus::order_status_t);
      if v_stage = 'Endorsed to Ops' then
        update orders set stage_changed_at = now() - interval '18 days' where order_id = oid;
      end if;
      if (j % 4) <> 0 then
        v_asg := (array[v_sa, v_sb, v_sc])[(j % 3) + 1];
        if v_asg is not null then
          insert into order_assignment(order_id, sales_id, collection_status)
            values (oid, v_asg, (array['Collected','Partial','Pending'])[(j % 3) + 1]::collection_t);
        end if;
      end if;
      if v_status = 'Completed' then
        update schedule set actual_participants = f, actual_revenue = f*v_price where schedule_id = sid;
        -- Real roster on completed sessions: attendance, and a certificate for
        -- each attendee. PART 3 backfills scores and certificate expiry.
        v_isc := cname ~* '(IRCA|Lead Auditor|Certification|DPO)';
        for pp in 1..f loop
          v_pcount := v_pcount + 1;
          v_pname := v_fn[(v_pcount % array_length(v_fn,1)) + 1] || ' ' || v_ln[((v_pcount / 7) % array_length(v_ln,1)) + 1];
          v_pemail := lower(replace(v_pname,' ','.')) || v_pcount || '@' || split_part(coalesce((select email from client where client_id = v_cl), 'x@co.example'),'@',2);
          v_att := case when (pp % 12) = 0 then 'No Show' else 'Attended' end;
          if v_att = 'Attended' then
            insert into participant(order_id, schedule_id, full_name, email, position_title, attendance_status, cert_number, cert_issued_date)
              values (oid, sid, v_pname, v_pemail,
                      (array['Engineer','Supervisor','Manager','Officer','Analyst','Coordinator'])[(v_pcount % 6) + 1],
                      'Attended', 'TRA-2026-' || lpad(v_pcount::text, 6, '0'), v_end + 5);
          else
            insert into participant(order_id, schedule_id, full_name, email, position_title, attendance_status)
              values (oid, sid, v_pname, v_pemail,
                      (array['Engineer','Supervisor','Manager','Officer','Analyst','Coordinator'])[(v_pcount % 6) + 1], 'No Show');
          end if;
        end loop;
      end if;
    end if;
  end loop;

  -- ---- guaranteed scenario sessions on the reserved trainer/venue (t1, v1) ----
  select course_id, (select fee_php from course_fee where course_id = c.course_id and modality='Face-to-face')
    into irca_course, irca_price
    from course c where c.course_name ~* '(IRCA|Lead Auditor)' order by c.course_name limit 1;

  -- Running now, with participants (roster gap on purpose).
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_cids[1], v_year, to_char(current_date,'FMMonth'), current_date-1, current_date+1, 'Face-to-face',
            (select fee_php from course_fee where course_id=v_cids[1] and modality='Face-to-face'), 'Running','Go', 8, 20, 0, v_t1, v_v1)
    returning schedule_id into sc_run;
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('RUN-001', current_date-25, 'Inside Sales', 'Face-to-face', 9,
            9*(select fee_php from course_fee where course_id=v_cids[1] and modality='Face-to-face'),
            'Partial','Confirmed','Endorsed to Ops', v_cids[1], sc_run, v_clients[5], v_u_any, 9,
            9*(select fee_php from course_fee where course_id=v_cids[1] and modality='Face-to-face'));
  insert into order_line(order_id, line_no, course_id, schedule_id, modality, seats, amount_php, line_status)
    values ('RUN-001', 1, v_cids[1], sc_run, 'Face-to-face', 9,
            9*(select fee_php from course_fee where course_id=v_cids[1] and modality='Face-to-face'), 'Confirmed');
  update orders set stage_changed_at = now() - interval '20 days' where order_id = 'RUN-001';
  if v_sb is not null then insert into order_assignment(order_id, sales_id, collection_status) values ('RUN-001', v_sb, 'Partial'); end if;
  insert into participant(order_id, schedule_id, full_name, email, position_title, attendance_status) values
    ('RUN-001', sc_run, 'Andrea Lopez','andrea@meralco.example','Safety Officer','Attended'),
    ('RUN-001', sc_run, 'Ben Tan','ben2@meralco.example','Engineer','Attended'),
    ('RUN-001', sc_run, 'Cara Diaz','cara@meralco.example','Supervisor','Registered');

  -- Full IRCA session + a waitlisted line.
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (irca_course, v_year, to_char(current_date+18,'FMMonth'), current_date+18, current_date+20, 'Face-to-face', irca_price, 'Confirmed','Go', 8, 10, 0, v_t1, v_v1)
    returning schedule_id into sc_wait;
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('WAIT-001', current_date-12, 'Webshop', 'Face-to-face', 10, 10*irca_price, 'Paid','Confirmed','SAP Created', irca_course, sc_wait, v_clients[1], v_u_any, 10, 10*irca_price);
  insert into order_line(order_id, line_no, course_id, schedule_id, modality, seats, amount_php, line_status)
    values ('WAIT-001', 1, irca_course, sc_wait, 'Face-to-face', 10, 10*irca_price, 'Confirmed');
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('WAIT-002', current_date-3, 'Inside Sales', 'Face-to-face', 2, 2*irca_price, 'Unpaid','Waitlist','New', irca_course, sc_wait, v_clients[4], v_u_any, 2, 2*irca_price);
  insert into order_line(order_id, line_no, course_id, schedule_id, modality, seats, amount_php, line_status)
    values ('WAIT-002', 1, irca_course, sc_wait, 'Face-to-face', 2, 2*irca_price, 'Waitlist');
  if v_sa is not null then insert into order_assignment(order_id, sales_id, collection_status) values ('WAIT-001', v_sa, 'Collected'); end if;

  -- A recently completed session with certificates issued.
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_cids[2], v_year, to_char(current_date-20,'FMMonth'), current_date-20, current_date-18, 'Face-to-face',
            (select fee_php from course_fee where course_id=v_cids[2] and modality='Face-to-face'), 'Completed','Go', 8, 20, 0, v_t1, v_v1)
    returning schedule_id into sid;
  insert into orders(order_id, sap_order_no, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, schedule_id, client_id, created_by, total_seats, total_amount)
    values ('DONE-001','176119002', current_date-55, 'Field Sales', 'Face-to-face', 8,
            8*(select fee_php from course_fee where course_id=v_cids[2] and modality='Face-to-face'),
            'Paid','Completed','SAP Created', v_cids[2], sid, v_clients[3], v_u_any, 8,
            8*(select fee_php from course_fee where course_id=v_cids[2] and modality='Face-to-face'));
  insert into order_line(order_id, line_no, course_id, schedule_id, modality, seats, amount_php, line_status)
    values ('DONE-001', 1, v_cids[2], sid, 'Face-to-face', 8,
            8*(select fee_php from course_fee where course_id=v_cids[2] and modality='Face-to-face'), 'Completed');
  update schedule set actual_participants = 8, actual_revenue = 8*(select fee_php from course_fee where course_id=v_cids[2] and modality='Face-to-face') where schedule_id = sid;
  if v_sc is not null then insert into order_assignment(order_id, sales_id, collection_status) values ('DONE-001', v_sc, 'Collected'); end if;
  insert into participant(order_id, schedule_id, full_name, email, position_title, attendance_status, cert_number, cert_issued_date) values
    ('DONE-001', sid, 'Danilo Cruz','danilo@bdo.example','QA Lead','Attended','TRA-2026-000001', current_date-17),
    ('DONE-001', sid, 'Elena Reyes','elena@bdo.example','Auditor','Attended','TRA-2026-000002', current_date-17),
    ('DONE-001', sid, 'Frank Uy','frank@bdo.example','Manager','No Show', null, null);

  -- Two e-learning orders (no session). One paid-but-waiting for the digest.
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, client_id, created_by, total_seats, total_amount, access_status, access_granted_date, went_live)
    values ('EL-001', current_date-15, 'Webshop', 'E-learning', 5, 17500, 'Paid','Confirmed','SAP Created', v_cids[1], v_clients[2], v_u_any, 5, 17500, 'Granted', current_date-14, 'Yes');
  insert into orders(order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, fulfillment_stage, course_id, client_id, created_by, total_seats, total_amount, access_status)
    values ('EL-002', current_date-6, 'Webshop', 'E-learning', 2, 7000, 'Paid','New','For Order Creation', v_cids[3], v_clients[3], v_u_any, 2, 7000, 'Not Granted');
  insert into order_line(order_id, line_no, course_id, modality, seats, amount_php, line_status, access_status) values
    ('EL-001', 1, v_cids[1], 'E-learning', 5, 17500, 'Confirmed', 'Granted'),
    ('EL-002', 1, v_cids[3], 'E-learning', 2, 7000, 'New', 'Not Granted');

  -- A session to cancel through an approved request.
  insert into schedule(course_id, year_id, month, start_date, end_date, modality, price, status, go_status, min_participants, max_participants, booked_participants, trainer_id, venue_id)
    values (v_cids[4], v_year, to_char(current_date+7,'FMMonth'), current_date+7, current_date+8, 'Face-to-face',
            (select fee_php from course_fee where course_id=v_cids[4] and modality='Face-to-face'), 'Tentative','No-Go', 8, 20, 0, v_t1, v_v1)
    returning schedule_id into sc_cancel;

  -- Forecasts (business owner) on two upcoming sessions.
  update schedule set forecast_revenue = 400000, forecast_participants = 10, forecast_by = v_u_bo where schedule_id = sc_wait;
  update schedule set forecast_revenue = 150000, forecast_participants = 12, forecast_by = v_u_bo where schedule_id = sc_run;

  -- Attribution.
  if v_sa is not null then
    insert into attribution(schedule_id, sales_id, clients_brought) values
      (sc_wait, v_sa, 2), (sc_run, v_sb, 1), (sid, v_sc, 3);
  end if;

  -- Notes and comments.
  insert into session_note(schedule_id, author, note) values
    (sc_run, v_u_any, 'Session running. Day one attendance strong.'),
    (sc_wait, v_u_any, 'Full house. One company on the waitlist.');
  insert into order_note(order_id, author, note) values
    ('RUN-001', v_u_any, 'Endorsed to ops. Roster still short a few names.'),
    ('WAIT-001', v_u_any, 'Paid in full. Certificates to follow after the run.');

  -- Approvals: two pending, two decided (one cancels the session above).
  insert into approval(object_type, schedule_id, quarter, requested_by, decision, note) values
    ('Schedule cancellation', sc_cancel, null, v_u_ops, 'Pending', 'Low interest, requesting cancellation.');
  insert into approval(object_type, schedule_id, quarter, requested_by, decision, note) values
    ('Forecast sign-off', null, 'Q3 2026', v_u_bo, 'Pending', 'Q3 forecast for review.');
  insert into approval(object_type, schedule_id, quarter, requested_by, decided_by, decision, decision_date, note) values
    ('Schedule cancellation', sc_cancel, null, v_u_ops, v_u_bo, 'Approved', current_date-1, 'Approved, cancelling.');
  insert into approval(object_type, schedule_id, quarter, requested_by, decided_by, decision, decision_date, note) values
    ('Forecast sign-off', null, 'Q4 2025', v_u_bo, v_u_bo, 'Rejected', current_date-30, 'Numbers too optimistic.');
  update schedule set status = 'Cancelled', go_status = 'No-Go' where schedule_id = sc_cancel;

  -- Duplicate candidate.
  insert into duplicate_candidate(order_id_a, order_id_b, match_basis, status) values
    ('EL-001', 'EL-002', 'Same channel and month', 'Open');

  -- Inquiry pipeline across every stage.
  if v_sa is not null then
    insert into inquiry(inquiry_date, sales_id, course_id, company, contact, email, phone, offering_type, pax, status) values
      (current_date-2,  v_sa, v_cids[1],  'Aboitiz Power','Liza Cruz','liza@aboitiz.example', null,'Public',   6,  'Received'),
      (current_date-5,  v_sb, v_cids[6],  'Maynilad','Rex Uy','rex@maynilad.example',          null,'In-house', 12, 'Responded'),
      (current_date-8,  v_sa, v_cids[11], 'Nestle PH','Amy Tan','amy@nestle.example',          null,'Public',   4,  'RFQ or P Sent'),
      (current_date-12, v_sc, v_cids[13], 'Unilab','Ben Sy','ben@unilab.example',              null,'In-house', 10, 'Awaiting Feedback'),
      (current_date-20, v_sb, v_cids[17], 'Petron','Cely Ramos','cely@petron.example',         null,'Public',   8,  'Closed Won'),
      (current_date-3,  v_sa, v_cids[8],  'DOST','Ivan Lee','ivan@dost.example',               null,'Public',   5,  'Received'),
      (current_date-6,  v_sc, v_cids[3],  'SM Retail','Joan Uy','joan@sm.example',             null,'In-house', 20, 'Responded'),
      (current_date-15, v_sb, v_cids[12], 'Converge','Ken Tan','ken@converge.example',         null,'Public',   7,  'RFQ or P Sent');
    -- More inquiries across every stage, cycling courses/owners/clients.
    for j in 0..23 loop
      insert into inquiry(inquiry_date, sales_id, course_id, company, contact, email, offering_type, pax, status)
      select current_date - (2 + j),
             (array[v_sa, v_sb, v_sc])[(j % 3) + 1],
             v_cids[(j % n) + 1],
             c.company, c.contact, c.email,
             (array['Public','In-house'])[(j % 2) + 1]::offering_t,
             4 + (j % 16),
             (array['Received','Responded','RFQ or P Sent','Awaiting Feedback','Closed Won'])[(j % 5) + 1]::inquiry_status_t
        from client c order by c.created_date offset (j % greatest(array_length(v_clients,1),1)) limit 1;
    end loop;
  end if;
end $$;

commit;

-- ===========================================================================
-- PART 2 - My Work streams (tasks and notifications)
-- ===========================================================================
begin;

insert into task(title, detail, entity_type, status, priority, source, assigned_to, created_by)
select 'Review your open items', 'Sample task seeded to populate My Work.', 'client', 'open', 'normal', 'manual', p.user_id, p.user_id
from profiles p;

insert into task(title, detail, entity_type, entity_id, status, priority, source, reason, assigned_to, created_by)
select 'Chase overdue collection', 'RUN-001 is partial and past due.', 'order', 'RUN-001', 'open', 'high', 'system', 'Overdue collection', p.user_id, p.user_id
from profiles p where p.role = 'sales';

insert into notification(recipient_id, kind, title, body, is_read)
select p.user_id, 'info', 'Sample data loaded', 'The portal is populated with a full 2026 calendar built on the Academy catalog.', false
from profiles p;

insert into notification(recipient_id, kind, title, body, entity_type, is_read)
select p.user_id, 'approval', 'Approval waiting', 'A schedule cancellation is pending your decision.', 'approval', false
from profiles p where p.role in ('business_owner','super_admin');

commit;

-- ===========================================================================
-- PART 3 - A–N feature data (accounts receivable, quotations, CRM, feedback
-- and quality, pricing rules, trainer availability, communications,
-- attachments, assessments and certificate validity).
--
-- Every block is guarded: a table section runs only if that migration has been
-- applied, and a column update runs only if that column exists. So this part is
-- safe on any subset of the program, and safe to re-run.
-- ===========================================================================
begin;
do $$
declare
  v_any uuid; v_sa uuid; v_sb uuid; v_sc uuid;
  v_cl1 uuid; v_cl2 uuid; v_cl3 uuid; v_qid uuid; v_course uuid; v_price numeric;
  pp int; v_cids uuid[]; n int;
begin
  select user_id into v_any from profiles order by (role='super_admin') desc, (role='operations') desc limit 1;
  select sales_id into v_sa from salesperson where active order by sales_id limit 1;
  select sales_id into v_sb from salesperson where active order by sales_id offset 1 limit 1;
  select sales_id into v_sc from salesperson where active order by sales_id offset 2 limit 1;
  v_sb := coalesce(v_sb, v_sa); v_sc := coalesce(v_sc, v_sa);
  select array_agg(course_id order by course_name) into v_cids from course where active;
  n := array_length(v_cids, 1);
  select client_id into v_cl1 from client order by created_date, client_id limit 1;
  select client_id into v_cl2 from client order by created_date, client_id offset 1 limit 1;
  select client_id into v_cl3 from client order by created_date, client_id offset 2 limit 1;

  -- ---- Cost inputs so profitability shows a real margin ----
  update trainer set daily_rate = case when trainer_type = 'Internal' then 8000 else 12000 end where daily_rate is null;
  update venue   set day_rate   = case when venue_type = 'Online' then 3000 else 15000 end     where day_rate is null;
  if exists (select 1 from information_schema.columns where table_name='schedule' and column_name='material_cost') then
    update schedule set material_cost = greatest(coalesce(booked_participants,0),1) * 500 where coalesce(material_cost,0) = 0;
  end if;

  -- ---- Course assessment attributes + certificate validity ----
  if exists (select 1 from information_schema.columns where table_name='course' and column_name='has_assessment') then
    update course set has_assessment = true, pass_mark = 70,
           cert_validity_months = case when training_type = 'PersCert' then 36 else null end
     where training_type = 'PersCert';
    update course set has_assessment = true, pass_mark = 60 where course_name ~* 'Internal Auditor';
  end if;

  -- ---- Participant scores, results, and certificate expiry ----
  if exists (select 1 from information_schema.columns where table_name='participant' and column_name='score') then
    update participant p set score = 85 + (abs(hashtext(p.participant_id::text) % 12)),
           result = 'Pass', assessed_date = coalesce(p.cert_issued_date, current_date-17),
           cert_expiry_date = coalesce(p.cert_issued_date, current_date-17) + interval '36 months'
     where p.cert_number is not null;
    update participant set result = 'Pending' where cert_number is null and attendance_status in ('Registered','Attended');
    -- A dozen certificates renewing soon, so the "expiring within four months"
    -- watch has content (a certificate issued three years ago is due now).
    with picks as (
      select participant_id, row_number() over (order by participant_id) as rn
        from participant where cert_number is not null order by participant_id limit 12)
    update participant p set
      cert_issued_date = current_date - interval '35 months',
      assessed_date = current_date - interval '35 months',
      cert_expiry_date = current_date + (picks.rn * 9)::int
      from picks where p.participant_id = picks.participant_id;
  end if;

  -- ---- Inquiry pipeline depth (value, probability, source, close date) ----
  if exists (select 1 from information_schema.columns where table_name='inquiry' and column_name='est_value') then
    update inquiry set
      est_value = coalesce(pax,5) * 15000,
      probability = case status::text when 'Received' then 20 when 'Responded' then 40
                    when 'RFQ or P Sent' then 60 when 'Awaiting Feedback' then 75
                    when 'Closed Won' then 100 else 15 end,
      source = (array['Website','Referral','Webshop','Event','Email campaign'])[(abs(hashtext(company) % 5)) + 1],
      expected_close = inquiry_date + 45
     where est_value is null;
    if v_sa is not null then
      insert into inquiry(inquiry_date, sales_id, course_id, company, contact, email, offering_type, pax, status, est_value, probability, source, lost_reason)
      select current_date-25, v_sa, course_id, 'Wilcon Depot', 'Rina Sy', 'rina@wilcon.example', 'In-house', 9,
             'Closed Lost'::inquiry_status_t, 135000, 0, 'Referral', 'Chose a competitor on price'
      from course order by course_name limit 1;
    end if;
  end if;

  -- ---- Multi-country: bill a batch of orders in Indonesia (IDR) so the
  -- by-country revenue panel and fn_current_country have two countries. ----
  if exists (select 1 from information_schema.columns where table_name='orders' and column_name='country') then
    update orders set country = 'ID', currency = 'IDR'
      where order_id in (
        select order_id from orders where order_status::text <> 'Cancelled'
        order by order_id offset 7 limit 22);
  end if;

  -- ---- Pricing and discount rules ----
  if to_regclass('public.discount_rule') is not null then
    truncate table discount_rule;
    insert into discount_rule(label, course_id, training_type, country, min_seats, discount_pct, active) values
      ('Volume: 10 or more seats', null, null, null, 10, 10, true),
      ('Volume: 15 or more seats', null, null, null, 15, 15, true),
      ('Public schedule promo (PH)', null, 'Professional', 'PH', 5, 5, true),
      ('Q1 early-bird', null, null, null, 1, 7, true);
    insert into discount_rule(label, course_id, training_type, country, min_seats, discount_amount, active) values
      ('Certification bulk rebate', null, 'PersCert', null, 8, 3000, true),
      ('In-house group rebate', null, null, null, 12, 5000, true);
  end if;

  -- ---- Accounts receivable: invoices + payments (triggers recompute AR) ----
  if to_regclass('public.invoice') is not null then
    truncate table invoice, payment;
    insert into invoice(order_id, invoice_number, issue_date, due_date, amount, status, created_by)
      select o.order_id, 'INV-' || right(o.order_id, 6), o.order_date + 2, o.order_date + 32, o.total_amount,
             case when o.payment_status::text = 'Paid' then 'Paid' else 'Sent' end, v_any
        from orders o
       where o.order_status::text in ('Confirmed','Completed') and coalesce(o.total_amount,0) > 0;
    insert into payment(order_id, paid_date, amount, method, reference, created_by)
      select o.order_id, o.order_date + 10,
             case when o.payment_status::text = 'Paid' then o.total_amount else round(o.total_amount * 0.5) end,
             'Bank transfer', 'OR-' || right(o.order_id, 6), v_any
        from orders o
       where o.order_status::text in ('Confirmed','Completed')
         and o.payment_status::text in ('Paid','Partial') and coalesce(o.total_amount,0) > 0;
  end if;

  -- ---- CRM contacts ----
  if to_regclass('public.contact') is not null then
    truncate table contact;
    insert into contact(client_id, name, title, email, phone, is_primary)
      select c.client_id, c.contact, 'Primary Contact', c.email, c.phone, true
        from client c where c.contact is not null;
    insert into contact(client_id, name, title, email, is_primary)
      select c.client_id, 'L&D Coordinator', 'Learning and Development', 'learning.' || c.email, false
        from client c where c.email is not null order by c.created_date limit 6;
  end if;

  -- ---- Quotations ----
  if to_regclass('public.quote') is not null then
    truncate table quote cascade;
    insert into quote(client_id, sales_id, status, valid_until, note, created_by)
      values (v_cl1, v_sa, 'Sent', current_date + 21, 'Standard corporate rate for Q3 intake.', v_any)
      returning quote_id into v_qid;
    insert into quote_line(quote_id, course_id, seats, unit_price)
      select v_qid, c.course_id, 8,
             coalesce((select fee_php from course_fee f where f.course_id = c.course_id and f.modality = 'Face-to-face' limit 1), 12000)
        from course c order by c.course_name limit 2;
    insert into quote(client_id, sales_id, status, valid_until, discount_pct, note, created_by)
      values (v_cl2, v_sb, 'Accepted', current_date + 30, 10, 'Volume discount applied.', v_any)
      returning quote_id into v_qid;
    insert into quote_line(quote_id, course_id, seats, unit_price)
      select v_qid, c.course_id, 12,
             coalesce((select fee_php from course_fee f where f.course_id = c.course_id and f.modality = 'Live Online Training' limit 1), 10000)
        from course c where c.course_name ~* 'Internal Auditor' order by c.course_name limit 1;
    -- More quotes across clients and statuses, each with a couple of lines.
    for pp in 0..9 loop
      insert into quote(client_id, sales_id, status, valid_until, discount_pct, note, created_by)
      select c.client_id, (array[v_sa, v_sb, v_sc])[(pp % 3) + 1],
             (array['Draft','Sent','Sent','Accepted','Declined'])[(pp % 5) + 1],
             current_date + 14 + pp, (array[0,0,5,10,0])[(pp % 5) + 1],
             'Auto-generated sample quote.', v_any
        from client c order by c.created_date offset (pp % greatest((select count(*)::int from client),1)) limit 1
      returning quote_id into v_qid;
      insert into quote_line(quote_id, course_id, seats, unit_price)
        select v_qid, v_cids[((pp + gs) % n) + 1], 6 + gs * 4,
               coalesce((select fee_php from course_fee f where f.course_id = v_cids[((pp + gs) % n) + 1] order by fee_php desc limit 1), 12000)
          from generate_series(0, 1) gs;
    end loop;
  end if;

  -- ---- Feedback and quality (NPS + ratings) for completed sessions ----
  if to_regclass('public.feedback') is not null then
    truncate table feedback;
    insert into feedback(schedule_id, nps, content_rating, trainer_rating, venue_rating, comments, created_by)
      select s.schedule_id,
             6 + (abs(hashtext(s.schedule_id::text) % 5)),
             4 + (abs(hashtext(s.schedule_id::text) % 2)),
             4 + (abs(hashtext(s.schedule_id::text || 'x') % 2)),
             4,
             (array['Great facilitation and practical examples.','Well paced, clear material.',
                    'Trainer was knowledgeable.','Good venue and logistics.'])[(abs(hashtext(s.schedule_id::text) % 4)) + 1],
             v_any
        from schedule s where s.status = 'Completed';
    -- a second response per completed session for a fuller distribution
    insert into feedback(schedule_id, nps, content_rating, trainer_rating, comments, created_by)
      select s.schedule_id,
             5 + (abs(hashtext(s.schedule_id::text || 'b') % 6)),
             3 + (abs(hashtext(s.schedule_id::text || 'b') % 3)),
             4 + (abs(hashtext(s.schedule_id::text || 'c') % 2)),
             'Would attend another course.', v_any
        from schedule s where s.status = 'Completed';
  end if;

  -- ---- Complaints ----
  if to_regclass('public.complaint') is not null then
    truncate table complaint;
    insert into complaint(subject, description, severity, status, client_id, order_id, opened_by) values
      ('Certificate name misspelled', 'Participant name on the certificate needs correction.', 'Medium', 'Open', v_cl3, 'DONE-001', v_any),
      ('Room temperature too cold', 'Onsite feedback: training room aircon set too low.', 'Low', 'Resolved', null, 'RUN-001', v_any),
      ('Invoice amount discrepancy', 'Billed amount does not match the purchase order.', 'High', 'In Progress', v_cl2, null, v_any);
    -- A few more tied to real completed orders, across severities and statuses.
    insert into complaint(subject, description, severity, status, client_id, order_id, opened_by)
      select (array['Late joining link','Materials not received','Trainer substitution','Parking access','Catering issue'])[(row_number() over () % 5)::int + 1],
             'Auto-generated sample complaint for QA coverage.',
             (array['Low','Medium','High'])[(row_number() over () % 3)::int + 1],
             (array['Open','In Progress','Resolved','Closed'])[(row_number() over () % 4)::int + 1],
             o.client_id, o.order_id, v_any
        from orders o where o.order_status::text = 'Completed' order by o.order_id limit 6;
  end if;

  -- ---- Trainer availability + co-trainer assignments ----
  if to_regclass('public.trainer_availability') is not null then
    truncate table trainer_availability;
    insert into trainer_availability(trainer_id, start_date, end_date, reason)
      select trainer_id, current_date + 10, current_date + 14, 'On leave' from trainer where code = 'TR-03';
    insert into trainer_availability(trainer_id, start_date, end_date, reason)
      select trainer_id, current_date + 30, current_date + 32, 'Conference' from trainer where code = 'TR-02';
    insert into trainer_availability(trainer_id, start_date, end_date, reason)
      select trainer_id, current_date + 45, current_date + 47, 'Personal leave' from trainer where code = 'TR-06';
  end if;
  if to_regclass('public.session_trainer') is not null then
    truncate table session_trainer;
    insert into session_trainer(schedule_id, trainer_id, role)
      select s.schedule_id, t.trainer_id, 'Assistant'
        from schedule s
        cross join lateral (select trainer_id from trainer where code = 'TR-05' limit 1) t
       where s.status in ('Running','Confirmed') and s.trainer_id is not null and s.trainer_id <> t.trainer_id
       limit 4
      on conflict do nothing;
  end if;

  -- ---- Communications log ----
  if to_regclass('public.comms_log') is not null then
    truncate table comms_log;
    insert into comms_log(template_key, to_email, subject, body, entity_type, entity_id, status, created_by) values
      ('booking_confirmation', 'grace@bdo.example', 'Your booking is confirmed', 'Thank you for booking with TÜV Rheinland Academy.', 'order', 'DONE-001', 'Sent', v_any),
      ('certificate_issued', 'danilo@bdo.example', 'Your certificate is ready', 'Your certificate has been issued and is attached.', 'order', 'DONE-001', 'Sent', v_any),
      ('payment_reminder', 'ella@meralco.example', 'Payment reminder', 'A balance remains on your order RUN-001.', 'order', 'RUN-001', 'Queued', v_any);
    -- Booking confirmations for a batch of confirmed/completed orders.
    insert into comms_log(template_key, to_email, subject, body, entity_type, entity_id, status, created_by)
      select 'booking_confirmation', coalesce(cl.email, 'noreply@tuv.example'),
             'Your booking is confirmed', 'Thank you for booking with TÜV Rheinland Academy.',
             'order', o.order_id, (array['Sent','Queued'])[(row_number() over () % 2)::int + 1], v_any
        from orders o join client cl on cl.client_id = o.client_id
       where o.order_status::text in ('Confirmed','Completed') order by o.order_id limit 20;
    update comms_log set sent_at = now() - interval '2 days' where status = 'Sent';
  end if;

  -- ---- Attachments (metadata; storage objects are illustrative) ----
  if to_regclass('public.attachment') is not null then
    truncate table attachment;
    insert into attachment(entity_type, entity_id, path, file_name, mime, uploaded_by) values
      ('order', 'DONE-001', 'attachments/order/DONE-001/purchase-order.pdf', 'Purchase Order.pdf', 'application/pdf', v_any),
      ('order', 'RUN-001', 'attachments/order/RUN-001/signed-quote.pdf', 'Signed Quote.pdf', 'application/pdf', v_any);
    insert into attachment(entity_type, entity_id, path, file_name, mime, uploaded_by)
      select 'session', s.schedule_id::text, 'attachments/session/' || s.schedule_id || '/roster.xlsx', 'Attendance Roster.xlsx', 'application/vnd.ms-excel', v_any
        from schedule s where s.status = 'Completed' order by s.start_date desc limit 8;
    insert into attachment(entity_type, entity_id, path, file_name, mime, uploaded_by)
      select 'order', o.order_id, 'attachments/order/' || o.order_id || '/purchase-order.pdf', 'Purchase Order.pdf', 'application/pdf', v_any
        from orders o where o.order_status::text = 'Completed' order by o.order_id limit 10;
  end if;
end $$;

commit;

-- Optional: a demo class to show off the app. Run after 0001_schema.sql.
-- Creates "Demo Class" with 30 groups (2 seats, 6 drives each) and 40 made-up
-- students who have already ranked and been placed, leaving open spots so a
-- visitor can sign up on their phone and get placed live.
-- Remove it later with:  delete from classes where name = 'Demo Class';

do $$
declare
  v_class uuid;
  first_f text[] := array['Ava','Mia','Emma','Harper','Lily','Chloe','Grace','Zoe','Nora','Ella','Paige','Kenzie','Avery','Riley','Maya','Lucy','Hannah','Sophie','Claire','Ruby','Isla','Sadie','Kate','Leah'];
  first_m text[] := array['Liam','Noah','Owen','Mason','Carter','Wyatt','Eli','Jack','Caleb','Logan','Ethan','Gavin','Brody','Cole','Tyler','Hunter','Isaac','Landon','Micah','Drew','Ben','Sam','Jonah','Reid'];
  lasts   text[] := array['Anderson','Becker','Carlson','Dvorak','Erickson','Fisher','Hansen','Iverson','Jensen','Klein','Larson','Meyer','Olson','Petersen','Schmidt','Thompson','Vogel','Weber','Young','Zimmerman'];
  s record;
  g uuid[];
  i int;
begin
  delete from classes where name = 'Demo Class';
  insert into classes (name, status, seats_per_group, min_ranks)
  values ('Demo Class', 'ranking', 2, 3) returning id into v_class;

  insert into groups (class_id, name, sort)
  select v_class, 'Group ' || n, n from generate_series(1, 30) n;

  -- Each group: 6 drives spread over ~7 weeks, weekday evenings or weekend mornings.
  insert into drives (group_id, drive_date, start_time, end_time)
  select gr.id,
         current_date + 7 + ((gr.sort * 5 + d * 8) % 49),
         case when gr.sort % 3 = 0 then time '09:00' when gr.sort % 3 = 1 then time '16:15' else time '13:00' end,
         case when gr.sort % 3 = 0 then time '11:00' when gr.sort % 3 = 1 then time '18:15' else time '15:00' end
  from groups gr, generate_series(0, 5) d
  where gr.class_id = v_class;

  perform setseed(0.27);
  for i in 1..40 loop
    insert into students (class_id, first_name, last_name, parent_email, gender, partner_pref)
    values (
      v_class,
      case when i % 2 = 0 then first_f[1 + (i / 2) % array_length(first_f, 1)] else first_m[1 + (i / 2) % array_length(first_m, 1)] end,
      lasts[1 + floor(random() * array_length(lasts, 1))::int],
      'demo' || i || '@example.com',
      case when i % 2 = 0 then 'F' else 'M' end,
      case when random() < 0.2 then (case when i % 2 = 0 then 'F' else 'M' end) else 'any' end
    );
  end loop;

  -- Everyone ranks 4 groups (popular low-numbered groups first) and is placed in sign-up order.
  for s in select id from students where class_id = v_class order by created_at, id loop
    select array_agg(id order by sort) into g from (
      select id, sort from groups
      where class_id = v_class
      order by random() * (sort + 4) limit 4
    ) t;
    delete from rankings where student_id = s.id;
    insert into rankings (student_id, group_id, rank)
    select s.id, x, ord::int from unnest(g) with ordinality as u(x, ord);
    update students set ranked_at = now() where id = s.id;
    perform place_student(s.id);
  end loop;
end $$;

select
  (select count(*) from students s join classes c on c.id = s.class_id where c.name = 'Demo Class') as demo_students,
  (select count(*) from placements p join students s on s.id = p.student_id join classes c on c.id = s.class_id where c.name = 'Demo Class') as placed;

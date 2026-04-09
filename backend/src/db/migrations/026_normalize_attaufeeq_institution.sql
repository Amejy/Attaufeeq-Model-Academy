DO $$
BEGIN
  IF to_regclass('public.students') IS NOT NULL THEN
    UPDATE students
      SET institution = 'ATTAUFEEQ Model Academy'
    WHERE lower(institution) IN ('model academy', 'attafeeq model academy', 'attaufiq model academy', 'attafiq model academy');
  END IF;

  IF to_regclass('public.teachers') IS NOT NULL THEN
    UPDATE teachers
      SET institution = 'ATTAUFEEQ Model Academy'
    WHERE lower(institution) IN ('model academy', 'attafeeq model academy', 'attaufiq model academy', 'attafiq model academy');
  END IF;

  IF to_regclass('public.classes') IS NOT NULL THEN
    UPDATE classes
      SET institution = 'ATTAUFEEQ Model Academy'
    WHERE lower(institution) IN ('model academy', 'attafeeq model academy', 'attaufiq model academy', 'attafiq model academy');
  END IF;

  IF to_regclass('public.subjects') IS NOT NULL THEN
    UPDATE subjects
      SET institution = 'ATTAUFEEQ Model Academy'
    WHERE lower(institution) IN ('model academy', 'attafeeq model academy', 'attaufiq model academy', 'attafiq model academy');
  END IF;

  IF to_regclass('public.admissions') IS NOT NULL THEN
    UPDATE admissions
      SET institution = 'ATTAUFEEQ Model Academy'
    WHERE lower(institution) IN ('model academy', 'attafeeq model academy', 'attaufiq model academy', 'attafiq model academy');
  END IF;

  IF to_regclass('public.results') IS NOT NULL THEN
    UPDATE results
      SET institution = 'ATTAUFEEQ Model Academy'
    WHERE lower(institution) IN ('model academy', 'attafeeq model academy', 'attaufiq model academy', 'attafiq model academy');
  END IF;

  IF to_regclass('public.news_events') IS NOT NULL THEN
    UPDATE news_events
      SET institution = 'ATTAUFEEQ Model Academy'
    WHERE lower(institution) IN ('model academy', 'attafeeq model academy', 'attaufiq model academy', 'attafiq model academy');
  END IF;
END $$;

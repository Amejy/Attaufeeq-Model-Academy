DO $$
DECLARE
  table_row RECORD;
  sequence_row RECORD;
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE USAGE ON SCHEMA public FROM anon;
  END IF;

  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE USAGE ON SCHEMA public FROM authenticated;
  END IF;

  FOR table_row IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_row.tablename);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_row.tablename);

    IF to_regrole('anon') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', table_row.tablename);
    END IF;

    IF to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated', table_row.tablename);
    END IF;

    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_row.tablename);
  END LOOP;

  FOR sequence_row IN
    SELECT sequencename
    FROM pg_sequences
    WHERE schemaname = 'public'
  LOOP
    IF to_regrole('anon') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM anon', sequence_row.sequencename);
    END IF;

    IF to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM authenticated', sequence_row.sequencename);
    END IF;

    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM PUBLIC', sequence_row.sequencename);
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
  END IF;

  IF to_regrole('authenticated') IS NOT NULL THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;
  END IF;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
END $$;

CREATE SCHEMA IF NOT EXISTS security;

CREATE OR REPLACE FUNCTION security.auto_enable_public_table_rls()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, security
AS $$
DECLARE
  command_row RECORD;
BEGIN
  FOR command_row IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
  LOOP
    IF command_row.schema_name = 'public' THEN
      BEGIN
        EXECUTE format('ALTER TABLE IF EXISTS %s ENABLE ROW LEVEL SECURITY', command_row.object_identity);
        EXECUTE format('ALTER TABLE IF EXISTS %s FORCE ROW LEVEL SECURITY', command_row.object_identity);
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'auto_enable_public_table_rls: failed on %', command_row.object_identity;
      END;
    END IF;
  END LOOP;
END $$;

DROP EVENT TRIGGER IF EXISTS auto_enable_public_table_rls;

CREATE EVENT TRIGGER auto_enable_public_table_rls
ON ddl_command_end
EXECUTE FUNCTION security.auto_enable_public_table_rls();

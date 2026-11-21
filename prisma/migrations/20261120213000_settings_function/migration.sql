CREATE OR REPLACE FUNCTION save_tenant_settings(patch jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tid uuid := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
BEGIN
  IF tid IS NULL THEN
    RAISE EXCEPTION 'tenant not set';
  END IF;
  UPDATE tenants SET settings = COALESCE(settings, '{}'::jsonb) || patch WHERE id = tid;
END;
$$;

REVOKE ALL ON FUNCTION save_tenant_settings(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_tenant_settings(jsonb) TO mighty_app;

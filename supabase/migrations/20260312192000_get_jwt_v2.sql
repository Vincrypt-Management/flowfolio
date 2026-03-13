DROP FUNCTION IF EXISTS public.get_jwt_secret();
CREATE OR REPLACE FUNCTION public.get_jwt_secret() RETURNS text AS $$
DECLARE
  result text;
BEGIN
  -- Try different setting names
  result := coalesce(
    current_setting('app.settings.jwt_secret', true),
    current_setting('pgjwt.secret', true),
    current_setting('request.jwt.claim.sub', true),
    'not_found'
  );
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also create a function that reads from the supabase_admin schema
CREATE OR REPLACE FUNCTION public.get_all_jwt_settings() RETURNS jsonb AS $$
  SELECT jsonb_object_agg(name, setting)
  FROM pg_settings
  WHERE name LIKE '%jwt%' OR name LIKE '%secret%' OR name LIKE 'app.%';
$$ LANGUAGE sql SECURITY DEFINER;

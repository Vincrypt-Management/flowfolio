CREATE OR REPLACE FUNCTION public.get_jwt_secret() RETURNS text AS $$
  SELECT current_setting('app.settings.jwt_secret', true);
$$ LANGUAGE sql SECURITY DEFINER;

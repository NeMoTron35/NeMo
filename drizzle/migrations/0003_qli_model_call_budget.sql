CREATE TABLE public.qli_model_calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.qli_agent_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qli_model_calls_profile_time ON public.qli_model_calls(profile_id, created_at DESC);
CREATE INDEX qli_model_calls_time ON public.qli_model_calls(created_at DESC);
REVOKE ALL ON public.qli_model_calls FROM anon, authenticated;
GRANT ALL ON public.qli_model_calls TO service_role;
ALTER TABLE public.qli_model_calls ENABLE ROW LEVEL SECURITY;

-- All-or-nothing reservation of _n hosted model calls, serialized by a transaction advisory lock.
CREATE OR REPLACE FUNCTION public.qli_reserve_model_calls(_profile uuid, _n integer, _hourly integer, _daily integer, _global_daily integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h integer; d integer; g integer;
BEGIN
  IF _n < 1 OR _n > 18 THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('qli_model_calls_budget'));
  SELECT count(*) INTO h FROM public.qli_model_calls WHERE profile_id = _profile AND created_at > now() - interval '1 hour';
  SELECT count(*) INTO d FROM public.qli_model_calls WHERE profile_id = _profile AND created_at > now() - interval '1 day';
  SELECT count(*) INTO g FROM public.qli_model_calls WHERE created_at > now() - interval '1 day';
  IF h + _n > _hourly OR d + _n > _daily OR g + _n > _global_daily THEN RETURN false; END IF;
  INSERT INTO public.qli_model_calls(profile_id) SELECT _profile FROM generate_series(1, _n);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.qli_reserve_model_calls(uuid, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qli_reserve_model_calls(uuid, integer, integer, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.qli_prune_neural() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.qli_neural_runs WHERE created_at < now() - interval '30 days';
  DELETE FROM public.qli_model_calls WHERE created_at < now() - interval '2 days';
$$;
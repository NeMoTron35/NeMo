ALTER TABLE public.qli_agent_profiles ADD COLUMN hosted_inference_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.qli_agent_profiles.hosted_inference_enabled IS 'Wallet-session owner opt-in only; does not grant transaction authority. Checked atomically by hosted-call budget reservation.';
CREATE OR REPLACE FUNCTION public.qli_reserve_model_calls(_profile uuid, _n integer, _hourly integer, _daily integer, _global_daily integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h bigint; d bigint; g bigint;
BEGIN
  IF _profile IS NULL OR _n IS NULL OR _hourly IS NULL OR _daily IS NULL OR _global_daily IS NULL
    OR _n < 1 OR _n > 18 OR _hourly < 0 OR _hourly > 100
    OR _daily < 0 OR _daily > 500 OR _global_daily < 0 OR _global_daily > 5000 THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('qli_model_calls_budget'));
  IF NOT EXISTS (SELECT 1 FROM public.qli_agent_profiles WHERE id = _profile AND hosted_inference_enabled) THEN RETURN false; END IF;
  SELECT count(*) INTO h FROM public.qli_model_calls WHERE profile_id = _profile AND created_at > now() - interval '1 hour';
  SELECT count(*) INTO d FROM public.qli_model_calls WHERE profile_id = _profile AND created_at > now() - interval '1 day';
  SELECT count(*) INTO g FROM public.qli_model_calls WHERE created_at > now() - interval '1 day';
  IF h + _n > _hourly OR d + _n > _daily OR g + _n > _global_daily THEN RETURN false; END IF;
  INSERT INTO public.qli_model_calls(profile_id) SELECT _profile FROM generate_series(1, _n);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.qli_reserve_model_calls(uuid, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qli_reserve_model_calls(uuid, integer, integer, integer, integer) TO service_role;
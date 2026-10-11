CREATE TABLE public.qli_neural_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.qli_agent_profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('analyze','shadow','graph','arena')),
  engine text NOT NULL CHECK (engine IN ('deterministic','hf')),
  model text,
  record_hash text CHECK (record_hash IS NULL OR record_hash ~ '^[0-9a-f]{64}$'),
  latency_ms integer,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qli_neural_runs_profile_time ON public.qli_neural_runs(profile_id, created_at DESC);
REVOKE ALL ON public.qli_neural_runs FROM anon, authenticated;
GRANT ALL ON public.qli_neural_runs TO service_role;
ALTER TABLE public.qli_neural_runs ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.qli_prune_neural() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.qli_neural_runs WHERE created_at < now() - interval '30 days';
$$;
REVOKE ALL ON FUNCTION public.qli_prune_neural() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qli_prune_neural() TO service_role;
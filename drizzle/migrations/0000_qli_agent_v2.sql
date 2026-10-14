CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.qli_wallet_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet text NOT NULL,
  network text NOT NULL CHECK (network IN ('mainnet-beta','devnet')),
  nonce text NOT NULL UNIQUE,
  message text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qli_wallet_nonces_wallet_idx ON public.qli_wallet_nonces (wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS qli_wallet_nonces_expiry_idx ON public.qli_wallet_nonces (expires_at);

CREATE TABLE IF NOT EXISTS public.qli_wallet_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet text NOT NULL,
  network text NOT NULL CHECK (network IN ('mainnet-beta','devnet')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qli_wallet_sessions_expiry_idx ON public.qli_wallet_sessions (expires_at);

CREATE TABLE IF NOT EXISTS public.qli_agent_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet text NOT NULL,
  network text NOT NULL CHECK (network IN ('mainnet-beta','devnet')),
  name text NOT NULL DEFAULT 'QLi Agent' CHECK (char_length(name) BETWEEN 1 AND 40),
  identity_root text CHECK (identity_root IS NULL OR identity_root ~ '^[0-9a-f]{64}$'),
  active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wallet, network)
);

CREATE TABLE IF NOT EXISTS public.qli_monitored_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.qli_agent_profiles(id) ON DELETE CASCADE,
  pool text NOT NULL,
  network text NOT NULL CHECK (network IN ('mainnet-beta','devnet')),
  creator text NOT NULL,
  base_mint text NOT NULL,
  quote_mint text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_observed_at timestamptz,
  last_slot bigint,
  last_error text,
  consecutive_errors integer NOT NULL DEFAULT 0,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, pool)
);
CREATE INDEX IF NOT EXISTS qli_monitored_pools_due_idx ON public.qli_monitored_pools (active, next_check_at);

CREATE TABLE IF NOT EXISTS public.qli_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.qli_monitored_pools(id) ON DELETE CASCADE,
  slot bigint NOT NULL,
  observed_at timestamptz NOT NULL,
  mode text NOT NULL CHECK (mode IN ('scheduled','live')),
  source text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, slot)
);
CREATE INDEX IF NOT EXISTS qli_observations_pool_idx ON public.qli_observations (pool_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS public.qli_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.qli_monitored_pools(id) ON DELETE CASCADE,
  ability text NOT NULL,
  level text NOT NULL CHECK (level IN ('info','warning')),
  title text NOT NULL,
  logic text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  slot bigint NOT NULL,
  observed_at timestamptz NOT NULL,
  dedup_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS qli_alerts_pool_idx ON public.qli_alerts (pool_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.qli_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.qli_monitored_pools(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('claim','buyback','burn')),
  amount text NOT NULL DEFAULT '',
  max_spend_sol text NOT NULL DEFAULT '',
  slippage_bps integer NOT NULL DEFAULT 0 CHECK (slippage_bps BETWEEN 0 AND 1000),
  rationale text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  slot bigint NOT NULL,
  observed_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','denied','handed-off','expired')),
  dedup_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS qli_proposals_pool_idx ON public.qli_proposals (pool_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.qli_worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','failed','skipped')),
  pools_checked integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  note text
);
CREATE INDEX IF NOT EXISTS qli_worker_runs_started_idx ON public.qli_worker_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.qli_worker_lease (
  id integer PRIMARY KEY CHECK (id = 1),
  holder text,
  expires_at timestamptz NOT NULL DEFAULT 'epoch'
);
INSERT INTO public.qli_worker_lease (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.qli_worker_config (
  id integer PRIMARY KEY CHECK (id = 1),
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.qli_worker_config (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.qli_notification_prefs (
  profile_id uuid PRIMARY KEY REFERENCES public.qli_agent_profiles(id) ON DELETE CASCADE,
  in_app boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Service-only: backend server functions and the worker verify wallet sessions themselves.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['qli_wallet_nonces','qli_wallet_sessions','qli_agent_profiles','qli_monitored_pools','qli_observations','qli_alerts','qli_proposals','qli_worker_runs','qli_worker_lease','qli_worker_config','qli_notification_prefs'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.qli_enforce_pool_quota() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.qli_monitored_pools WHERE profile_id = NEW.profile_id) >= 5 THEN
    RAISE EXCEPTION 'QLi Agent pool quota (5) reached';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS qli_pool_quota ON public.qli_monitored_pools;
CREATE TRIGGER qli_pool_quota BEFORE INSERT ON public.qli_monitored_pools
  FOR EACH ROW EXECUTE FUNCTION public.qli_enforce_pool_quota();

CREATE OR REPLACE FUNCTION public.qli_try_lease(_holder text, _ttl_seconds integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  UPDATE public.qli_worker_lease SET holder = _holder, expires_at = now() + make_interval(secs => _ttl_seconds)
  WHERE id = 1 AND (expires_at < now() OR holder = _holder)
  RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END $$;

CREATE OR REPLACE FUNCTION public.qli_release_lease(_holder text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.qli_worker_lease SET expires_at = 'epoch' WHERE id = 1 AND holder = _holder;
$$;

CREATE OR REPLACE FUNCTION public.qli_scheduler_active() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public, cron AS $$
  SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'qli-agent-worker' AND active);
$$;

CREATE OR REPLACE FUNCTION public.qli_prune() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.qli_observations WHERE observed_at < now() - interval '30 days';
  DELETE FROM public.qli_alerts WHERE created_at < now() - interval '90 days';
  DELETE FROM public.qli_proposals WHERE created_at < now() - interval '30 days';
  DELETE FROM public.qli_worker_runs WHERE started_at < now() - interval '14 days';
  DELETE FROM public.qli_wallet_nonces WHERE expires_at < now() - interval '1 day';
  DELETE FROM public.qli_wallet_sessions WHERE expires_at < now() - interval '1 day';
  UPDATE public.qli_proposals SET status = 'expired' WHERE status = 'open' AND observed_at < now() - interval '24 hours';
$$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['qli_try_lease(text,integer)','qli_release_lease(text)','qli_scheduler_active()','qli_prune()','qli_enforce_pool_quota()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
CREATE TABLE public.qli_monitored_vaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.qli_agent_profiles(id) ON DELETE CASCADE,
  network text NOT NULL CHECK (network = 'devnet'),
  program_id text NOT NULL,
  program_sha256 text NOT NULL CHECK (program_sha256 ~ '^[0-9a-f]{64}$'),
  upgrade_authority text,
  vault text NOT NULL,
  owner text NOT NULL,
  mint text NOT NULL,
  escrow text NOT NULL,
  destination text NOT NULL,
  account_version integer NOT NULL,
  decimals integer NOT NULL CHECK (decimals BETWEEN 0 AND 18),
  active boolean NOT NULL DEFAULT true,
  last_slot bigint,
  last_observed_at timestamptz,
  last_error text,
  consecutive_errors integer NOT NULL DEFAULT 0,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, vault)
);
CREATE TABLE public.qli_vault_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id uuid NOT NULL REFERENCES public.qli_monitored_vaults(id) ON DELETE CASCADE,
  slot bigint NOT NULL,
  observed_at timestamptz NOT NULL,
  escrow_balance text NOT NULL CHECK (escrow_balance ~ '^[0-9]{1,20}$'),
  window_spent text NOT NULL CHECK (window_spent ~ '^[0-9]{1,20}$'),
  nonce text NOT NULL CHECK (nonce ~ '^[0-9]{1,20}$'),
  epoch integer NOT NULL,
  paused boolean NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vault_id, slot)
);
CREATE TABLE public.qli_vault_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id uuid NOT NULL REFERENCES public.qli_monitored_vaults(id) ON DELETE CASCADE,
  code text NOT NULL,
  level text NOT NULL CHECK (level IN ('info','warn','critical')),
  detail text NOT NULL,
  slot bigint NOT NULL,
  dedup_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vault_id, dedup_key)
);
GRANT ALL ON public.qli_monitored_vaults, public.qli_vault_observations, public.qli_vault_alerts TO service_role;
REVOKE ALL ON public.qli_monitored_vaults, public.qli_vault_observations, public.qli_vault_alerts FROM anon, authenticated;
ALTER TABLE public.qli_monitored_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qli_vault_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qli_vault_alerts ENABLE ROW LEVEL SECURITY;
CREATE INDEX qli_vault_obs_idx ON public.qli_vault_observations (vault_id, observed_at DESC);
CREATE INDEX qli_vault_alert_idx ON public.qli_vault_alerts (vault_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.qli_enforce_vault_quota() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF (SELECT count(*) FROM public.qli_monitored_vaults WHERE profile_id = NEW.profile_id) >= 3 THEN
    RAISE EXCEPTION 'QLi vault quota (3) reached';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qli_vault_quota BEFORE INSERT ON public.qli_monitored_vaults FOR EACH ROW EXECUTE FUNCTION public.qli_enforce_vault_quota();
CREATE OR REPLACE FUNCTION public.qli_prune_vaults() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  DELETE FROM public.qli_vault_observations WHERE observed_at < now() - interval '30 days';
  DELETE FROM public.qli_vault_alerts WHERE created_at < now() - interval '90 days';
$$;
REVOKE EXECUTE ON FUNCTION public.qli_prune_vaults() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qli_prune_vaults() TO service_role;
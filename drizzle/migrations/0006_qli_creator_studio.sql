CREATE TABLE public.qli_creator_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet text NOT NULL,
  network text NOT NULL CHECK (network IN ('mainnet-beta','devnet')),
  handle text NOT NULL CHECK (handle ~ '^[a-z0-9_]{3,24}$'),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  pool text,
  pool_network text CHECK (pool_network IS NULL OR pool_network IN ('mainnet-beta','devnet')),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_wallet, network, handle)
);
CREATE TABLE public.qli_creator_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL REFERENCES public.qli_creator_personas(id) ON DELETE CASCADE,
  owner_wallet text NOT NULL,
  network text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','ready','archived')),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb,
  provenance_hash text CHECK (provenance_hash IS NULL OR provenance_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.qli_creator_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL REFERENCES public.qli_creator_personas(id) ON DELETE CASCADE,
  owner_wallet text NOT NULL,
  network text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  pack_id uuid REFERENCES public.qli_creator_packs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.qli_creator_qa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL REFERENCES public.qli_creator_personas(id) ON DELETE CASCADE,
  owner_wallet text NOT NULL,
  network text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  grounded boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qli_creator_personas_owner ON public.qli_creator_personas(owner_wallet, network);
CREATE INDEX qli_creator_packs_owner ON public.qli_creator_packs(owner_wallet, network, updated_at DESC);
CREATE INDEX qli_creator_workflows_owner ON public.qli_creator_workflows(owner_wallet, network, created_at DESC);
CREATE INDEX qli_creator_qa_owner ON public.qli_creator_qa(owner_wallet, network, created_at DESC);
REVOKE ALL ON public.qli_creator_personas, public.qli_creator_packs, public.qli_creator_workflows, public.qli_creator_qa FROM anon, authenticated;
GRANT ALL ON public.qli_creator_personas, public.qli_creator_packs, public.qli_creator_workflows, public.qli_creator_qa TO service_role;
ALTER TABLE public.qli_creator_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qli_creator_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qli_creator_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qli_creator_qa ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.qli_creator_quota() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE lim int; n bigint;
BEGIN
  lim := CASE TG_TABLE_NAME WHEN 'qli_creator_personas' THEN 10 WHEN 'qli_creator_packs' THEN 200 WHEN 'qli_creator_workflows' THEN 500 ELSE 300 END;
  EXECUTE format('SELECT count(*) FROM public.%I WHERE owner_wallet = $1 AND network = $2', TG_TABLE_NAME) INTO n USING NEW.owner_wallet, NEW.network;
  IF n >= lim THEN RAISE EXCEPTION 'Creator Studio quota (%) reached', lim; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qli_creator_personas_quota BEFORE INSERT ON public.qli_creator_personas FOR EACH ROW EXECUTE FUNCTION public.qli_creator_quota();
CREATE TRIGGER qli_creator_packs_quota BEFORE INSERT ON public.qli_creator_packs FOR EACH ROW EXECUTE FUNCTION public.qli_creator_quota();
CREATE TRIGGER qli_creator_workflows_quota BEFORE INSERT ON public.qli_creator_workflows FOR EACH ROW EXECUTE FUNCTION public.qli_creator_quota();
CREATE TRIGGER qli_creator_qa_quota BEFORE INSERT ON public.qli_creator_qa FOR EACH ROW EXECUTE FUNCTION public.qli_creator_quota();
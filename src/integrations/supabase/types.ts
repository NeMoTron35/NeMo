export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      qli_agent_profiles: {
        Row: {
          active: boolean
          created_at: string
          hosted_inference_enabled: boolean
          id: string
          identity_root: string | null
          name: string
          network: string
          settings: Json
          updated_at: string
          wallet: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          hosted_inference_enabled?: boolean
          id?: string
          identity_root?: string | null
          name?: string
          network: string
          settings?: Json
          updated_at?: string
          wallet: string
        }
        Update: {
          active?: boolean
          created_at?: string
          hosted_inference_enabled?: boolean
          id?: string
          identity_root?: string | null
          name?: string
          network?: string
          settings?: Json
          updated_at?: string
          wallet?: string
        }
        Relationships: []
      }
      qli_alerts: {
        Row: {
          ability: string
          created_at: string
          dedup_key: string
          evidence: Json
          id: string
          level: string
          logic: string
          observed_at: string
          pool_id: string
          slot: number
          title: string
        }
        Insert: {
          ability: string
          created_at?: string
          dedup_key: string
          evidence?: Json
          id?: string
          level: string
          logic: string
          observed_at: string
          pool_id: string
          slot: number
          title: string
        }
        Update: {
          ability?: string
          created_at?: string
          dedup_key?: string
          evidence?: Json
          id?: string
          level?: string
          logic?: string
          observed_at?: string
          pool_id?: string
          slot?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "qli_alerts_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "qli_monitored_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_creator_packs: {
        Row: {
          content: Json
          created_at: string
          evidence: Json | null
          id: string
          network: string
          owner_wallet: string
          persona_id: string
          provenance_hash: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          evidence?: Json | null
          id?: string
          network: string
          owner_wallet: string
          persona_id: string
          provenance_hash?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          evidence?: Json | null
          id?: string
          network?: string
          owner_wallet?: string
          persona_id?: string
          provenance_hash?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qli_creator_packs_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "qli_creator_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_creator_personas: {
        Row: {
          archived: boolean
          created_at: string
          data: Json
          handle: string
          id: string
          network: string
          owner_wallet: string
          pool: string | null
          pool_network: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          data?: Json
          handle: string
          id?: string
          network: string
          owner_wallet: string
          pool?: string | null
          pool_network?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          data?: Json
          handle?: string
          id?: string
          network?: string
          owner_wallet?: string
          pool?: string | null
          pool_network?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qli_creator_qa: {
        Row: {
          answer: string
          created_at: string
          grounded: boolean
          id: string
          network: string
          owner_wallet: string
          persona_id: string
          question: string
          status: string
        }
        Insert: {
          answer: string
          created_at?: string
          grounded?: boolean
          id?: string
          network: string
          owner_wallet: string
          persona_id: string
          question: string
          status?: string
        }
        Update: {
          answer?: string
          created_at?: string
          grounded?: boolean
          id?: string
          network?: string
          owner_wallet?: string
          persona_id?: string
          question?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "qli_creator_qa_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "qli_creator_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_creator_workflows: {
        Row: {
          created_at: string
          id: string
          kind: string
          network: string
          owner_wallet: string
          pack_id: string | null
          persona_id: string
          status: string
          steps: Json
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          network: string
          owner_wallet: string
          pack_id?: string | null
          persona_id: string
          status: string
          steps?: Json
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          network?: string
          owner_wallet?: string
          pack_id?: string | null
          persona_id?: string
          status?: string
          steps?: Json
        }
        Relationships: [
          {
            foreignKeyName: "qli_creator_workflows_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "qli_creator_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qli_creator_workflows_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "qli_creator_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_model_calls: {
        Row: {
          created_at: string
          id: number
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: never
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qli_model_calls_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "qli_agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_monitored_pools: {
        Row: {
          active: boolean
          base_mint: string
          consecutive_errors: number
          created_at: string
          creator: string
          id: string
          last_error: string | null
          last_observed_at: string | null
          last_slot: number | null
          network: string
          next_check_at: string
          pool: string
          profile_id: string
          quote_mint: string
        }
        Insert: {
          active?: boolean
          base_mint: string
          consecutive_errors?: number
          created_at?: string
          creator: string
          id?: string
          last_error?: string | null
          last_observed_at?: string | null
          last_slot?: number | null
          network: string
          next_check_at?: string
          pool: string
          profile_id: string
          quote_mint: string
        }
        Update: {
          active?: boolean
          base_mint?: string
          consecutive_errors?: number
          created_at?: string
          creator?: string
          id?: string
          last_error?: string | null
          last_observed_at?: string | null
          last_slot?: number | null
          network?: string
          next_check_at?: string
          pool?: string
          profile_id?: string
          quote_mint?: string
        }
        Relationships: [
          {
            foreignKeyName: "qli_monitored_pools_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "qli_agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_monitored_vaults: {
        Row: {
          account_version: number
          active: boolean
          consecutive_errors: number
          created_at: string
          decimals: number
          destination: string
          escrow: string
          id: string
          last_error: string | null
          last_observed_at: string | null
          last_slot: number | null
          mint: string
          network: string
          next_check_at: string
          owner: string
          profile_id: string
          program_id: string
          program_sha256: string
          upgrade_authority: string | null
          vault: string
        }
        Insert: {
          account_version: number
          active?: boolean
          consecutive_errors?: number
          created_at?: string
          decimals: number
          destination: string
          escrow: string
          id?: string
          last_error?: string | null
          last_observed_at?: string | null
          last_slot?: number | null
          mint: string
          network: string
          next_check_at?: string
          owner: string
          profile_id: string
          program_id: string
          program_sha256: string
          upgrade_authority?: string | null
          vault: string
        }
        Update: {
          account_version?: number
          active?: boolean
          consecutive_errors?: number
          created_at?: string
          decimals?: number
          destination?: string
          escrow?: string
          id?: string
          last_error?: string | null
          last_observed_at?: string | null
          last_slot?: number | null
          mint?: string
          network?: string
          next_check_at?: string
          owner?: string
          profile_id?: string
          program_id?: string
          program_sha256?: string
          upgrade_authority?: string | null
          vault?: string
        }
        Relationships: [
          {
            foreignKeyName: "qli_monitored_vaults_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "qli_agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_neural_runs: {
        Row: {
          created_at: string
          engine: string
          id: string
          kind: string
          latency_ms: number | null
          model: string | null
          profile_id: string
          record_hash: string | null
          status: string
        }
        Insert: {
          created_at?: string
          engine: string
          id?: string
          kind: string
          latency_ms?: number | null
          model?: string | null
          profile_id: string
          record_hash?: string | null
          status: string
        }
        Update: {
          created_at?: string
          engine?: string
          id?: string
          kind?: string
          latency_ms?: number | null
          model?: string | null
          profile_id?: string
          record_hash?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "qli_neural_runs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "qli_agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_notification_prefs: {
        Row: {
          in_app: boolean
          profile_id: string
          updated_at: string
        }
        Insert: {
          in_app?: boolean
          profile_id: string
          updated_at?: string
        }
        Update: {
          in_app?: boolean
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qli_notification_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "qli_agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_observations: {
        Row: {
          created_at: string
          data: Json
          id: string
          mode: string
          observed_at: string
          pool_id: string
          slot: number
          source: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          mode: string
          observed_at: string
          pool_id: string
          slot: number
          source: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          mode?: string
          observed_at?: string
          pool_id?: string
          slot?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "qli_observations_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "qli_monitored_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_proposals: {
        Row: {
          amount: string
          created_at: string
          dedup_key: string
          evidence: Json
          id: string
          max_spend_sol: string
          observed_at: string
          pool_id: string
          rationale: string
          slippage_bps: number
          slot: number
          status: string
          step: string
        }
        Insert: {
          amount?: string
          created_at?: string
          dedup_key: string
          evidence?: Json
          id?: string
          max_spend_sol?: string
          observed_at: string
          pool_id: string
          rationale: string
          slippage_bps?: number
          slot: number
          status?: string
          step: string
        }
        Update: {
          amount?: string
          created_at?: string
          dedup_key?: string
          evidence?: Json
          id?: string
          max_spend_sol?: string
          observed_at?: string
          pool_id?: string
          rationale?: string
          slippage_bps?: number
          slot?: number
          status?: string
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "qli_proposals_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "qli_monitored_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_vault_alerts: {
        Row: {
          code: string
          created_at: string
          dedup_key: string
          detail: string
          id: string
          level: string
          slot: number
          vault_id: string
        }
        Insert: {
          code: string
          created_at?: string
          dedup_key: string
          detail: string
          id?: string
          level: string
          slot: number
          vault_id: string
        }
        Update: {
          code?: string
          created_at?: string
          dedup_key?: string
          detail?: string
          id?: string
          level?: string
          slot?: number
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qli_vault_alerts_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "qli_monitored_vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_vault_observations: {
        Row: {
          created_at: string
          data: Json
          epoch: number
          escrow_balance: string
          id: string
          nonce: string
          observed_at: string
          paused: boolean
          slot: number
          vault_id: string
          window_spent: string
        }
        Insert: {
          created_at?: string
          data?: Json
          epoch: number
          escrow_balance: string
          id?: string
          nonce: string
          observed_at: string
          paused: boolean
          slot: number
          vault_id: string
          window_spent: string
        }
        Update: {
          created_at?: string
          data?: Json
          epoch?: number
          escrow_balance?: string
          id?: string
          nonce?: string
          observed_at?: string
          paused?: boolean
          slot?: number
          vault_id?: string
          window_spent?: string
        }
        Relationships: [
          {
            foreignKeyName: "qli_vault_observations_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "qli_monitored_vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      qli_wallet_nonces: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          message: string
          network: string
          nonce: string
          used_at: string | null
          wallet: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          message: string
          network: string
          nonce: string
          used_at?: string | null
          wallet: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          message?: string
          network?: string
          nonce?: string
          used_at?: string | null
          wallet?: string
        }
        Relationships: []
      }
      qli_wallet_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          network: string
          revoked_at: string | null
          token_hash: string
          wallet: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          network: string
          revoked_at?: string | null
          token_hash: string
          wallet: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          network?: string
          revoked_at?: string | null
          token_hash?: string
          wallet?: string
        }
        Relationships: []
      }
      qli_worker_config: {
        Row: {
          created_at: string
          id: number
          token: string
        }
        Insert: {
          created_at?: string
          id: number
          token?: string
        }
        Update: {
          created_at?: string
          id?: number
          token?: string
        }
        Relationships: []
      }
      qli_worker_lease: {
        Row: {
          expires_at: string
          holder: string | null
          id: number
        }
        Insert: {
          expires_at?: string
          holder?: string | null
          id: number
        }
        Update: {
          expires_at?: string
          holder?: string | null
          id?: number
        }
        Relationships: []
      }
      qli_worker_runs: {
        Row: {
          errors: number
          finished_at: string | null
          id: string
          note: string | null
          pools_checked: number
          started_at: string
          status: string
        }
        Insert: {
          errors?: number
          finished_at?: string | null
          id?: string
          note?: string | null
          pools_checked?: number
          started_at?: string
          status?: string
        }
        Update: {
          errors?: number
          finished_at?: string | null
          id?: string
          note?: string | null
          pools_checked?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      qli_prune: { Args: never; Returns: undefined }
      qli_prune_neural: { Args: never; Returns: undefined }
      qli_prune_vaults: { Args: never; Returns: undefined }
      qli_release_lease: { Args: { _holder: string }; Returns: undefined }
      qli_reserve_model_calls: {
        Args: {
          _daily: number
          _global_daily: number
          _hourly: number
          _n: number
          _profile: string
        }
        Returns: boolean
      }
      qli_scheduler_active: { Args: never; Returns: boolean }
      qli_try_lease: {
        Args: { _holder: string; _ttl_seconds: number }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
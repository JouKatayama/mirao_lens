export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_runs: {
        Row: {
          cost_metadata_json: Json
          created_at: string
          error_code: string | null
          id: string
          latency_ms: number | null
          model_alias: string
          provider: string
          scan_id: string
          stage: string
          status: string
          user_id: string
        }
        Insert: {
          cost_metadata_json?: Json
          created_at?: string
          error_code?: string | null
          id?: string
          latency_ms?: number | null
          model_alias: string
          provider: string
          scan_id: string
          stage: string
          status: string
          user_id: string
        }
        Update: {
          cost_metadata_json?: Json
          created_at?: string
          error_code?: string | null
          id?: string
          latency_ms?: number | null
          model_alias?: string
          provider?: string
          scan_id?: string
          stage?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_scan_id_user_id_fkey"
            columns: ["scan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      business_cards: {
        Row: {
          address: string | null
          company: string | null
          created_at: string
          department: string | null
          email: string | null
          extraction_json: Json
          field_confidence: Json
          id: string
          language: string
          name: string | null
          organization_id: string | null
          person_id: string | null
          phone: string | null
          scan_id: string
          title: string | null
          updated_at: string
          user_corrected: boolean
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          company?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          extraction_json?: Json
          field_confidence?: Json
          id?: string
          language?: string
          name?: string | null
          organization_id?: string | null
          person_id?: string | null
          phone?: string | null
          scan_id: string
          title?: string | null
          updated_at?: string
          user_corrected?: boolean
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          company?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          extraction_json?: Json
          field_confidence?: Json
          id?: string
          language?: string
          name?: string | null
          organization_id?: string | null
          person_id?: string | null
          phone?: string | null
          scan_id?: string
          title?: string | null
          updated_at?: string
          user_corrected?: boolean
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_cards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_cards_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_cards_scan_id_user_id_fkey"
            columns: ["scan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      evidence: {
        Row: {
          confidence: number
          created_at: string
          excerpt: string | null
          id: string
          retrieved_at: string | null
          scan_id: string
          source_title: string | null
          source_type: string
          source_url: string | null
          user_id: string
        }
        Insert: {
          confidence: number
          created_at?: string
          excerpt?: string | null
          id?: string
          retrieved_at?: string | null
          scan_id: string
          source_title?: string | null
          source_type: string
          source_url?: string | null
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          excerpt?: string | null
          id?: string
          retrieved_at?: string | null
          scan_id?: string
          source_title?: string | null
          source_type?: string
          source_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_scan_id_user_id_fkey"
            columns: ["scan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      interaction_notes: {
        Row: {
          created_at: string
          id: string
          note_text: string
          scan_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note_text: string
          scan_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note_text?: string
          scan_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_notes_scan_id_user_id_fkey"
            columns: ["scan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      next_actions: {
        Row: {
          action_text: string
          created_at: string
          id: string
          scan_id: string
          source: string
          status: string
          timing_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_text: string
          created_at?: string
          id?: string
          scan_id: string
          source: string
          status?: string
          timing_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_text?: string
          created_at?: string
          id?: string
          scan_id?: string
          source?: string
          status?: string
          timing_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "next_actions_scan_id_user_id_fkey"
            columns: ["scan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          industry: string | null
          name: string
          owner_user_id: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          industry?: string | null
          name: string
          owner_user_id: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          industry?: string | null
          name?: string
          owner_user_id?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          created_at: string
          department: string | null
          id: string
          identity_status: string
          name: string
          owner_user_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          id?: string
          identity_status?: string
          name: string
          owner_user_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          id?: string
          identity_status?: string
          name?: string
          owner_user_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      personal_context_items: {
        Row: {
          created_at: string
          embedding: string | null
          id: string
          onboarding_position: number | null
          onboarding_request_id: string | null
          source_type: string
          tags: string[]
          text: string
          type: string
          updated_at: string
          user_approved: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          id?: string
          onboarding_position?: number | null
          onboarding_request_id?: string | null
          source_type: string
          tags?: string[]
          text: string
          type: string
          updated_at?: string
          user_approved?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          id?: string
          onboarding_position?: number | null
          onboarding_request_id?: string | null
          source_type?: string
          tags?: string[]
          text?: string
          type?: string
          updated_at?: string
          user_approved?: boolean
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          current_company: string | null
          current_role: string | null
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_company?: string | null
          current_role?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_company?: string | null
          current_role?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      relationship_analyses: {
        Row: {
          company_context_json: Json
          flash_brief_json: Json
          generated_at: string
          id: string
          model_metadata_json: Json
          mutual_value_json: Json
          scan_id: string
          user_id: string
        }
        Insert: {
          company_context_json?: Json
          flash_brief_json?: Json
          generated_at?: string
          id?: string
          model_metadata_json?: Json
          mutual_value_json?: Json
          scan_id: string
          user_id: string
        }
        Update: {
          company_context_json?: Json
          flash_brief_json?: Json
          generated_at?: string
          id?: string
          model_metadata_json?: Json
          mutual_value_json?: Json
          scan_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_analyses_scan_id_user_id_fkey"
            columns: ["scan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      scans: {
        Row: {
          created_at: string
          id: string
          meeting_goal: string
          raw_image_expires_at: string | null
          raw_image_path: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_goal?: string
          raw_image_expires_at?: string | null
          raw_image_path?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_goal?: string
          raw_image_expires_at?: string | null
          raw_image_path?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_card_extraction: {
        Args: { p_model_alias: string; p_provider: string; p_scan_id: string }
        Returns: {
          raw_image_path: string
          run_id: string
        }[]
      }
      claim_company_context: {
        Args: { p_model_alias: string; p_provider: string; p_scan_id: string }
        Returns: {
          run_id: string
        }[]
      }
      claim_flash_brief: {
        Args: { p_model_alias: string; p_provider: string; p_scan_id: string }
        Returns: {
          run_id: string
        }[]
      }
      claim_mutual_value: {
        Args: { p_model_alias: string; p_provider: string; p_scan_id: string }
        Returns: {
          run_id: string
        }[]
      }
      correct_business_card: {
        Args: { p_corrections: Json; p_scan_id: string }
        Returns: {
          address: string | null
          company: string | null
          created_at: string
          department: string | null
          email: string | null
          extraction_json: Json
          field_confidence: Json
          id: string
          language: string
          name: string | null
          organization_id: string | null
          person_id: string | null
          phone: string | null
          scan_id: string
          title: string | null
          updated_at: string
          user_corrected: boolean
          user_id: string
          website: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "business_cards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_next_action: {
        Args: {
          p_action_text: string
          p_scan_id: string
          p_source: string
          p_status: string
          p_timing_text: string
        }
        Returns: {
          action_id: string
        }[]
      }
      delete_own_account: { Args: never; Returns: undefined }
      fail_card_extraction: {
        Args: {
          p_error_code: string
          p_run_id: string
          p_scan_id: string
          p_terminal: boolean
        }
        Returns: boolean
      }
      fail_company_context: {
        Args: { p_error_code: string; p_run_id: string; p_scan_id: string }
        Returns: boolean
      }
      fail_flash_brief: {
        Args: { p_error_code: string; p_run_id: string; p_scan_id: string }
        Returns: boolean
      }
      fail_mutual_value: {
        Args: { p_error_code: string; p_run_id: string; p_scan_id: string }
        Returns: boolean
      }
      persist_card_extraction: {
        Args: {
          p_extraction: Json
          p_latency_ms: number
          p_run_id: string
          p_scan_id: string
        }
        Returns: {
          address: string | null
          company: string | null
          created_at: string
          department: string | null
          email: string | null
          extraction_json: Json
          field_confidence: Json
          id: string
          language: string
          name: string | null
          organization_id: string | null
          person_id: string | null
          phone: string | null
          scan_id: string
          title: string | null
          updated_at: string
          user_corrected: boolean
          user_id: string
          website: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "business_cards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      persist_company_context: {
        Args: {
          p_context_json: Json
          p_latency_ms: number
          p_run_id: string
          p_scan_id: string
        }
        Returns: boolean
      }
      persist_flash_brief: {
        Args: {
          p_brief_json: Json
          p_latency_ms: number
          p_run_id: string
          p_scan_id: string
        }
        Returns: {
          analysis_id: string
        }[]
      }
      persist_mutual_value: {
        Args: {
          p_latency_ms: number
          p_mutual_value_json: Json
          p_run_id: string
          p_scan_id: string
        }
        Returns: {
          analysis_id: string
        }[]
      }
      persist_personal_context_onboarding: {
        Args: {
          p_current_company: string
          p_current_role: string
          p_request_id: string
          p_suggestions: Json
        }
        Returns: {
          created_at: string
          embedding: string | null
          id: string
          onboarding_position: number | null
          onboarding_request_id: string | null
          source_type: string
          tags: string[]
          text: string
          type: string
          updated_at: string
          user_approved: boolean
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "personal_context_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      upsert_interaction_note: {
        Args: { p_note_text: string; p_scan_id: string }
        Returns: {
          note_id: string
        }[]
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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


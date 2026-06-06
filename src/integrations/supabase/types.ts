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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      contributions: {
        Row: {
          amount: number
          contributor_id: string
          created_at: string
          event_id: string
          id: string
          mpesa_code: string | null
          notes: string | null
          paid_at: string
          recorded_by: string | null
          status: Database["public"]["Enums"]["contribution_status"]
        }
        Insert: {
          amount: number
          contributor_id: string
          created_at?: string
          event_id: string
          id?: string
          mpesa_code?: string | null
          notes?: string | null
          paid_at?: string
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["contribution_status"]
        }
        Update: {
          amount?: number
          contributor_id?: string
          created_at?: string
          event_id?: string
          id?: string
          mpesa_code?: string | null
          notes?: string | null
          paid_at?: string
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["contribution_status"]
        }
        Relationships: [
          {
            foreignKeyName: "contributions_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "welfare_events"
            referencedColumns: ["id"]
          },
        ]
      }
      dependants: {
        Row: {
          created_at: string
          date_of_birth: string | null
          id: string
          member_id: string
          name: string
          relationship: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          id?: string
          member_id: string
          name: string
          relationship: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          id?: string
          member_id?: string
          name?: string
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          membership_number: string | null
          phone: string | null
          school: string | null
          staff_number: string | null
          updated_at: string
          user_id: string
          zone: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          membership_number?: string | null
          phone?: string | null
          school?: string | null
          staff_number?: string | null
          updated_at?: string
          user_id: string
          zone?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          membership_number?: string | null
          phone?: string | null
          school?: string | null
          staff_number?: string | null
          updated_at?: string
          user_id?: string
          zone?: string
        }
        Relationships: []
      }
      staged_teachers: {
        Row: {
          children: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          created_by: string | null
          email: string
          form_timestamp: string | null
          full_name: string
          home_county: string | null
          id: string
          membership_number: string | null
          next_of_kin: string | null
          next_of_kin_contact: string | null
          parents: string | null
          phone: string | null
          school: string | null
          signature: string | null
          spouse_name: string | null
          staff_number: string | null
        }
        Insert: {
          children?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          form_timestamp?: string | null
          full_name: string
          home_county?: string | null
          id?: string
          membership_number?: string | null
          next_of_kin?: string | null
          next_of_kin_contact?: string | null
          parents?: string | null
          phone?: string | null
          school?: string | null
          signature?: string | null
          spouse_name?: string | null
          staff_number?: string | null
        }
        Update: {
          children?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          form_timestamp?: string | null
          full_name?: string
          home_county?: string | null
          id?: string
          membership_number?: string | null
          next_of_kin?: string | null
          next_of_kin_contact?: string | null
          parents?: string | null
          phone?: string | null
          school?: string | null
          signature?: string | null
          spouse_name?: string | null
          staff_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staged_teachers_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      welfare_events: {
        Row: {
          affected_member_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          status: Database["public"]["Enums"]["event_status"]
          target_amount: number | null
          title: string
          updated_at: string
        }
        Insert: {
          affected_member_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          status?: Database["public"]["Enums"]["event_status"]
          target_amount?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          affected_member_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          status?: Database["public"]["Enums"]["event_status"]
          target_amount?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "welfare_events_affected_member_id_fkey"
            columns: ["affected_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_membership_number: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "member" | "committee"
      contribution_status: "pending" | "confirmed"
      event_status: "open" | "closed"
      event_type: "bereavement" | "emergency" | "other"
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
    Enums: {
      app_role: ["admin", "member", "committee"],
      contribution_status: ["pending", "confirmed"],
      event_status: ["open", "closed"],
      event_type: ["bereavement", "emergency", "other"],
    },
  },
} as const

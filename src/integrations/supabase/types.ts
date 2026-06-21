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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      convoy_members: {
        Row: {
          accent_color: string | null
          convoy_id: string
          current_lat: number | null
          current_lng: number | null
          current_speed: number | null
          distance_driven: number | null
          has_navigated: boolean
          id: string
          is_speaking: boolean | null
          joined_at: string | null
          last_seen: string | null
          stationary_time: number | null
          top_speed: number | null
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          convoy_id: string
          current_lat?: number | null
          current_lng?: number | null
          current_speed?: number | null
          distance_driven?: number | null
          has_navigated?: boolean
          id?: string
          is_speaking?: boolean | null
          joined_at?: string | null
          last_seen?: string | null
          stationary_time?: number | null
          top_speed?: number | null
          user_id: string
        }
        Update: {
          accent_color?: string | null
          convoy_id?: string
          current_lat?: number | null
          current_lng?: number | null
          current_speed?: number | null
          distance_driven?: number | null
          has_navigated?: boolean
          id?: string
          is_speaking?: boolean | null
          joined_at?: string | null
          last_seen?: string | null
          stationary_time?: number | null
          top_speed?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "convoy_members_convoy_id_fkey"
            columns: ["convoy_id"]
            isOneToOne: false
            referencedRelation: "convoys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convoy_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      convoy_messages: {
        Row: {
          content: string
          convoy_id: string
          created_at: string
          id: string
          sender_name: string
          user_id: string
        }
        Insert: {
          content: string
          convoy_id: string
          created_at?: string
          id?: string
          sender_name: string
          user_id: string
        }
        Update: {
          content?: string
          convoy_id?: string
          created_at?: string
          id?: string
          sender_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "convoy_messages_convoy_id_fkey"
            columns: ["convoy_id"]
            isOneToOne: false
            referencedRelation: "convoys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convoy_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      convoy_waypoints: {
        Row: {
          address: string | null
          completed_at: string | null
          convoy_id: string
          created_at: string
          id: string
          is_completed: boolean
          lat: number
          lng: number
          name: string
          order_index: number
        }
        Insert: {
          address?: string | null
          completed_at?: string | null
          convoy_id: string
          created_at?: string
          id?: string
          is_completed?: boolean
          lat: number
          lng: number
          name: string
          order_index?: number
        }
        Update: {
          address?: string | null
          completed_at?: string | null
          convoy_id?: string
          created_at?: string
          id?: string
          is_completed?: boolean
          lat?: number
          lng?: number
          name?: string
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "convoy_waypoints_convoy_id_fkey"
            columns: ["convoy_id"]
            isOneToOne: false
            referencedRelation: "convoys"
            referencedColumns: ["id"]
          },
        ]
      }
      convoys: {
        Row: {
          code: string
          created_at: string | null
          destination_address: string | null
          destination_lat: number | null
          destination_lng: number | null
          destination_name: string | null
          destination_set_at: string | null
          id: string
          is_active: boolean | null
          is_paused: boolean
          leader_id: string | null
          name: string
          paused_at: string | null
          ride_ended_at: string | null
          ride_started_at: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          destination_set_at?: string | null
          id?: string
          is_active?: boolean | null
          is_paused?: boolean
          leader_id?: string | null
          name: string
          paused_at?: string | null
          ride_ended_at?: string | null
          ride_started_at?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          destination_set_at?: string | null
          id?: string
          is_active?: boolean | null
          is_paused?: boolean
          leader_id?: string | null
          name?: string
          paused_at?: string | null
          ride_ended_at?: string | null
          ride_started_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "convoys_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_integrations: {
        Row: {
          auto_announce: boolean
          created_at: string
          role_to_ping: string | null
          server_name: string | null
          updated_at: string
          user_id: string
          webhook_url: string
        }
        Insert: {
          auto_announce?: boolean
          created_at?: string
          role_to_ping?: string | null
          server_name?: string | null
          updated_at?: string
          user_id: string
          webhook_url: string
        }
        Update: {
          auto_announce?: boolean
          created_at?: string
          role_to_ping?: string | null
          server_name?: string | null
          updated_at?: string
          user_id?: string
          webhook_url?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name: string
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_convoy_code: { Args: never; Returns: string }
      is_convoy_member: {
        Args: { _convoy_id: string; _user_id: string }
        Returns: boolean
      }
      profile_count: { Args: never; Returns: number }
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

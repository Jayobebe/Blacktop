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
      card_drop_collections: {
        Row: {
          collector_id: string
          collector_name: string
          created_at: string
          drop_id: string
          id: string
        }
        Insert: {
          collector_id: string
          collector_name?: string
          created_at?: string
          drop_id: string
          id?: string
        }
        Update: {
          collector_id?: string
          collector_name?: string
          created_at?: string
          drop_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_drop_collections_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "card_drops"
            referencedColumns: ["id"]
          },
        ]
      }
      card_drops: {
        Row: {
          card_zoom: number
          copy_index: number
          created_at: string
          crew_code: string
          id: string
          is_active: boolean
          lat: number
          lng: number
          make_model: string | null
          max_g_force: number
          max_lean: number
          owner_id: string
          owner_name: string
          photo_path: string | null
          placement_scale: number
          placement_x: number
          placement_y: number
          tier: string
          top_speed_mph: number
          total_distance_mi: number
          total_duration_sec: number
          total_rides: number
          updated_at: string
          vehicle_name: string
          visibility: string
        }
        Insert: {
          card_zoom?: number
          copy_index?: number
          created_at?: string
          crew_code: string
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          make_model?: string | null
          max_g_force?: number
          max_lean?: number
          owner_id: string
          owner_name?: string
          photo_path?: string | null
          placement_scale?: number
          placement_x?: number
          placement_y?: number
          tier?: string
          top_speed_mph?: number
          total_distance_mi?: number
          total_duration_sec?: number
          total_rides?: number
          updated_at?: string
          vehicle_name: string
          visibility?: string
        }
        Update: {
          card_zoom?: number
          copy_index?: number
          created_at?: string
          crew_code?: string
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          make_model?: string | null
          max_g_force?: number
          max_lean?: number
          owner_id?: string
          owner_name?: string
          photo_path?: string | null
          placement_scale?: number
          placement_x?: number
          placement_y?: number
          tier?: string
          top_speed_mph?: number
          total_distance_mi?: number
          total_duration_sec?: number
          total_rides?: number
          updated_at?: string
          vehicle_name?: string
          visibility?: string
        }
        Relationships: []
      }
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
          crew_code: string | null
          destination_address: string | null
          destination_lat: number | null
          destination_lng: number | null
          destination_name: string | null
          destination_set_at: string | null
          id: string
          is_active: boolean | null
          is_listed: boolean
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
          crew_code?: string | null
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          destination_set_at?: string | null
          id?: string
          is_active?: boolean | null
          is_listed?: boolean
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
          crew_code?: string | null
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          destination_set_at?: string | null
          id?: string
          is_active?: boolean | null
          is_listed?: boolean
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
      crew_scores: {
        Row: {
          crew_code: string
          display_name: string
          hit_heavy: number
          max_lean: number
          petrol_head: number
          ride_count: number
          top_speed: number
          total_distance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          crew_code: string
          display_name?: string
          hit_heavy?: number
          max_lean?: number
          petrol_head?: number
          ride_count?: number
          top_speed?: number
          total_distance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          crew_code?: string
          display_name?: string
          hit_heavy?: number
          max_lean?: number
          petrol_head?: number
          ride_count?: number
          top_speed?: number
          total_distance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crew_weekly_scores: {
        Row: {
          corner_score: number
          crew_code: string
          display_name: string
          distance: number
          longest_ride: number
          max_lean: number
          night_rides: number
          ride_count: number
          top_speed: number
          updated_at: string
          user_id: string
          week_key: string
        }
        Insert: {
          corner_score?: number
          crew_code: string
          display_name?: string
          distance?: number
          longest_ride?: number
          max_lean?: number
          night_rides?: number
          ride_count?: number
          top_speed?: number
          updated_at?: string
          user_id: string
          week_key: string
        }
        Update: {
          corner_score?: number
          crew_code?: string
          display_name?: string
          distance?: number
          longest_ride?: number
          max_lean?: number
          night_rides?: number
          ride_count?: number
          top_speed?: number
          updated_at?: string
          user_id?: string
          week_key?: string
        }
        Relationships: []
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
      edge_rate_limits: {
        Row: {
          bucket: string
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          request_count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          bucket?: string
          request_count?: number
          user_id?: string
          window_start?: string
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
      world_locations: {
        Row: {
          last_seen: string
          lat: number
          lng: number
          user_id: string
        }
        Insert: {
          last_seen?: string
          lat: number
          lng: number
          user_id: string
        }
        Update: {
          last_seen?: string
          lat?: number
          lng?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      area_card_kings: {
        Args: { _lat: number; _lng: number; _radius_km?: number }
        Returns: {
          active_drops: number
          collected_count: number
          owner_name: string
        }[]
      }
      check_rate_limit: {
        Args: {
          _bucket: string
          _max_requests: number
          _window_seconds: number
        }
        Returns: boolean
      }
      claim_convoy_leadership: {
        Args: { _convoy_id: string }
        Returns: boolean
      }
      collect_card_drop: {
        Args: { _drop_id: string; _lat: number; _lng: number }
        Returns: {
          card_zoom: number
          id: string
          lat: number
          lng: number
          make_model: string
          max_g_force: number
          max_lean: number
          owner_name: string
          photo_path: string
          placement_scale: number
          placement_x: number
          placement_y: number
          tier: string
          top_speed_mph: number
          total_distance_mi: number
          total_duration_sec: number
          total_rides: number
          vehicle_name: string
        }[]
      }
      convoy_id_from_topic: { Args: { _topic: string }; Returns: string }
      crew_convoy_detail: {
        Args: { _convoy_id: string }
        Returns: {
          distance_driven: number
          is_leader: boolean
          lat: number
          lng: number
          member_name: string
          top_speed: number
        }[]
      }
      generate_convoy_code: { Args: never; Returns: string }
      get_world_presence: {
        Args: never
        Returns: {
          lat: number
          lng: number
        }[]
      }
      is_convoy_member: {
        Args: { _convoy_id: string; _user_id: string }
        Returns: boolean
      }
      list_card_drops: {
        Args: {
          _crew_code: string
          _lat: number
          _lng: number
          _radius_km: number
        }
        Returns: {
          card_zoom: number
          collected: boolean
          created_at: string
          id: string
          is_own: boolean
          lat: number
          lng: number
          make_model: string
          max_g_force: number
          max_lean: number
          owner_name: string
          photo_path: string
          placement_scale: number
          placement_x: number
          placement_y: number
          tier: string
          top_speed_mph: number
          total_distance_mi: number
          total_duration_sec: number
          total_rides: number
          vehicle_name: string
        }[]
      }
      list_crew_challenge: {
        Args: { _crew_code: string; _week_key: string }
        Returns: {
          corner_score: number
          display_name: string
          distance: number
          longest_ride: number
          max_lean: number
          night_rides: number
          ride_count: number
          top_speed: number
        }[]
      }
      list_crew_convoys: {
        Args: { _crew_code: string }
        Returns: {
          code: string
          created_at: string
          destination_address: string
          destination_name: string
          id: string
          is_riding: boolean
          leader_name: string
          member_count: number
          name: string
        }[]
      }
      list_crew_leaderboard: {
        Args: { _crew_code: string }
        Returns: {
          display_name: string
          hit_heavy: number
          max_lean: number
          petrol_head: number
          ride_count: number
          top_speed: number
          total_distance: number
        }[]
      }
      list_crew_month: {
        Args: { _crew_code: string; _month_key: string }
        Returns: {
          distance: number
          members: number
          ride_count: number
        }[]
      }
      list_my_kickbacks: {
        Args: never
        Returns: {
          collector_name: string
          created_at: string
          id: string
          tier: string
          vehicle_name: string
        }[]
      }
      lookup_convoy_by_code: {
        Args: { _code: string }
        Returns: {
          code: string
          created_at: string | null
          crew_code: string | null
          destination_address: string | null
          destination_lat: number | null
          destination_lng: number | null
          destination_name: string | null
          destination_set_at: string | null
          id: string
          is_active: boolean | null
          is_listed: boolean
          is_paused: boolean
          leader_id: string | null
          name: string
          paused_at: string | null
          ride_ended_at: string | null
          ride_started_at: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "convoys"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_card_collection_count: { Args: never; Returns: number }
      profile_count: { Args: never; Returns: number }
      shares_convoy_with: { Args: { _other_user_id: string }; Returns: boolean }
      transfer_convoy_leadership: {
        Args: { _convoy_id: string; _new_leader_id: string }
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

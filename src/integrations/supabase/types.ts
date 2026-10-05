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
      blacktank_members: {
        Row: {
          crew_code: string
          display_name: string
          id: string
          joined_at: string
          nim_address: string | null
          updated_at: string
          usdt_address: string | null
          user_id: string
        }
        Insert: {
          crew_code: string
          display_name?: string
          id?: string
          joined_at?: string
          nim_address?: string | null
          updated_at?: string
          usdt_address?: string | null
          user_id: string
        }
        Update: {
          crew_code?: string
          display_name?: string
          id?: string
          joined_at?: string
          nim_address?: string | null
          updated_at?: string
          usdt_address?: string | null
          user_id?: string
        }
        Relationships: []
      }
      blacktank_places: {
        Row: {
          crew_code: string
          label: string
          lat: number
          lng: number
          set_by: string | null
          updated_at: string
        }
        Insert: {
          crew_code: string
          label?: string
          lat: number
          lng: number
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          crew_code?: string
          label?: string
          lat?: number
          lng?: number
          set_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      blacktank_pledges: {
        Row: {
          amount: number
          created_at: string
          crew_code: string
          currency: string
          display_name: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          crew_code: string
          currency: string
          display_name?: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          crew_code?: string
          currency?: string
          display_name?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      blacktank_requests: {
        Row: {
          amount: number
          created_at: string
          crew_code: string
          currency: string
          expires_at: string
          id: string
          payout_address: string
          reason: string
          requester_id: string
          requester_name: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          crew_code: string
          currency: string
          expires_at: string
          id?: string
          payout_address: string
          reason: string
          requester_id: string
          requester_name?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          crew_code?: string
          currency?: string
          expires_at?: string
          id?: string
          payout_address?: string
          reason?: string
          requester_id?: string
          requester_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      blacktank_settlements: {
        Row: {
          amount: number
          created_at: string
          crew_code: string
          currency: string
          id: string
          payer_id: string
          payer_name: string
          request_id: string
          tx_ref: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          crew_code: string
          currency: string
          id?: string
          payer_id: string
          payer_name?: string
          request_id: string
          tx_ref?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          crew_code?: string
          currency?: string
          id?: string
          payer_id?: string
          payer_name?: string
          request_id?: string
          tx_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blacktank_settlements_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "blacktank_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      blacktank_votes: {
        Row: {
          approve: boolean
          created_at: string
          id: string
          request_id: string
          voter_id: string
          voter_name: string
        }
        Insert: {
          approve: boolean
          created_at?: string
          id?: string
          request_id: string
          voter_id: string
          voter_name?: string
        }
        Update: {
          approve?: boolean
          created_at?: string
          id?: string
          request_id?: string
          voter_id?: string
          voter_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "blacktank_votes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "blacktank_requests"
            referencedColumns: ["id"]
          },
        ]
      }
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
          max_g_force: number | null
          max_lean: number | null
          owner_id: string
          owner_name: string
          photo_path: string | null
          placement_scale: number
          placement_x: number
          placement_y: number
          tier: string
          top_speed_mph: number | null
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
          max_g_force?: number | null
          max_lean?: number | null
          owner_id: string
          owner_name?: string
          photo_path?: string | null
          placement_scale?: number
          placement_x?: number
          placement_y?: number
          tier?: string
          top_speed_mph?: number | null
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
          max_g_force?: number | null
          max_lean?: number | null
          owner_id?: string
          owner_name?: string
          photo_path?: string | null
          placement_scale?: number
          placement_x?: number
          placement_y?: number
          tier?: string
          top_speed_mph?: number | null
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
          max_lean: number | null
          petrol_head: number
          ride_count: number
          top_speed: number | null
          total_distance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          crew_code: string
          display_name?: string
          hit_heavy?: number
          max_lean?: number | null
          petrol_head?: number
          ride_count?: number
          top_speed?: number | null
          total_distance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          crew_code?: string
          display_name?: string
          hit_heavy?: number
          max_lean?: number | null
          petrol_head?: number
          ride_count?: number
          top_speed?: number | null
          total_distance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crew_weekly_scores: {
        Row: {
          corner_score: number | null
          crew_code: string
          display_name: string
          distance: number
          longest_ride: number
          max_lean: number | null
          night_rides: number
          ride_count: number
          top_speed: number | null
          updated_at: string
          user_id: string
          week_key: string
        }
        Insert: {
          corner_score?: number | null
          crew_code: string
          display_name?: string
          distance?: number
          longest_ride?: number
          max_lean?: number | null
          night_rides?: number
          ride_count?: number
          top_speed?: number | null
          updated_at?: string
          user_id: string
          week_key: string
        }
        Update: {
          corner_score?: number | null
          crew_code?: string
          display_name?: string
          distance?: number
          longest_ride?: number
          max_lean?: number | null
          night_rides?: number
          ride_count?: number
          top_speed?: number | null
          updated_at?: string
          user_id?: string
          week_key?: string
        }
        Relationships: []
      }
      cw_accounts: {
        Row: {
          active_code: string | null
          balance: number
          created_at: string
          first_win_day: string | null
          free_spins: number
          free_tag_spins: number
          last_created_at: string | null
          last_offline_reward: string | null
          last_rapture: string | null
          last_topup: string | null
          last_wear_run: string | null
          prize_due: boolean
          reward_count: number
          reward_day: string | null
          user_id: string
        }
        Insert: {
          active_code?: string | null
          balance?: number
          created_at?: string
          first_win_day?: string | null
          free_spins?: number
          free_tag_spins?: number
          last_created_at?: string | null
          last_offline_reward?: string | null
          last_rapture?: string | null
          last_topup?: string | null
          last_wear_run?: string | null
          prize_due?: boolean
          reward_count?: number
          reward_day?: string | null
          user_id: string
        }
        Update: {
          active_code?: string | null
          balance?: number
          created_at?: string
          first_win_day?: string | null
          free_spins?: number
          free_tag_spins?: number
          last_created_at?: string | null
          last_offline_reward?: string | null
          last_rapture?: string | null
          last_topup?: string | null
          last_wear_run?: string | null
          prize_due?: boolean
          reward_count?: number
          reward_day?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cw_catalog: {
        Row: {
          category: string | null
          id: string
          maker: string | null
          price: number
          ratings: number[]
          vehicle: string
        }
        Insert: {
          category?: string | null
          id: string
          maker?: string | null
          price?: number
          ratings: number[]
          vehicle: string
        }
        Update: {
          category?: string | null
          id?: string
          maker?: string | null
          price?: number
          ratings?: number[]
          vehicle?: string
        }
        Relationships: []
      }
      cw_contract_runs: {
        Row: {
          at: string
          run: string
          user_id: string
        }
        Insert: {
          at?: string
          run: string
          user_id: string
        }
        Update: {
          at?: string
          run?: string
          user_id?: string
        }
        Relationships: []
      }
      cw_contracts: {
        Row: {
          day: string
          ids: string[]
          paid: boolean[]
          progress: number[]
          user_id: string
        }
        Insert: {
          day: string
          ids: string[]
          paid: boolean[]
          progress: number[]
          user_id: string
        }
        Update: {
          day?: string
          ids?: string[]
          paid?: boolean[]
          progress?: number[]
          user_id?: string
        }
        Relationships: []
      }
      cw_matches: {
        Row: {
          categories: number[]
          code: string
          created_at: string
          d1: string[]
          d2: string[] | null
          deadline: string
          hp1: number[]
          hp2: number[]
          log: Json
          move1: number | null
          move2: number | null
          p1: string
          p2: string | null
          penalty: number
          round: number
          rt1: Json | null
          rt2: Json | null
          stake: number
          status: string
          tag1: number | null
          tag2: number | null
          tags1: string[] | null
          tags2: string[] | null
          used1: number[]
          used2: number[]
          winner: string | null
        }
        Insert: {
          categories: number[]
          code?: string
          created_at?: string
          d1: string[]
          d2?: string[] | null
          deadline?: string
          hp1?: number[]
          hp2?: number[]
          log?: Json
          move1?: number | null
          move2?: number | null
          p1: string
          p2?: string | null
          penalty?: number
          round?: number
          rt1?: Json | null
          rt2?: Json | null
          stake?: number
          status?: string
          tag1?: number | null
          tag2?: number | null
          tags1?: string[] | null
          tags2?: string[] | null
          used1?: number[]
          used2?: number[]
          winner?: string | null
        }
        Update: {
          categories?: number[]
          code?: string
          created_at?: string
          d1?: string[]
          d2?: string[] | null
          deadline?: string
          hp1?: number[]
          hp2?: number[]
          log?: Json
          move1?: number | null
          move2?: number | null
          p1?: string
          p2?: string | null
          penalty?: number
          round?: number
          rt1?: Json | null
          rt2?: Json | null
          stake?: number
          status?: string
          tag1?: number | null
          tag2?: number | null
          tags1?: string[] | null
          tags2?: string[] | null
          used1?: number[]
          used2?: number[]
          winner?: string | null
        }
        Relationships: []
      }
      cw_offers: {
        Row: {
          buyer: string
          created_at: string
          id: string
          rpm: number
          status: string
          trade_id: string
        }
        Insert: {
          buyer: string
          created_at?: string
          id?: string
          rpm: number
          status?: string
          trade_id: string
        }
        Update: {
          buyer?: string
          created_at?: string
          id?: string
          rpm?: number
          status?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cw_offers_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "cw_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      cw_own_cards: {
        Row: {
          card_key: string
          ratings: number[]
          set_at: string
          user_id: string
        }
        Insert: {
          card_key: string
          ratings: number[]
          set_at?: string
          user_id: string
        }
        Update: {
          card_key?: string
          ratings?: number[]
          set_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cw_owned: {
        Row: {
          bought_at: string
          card_id: string
          user_id: string
        }
        Insert: {
          bought_at?: string
          card_id: string
          user_id: string
        }
        Update: {
          bought_at?: string
          card_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cw_owned_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cw_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      cw_sets_claimed: {
        Row: {
          claimed_at: string
          maker: string
          user_id: string
        }
        Insert: {
          claimed_at?: string
          maker: string
          user_id: string
        }
        Update: {
          claimed_at?: string
          maker?: string
          user_id?: string
        }
        Relationships: []
      }
      cw_spins: {
        Row: {
          category: string
          count: number
          user_id: string
        }
        Insert: {
          category: string
          count?: number
          user_id: string
        }
        Update: {
          category?: string
          count?: number
          user_id?: string
        }
        Relationships: []
      }
      cw_swap_items: {
        Row: {
          card_id: string
          side: number
          swap_id: string
        }
        Insert: {
          card_id: string
          side: number
          swap_id: string
        }
        Update: {
          card_id?: string
          side?: number
          swap_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cw_swap_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cw_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cw_swap_items_swap_id_fkey"
            columns: ["swap_id"]
            isOneToOne: false
            referencedRelation: "cw_swaps"
            referencedColumns: ["id"]
          },
        ]
      }
      cw_swaps: {
        Row: {
          a: string
          a_ready: boolean
          a_rpm: number
          b: string | null
          b_ready: boolean
          b_rpm: number
          code: string
          created_at: string
          expires_at: string
          id: string
          status: string
        }
        Insert: {
          a: string
          a_ready?: boolean
          a_rpm?: number
          b?: string | null
          b_ready?: boolean
          b_rpm?: number
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          status?: string
        }
        Update: {
          a?: string
          a_ready?: boolean
          a_rpm?: number
          b?: string | null
          b_ready?: boolean
          b_rpm?: number
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
      cw_tags: {
        Row: {
          card_id: string
          power: string
          user_id: string
          won_at: string
        }
        Insert: {
          card_id: string
          power: string
          user_id: string
          won_at?: string
        }
        Update: {
          card_id?: string
          power?: string
          user_id?: string
          won_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cw_tags_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cw_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      cw_trades: {
        Row: {
          card_id: string
          code: string
          created_at: string
          expires_at: string
          id: string
          seller: string
          status: string
        }
        Insert: {
          card_id: string
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          seller: string
          status?: string
        }
        Update: {
          card_id?: string
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          seller?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cw_trades_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cw_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      cw_wear: {
        Row: {
          card_id: string
          condition: number
          user_id: string
        }
        Insert: {
          card_id: string
          condition?: number
          user_id: string
        }
        Update: {
          card_id?: string
          condition?: number
          user_id?: string
        }
        Relationships: []
      }
      derez_lobbies: {
        Row: {
          arena: Json | null
          code: string
          created_at: string
          id: string
          leader_id: string
          lives: number
          round_seq: number
          started_at: string | null
          state: string
          updated_at: string
          winner_id: string | null
          winner_name: string | null
        }
        Insert: {
          arena?: Json | null
          code: string
          created_at?: string
          id?: string
          leader_id: string
          lives?: number
          round_seq?: number
          started_at?: string | null
          state?: string
          updated_at?: string
          winner_id?: string | null
          winner_name?: string | null
        }
        Update: {
          arena?: Json | null
          code?: string
          created_at?: string
          id?: string
          leader_id?: string
          lives?: number
          round_seq?: number
          started_at?: string | null
          state?: string
          updated_at?: string
          winner_id?: string | null
          winner_name?: string | null
        }
        Relationships: []
      }
      derez_players: {
        Row: {
          accent_color: string
          display_name: string
          id: string
          is_alive: boolean
          is_ready: boolean
          joined_at: string
          lives_left: number
          lobby_id: string
          user_id: string
        }
        Insert: {
          accent_color?: string
          display_name?: string
          id?: string
          is_alive?: boolean
          is_ready?: boolean
          joined_at?: string
          lives_left?: number
          lobby_id: string
          user_id: string
        }
        Update: {
          accent_color?: string
          display_name?: string
          id?: string
          is_alive?: boolean
          is_ready?: boolean
          joined_at?: string
          lives_left?: number
          lobby_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "derez_players_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "derez_lobbies"
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
      enterprise_guest_sessions: {
        Row: {
          callsign: string | null
          created_at: string
          expires_at: string
          id: string
          org_id: string
          role: string
          session_token: string
        }
        Insert: {
          callsign?: string | null
          created_at?: string
          expires_at: string
          id?: string
          org_id: string
          role?: string
          session_token: string
        }
        Update: {
          callsign?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          org_id?: string
          role?: string
          session_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_guest_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hazard_votes: {
        Row: {
          created_at: string
          hazard_id: string
          still_there: boolean
          voter_id: string
        }
        Insert: {
          created_at?: string
          hazard_id: string
          still_there: boolean
          voter_id?: string
        }
        Update: {
          created_at?: string
          hazard_id?: string
          still_there?: boolean
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hazard_votes_hazard_id_fkey"
            columns: ["hazard_id"]
            isOneToOne: false
            referencedRelation: "hazards"
            referencedColumns: ["id"]
          },
        ]
      }
      hazards: {
        Row: {
          confirmations: number
          created_at: string
          denials: number
          expires_at: string
          heading: number | null
          id: string
          kind: string
          lat: number
          lng: number
          reporter_id: string
        }
        Insert: {
          confirmations?: number
          created_at?: string
          denials?: number
          expires_at: string
          heading?: number | null
          id?: string
          kind: string
          lat: number
          lng: number
          reporter_id?: string
        }
        Update: {
          confirmations?: number
          created_at?: string
          denials?: number
          expires_at?: string
          heading?: number | null
          id?: string
          kind?: string
          lat?: number
          lng?: number
          reporter_id?: string
        }
        Relationships: []
      }
      organization_invites: {
        Row: {
          code: string
          created_at: string
          expires_at: string | null
          id: string
          max_uses: number | null
          org_id: string
          role: string
          uses: number
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          org_id: string
          role?: string
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          org_id?: string
          role?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          callsign: string | null
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          callsign?: string | null
          created_at?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          callsign?: string | null
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          branding: Json
          contact_email: string | null
          created_at: string
          id: string
          name: string
          settings: Json
          slug: string
          tier: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          contact_email?: string | null
          created_at?: string
          id?: string
          name: string
          settings?: Json
          slug: string
          tier?: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          contact_email?: string | null
          created_at?: string
          id?: string
          name?: string
          settings?: Json
          slug?: string
          tier?: string
          updated_at?: string
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
      push_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      push_outbox: {
        Row: {
          claimed_at: string | null
          created_at: string
          id: number
          kind: string
          payload: Json
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          id?: number
          kind: string
          payload?: Json
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          id?: number
          kind?: string
          payload?: Json
        }
        Relationships: []
      }
      push_reminders: {
        Row: {
          body: string
          category: string
          created_at: string
          due_at: string
          id: string
          key: string
          sent_at: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          due_at: string
          id?: string
          key: string
          sent_at?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          due_at?: string
          id?: string
          key?: string
          sent_at?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_sent: {
        Row: {
          key: string
          sent_at: string
        }
        Insert: {
          key: string
          sent_at?: string
        }
        Update: {
          key?: string
          sent_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          categories: string[]
          created_at: string
          crew_code: string | null
          crew_codes: string[]
          crew_names: Json
          distance_unit: string | null
          endpoint: string
          id: string
          last_sent_at: string | null
          p256dh: string
          speed_unit: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
          weather_at: string | null
          weather_lat: number | null
          weather_lng: number | null
        }
        Insert: {
          auth: string
          categories?: string[]
          created_at?: string
          crew_code?: string | null
          crew_codes?: string[]
          crew_names?: Json
          distance_unit?: string | null
          endpoint: string
          id?: string
          last_sent_at?: string | null
          p256dh: string
          speed_unit?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
          weather_at?: string | null
          weather_lat?: number | null
          weather_lng?: number | null
        }
        Update: {
          auth?: string
          categories?: string[]
          created_at?: string
          crew_code?: string | null
          crew_codes?: string[]
          crew_names?: Json
          distance_unit?: string | null
          endpoint?: string
          id?: string
          last_sent_at?: string | null
          p256dh?: string
          speed_unit?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          weather_at?: string | null
          weather_lat?: number | null
          weather_lng?: number | null
        }
        Relationships: []
      }
      speedshop_suggestions: {
        Row: {
          body: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      speedshop_votes: {
        Row: {
          interest: string
          item_id: string
          price_band: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          interest: string
          item_id: string
          price_band?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          interest?: string
          item_id?: string
          price_band?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      track_record_beats: {
        Row: {
          at: string
          beaten_id: string
          beaten_ms: number
          beater_id: string
          beater_ms: number
          direction: string
          osm_id: number
          vehicle_class: string
        }
        Insert: {
          at?: string
          beaten_id: string
          beaten_ms: number
          beater_id: string
          beater_ms: number
          direction: string
          osm_id: number
          vehicle_class: string
        }
        Update: {
          at?: string
          beaten_id?: string
          beaten_ms?: number
          beater_id?: string
          beater_ms?: number
          direction?: string
          osm_id?: number
          vehicle_class?: string
        }
        Relationships: []
      }
      track_records: {
        Row: {
          card: Json | null
          direction: string
          display_name: string
          fixes: number | null
          flagged: boolean
          lap_ms: number
          max_gap_ms: number | null
          osm_id: number
          sectors: number[]
          set_at: string
          track_name: string
          user_id: string
          vehicle_class: string
          vehicle_name: string | null
        }
        Insert: {
          card?: Json | null
          direction: string
          display_name: string
          fixes?: number | null
          flagged?: boolean
          lap_ms: number
          max_gap_ms?: number | null
          osm_id: number
          sectors?: number[]
          set_at?: string
          track_name: string
          user_id: string
          vehicle_class: string
          vehicle_name?: string | null
        }
        Update: {
          card?: Json | null
          direction?: string
          display_name?: string
          fixes?: number | null
          flagged?: boolean
          lap_ms?: number
          max_gap_ms?: number | null
          osm_id?: number
          sectors?: number[]
          set_at?: string
          track_name?: string
          user_id?: string
          vehicle_class?: string
          vehicle_name?: string | null
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
          kickbacks: number
          owner_name: string
          points: number
        }[]
      }
      blacktank_cancel_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      blacktank_get_place: {
        Args: { _crew_code: string }
        Returns: {
          label: string
          lat: number
          lng: number
        }[]
      }
      blacktank_join: {
        Args: {
          _crew_code: string
          _nim_address?: string
          _usdt_address?: string
        }
        Returns: undefined
      }
      blacktank_list_pledges: {
        Args: { _crew_code: string }
        Returns: {
          currency: string
          display_name: string
          last_at: string
          total: number
        }[]
      }
      blacktank_list_requests: {
        Args: { _crew_code: string }
        Returns: {
          amount: number
          created_at: string
          currency: string
          expires_at: string
          id: string
          is_mine: boolean
          my_settled: boolean
          my_share: number
          my_vote: boolean
          no_votes: number
          payout_address: string
          reason: string
          requester_id: string
          requester_name: string
          status: string
          votes_needed: number
          yes_votes: number
        }[]
      }
      blacktank_pledge: {
        Args: {
          _amount: number
          _crew_code: string
          _currency: string
          _note?: string
        }
        Returns: string
      }
      blacktank_request: {
        Args: {
          _amount: number
          _crew_code: string
          _currency: string
          _expires_minutes?: number
          _payout_address: string
          _reason: string
        }
        Returns: string
      }
      blacktank_set_place: {
        Args: {
          _crew_code: string
          _label?: string
          _lat: number
          _lng: number
        }
        Returns: undefined
      }
      blacktank_settle: {
        Args: { _amount: number; _request_id: string; _tx_ref?: string }
        Returns: undefined
      }
      blacktank_summary: {
        Args: { _crew_code: string }
        Returns: {
          balance: number
          currency: string
          member_count: number
          my_pledged: number
          paid_out: number
          pledged: number
        }[]
      }
      blacktank_sweep: { Args: { _crew_code: string }; Returns: undefined }
      blacktank_vote: {
        Args: { _approve: boolean; _request_id: string }
        Returns: string
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
      claim_push_outbox: {
        Args: { _limit?: number }
        Returns: {
          claimed_at: string | null
          created_at: string
          id: number
          kind: string
          payload: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "push_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
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
      cw_action: {
        Args: {
          _action: string
          _card?: number
          _code?: string
          _deck?: string[]
          _own?: Json
          _round?: number
          _tag?: number
          _tags?: string[]
        }
        Returns: Json
      }
      cw_apply_wear: {
        Args: {
          _d1: string[]
          _d2: string[]
          _log: Json
          _p1: string
          _p2: string
        }
        Returns: undefined
      }
      cw_available: { Args: never; Returns: boolean }
      cw_buy: { Args: { _card: string }; Returns: Json }
      cw_claim_prize: { Args: { _card: string }; Returns: Json }
      cw_contract_defs: {
        Args: never
        Returns: {
          id: string
          rpm: number
          target: number
        }[]
      }
      cw_contract_report: {
        Args: { _facts: Json; _run: string }
        Returns: Json
      }
      cw_contracts_today: { Args: never; Returns: Json }
      cw_daily_topup: { Args: { _u: string }; Returns: undefined }
      cw_flip: { Args: never; Returns: boolean }
      cw_is_race: { Args: { _card: string }; Returns: boolean }
      cw_my_wear: {
        Args: never
        Returns: {
          card_id: string
          condition: number
        }[]
      }
      cw_pay_out: {
        Args: {
          _d1: string[]
          _d2: string[]
          _log: Json
          _p1: string
          _p2: string
          _stake: number
          _winner: string
        }
        Returns: undefined
      }
      cw_prize_rules: { Args: never; Returns: Json }
      cw_repair: { Args: { _card: string }; Returns: Json }
      cw_report_wear: {
        Args: {
          _deck: string[]
          _raptured: string
          _rounds: number[]
          _run: string
        }
        Returns: {
          card_id: string
          condition: number
        }[]
      }
      cw_reward_offline: { Args: { _result: string }; Returns: Json }
      cw_rules: { Args: never; Returns: Json }
      cw_save_wear:
        | {
            Args: { _deck: string[]; _fought: string[]; _run: string }
            Returns: {
              card_id: string
              condition: number
            }[]
          }
        | {
            Args: {
              _deck: string[]
              _fought: string[]
              _raptured: string
              _run: string
            }
            Returns: {
              card_id: string
              condition: number
            }[]
          }
      cw_set_claim: { Args: { _maker: string }; Returns: Json }
      cw_sets: { Args: never; Returns: Json }
      cw_shop: { Args: never; Returns: Json }
      cw_slot_ratings: {
        Args: { _base: number[]; _idx: number; _rt: Json }
        Returns: number[]
      }
      cw_spin: { Args: { _cat: string; _free?: boolean }; Returns: Json }
      cw_spin_cost: { Args: { _cat: string }; Returns: number }
      cw_spin_tag: { Args: never; Returns: Json }
      cw_swap_cancel: { Args: { _swap: string }; Returns: Json }
      cw_swap_join: { Args: { _code: string }; Returns: Json }
      cw_swap_mine: { Args: never; Returns: Json }
      cw_swap_open: { Args: never; Returns: Json }
      cw_swap_ready: { Args: { _ready: boolean; _swap: string }; Returns: Json }
      cw_swap_set: {
        Args: { _cards: string[]; _rpm: number; _swap: string }
        Returns: Json
      }
      cw_swap_view: { Args: { _swap: string }; Returns: Json }
      cw_tag_value: {
        Args: { _kind: string; _power: number; _ref: string }
        Returns: number
      }
      cw_trade_cancel: { Args: { _trade: string }; Returns: Json }
      cw_trade_list: { Args: { _card: string }; Returns: Json }
      cw_trade_offer: { Args: { _code: string; _rpm: number }; Returns: Json }
      cw_trade_respond: {
        Args: { _accept: boolean; _offer: string }
        Returns: Json
      }
      cw_trade_sweep: { Args: never; Returns: undefined }
      cw_trade_view: { Args: { _code: string }; Returns: Json }
      cw_trade_withdraw: { Args: { _offer: string }; Returns: Json }
      cw_trades_mine: { Args: never; Returns: Json }
      cw_wear_for: {
        Args: { _fought: string[]; _user: string }
        Returns: undefined
      }
      cw_wear_loss: {
        Args: { _card: string; _rounds: number }
        Returns: number
      }
      cw_wear_mult: {
        Args: { _card: string; _cat: number; _user: string }
        Returns: number
      }
      cw_wear_offline: {
        Args: { _deck: string[]; _fought: string[] }
        Returns: {
          card_id: string
          condition: number
        }[]
      }
      cw_wear_rounds: {
        Args: { _cards: string[]; _rounds: number[]; _user: string }
        Returns: undefined
      }
      cw_wear_rules: { Args: never; Returns: Json }
      enterprise_role: { Args: { _org: string }; Returns: string }
      generate_convoy_code: { Args: never; Returns: string }
      get_world_presence: {
        Args: never
        Returns: {
          lat: number
          lng: number
        }[]
      }
      hazard_ttl: { Args: { _kind: string }; Returns: string }
      hazards_in_bbox: {
        Args: { _east: number; _north: number; _south: number; _west: number }
        Returns: {
          confirmations: number
          created_at: string
          denials: number
          expires_at: string
          heading: number
          id: string
          kind: string
          lat: number
          lng: number
          mine: boolean
          my_vote: boolean
        }[]
      }
      is_blacktank_member: {
        Args: { _crew_code: string; _user_id: string }
        Returns: boolean
      }
      is_convoy_member: {
        Args: { _convoy_id: string; _user_id: string }
        Returns: boolean
      }
      is_derez_member: {
        Args: { _lobby_id: string; _user_id: string }
        Returns: boolean
      }
      is_push_service_endpoint: {
        Args: { _endpoint: string }
        Returns: boolean
      }
      leave_track_leaderboards: { Args: never; Returns: undefined }
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
      lookup_derez_by_code: {
        Args: { _code: string }
        Returns: {
          arena: Json | null
          code: string
          created_at: string
          id: string
          leader_id: string
          lives: number
          round_seq: number
          started_at: string | null
          state: string
          updated_at: string
          winner_id: string | null
          winner_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "derez_lobbies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_card_collection_count: { Args: never; Returns: number }
      profile_count: { Args: never; Returns: number }
      push_call: { Args: { _action: string }; Returns: undefined }
      push_enqueue: {
        Args: { _kind: string; _payload: Json }
        Returns: undefined
      }
      push_mark_once: {
        Args: { _cooldown_seconds?: number; _key: string }
        Returns: boolean
      }
      push_tick: { Args: never; Returns: undefined }
      register_push_subscription: {
        Args: {
          _auth: string
          _categories?: string[]
          _crew_code?: string
          _crew_codes?: string[]
          _crew_names?: Json
          _distance_unit?: string
          _endpoint: string
          _lat?: number
          _lng?: number
          _p256dh: string
          _speed_unit?: string
          _user_agent?: string
        }
        Returns: undefined
      }
      remove_my_hazard: { Args: { _id: string }; Returns: undefined }
      report_hazard: {
        Args: { _heading?: number; _kind: string; _lat: number; _lng: number }
        Returns: string
      }
      set_push_reminders: {
        Args: { _category: string; _reminders: Json }
        Returns: undefined
      }
      shares_convoy_with: { Args: { _other_user_id: string }; Returns: boolean }
      speedshop_results: {
        Args: never
        Returns: {
          item_id: string
          maybe: number
          no: number
          top_price: string
          yes: number
        }[]
      }
      speedshop_suggestion_list: {
        Args: { _limit?: number }
        Returns: {
          body: string
          created_at: string
        }[]
      }
      speedshop_survey_table: {
        Args: never
        Returns: {
          item_id: string
          last_at: string
          maybe: number
          no: number
          prices: Json
          yes: number
        }[]
      }
      submit_track_lap:
        | {
            Args: {
              _card?: Json
              _direction: string
              _display_name: string
              _lap_ms: number
              _length_m: number
              _osm_id: number
              _sectors: number[]
              _track_name: string
              _vehicle_class: string
              _vehicle_name?: string
            }
            Returns: {
              card: Json
              display_name: string
              lap_ms: number
              vehicle_name: string
            }[]
          }
        | {
            Args: {
              _card?: Json
              _direction: string
              _display_name: string
              _fixes?: number
              _lap_ms: number
              _length_m: number
              _max_gap_ms?: number
              _osm_id: number
              _sectors: number[]
              _track_name: string
              _vehicle_class: string
              _vehicle_name?: string
            }
            Returns: {
              card: Json
              display_name: string
              lap_ms: number
              vehicle_name: string
            }[]
          }
      track_leaderboard: {
        Args: {
          _direction: string
          _limit?: number
          _osm_id: number
          _vehicle_class: string
        }
        Returns: {
          display_name: string
          is_me: boolean
          lap_ms: number
          rank: number
          sectors: number[]
          set_at: string
          vehicle_name: string
        }[]
      }
      transfer_convoy_leadership: {
        Args: { _convoy_id: string; _new_leader_id: string }
        Returns: boolean
      }
      unregister_push_subscription: {
        Args: { _endpoint: string }
        Returns: undefined
      }
      verify_enterprise_token: { Args: { token_code: string }; Returns: Json }
      vote_hazard: {
        Args: { _id: string; _still_there: boolean }
        Returns: undefined
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

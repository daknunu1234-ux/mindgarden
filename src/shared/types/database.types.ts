// Hand-written from 01.share-docx/DATABASE.md, in the same shape `supabase gen types` produces.
// Replace with the generated file once the migrations exist:
//   npx supabase gen types typescript --project-id <PROJECT_ID> > src/shared/types/database.types.ts

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
      roles: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          role_id: number
          email: string
          full_name: string | null
          // Migration 20260928001000: the public name the player chose (2–30 chars); null = pseudonym.
          display_name: string | null
          // Migration 20260930000000: fraction of a coin carried between buffed payouts (0 ≤ x < 1).
          coin_carry: number
          avatar_url: string | null
          streak_count: number
          last_active_at: string | null
          coins: number
          created_at: string
        }
        Insert: {
          id: string
          role_id?: number
          email: string
          full_name?: string | null
          display_name?: string | null
          avatar_url?: string | null
          streak_count?: number
          last_active_at?: string | null
          coins?: number
          created_at?: string
        }
        Update: {
          id?: string
          role_id?: number
          email?: string
          full_name?: string | null
          display_name?: string | null
          avatar_url?: string | null
          streak_count?: number
          last_active_at?: string | null
          coins?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'users_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
        ]
      }
      decks: {
        Row: {
          id: string
          user_id: string
          title: string
          slug: string
          description: string | null
          is_public: boolean
          tree_type: string
          created_at: string
          // Migration 20260928000900: the owner hosts a Mind Tournament on this (public) tree.
          is_tournament_open: boolean
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          slug: string
          description?: string | null
          is_public?: boolean
          tree_type?: string
          created_at?: string
          is_tournament_open?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          slug?: string
          description?: string | null
          is_public?: boolean
          tree_type?: string
          created_at?: string
          is_tournament_open?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'decks_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      mindmap_nodes: {
        Row: {
          id: string
          deck_id: string
          parent_id: string | null
          title: string
          sort_order: number
        }
        Insert: {
          id?: string
          deck_id: string
          parent_id?: string | null
          title: string
          sort_order?: number
        }
        Update: {
          id?: string
          deck_id?: string
          parent_id?: string | null
          title?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'mindmap_nodes_deck_id_fkey'
            columns: ['deck_id']
            isOneToOne: false
            referencedRelation: 'decks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mindmap_nodes_parent_id_deck_id_fkey'
            columns: ['parent_id', 'deck_id']
            isOneToOne: false
            referencedRelation: 'mindmap_nodes'
            referencedColumns: ['id', 'deck_id']
          },
        ]
      }
      knowledge_items: {
        Row: {
          id: string
          node_id: string
          prompt: string
          correct_stmt: string
          trap_rules: Json
          created_at: string
        }
        Insert: {
          id?: string
          node_id: string
          prompt: string
          correct_stmt: string
          trap_rules?: Json
          created_at?: string
        }
        Update: {
          id?: string
          node_id?: string
          prompt?: string
          correct_stmt?: string
          trap_rules?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'knowledge_items_node_id_fkey'
            columns: ['node_id']
            isOneToOne: false
            referencedRelation: 'mindmap_nodes'
            referencedColumns: ['id']
          },
        ]
      }
      practice_days: {
        Row: {
          user_id: string
          day: string
          time_zone: string
          created_at: string
        }
        Insert: {
          user_id: string
          day: string
          time_zone?: string
          created_at?: string
        }
        Update: {
          user_id?: string
          day?: string
          time_zone?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'practice_days_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      // Migration 20261003000000_tree_fruit.sql. Players read their own rows; only the server writes.
      deck_practice_days: {
        Row: {
          user_id: string
          deck_id: string
          day: string
          created_at: string
        }
        Insert: {
          user_id: string
          deck_id: string
          day: string
          created_at?: string
        }
        Update: {
          user_id?: string
          deck_id?: string
          day?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'deck_practice_days_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'deck_practice_days_deck_id_fkey'
            columns: ['deck_id']
            isOneToOne: false
            referencedRelation: 'decks'
            referencedColumns: ['id']
          },
        ]
      }
      // Migration 20261003000000_tree_fruit.sql. Players read their own rows; only the server writes.
      tree_harvests: {
        Row: {
          user_id: string
          deck_id: string
          day: string
          coins: number
          created_at: string
        }
        Insert: {
          user_id: string
          deck_id: string
          day: string
          coins: number
          created_at?: string
        }
        Update: {
          user_id?: string
          deck_id?: string
          day?: string
          coins?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tree_harvests_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tree_harvests_deck_id_fkey'
            columns: ['deck_id']
            isOneToOne: false
            referencedRelation: 'decks'
            referencedColumns: ['id']
          },
        ]
      }
      // Migration 20260928000900_mind_tournament.sql. Players read their own rows; only
      // record_tournament_answer() (service role) writes.
      deck_tournament_participants: {
        Row: {
          id: string
          deck_id: string
          user_id: string
          current_points: number
          max_points: number
          mastery_percentage: number | null
          days_count: number
          is_graduated: boolean
          graduated_at: string | null
          last_practiced_date: string
          updated_at: string
        }
        Insert: {
          id?: string
          deck_id: string
          user_id: string
          current_points?: number
          max_points?: number
          days_count?: number
          is_graduated?: boolean
          graduated_at?: string | null
          last_practiced_date?: string
          updated_at?: string
        }
        Update: {
          id?: string
          deck_id?: string
          user_id?: string
          current_points?: number
          max_points?: number
          days_count?: number
          is_graduated?: boolean
          graduated_at?: string | null
          last_practiced_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'deck_tournament_participants_deck_id_fkey'
            columns: ['deck_id']
            isOneToOne: false
            referencedRelation: 'decks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'deck_tournament_participants_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      deck_tournament_item_progress: {
        Row: {
          id: string
          participant_id: string
          knowledge_item_id: string
          mastery_level: number
        }
        Insert: {
          id?: string
          participant_id: string
          knowledge_item_id: string
          mastery_level?: number
        }
        Update: {
          id?: string
          participant_id?: string
          knowledge_item_id?: string
          mastery_level?: number
        }
        Relationships: [
          {
            foreignKeyName: 'deck_tournament_item_progress_participant_id_fkey'
            columns: ['participant_id']
            isOneToOne: false
            referencedRelation: 'deck_tournament_participants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'deck_tournament_item_progress_knowledge_item_id_fkey'
            columns: ['knowledge_item_id']
            isOneToOne: false
            referencedRelation: 'knowledge_items'
            referencedColumns: ['id']
          },
        ]
      }
      // Migration 20260930000000_farm_grid.sql. Players read their farm (+ visitors: items and public
      // trees) and delete their own placements; purchase_and_place_item() is the only writer.
      garden_placements: {
        Row: {
          id: string
          user_id: string
          item_type: 'tree' | 'fence' | 'stream' | 'farmer_house' | 'woodshop' | 'rockery' | 'animal'
          deck_id: string | null
          grid_x: number
          grid_y: number
          width: number
          height: number
          variant: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          item_type: 'tree' | 'fence' | 'stream' | 'farmer_house' | 'woodshop' | 'rockery' | 'animal'
          deck_id?: string | null
          grid_x: number
          grid_y: number
          width?: number
          height?: number
          variant?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          item_type?: 'tree' | 'fence' | 'stream' | 'farmer_house' | 'woodshop' | 'rockery' | 'animal'
          deck_id?: string | null
          grid_x?: number
          grid_y?: number
          width?: number
          height?: number
          variant?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'garden_placements_deck_id_fkey'
            columns: ['deck_id']
            isOneToOne: false
            referencedRelation: 'decks'
            referencedColumns: ['id']
          },
        ]
      }
      // Migration 20260928000800_tree_visits.sql. Players read their own rows; record_tree_visit() writes.
      tree_visits: {
        Row: {
          user_id: string
          deck_id: string
          visited_at: string
        }
        Insert: {
          user_id: string
          deck_id: string
          visited_at?: string
        }
        Update: {
          user_id?: string
          deck_id?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tree_visits_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tree_visits_deck_id_fkey'
            columns: ['deck_id']
            isOneToOne: false
            referencedRelation: 'decks'
            referencedColumns: ['id']
          },
        ]
      }
      user_progress: {
        Row: {
          id: string
          user_id: string
          knowledge_item_id: string
          mastery_level: number
          mistake_count: number
          last_practiced_at: string | null
          coin_awarded_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          knowledge_item_id: string
          mastery_level?: number
          mistake_count?: number
          last_practiced_at?: string | null
          coin_awarded_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          knowledge_item_id?: string
          mastery_level?: number
          mistake_count?: number
          last_practiced_at?: string | null
          coin_awarded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'user_progress_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_progress_knowledge_item_id_fkey'
            columns: ['knowledge_item_id']
            isOneToOne: false
            referencedRelation: 'knowledge_items'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      // Migration 20260928000300_user_coins.sql. Service role only.
      // Migration 20261003000000_tree_fruit.sql. Service role only: pays FRUIT_COINS once per tree per day.
      harvest_tree_fruit: {
        Args: { p_user_id: string; p_deck_id: string; p_today: string }
        Returns: { coins_earned: number; total_coins: number }[]
      }
      award_mastery_coin: {
        Args: { p_user_id: string; p_item_id: string }
        Returns: { coins_earned: number; total_coins: number }[]
      }
      // Migration 20260928000500_seed_economy.sql. Runs as the caller (auth.uid()); charges 100 🪙.
      plant_deck: {
        Args: { p_title: string; p_slug: string; p_description: string | null; p_is_public: boolean; p_tree_type: string }
        Returns: { deck_id: string; remaining_coins: number }[]
      }
      // Migration 20260928000600: the caller's profile row (created with 300 🪙 if missing) → balance.
      ensure_user_profile: {
        Args: Record<string, never>
        Returns: number
      }
      // Migration 20260928000700: deep-copy another gardener's public tree for min(100 + n, 150) 🪙.
      clone_deck: {
        Args: { p_source_deck_id: string; p_slug: string }
        Returns: { deck_id: string; remaining_coins: number; cost: number }[]
      }
      // Migration 20260928000800: save/refresh the caller's visit to someone else's public tree.
      record_tree_visit: {
        Args: { p_deck_id: string }
        Returns: boolean
      }
      // Migration 20260928000900 (service role only): one graded tournament answer.
      record_tournament_answer: {
        Args: {
          p_user_id: string
          p_deck_id: string
          p_item_id: string
          p_is_correct: boolean
          p_day: string
          p_drillable_item_ids: string[]
        }
        Returns: {
          mastery_level: number
          previous_level: number
          current_points: number
          max_points: number
          mastery_percentage: number | null
          days_count: number
          is_graduated: boolean
          just_graduated: boolean
        }[]
      }
      // Migration 20260928000900: public boards of a readable tree (no emails).
      get_tournament_active_board: {
        Args: { p_deck_id: string }
        Returns: {
          rank: number
          user_id: string
          display_name: string | null
          current_points: number
          max_points: number
          mastery_percentage: number | null
          days_count: number
          updated_at: string
        }[]
      }
      get_tournament_hall_of_fame: {
        Args: { p_deck_id: string }
        Returns: {
          rank: number
          user_id: string
          display_name: string | null
          max_points: number
          days_count: number
          graduated_at: string
        }[]
      }
      // Migration 20260928001000: chosen display names by id (never emails or full names).
      get_display_names: {
        Args: { p_user_ids: string[] }
        Returns: { user_id: string; display_name: string }[]
      }
      // Migration 20260930000000: buy (or plant, free) and place one farm item; price + size from the catalogue.
      purchase_and_place_item: {
        Args: { p_item_type: string; p_x: number; p_y: number; p_deck_id?: string | null; p_variant?: string | null }
        Returns: { placement_id: string; remaining_coins: number; cost: number }[]
      }
      // Migration 20261002000000: move one of your placements (owner, bounds and overlaps checked).
      move_garden_placement: {
        Args: { p_placement_id: string; p_new_x: number; p_new_y: number }
        Returns: { placement_id: string; grid_x: number; grid_y: number }[]
      }
      // Migration 20260930000000: chop (delete) a tree, with the Woodshop refund.
      uproot_deck: {
        Args: { p_deck_id: string }
        Returns: { deck_id: string; refund: number; total_coins: number }[]
      }
      // Service role only: test top-ups (Coin Shop dev mode).
      dev_grant_coins: {
        Args: { p_user_id: string; p_amount: number }
        Returns: number
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

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']

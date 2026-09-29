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

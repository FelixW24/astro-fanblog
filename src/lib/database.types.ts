
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "article_notification_preferences": {
                  Row: {
                    "category": string,"email_enabled": boolean,"in_app_enabled": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"email_enabled"?: boolean,"in_app_enabled"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "category"?: string,"email_enabled"?: boolean,"in_app_enabled"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "article_notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "reader_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"article_views": {
                  Row: {
                    "article_id": number,"id": number,"viewed_at": string,"visitor_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "article_id": number,"id"?: never,"viewed_at"?: string,"visitor_key": string
                  }
                  Update: {
                    "article_id"?: number,"id"?: never,"viewed_at"?: string,"visitor_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "article_views_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "articles"
      referencedColumns: ["id"]
    }
                  ]
                },"articles": {
                  Row: {
                    "author": string,"category": string,"content": string,"cover_disabled": boolean,"cover_image_alt": string | null,"cover_image_url": string | null,"created_at": string,"excerpt": string,"id": number,"is_featured": boolean,"published_at": string | null,"read_minutes": number,"seo_description": string | null,"seo_title": string | null,"slug": string,"source_urls": (string)[],"status": string,"tags": (string)[],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author"?: string,"category": string,"content": string,"cover_disabled"?: boolean,"cover_image_alt"?: string | null,"cover_image_url"?: string | null,"created_at"?: string,"excerpt": string,"id"?: never,"is_featured"?: boolean,"published_at"?: string | null,"read_minutes"?: number,"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"source_urls"?: (string)[],"status"?: string,"tags"?: (string)[],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "author"?: string,"category"?: string,"content"?: string,"cover_disabled"?: boolean,"cover_image_alt"?: string | null,"cover_image_url"?: string | null,"created_at"?: string,"excerpt"?: string,"id"?: never,"is_featured"?: boolean,"published_at"?: string | null,"read_minutes"?: number,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"source_urls"?: (string)[],"status"?: string,"tags"?: (string)[],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"comment_bans": {
                  Row: {
                    "blocked_until": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_until": string,"user_id": string
                  }
                  Update: {
                    "blocked_until"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comment_bans_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "reader_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"comment_blocklist": {
                  Row: {
                    "created_at": string,"id": number,"term": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"term": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"term"?: string
                  }
                  Relationships: [
                    
                  ]
                },"comment_moderation_log": {
                  Row: {
                    "blocked_until": string | null,"comment_id": number,"created_at": string,"decision": string,"id": number,"moderator_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_until"?: string | null,"comment_id": number,"created_at"?: string,"decision": string,"id"?: never,"moderator_id"?: string | null
                  }
                  Update: {
                    "blocked_until"?: string | null,"comment_id"?: number,"created_at"?: string,"decision"?: string,"id"?: never,"moderator_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "comment_moderation_log_comment_id_fkey"
      columns: ["comment_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id"]
    }
                  ]
                },"comment_votes": {
                  Row: {
                    "comment_id": number,"user_id": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "comment_id": number,"user_id": string,"value": number
                  }
                  Update: {
                    "comment_id"?: number,"user_id"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "comment_votes_comment_id_fkey"
      columns: ["comment_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comment_votes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "reader_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "article_id": number,"body": string,"created_at": string,"id": number,"parent_id": number | null,"status": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "article_id": number,"body": string,"created_at"?: string,"id"?: never,"parent_id"?: number | null,"status"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "article_id"?: number,"body"?: string,"created_at"?: string,"id"?: never,"parent_id"?: number | null,"status"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "articles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_parent_id_article_id_fkey"
      columns: ["parent_id","article_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id","article_id"]
    },{
      foreignKeyName: "comments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "reader_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"loans": {
                  Row: {
                    "created_at": string,"direction": string,"ends_on": string | null,"id": number,"note": string | null,"partner_club": string,"player_id": number,"source_url": string | null,"starts_on": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"direction": string,"ends_on"?: string | null,"id"?: never,"note"?: string | null,"partner_club": string,"player_id": number,"source_url"?: string | null,"starts_on": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"direction"?: string,"ends_on"?: string | null,"id"?: never,"note"?: string | null,"partner_club"?: string,"player_id"?: number,"source_url"?: string | null,"starts_on"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "loans_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"matches": {
                  Row: {
                    "away_goals": number | null,"cancelled": boolean,"corners_against": number | null,"corners_for": number | null,"fouls_against": number | null,"fouls_for": number | null,"home_goals": number | null,"id": number,"is_home": boolean,"kickoff_at": string | null,"matchcenter_url": string | null,"opponent": string,"opponent_short": string,"possession_pct": number | null,"red_cards_against": number | null,"red_cards_for": number | null,"shots_against": number | null,"shots_for": number | null,"shots_on_target_against": number | null,"shots_on_target_for": number | null,"venue": string,"xg_against": number | null,"xg_for": number | null,"yellow_cards_against": number | null,"yellow_cards_for": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "away_goals"?: number | null,"cancelled"?: boolean,"corners_against"?: number | null,"corners_for"?: number | null,"fouls_against"?: number | null,"fouls_for"?: number | null,"home_goals"?: number | null,"id"?: never,"is_home"?: boolean,"kickoff_at"?: string | null,"matchcenter_url"?: string | null,"opponent": string,"opponent_short": string,"possession_pct"?: number | null,"red_cards_against"?: number | null,"red_cards_for"?: number | null,"shots_against"?: number | null,"shots_for"?: number | null,"shots_on_target_against"?: number | null,"shots_on_target_for"?: number | null,"venue": string,"xg_against"?: number | null,"xg_for"?: number | null,"yellow_cards_against"?: number | null,"yellow_cards_for"?: number | null
                  }
                  Update: {
                    "away_goals"?: number | null,"cancelled"?: boolean,"corners_against"?: number | null,"corners_for"?: number | null,"fouls_against"?: number | null,"fouls_for"?: number | null,"home_goals"?: number | null,"id"?: never,"is_home"?: boolean,"kickoff_at"?: string | null,"matchcenter_url"?: string | null,"opponent"?: string,"opponent_short"?: string,"possession_pct"?: number | null,"red_cards_against"?: number | null,"red_cards_for"?: number | null,"shots_against"?: number | null,"shots_for"?: number | null,"shots_on_target_against"?: number | null,"shots_on_target_for"?: number | null,"venue"?: string,"xg_against"?: number | null,"xg_for"?: number | null,"yellow_cards_against"?: number | null,"yellow_cards_for"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"newsletter_settings": {
                  Row: {
                    "email_label": string,"email_placeholder": string,"heading": string,"id": boolean,"intro": string,"modal_enabled": boolean,"newsletter_enabled": boolean,"privacy_note": string,"submit_label": string,"success_message": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email_label"?: string,"email_placeholder"?: string,"heading"?: string,"id"?: boolean,"intro"?: string,"modal_enabled"?: boolean,"newsletter_enabled"?: boolean,"privacy_note"?: string,"submit_label"?: string,"success_message"?: string,"updated_at"?: string
                  }
                  Update: {
                    "email_label"?: string,"email_placeholder"?: string,"heading"?: string,"id"?: boolean,"intro"?: string,"modal_enabled"?: boolean,"newsletter_enabled"?: boolean,"privacy_note"?: string,"submit_label"?: string,"success_message"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"newsletter_subscribers": {
                  Row: {
                    "confirmed_at": string | null,"consent_text": string,"created_at": string,"email": string,"id": string,"status": string,"unsubscribed_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_at"?: string | null,"consent_text"?: string,"created_at"?: string,"email": string,"id"?: string,"status"?: string,"unsubscribed_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "confirmed_at"?: string | null,"consent_text"?: string,"created_at"?: string,"email"?: string,"id"?: string,"status"?: string,"unsubscribed_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "article_id": number,"category": string,"created_at": string,"id": number,"read_at": string | null,"slug": string,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "article_id": number,"category": string,"created_at"?: string,"id"?: never,"read_at"?: string | null,"slug": string,"title": string,"user_id": string
                  }
                  Update: {
                    "article_id"?: number,"category"?: string,"created_at"?: string,"id"?: never,"read_at"?: string | null,"slug"?: string,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "articles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "reader_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"page_views": {
                  Row: {
                    "id": number,"path": string,"viewed_at": string,"visitor_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"path": string,"viewed_at"?: string,"visitor_key": string
                  }
                  Update: {
                    "id"?: never,"path"?: string,"viewed_at"?: string,"visitor_key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"player_chart_templates": {
                  Row: {
                    "chart_type": string,"created_at": string,"id": string,"metric_labels": (string)[],"name": string,"position": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chart_type": string,"created_at"?: string,"id"?: string,"metric_labels": (string)[],"name": string,"position": string
                  }
                  Update: {
                    "chart_type"?: string,"created_at"?: string,"id"?: string,"metric_labels"?: (string)[],"name"?: string,"position"?: string
                  }
                  Relationships: [
                    
                  ]
                },"player_charts": {
                  Row: {
                    "chart_type": string,"created_at": string,"description": string | null,"id": number,"metrics": NonNullable<Json>,"player_id": number,"sort_order": number,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chart_type"?: string,"created_at"?: string,"description"?: string | null,"id"?: number,"metrics": NonNullable<Json>,"player_id": number,"sort_order"?: number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "chart_type"?: string,"created_at"?: string,"description"?: string | null,"id"?: number,"metrics"?: NonNullable<Json>,"player_id"?: number,"sort_order"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_charts_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"player_match_ratings": {
                  Row: {
                    "assists": number,"created_at": string,"goals": number,"id": number,"match_id": number,"minutes_played": number | null,"note": string | null,"player_id": number,"rating": string | null,"status": string,"sub_minute": number | null,"substituted_by_player_id": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assists"?: number,"created_at"?: string,"goals"?: number,"id"?: never,"match_id": number,"minutes_played"?: number | null,"note"?: string | null,"player_id": number,"rating"?: string | null,"status"?: string,"sub_minute"?: number | null,"substituted_by_player_id"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "assists"?: number,"created_at"?: string,"goals"?: number,"id"?: never,"match_id"?: number,"minutes_played"?: number | null,"note"?: string | null,"player_id"?: number,"rating"?: string | null,"status"?: string,"sub_minute"?: number | null,"substituted_by_player_id"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_match_ratings_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "player_match_ratings_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "player_match_ratings_substituted_by_player_id_fkey"
      columns: ["substituted_by_player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "bio": string | null,"contract_until": string | null,"created_at": string,"date_of_birth": string | null,"height_cm": number | null,"id": number,"injury_since": string | null,"injury_until": string | null,"is_injured": boolean,"joined_on": string | null,"market_value_eur": number | null,"name": string,"nationality": string | null,"position": string,"preferred_foot": string | null,"profile_image_alt": string | null,"profile_image_url": string | null,"profile_slogan": string,"shirt_number": number | null,"slug": string,"squad_status": string,"total_assists": number,"total_goals": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bio"?: string | null,"contract_until"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"height_cm"?: number | null,"id"?: never,"injury_since"?: string | null,"injury_until"?: string | null,"is_injured"?: boolean,"joined_on"?: string | null,"market_value_eur"?: number | null,"name": string,"nationality"?: string | null,"position": string,"preferred_foot"?: string | null,"profile_image_alt"?: string | null,"profile_image_url"?: string | null,"profile_slogan"?: string,"shirt_number"?: number | null,"slug": string,"squad_status"?: string,"total_assists"?: number,"total_goals"?: number,"updated_at"?: string
                  }
                  Update: {
                    "bio"?: string | null,"contract_until"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"height_cm"?: number | null,"id"?: never,"injury_since"?: string | null,"injury_until"?: string | null,"is_injured"?: boolean,"joined_on"?: string | null,"market_value_eur"?: number | null,"name"?: string,"nationality"?: string | null,"position"?: string,"preferred_foot"?: string | null,"profile_image_alt"?: string | null,"profile_image_url"?: string | null,"profile_slogan"?: string,"shirt_number"?: number | null,"slug"?: string,"squad_status"?: string,"total_assists"?: number,"total_goals"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reader_details": {
                  Row: {
                    "bio": string,"birth_date": string,"full_name": string,"id": string,"privacy_acknowledged_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bio"?: string,"birth_date": string,"full_name": string,"id": string,"privacy_acknowledged_at"?: string
                  }
                  Update: {
                    "bio"?: string,"birth_date"?: string,"full_name"?: string,"id"?: string,"privacy_acknowledged_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reader_details_id_fkey"
      columns: ["id"]
isOneToOne: true
      referencedRelation: "reader_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reader_profiles": {
                  Row: {
                    "avatar": string,"avatar_url": string | null,"id": string,"is_ghost": boolean,"username": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar": string,"avatar_url"?: string | null,"id": string,"is_ghost"?: boolean,"username": string
                  }
                  Update: {
                    "avatar"?: string,"avatar_url"?: string | null,"id"?: string,"is_ghost"?: boolean,"username"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reserved_username_patterns": {
                  Row: {
                    "created_at": string,"id": string,"pattern": string,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"pattern": string,"reason"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"pattern"?: string,"reason"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"reserved_usernames": {
                  Row: {
                    "created_at": string,"id": string,"reason": string | null,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"reason"?: string | null,"value": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"reason"?: string | null,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "check_username":
{ Args: { "p_username": string }; Returns: boolean
                           },
"comment_scores":
{ Args: { "target_article": number }; Returns: {
              "comment_id": number,"dislikes": number,"likes": number
            }[]
                           },
"complete_reader_profile":
{ Args: { "p_avatar": string,"p_avatar_url"?: string,"p_birth_date": string,"p_full_name": string,"p_username": string }; Returns: undefined
                           },
"create_player_profile":
{ Args: { "p_chart": Json,"p_player": Json }; Returns: number
                           },
"create_player_profile_with_availability":
{ Args: { "p_chart": Json,"p_player": Json }; Returns: number
                           },
"is_reserved_username":
{ Args: { "p_username": string }; Returns: boolean
                           },
"moderate_comment":
{ Args: { "ban_hours"?: number,"decision": string,"target_comment": number }; Returns: undefined
                           },
"reader_profile_card":
{ Args: { "p_user_id": string }; Returns: {
              "avatar_url": string,"bio": string,"comment_count": number,"member_since": string,"username": string
            }[]
                           },
"set_reader_avatar_url":
{ Args: { "p_avatar_url"?: string }; Returns: undefined
                           },
"submit_comment":
{ Args: { "comment_body": string,"parent_comment"?: number,"target_article": number }; Returns: {
              "id": number,"status": string
            }[]
                           },
"update_reader_profile":
{ Args: { "p_bio"?: string,"p_birth_date": string,"p_full_name": string,"p_username": string }; Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const

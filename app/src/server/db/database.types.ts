
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "app_user": {
                  Row: {
                    "auth_user_id": string | null,"created_at": string,"email": string,"id": string,"ipad_input_mode": string | null,"language": string,"name": string | null,"role_preset": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_user_id"?: string | null,"created_at"?: string,"email": string,"id"?: string,"ipad_input_mode"?: string | null,"language"?: string,"name"?: string | null,"role_preset"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "auth_user_id"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"ipad_input_mode"?: string | null,"language"?: string,"name"?: string | null,"role_preset"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"job": {
                  Row: {
                    "attempts": number,"created_at": string,"created_by": string | null,"error": string | null,"finished_at": string | null,"id": string,"kind": string,"lease_expires_at": string | null,"max_attempts": number,"payload": NonNullable<Json>,"progress": number,"project_id": string | null,"result": Json | null,"run_after": string,"run_id": string | null,"started_at": string | null,"state": Json | null,"status": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"created_by"?: string | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"kind": string,"lease_expires_at"?: string | null,"max_attempts": number,"payload"?: NonNullable<Json>,"progress"?: number,"project_id"?: string | null,"result"?: Json | null,"run_after"?: string,"run_id"?: string | null,"started_at"?: string | null,"state"?: Json | null,"status"?: string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"created_by"?: string | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"kind"?: string,"lease_expires_at"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"progress"?: number,"project_id"?: string | null,"result"?: Json | null,"run_after"?: string,"run_id"?: string | null,"started_at"?: string | null,"state"?: Json | null,"status"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "job_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"membership": {
                  Row: {
                    "created_at": string,"id": string,"invited_at": string | null,"last_active_at": string | null,"scope": string,"status": string,"tenant_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"invited_at"?: string | null,"last_active_at"?: string | null,"scope": string,"status": string,"tenant_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"invited_at"?: string | null,"last_active_at"?: string | null,"scope"?: string,"status"?: string,"tenant_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membership_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    }
                  ]
                },"membership_project": {
                  Row: {
                    "created_at": string,"membership_id": string,"project_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"membership_id": string,"project_id": string,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"membership_id"?: string,"project_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_project_membership_id_tenant_id_fkey"
      columns: ["membership_id","tenant_id"]
isOneToOne: false
      referencedRelation: "membership"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "membership_project_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "membership_project_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"project": {
                  Row: {
                    "address": string,"archived_at": string | null,"client_name": string | null,"code_edition": string | null,"created_at": string,"ezbinder_job_id": string | null,"ezbinder_job_no": string | null,"id": string,"name": string,"open_items_count": number,"phase_default": string | null,"property_record_id": string | null,"scope_of_work": string | null,"settings": NonNullable<Json>,"status": string,"submittal_profile_id": string | null,"tenant_id": string,"thumbnail_path": string | null,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address": string,"archived_at"?: string | null,"client_name"?: string | null,"code_edition"?: string | null,"created_at"?: string,"ezbinder_job_id"?: string | null,"ezbinder_job_no"?: string | null,"id"?: string,"name": string,"open_items_count"?: number,"phase_default"?: string | null,"property_record_id"?: string | null,"scope_of_work"?: string | null,"settings"?: NonNullable<Json>,"status"?: string,"submittal_profile_id"?: string | null,"tenant_id": string,"thumbnail_path"?: string | null,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string,"archived_at"?: string | null,"client_name"?: string | null,"code_edition"?: string | null,"created_at"?: string,"ezbinder_job_id"?: string | null,"ezbinder_job_no"?: string | null,"id"?: string,"name"?: string,"open_items_count"?: number,"phase_default"?: string | null,"property_record_id"?: string | null,"scope_of_work"?: string | null,"settings"?: NonNullable<Json>,"status"?: string,"submittal_profile_id"?: string | null,"tenant_id"?: string,"thumbnail_path"?: string | null,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant": {
                  Row: {
                    "code_edition": string | null,"contact": NonNullable<Json>,"created_at": string,"defaults": NonNullable<Json>,"id": string,"license_no": string | null,"logo_path": string | null,"name": string,"title_block": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code_edition"?: string | null,"contact"?: NonNullable<Json>,"created_at"?: string,"defaults"?: NonNullable<Json>,"id"?: string,"license_no"?: string | null,"logo_path"?: string | null,"name": string,"title_block"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "code_edition"?: string | null,"contact"?: NonNullable<Json>,"created_at"?: string,"defaults"?: NonNullable<Json>,"id"?: string,"license_no"?: string | null,"logo_path"?: string | null,"name"?: string,"title_block"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "current_app_user_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"enqueue_job":
{ Args: { "p_kind": string,"p_max_attempts": number,"p_payload": Json,"p_project_id": string,"p_run_after"?: string }; Returns: string
                           },
"health":
{ Args: Record<PropertyKey, never>; Returns: {
              "schema_version": string,"status": string
            }[]
                           },
"job_claim":
{ Args: { "p_lease_seconds": number,"p_only_tenant"?: string,"p_run_id": string }; Returns: {
              "attempts": number,
"created_at": string,
"created_by": string | null,
"error": string | null,
"finished_at": string | null,
"id": string,
"kind": string,
"lease_expires_at": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"progress": number,
"project_id": string | null,
"result": Json | null,
"run_after": string,
"run_id": string | null,
"started_at": string | null,
"state": Json | null,
"status": string,
"tenant_id": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "job"
        isOneToOne: false
        isSetofReturn: true
      } },
"job_complete":
{ Args: { "p_job_id": string,"p_result": Json,"p_run_id": string }; Returns: boolean
                           },
"job_continue":
{ Args: { "p_job_id": string,"p_run_id": string,"p_state": Json }; Returns: boolean
                           },
"job_fail":
{ Args: { "p_error": string,"p_job_id": string,"p_retry_after_ms": number,"p_run_id": string }; Returns: boolean
                           },
"job_fail_expired":
{ Args: { "p_only_tenant"?: string }; Returns: {
              "attempts": number,
"created_at": string,
"created_by": string | null,
"error": string | null,
"finished_at": string | null,
"id": string,
"kind": string,
"lease_expires_at": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"progress": number,
"project_id": string | null,
"result": Json | null,
"run_after": string,
"run_id": string | null,
"started_at": string | null,
"state": Json | null,
"status": string,
"tenant_id": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "job"
        isOneToOne: false
        isSetofReturn: true
      } },
"job_progress":
{ Args: { "p_job_id": string,"p_progress": number,"p_run_id": string }; Returns: boolean
                           },
"link_app_user":
{ Args: Record<PropertyKey, never>; Returns: {
              "accepted_membership_id": string,"accepted_tenant_id": string,"app_user_id": string,"has_access": boolean
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

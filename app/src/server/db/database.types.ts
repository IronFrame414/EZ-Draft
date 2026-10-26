
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
                },"backup_run": {
                  Row: {
                    "bytes_copied": number,"created_at": string,"error": string | null,"files_cursor": string | null,"finished_at": string | null,"id": string,"kind": string,"location": string | null,"objects_copied": number,"objects_hidden": number,"objects_skipped": number,"scope": string,"started_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes_copied"?: number,"created_at"?: string,"error"?: string | null,"files_cursor"?: string | null,"finished_at"?: string | null,"id"?: string,"kind": string,"location"?: string | null,"objects_copied"?: number,"objects_hidden"?: number,"objects_skipped"?: number,"scope"?: string,"started_at"?: string,"status"?: string
                  }
                  Update: {
                    "bytes_copied"?: number,"created_at"?: string,"error"?: string | null,"files_cursor"?: string | null,"finished_at"?: string | null,"id"?: string,"kind"?: string,"location"?: string | null,"objects_copied"?: number,"objects_hidden"?: number,"objects_skipped"?: number,"scope"?: string,"started_at"?: string,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"customer": {
                  Row: {
                    "address": string | null,"archived_at": string | null,"created_at": string,"email": string,"id": string,"name": string,"phone": string | null,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"archived_at"?: string | null,"created_at"?: string,"email": string,"id"?: string,"name": string,"phone"?: string | null,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"archived_at"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"name"?: string,"phone"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"error_alert": {
                  Row: {
                    "email_claim": string | null,"emailed_at": string | null,"fingerprint": string,"first_seen_at": string,"id": string,"kind": string,"last_seen_at": string,"occurrences": number,"project_id": string | null,"ref": string | null,"source": string,"tenant_id": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email_claim"?: string | null,"emailed_at"?: string | null,"fingerprint": string,"first_seen_at"?: string,"id"?: string,"kind": string,"last_seen_at"?: string,"occurrences"?: number,"project_id"?: string | null,"ref"?: string | null,"source": string,"tenant_id"?: string | null,"title": string
                  }
                  Update: {
                    "email_claim"?: string | null,"emailed_at"?: string | null,"fingerprint"?: string,"first_seen_at"?: string,"id"?: string,"kind"?: string,"last_seen_at"?: string,"occurrences"?: number,"project_id"?: string | null,"ref"?: string | null,"source"?: string,"tenant_id"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "error_alert_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "error_alert_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"error_tunnel_throttle": {
                  Row: {
                    "at": string,"id": string,"key_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"id"?: string,"key_hash": string
                  }
                  Update: {
                    "at"?: string,"id"?: string,"key_hash"?: string
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
                    "created_at": string,"id": string,"invited_at": string | null,"last_active_at": string | null,"role_id": string | null,"scope": string,"status": string,"tenant_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"invited_at"?: string | null,"last_active_at"?: string | null,"role_id"?: string | null,"scope": string,"status": string,"tenant_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"invited_at"?: string | null,"last_active_at"?: string | null,"role_id"?: string | null,"scope"?: string,"status"?: string,"tenant_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_role_id_fkey"
      columns: ["role_id","tenant_id"]
isOneToOne: false
      referencedRelation: "role"
      referencedColumns: ["id","tenant_id"]
    },{
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
                    "address": string,"archived_at": string | null,"client_name": string | null,"code_edition": string | null,"created_at": string,"customer_id": string | null,"ezbinder_job_id": string | null,"ezbinder_job_no": string | null,"id": string,"name": string,"open_items_count": number,"phase_default": string | null,"property_record_id": string | null,"scope_of_work": string | null,"settings": NonNullable<Json>,"status": string,"submittal_profile_id": string | null,"tenant_id": string,"thumbnail_path": string | null,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address": string,"archived_at"?: string | null,"client_name"?: string | null,"code_edition"?: string | null,"created_at"?: string,"customer_id"?: string | null,"ezbinder_job_id"?: string | null,"ezbinder_job_no"?: string | null,"id"?: string,"name": string,"open_items_count"?: number,"phase_default"?: string | null,"property_record_id"?: string | null,"scope_of_work"?: string | null,"settings"?: NonNullable<Json>,"status"?: string,"submittal_profile_id"?: string | null,"tenant_id": string,"thumbnail_path"?: string | null,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string,"archived_at"?: string | null,"client_name"?: string | null,"code_edition"?: string | null,"created_at"?: string,"customer_id"?: string | null,"ezbinder_job_id"?: string | null,"ezbinder_job_no"?: string | null,"id"?: string,"name"?: string,"open_items_count"?: number,"phase_default"?: string | null,"property_record_id"?: string | null,"scope_of_work"?: string | null,"settings"?: NonNullable<Json>,"status"?: string,"submittal_profile_id"?: string | null,"tenant_id"?: string,"thumbnail_path"?: string | null,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_customer_fk"
      columns: ["customer_id","tenant_id"]
isOneToOne: false
      referencedRelation: "customer"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "project_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"role": {
                  Row: {
                    "created_at": string,"default_permissions": (string)[],"id": string,"name": string,"preset": string | null,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_permissions"?: (string)[],"id"?: string,"name": string,"preset"?: string | null,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_permissions"?: (string)[],"id"?: string,"name"?: string,"preset"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"sign_in_throttle": {
                  Row: {
                    "at": string,"failed": boolean,"id": string,"key_hash": string,"kind": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"failed"?: boolean,"id"?: string,"key_hash": string,"kind": string
                  }
                  Update: {
                    "at"?: string,"failed"?: boolean,"id"?: string,"key_hash"?: string,"kind"?: string
                  }
                  Relationships: [
                    
                  ]
                },"source_file": {
                  Row: {
                    "content_type": string,"created_at": string,"id": string,"kind": string,"original_name": string,"project_id": string,"scale_calibration": Json | null,"size_bytes": number,"storage_path": string,"supplier_contact_email": string | null,"supplier_name": string | null,"tenant_id": string,"uploaded_at": string | null,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content_type": string,"created_at"?: string,"id"?: string,"kind": string,"original_name": string,"project_id": string,"scale_calibration"?: Json | null,"size_bytes": number,"storage_path": string,"supplier_contact_email"?: string | null,"supplier_name"?: string | null,"tenant_id": string,"uploaded_at"?: string | null,"uploaded_by"?: string | null
                  }
                  Update: {
                    "content_type"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"original_name"?: string,"project_id"?: string,"scale_calibration"?: Json | null,"size_bytes"?: number,"storage_path"?: string,"supplier_contact_email"?: string | null,"supplier_name"?: string | null,"tenant_id"?: string,"uploaded_at"?: string | null,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_file_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "source_file_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_file_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "app_user"
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
                },"user_permission": {
                  Row: {
                    "granted": boolean,"membership_id": string,"permission_key": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted": boolean,"membership_id": string,"permission_key": string,"tenant_id": string
                  }
                  Update: {
                    "granted"?: boolean,"membership_id"?: string,"permission_key"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_permission_membership_id_tenant_id_fkey"
      columns: ["membership_id","tenant_id"]
isOneToOne: false
      referencedRelation: "membership"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "user_permission_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
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
"current_permissions":
{ Args: Record<PropertyKey, never>; Returns: {
              "listed_project_ids": (string)[],"membership_id": string,"permission_keys": (string)[],"project_scope": string
            }[]
                           },
"enqueue_job":
{ Args: { "p_kind": string,"p_max_attempts": number,"p_payload": Json,"p_project_id": string,"p_run_after"?: string }; Returns: string
                           },
"error_tunnel_take":
{ Args: { "p_events": number,"p_ip_key": string }; Returns: boolean
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
                           },
"list_customers":
{ Args: { "p_archived": boolean,"p_page": number,"p_search": string }; Returns: Json
                           },
"record_error_alert":
{ Args: { "p_fingerprint": string,"p_kind": string,"p_project_id": string,"p_ref": string,"p_source": string,"p_tenant_id": string,"p_title": string }; Returns: {
              "alert_id": string,"capped": boolean,"email_claim": string,"is_new": boolean
            }[]
                           },
"release_error_alert_email":
{ Args: { "p_alert_id": string,"p_claim": string }; Returns: boolean
                           },
"sign_in_throttle_settle":
{ Args: { "p_attempt_id": string,"p_ip_attempt_id": string }; Returns: undefined
                           },
"sign_in_throttle_take":
{ Args: { "p_email_key": string,"p_ip_key": string,"p_kind": string }; Returns: {
              "allowed": boolean,"attempt_id": string,"ip_attempt_id": string,"limited_by": string
            }[]
                           },
"update_tenant_identity":
{ Args: { "p_contact": Json,"p_license_no": string,"p_logo_path": string,"p_name": string,"p_set_logo": boolean }; Returns: {
              "changed": (string)[],"tenant_contact": Json,"tenant_id": string,"tenant_license_no": string,"tenant_logo_path": string,"tenant_name": string,"tenant_updated_at": string
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

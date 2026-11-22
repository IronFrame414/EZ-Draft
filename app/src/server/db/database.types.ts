
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_assistant_slot": {
                  Row: {
                    "app_user_id": string,"finished_at": string | null,"id": string,"started_at": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_user_id": string,"finished_at"?: string | null,"id"?: string,"started_at"?: string,"tenant_id": string
                  }
                  Update: {
                    "app_user_id"?: string,"finished_at"?: string | null,"id"?: string,"started_at"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_assistant_slot_app_user_id_fkey"
      columns: ["app_user_id"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_assistant_slot_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_key_attempt": {
                  Row: {
                    "app_user_id": string,"at": string,"id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_user_id": string,"at"?: string,"id"?: string,"tenant_id": string
                  }
                  Update: {
                    "app_user_id"?: string,"at"?: string,"id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_key_attempt_app_user_id_fkey"
      columns: ["app_user_id"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_key_attempt_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage": {
                  Row: {
                    "app_user_id": string,"cost_usd": number,"created_at": string,"id": string,"model": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_user_id": string,"cost_usd": number,"created_at"?: string,"id"?: string,"model": string,"tenant_id": string
                  }
                  Update: {
                    "app_user_id"?: string,"cost_usd"?: number,"created_at"?: string,"id"?: string,"model"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_app_user_id_fkey"
      columns: ["app_user_id"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_usage_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"app_user": {
                  Row: {
                    "auth_user_id": string | null,"created_at": string,"email": string,"id": string,"ipad_input_mode": string | null,"language": string,"name": string | null,"rail_order": (string)[],"role_preset": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_user_id"?: string | null,"created_at"?: string,"email": string,"id"?: string,"ipad_input_mode"?: string | null,"language"?: string,"name"?: string | null,"rail_order"?: (string)[],"role_preset"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "auth_user_id"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"ipad_input_mode"?: string | null,"language"?: string,"name"?: string | null,"rail_order"?: (string)[],"role_preset"?: string | null,"updated_at"?: string
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
                },"benchmark_run": {
                  Row: {
                    "app_version": string,"created_by": string | null,"device": NonNullable<Json>,"id": string,"results": NonNullable<Json>,"run_at": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_version": string,"created_by"?: string | null,"device": NonNullable<Json>,"id"?: string,"results": NonNullable<Json>,"run_at"?: string,"tenant_id": string
                  }
                  Update: {
                    "app_version"?: string,"created_by"?: string | null,"device"?: NonNullable<Json>,"id"?: string,"results"?: NonNullable<Json>,"run_at"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "benchmark_run_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "benchmark_run_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_item": {
                  Row: {
                    "ai_confidence": NonNullable<Json>,"allowance_category": string | null,"brand": string | null,"category": string,"created_at": string,"depth": number | null,"finish": string | null,"height": number | null,"id": string,"install_specs": NonNullable<Json>,"is_standard_spec": boolean,"lead_time_days": number | null,"lead_time_text": string | null,"line": string | null,"markup_pct": number | null,"model": string | null,"name": string,"project_id": string | null,"sell_price": number | null,"sku": string | null,"source_url": string | null,"spec_sheet_path": string | null,"subcategory": string | null,"supplier": string | null,"tenant_id": string,"texture_path": string | null,"thumb_path": string | null,"unit_cost": number | null,"updated_at": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_confidence"?: NonNullable<Json>,"allowance_category"?: string | null,"brand"?: string | null,"category": string,"created_at"?: string,"depth"?: number | null,"finish"?: string | null,"height"?: number | null,"id"?: string,"install_specs"?: NonNullable<Json>,"is_standard_spec"?: boolean,"lead_time_days"?: number | null,"lead_time_text"?: string | null,"line"?: string | null,"markup_pct"?: number | null,"model"?: string | null,"name": string,"project_id"?: string | null,"sell_price"?: number | null,"sku"?: string | null,"source_url"?: string | null,"spec_sheet_path"?: string | null,"subcategory"?: string | null,"supplier"?: string | null,"tenant_id": string,"texture_path"?: string | null,"thumb_path"?: string | null,"unit_cost"?: number | null,"updated_at"?: string,"width"?: number | null
                  }
                  Update: {
                    "ai_confidence"?: NonNullable<Json>,"allowance_category"?: string | null,"brand"?: string | null,"category"?: string,"created_at"?: string,"depth"?: number | null,"finish"?: string | null,"height"?: number | null,"id"?: string,"install_specs"?: NonNullable<Json>,"is_standard_spec"?: boolean,"lead_time_days"?: number | null,"lead_time_text"?: string | null,"line"?: string | null,"markup_pct"?: number | null,"model"?: string | null,"name"?: string,"project_id"?: string | null,"sell_price"?: number | null,"sku"?: string | null,"source_url"?: string | null,"spec_sheet_path"?: string | null,"subcategory"?: string | null,"supplier"?: string | null,"tenant_id"?: string,"texture_path"?: string | null,"thumb_path"?: string | null,"unit_cost"?: number | null,"updated_at"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_item_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "catalog_item_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
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
                },"design_option_cost_line": {
                  Row: {
                    "created_at": string,"id": string,"item": string,"option_id": string,"project_id": string,"qty": number,"sort": number,"tenant_id": string,"unit_cost": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"item": string,"option_id": string,"project_id": string,"qty": number,"sort"?: number,"tenant_id": string,"unit_cost": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item"?: string,"option_id"?: string,"project_id"?: string,"qty"?: number,"sort"?: number,"tenant_id"?: string,"unit_cost"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "design_option_cost_line_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "design_option_cost_line_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"edit_lock": {
                  Row: {
                    "device_id": string | null,"holder_app_user_id": string | null,"lock_epoch": number,"offline": boolean,"project_id": string,"since": string | null,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "device_id"?: string | null,"holder_app_user_id"?: string | null,"lock_epoch"?: number,"offline"?: boolean,"project_id": string,"since"?: string | null,"tenant_id": string
                  }
                  Update: {
                    "device_id"?: string | null,"holder_app_user_id"?: string | null,"lock_epoch"?: number,"offline"?: boolean,"project_id"?: string,"since"?: string | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "edit_lock_holder_app_user_id_fkey"
      columns: ["holder_app_user_id"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "edit_lock_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "edit_lock_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"edit_request": {
                  Row: {
                    "deadline_at": string,"id": string,"project_id": string,"requested_at": string,"requester_app_user_id": string,"responded_at": string | null,"response": string | null,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "deadline_at": string,"id"?: string,"project_id": string,"requested_at"?: string,"requester_app_user_id": string,"responded_at"?: string | null,"response"?: string | null,"tenant_id": string
                  }
                  Update: {
                    "deadline_at"?: string,"id"?: string,"project_id"?: string,"requested_at"?: string,"requester_app_user_id"?: string,"responded_at"?: string | null,"response"?: string | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "edit_request_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "edit_request_requester_app_user_id_fkey"
      columns: ["requester_app_user_id"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "edit_request_tenant_id_fkey"
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
                },"event_log": {
                  Row: {
                    "action": string,"actor_app_user_id": string | null,"actor_name": string | null,"at": string,"details": NonNullable<Json>,"id": string,"ip": unknown,"object_id": string,"object_type": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_app_user_id"?: string | null,"actor_name"?: string | null,"at"?: string,"details"?: NonNullable<Json>,"id"?: string,"ip"?: unknown,"object_id": string,"object_type": string,"tenant_id": string
                  }
                  Update: {
                    "action"?: string,"actor_app_user_id"?: string | null,"actor_name"?: string | null,"at"?: string,"details"?: NonNullable<Json>,"id"?: string,"ip"?: unknown,"object_id"?: string,"object_type"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_log_actor_app_user_id_fkey"
      columns: ["actor_app_user_id"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_log_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"field_measure_session": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"project_id": string,"rooms": NonNullable<Json>,"sent_at": string | null,"sent_by": string | null,"sent_change_id": string | null,"tenant_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"project_id": string,"rooms"?: NonNullable<Json>,"sent_at"?: string | null,"sent_by"?: string | null,"sent_change_id"?: string | null,"tenant_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"project_id"?: string,"rooms"?: NonNullable<Json>,"sent_at"?: string | null,"sent_by"?: string | null,"sent_change_id"?: string | null,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "field_measure_session_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "field_measure_session_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "field_measure_session_sent_by_fkey"
      columns: ["sent_by"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "field_measure_session_sent_change_id_fkey"
      columns: ["sent_change_id"]
isOneToOne: false
      referencedRelation: "offline_change"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "field_measure_session_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "field_measure_session_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    }
                  ]
                },"field_task": {
                  Row: {
                    "created_at": string,"done_at": string | null,"done_by": string | null,"id": string,"job_id": string | null,"linked_objects": NonNullable<Json>,"phase": string,"phase_position": number,"photos": NonNullable<Json>,"position": number,"project_id": string,"room": string,"room_id": string | null,"status": string,"tenant_id": string,"text_en": string,"text_es": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"done_at"?: string | null,"done_by"?: string | null,"id"?: string,"job_id"?: string | null,"linked_objects"?: NonNullable<Json>,"phase": string,"phase_position": number,"photos"?: NonNullable<Json>,"position": number,"project_id": string,"room"?: string,"room_id"?: string | null,"status"?: string,"tenant_id": string,"text_en": string,"text_es"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"done_at"?: string | null,"done_by"?: string | null,"id"?: string,"job_id"?: string | null,"linked_objects"?: NonNullable<Json>,"phase"?: string,"phase_position"?: number,"photos"?: NonNullable<Json>,"position"?: number,"project_id"?: string,"room"?: string,"room_id"?: string | null,"status"?: string,"tenant_id"?: string,"text_en"?: string,"text_es"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "field_task_done_by_fkey"
      columns: ["done_by"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "field_task_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "field_task_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "field_task_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"import_review_item": {
                  Row: {
                    "created_at": string,"decision": string | null,"fix": Json | null,"id": string,"item_id": string,"job_id": string,"project_id": string,"tenant_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decision"?: string | null,"fix"?: Json | null,"id"?: string,"item_id": string,"job_id": string,"project_id": string,"tenant_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"decision"?: string | null,"fix"?: Json | null,"id"?: string,"item_id"?: string,"job_id"?: string,"project_id"?: string,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_review_item_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_review_item_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "import_review_item_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_review_item_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    }
                  ]
                },"import_session": {
                  Row: {
                    "created_at": string,"error": string | null,"id": string,"items": NonNullable<Json>,"job_id": string | null,"mode": string,"project_id": string,"source_file_id": string,"source_kind": string,"status": string,"summary": NonNullable<Json>,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"id"?: string,"items"?: NonNullable<Json>,"job_id"?: string | null,"mode"?: string,"project_id": string,"source_file_id": string,"source_kind": string,"status"?: string,"summary"?: NonNullable<Json>,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"id"?: string,"items"?: NonNullable<Json>,"job_id"?: string | null,"mode"?: string,"project_id"?: string,"source_file_id"?: string,"source_kind"?: string,"status"?: string,"summary"?: NonNullable<Json>,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_session_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_session_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "import_session_source_file_id_fkey"
      columns: ["source_file_id"]
isOneToOne: false
      referencedRelation: "source_file"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_session_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"invite": {
                  Row: {
                    "accepted_at": string | null,"cancelled_at": string | null,"code_tries": number,"created_at": string,"created_by": string | null,"expires_at": string,"id": string,"membership_id": string,"secret": string,"sent_by": string | null,"tenant_id": string,"token_sha256": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"cancelled_at"?: string | null,"code_tries"?: number,"created_at"?: string,"created_by"?: string | null,"expires_at": string,"id"?: string,"membership_id": string,"secret": string,"sent_by"?: string | null,"tenant_id": string,"token_sha256": string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"cancelled_at"?: string | null,"code_tries"?: number,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"id"?: string,"membership_id"?: string,"secret"?: string,"sent_by"?: string | null,"tenant_id"?: string,"token_sha256"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invite_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invite_membership_id_tenant_id_fkey"
      columns: ["membership_id","tenant_id"]
isOneToOne: false
      referencedRelation: "membership"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "invite_sent_by_fkey"
      columns: ["sent_by"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invite_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
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
                },"library_item": {
                  Row: {
                    "created_at": string,"data": NonNullable<Json>,"id": string,"kind": string,"name": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind": string,"name": string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind"?: string,"name"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "library_item_tenant_id_fkey"
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
                },"model_object": {
                  Row: {
                    "created_at": string,"data": NonNullable<Json>,"deleted": boolean,"object_id": string,"project_id": string,"schema_version": number,"tenant_id": string,"type": string,"updated_at": string,"updated_by": string | null,"updated_seq": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"data": NonNullable<Json>,"deleted"?: boolean,"object_id": string,"project_id": string,"schema_version": number,"tenant_id": string,"type": string,"updated_at"?: string,"updated_by"?: string | null,"updated_seq": number
                  }
                  Update: {
                    "created_at"?: string,"data"?: NonNullable<Json>,"deleted"?: boolean,"object_id"?: string,"project_id"?: string,"schema_version"?: number,"tenant_id"?: string,"type"?: string,"updated_at"?: string,"updated_by"?: string | null,"updated_seq"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "model_object_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "model_object_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "model_object_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    }
                  ]
                },"model_version": {
                  Row: {
                    "cause": string | null,"cleanup_shown_at": string | null,"created_at": string,"created_by": string | null,"id": string,"is_sent": boolean,"is_snapshot": boolean,"keep": boolean,"label": string | null,"model_json": NonNullable<Json>,"parent_version_id": string | null,"preview_path": string | null,"project_id": string,"schema_version": number,"sent_at": string | null,"sent_to": string | null,"tenant_id": string,"version_no": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cause"?: string | null,"cleanup_shown_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_sent"?: boolean,"is_snapshot"?: boolean,"keep"?: boolean,"label"?: string | null,"model_json": NonNullable<Json>,"parent_version_id"?: string | null,"preview_path"?: string | null,"project_id": string,"schema_version": number,"sent_at"?: string | null,"sent_to"?: string | null,"tenant_id": string,"version_no"?: number | null
                  }
                  Update: {
                    "cause"?: string | null,"cleanup_shown_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_sent"?: boolean,"is_snapshot"?: boolean,"keep"?: boolean,"label"?: string | null,"model_json"?: NonNullable<Json>,"parent_version_id"?: string | null,"preview_path"?: string | null,"project_id"?: string,"schema_version"?: number,"sent_at"?: string | null,"sent_to"?: string | null,"tenant_id"?: string,"version_no"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "model_version_parent_version_id_fkey"
      columns: ["parent_version_id"]
isOneToOne: false
      referencedRelation: "model_version"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "model_version_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "model_version_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"notification": {
                  Row: {
                    "created_at": string,"emailed_at": string | null,"id": string,"in_app": boolean,"kind": string,"link": string,"payload": NonNullable<Json>,"project_id": string | null,"read_at": string | null,"tenant_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"emailed_at"?: string | null,"id"?: string,"in_app"?: boolean,"kind": string,"link": string,"payload"?: NonNullable<Json>,"project_id"?: string | null,"read_at"?: string | null,"tenant_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"emailed_at"?: string | null,"id"?: string,"in_app"?: boolean,"kind"?: string,"link"?: string,"payload"?: NonNullable<Json>,"project_id"?: string | null,"read_at"?: string | null,"tenant_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_setting": {
                  Row: {
                    "email": boolean,"in_app": boolean,"kind": string,"tenant_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email"?: boolean,"in_app"?: boolean,"kind": string,"tenant_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "email"?: boolean,"in_app"?: boolean,"kind"?: string,"tenant_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_setting_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_setting_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    }
                  ]
                },"offline_change": {
                  Row: {
                    "app_user_id": string,"base_version_id": string | null,"device_id": string,"id": string,"kind": string,"ops": NonNullable<Json>,"photo_path": string | null,"project_id": string,"queued_at": string,"synced_at": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_user_id": string,"base_version_id"?: string | null,"device_id": string,"id": string,"kind": string,"ops": NonNullable<Json>,"photo_path"?: string | null,"project_id": string,"queued_at": string,"synced_at"?: string,"tenant_id": string
                  }
                  Update: {
                    "app_user_id"?: string,"base_version_id"?: string | null,"device_id"?: string,"id"?: string,"kind"?: string,"ops"?: NonNullable<Json>,"photo_path"?: string | null,"project_id"?: string,"queued_at"?: string,"synced_at"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "offline_change_app_user_id_fkey"
      columns: ["app_user_id"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offline_change_base_version_id_fkey"
      columns: ["base_version_id"]
isOneToOne: false
      referencedRelation: "model_version"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offline_change_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "offline_change_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"project": {
                  Row: {
                    "address": string,"archived_at": string | null,"client_name": string | null,"code_edition": string | null,"completed_at": string | null,"completed_from": string | null,"created_at": string,"customer_id": string | null,"ezbinder_job_id": string | null,"ezbinder_job_no": string | null,"id": string,"is_benchmark": boolean,"name": string,"open_items_count": number,"phase_default": string,"property_record_id": string | null,"scope_of_work": string | null,"scope_trades": (string)[],"settings": NonNullable<Json>,"status": string,"submittal_profile_id": string | null,"tenant_id": string,"thumbnail_path": string | null,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address": string,"archived_at"?: string | null,"client_name"?: string | null,"code_edition"?: string | null,"completed_at"?: string | null,"completed_from"?: string | null,"created_at"?: string,"customer_id"?: string | null,"ezbinder_job_id"?: string | null,"ezbinder_job_no"?: string | null,"id"?: string,"is_benchmark"?: boolean,"name": string,"open_items_count"?: number,"phase_default"?: string,"property_record_id"?: string | null,"scope_of_work"?: string | null,"scope_trades"?: (string)[],"settings"?: NonNullable<Json>,"status"?: string,"submittal_profile_id"?: string | null,"tenant_id": string,"thumbnail_path"?: string | null,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string,"archived_at"?: string | null,"client_name"?: string | null,"code_edition"?: string | null,"completed_at"?: string | null,"completed_from"?: string | null,"created_at"?: string,"customer_id"?: string | null,"ezbinder_job_id"?: string | null,"ezbinder_job_no"?: string | null,"id"?: string,"is_benchmark"?: boolean,"name"?: string,"open_items_count"?: number,"phase_default"?: string,"property_record_id"?: string | null,"scope_of_work"?: string | null,"scope_trades"?: (string)[],"settings"?: NonNullable<Json>,"status"?: string,"submittal_profile_id"?: string | null,"tenant_id"?: string,"thumbnail_path"?: string | null,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_customer_fk"
      columns: ["customer_id","tenant_id"]
isOneToOne: false
      referencedRelation: "customer"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "project_submittal_profile_fkey"
      columns: ["submittal_profile_id","tenant_id"]
isOneToOne: false
      referencedRelation: "submittal_profile"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "project_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"project_recent": {
                  Row: {
                    "membership_id": string,"opened_at": string,"project_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "membership_id": string,"opened_at"?: string,"project_id": string,"tenant_id": string
                  }
                  Update: {
                    "membership_id"?: string,"opened_at"?: string,"project_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_recent_membership_id_tenant_id_fkey"
      columns: ["membership_id","tenant_id"]
isOneToOne: false
      referencedRelation: "membership"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "project_recent_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "project_recent_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"reference_drawing": {
                  Row: {
                    "convert_status": NonNullable<Json>,"created_at": string,"error": string | null,"id": string,"job_id": string | null,"layer_state": NonNullable<Json>,"manifest_path": string | null,"not_read": NonNullable<Json>,"project_id": string,"rev_label": string | null,"source_file_id": string,"status": string,"tenant_id": string,"units": string | null,"updated_at": string,"version_no": number
                  }
                  ComputedFields: never
                  Insert: {
                    "convert_status"?: NonNullable<Json>,"created_at"?: string,"error"?: string | null,"id"?: string,"job_id"?: string | null,"layer_state"?: NonNullable<Json>,"manifest_path"?: string | null,"not_read"?: NonNullable<Json>,"project_id": string,"rev_label"?: string | null,"source_file_id": string,"status": string,"tenant_id": string,"units"?: string | null,"updated_at"?: string,"version_no"?: number
                  }
                  Update: {
                    "convert_status"?: NonNullable<Json>,"created_at"?: string,"error"?: string | null,"id"?: string,"job_id"?: string | null,"layer_state"?: NonNullable<Json>,"manifest_path"?: string | null,"not_read"?: NonNullable<Json>,"project_id"?: string,"rev_label"?: string | null,"source_file_id"?: string,"status"?: string,"tenant_id"?: string,"units"?: string | null,"updated_at"?: string,"version_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "reference_drawing_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reference_drawing_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "reference_drawing_source_file_id_fkey"
      columns: ["source_file_id"]
isOneToOne: true
      referencedRelation: "source_file"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reference_drawing_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"render_allowance": {
                  Row: {
                    "amount_usd": number,"balance_usd": number,"created_at": string,"last_refilled_at": string,"refill_amount_usd": number,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_usd": number,"balance_usd": number,"created_at"?: string,"last_refilled_at"?: string,"refill_amount_usd": number,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_usd"?: number,"balance_usd"?: number,"created_at"?: string,"last_refilled_at"?: string,"refill_amount_usd"?: number,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "render_allowance_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: true
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"render_tier_model": {
                  Row: {
                    "cost_usd_per_render": number | null,"created_at": string,"model_id": string,"output_size": string,"provider": string,"tenant_id": string,"tier": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_usd_per_render"?: number | null,"created_at"?: string,"model_id": string,"output_size": string,"provider": string,"tenant_id": string,"tier": string,"updated_at"?: string
                  }
                  Update: {
                    "cost_usd_per_render"?: number | null,"created_at"?: string,"model_id"?: string,"output_size"?: string,"provider"?: string,"tenant_id"?: string,"tier"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "render_tier_model_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"review_item": {
                  Row: {
                    "created_at": string,"id": string,"project_id": string,"resolved_at": string | null,"source": string,"source_ref": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"project_id": string,"resolved_at"?: string | null,"source": string,"source_ref": string,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"project_id"?: string,"resolved_at"?: string | null,"source"?: string,"source_ref"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_item_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "review_item_tenant_id_fkey"
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
                },"sent_package": {
                  Row: {
                    "created_at": string,"created_by": string | null,"email_sent_at": string | null,"expires_at": string,"id": string,"kind": string,"model_version_id": string,"note": string | null,"project_id": string,"recipients": NonNullable<Json>,"reminder_sent_at": string | null,"renewed_at": string | null,"revoked_at": string | null,"tenant_id": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"email_sent_at"?: string | null,"expires_at": string,"id"?: string,"kind": string,"model_version_id": string,"note"?: string | null,"project_id": string,"recipients": NonNullable<Json>,"reminder_sent_at"?: string | null,"renewed_at"?: string | null,"revoked_at"?: string | null,"tenant_id": string,"token_hash": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"email_sent_at"?: string | null,"expires_at"?: string,"id"?: string,"kind"?: string,"model_version_id"?: string,"note"?: string | null,"project_id"?: string,"recipients"?: NonNullable<Json>,"reminder_sent_at"?: string | null,"renewed_at"?: string | null,"revoked_at"?: string | null,"tenant_id"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sent_package_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sent_package_model_version_id_fkey"
      columns: ["model_version_id"]
isOneToOne: false
      referencedRelation: "model_version"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sent_package_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "sent_package_tenant_id_fkey"
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
                },"submittal_profile": {
                  Row: {
                    "archived_at": string | null,"bookmarks": boolean,"created_at": string,"department": string,"export_unsigned": boolean,"file_split": string,"flatten": boolean,"id": string,"is_default": boolean,"max_file_mb": number | null,"min_scale_in_per_ft": number | null,"naming_max_length": number | null,"naming_template": string,"naming_upper": boolean,"required_notes": (string)[],"resubmittal_mode": string,"revision_naming": string,"sheet_size": string,"signer": string,"stamp_box_height_in": number,"stamp_box_position": string,"stamp_box_width_in": number,"submittal_type": string,"tenant_id": string,"toc_sheet": boolean,"transmittal": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"bookmarks"?: boolean,"created_at"?: string,"department": string,"export_unsigned"?: boolean,"file_split"?: string,"flatten"?: boolean,"id"?: string,"is_default"?: boolean,"max_file_mb"?: number | null,"min_scale_in_per_ft"?: number | null,"naming_max_length"?: number | null,"naming_template"?: string,"naming_upper"?: boolean,"required_notes"?: (string)[],"resubmittal_mode"?: string,"revision_naming"?: string,"sheet_size"?: string,"signer"?: string,"stamp_box_height_in"?: number,"stamp_box_position"?: string,"stamp_box_width_in"?: number,"submittal_type"?: string,"tenant_id": string,"toc_sheet"?: boolean,"transmittal"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"bookmarks"?: boolean,"created_at"?: string,"department"?: string,"export_unsigned"?: boolean,"file_split"?: string,"flatten"?: boolean,"id"?: string,"is_default"?: boolean,"max_file_mb"?: number | null,"min_scale_in_per_ft"?: number | null,"naming_max_length"?: number | null,"naming_template"?: string,"naming_upper"?: boolean,"required_notes"?: (string)[],"resubmittal_mode"?: string,"revision_naming"?: string,"sheet_size"?: string,"signer"?: string,"stamp_box_height_in"?: number,"stamp_box_position"?: string,"stamp_box_width_in"?: number,"submittal_type"?: string,"tenant_id"?: string,"toc_sheet"?: boolean,"transmittal"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submittal_profile_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"sync_conflict": {
                  Row: {
                    "base_seq": number,"created_at": string,"data": Json | null,"deleted": boolean,"id": string,"object_id": string,"project_id": string,"reason": string,"schema_version": number | null,"tenant_id": string,"type": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_seq": number,"created_at"?: string,"data"?: Json | null,"deleted": boolean,"id"?: string,"object_id": string,"project_id": string,"reason": string,"schema_version"?: number | null,"tenant_id": string,"type"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "base_seq"?: number,"created_at"?: string,"data"?: Json | null,"deleted"?: boolean,"id"?: string,"object_id"?: string,"project_id"?: string,"reason"?: string,"schema_version"?: number | null,"tenant_id"?: string,"type"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_conflict_project_id_tenant_id_fkey"
      columns: ["project_id","tenant_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "sync_conflict_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sync_conflict_user_id_fkey"
      columns: ["user_id"]
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
                },"user_ai_key": {
                  Row: {
                    "app_user_id": string,"ciphertext": string,"created_at": string,"last4": string,"secret_version": number,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_user_id": string,"ciphertext": string,"created_at"?: string,"last4": string,"secret_version": number,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "app_user_id"?: string,"ciphertext"?: string,"created_at"?: string,"last4"?: string,"secret_version"?: number,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_ai_key_app_user_id_fkey"
      columns: ["app_user_id"]
isOneToOne: false
      referencedRelation: "app_user"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_ai_key_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
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
            "accept_invite":
{ Args: { "p_ip"?: unknown,"p_token_sha256": string }; Returns: Json
                           },
"acquire_edit_lock":
{ Args: { "p_device_id": string,"p_ip"?: unknown,"p_project": string }; Returns: Json
                           },
"archive_project":
{ Args: { "p_project": string }; Returns: Json
                           },
"archive_submittal_profile":
{ Args: { "p_archived": boolean,"p_id": string }; Returns: boolean
                           },
"cancel_edit_request":
{ Args: { "p_ip"?: unknown,"p_project": string }; Returns: Json
                           },
"cancel_import":
{ Args: { "p_job": string,"p_project": string }; Returns: Json
                           },
"cancel_invite":
{ Args: { "p_ip"?: unknown,"p_membership_id": string }; Returns: Json
                           },
"complete_project":
{ Args: { "p_project": string }; Returns: Json
                           },
"count_projects":
{ Args: { "p_search"?: string }; Returns: Json
                           },
"create_benchmark_project":
{ Args: { "p_changes": Json }; Returns: Json
                           },
"create_checkpoint":
{ Args: { "p_project": string }; Returns: string
                           },
"create_invite":
{ Args: { "p_email": string,"p_ip"?: unknown,"p_language": string,"p_name": string,"p_role_id": string,"p_scope": string,"p_secret": string,"p_token_sha256": string }; Returns: Json
                           },
"create_project":
{ Args: { "p_address": string,"p_customer_id": string,"p_defaults"?: Json,"p_foreman_membership_id"?: string,"p_name": string,"p_scope_of_work": string,"p_scope_trades"?: (string)[],"p_type": string }; Returns: {
              "project_id": string,"tenant_id": string
            }[]
                           },
"create_project_with_objects":
{ Args: { "p_address": string,"p_customer_id": string,"p_defaults"?: Json,"p_foreman_membership_id"?: string,"p_name": string,"p_objects": Json,"p_scope_of_work": string,"p_scope_trades"?: (string)[],"p_type": string }; Returns: {
              "project_id": string,"tenant_id": string
            }[]
                           },
"create_role":
{ Args: { "p_granted": (string)[],"p_ip"?: unknown,"p_name": string }; Returns: Json
                           },
"create_submittal_profile":
{ Args: { "p_department": string,"p_source"?: string }; Returns: {
              "archived_at": string | null,
"bookmarks": boolean,
"created_at": string,
"department": string,
"export_unsigned": boolean,
"file_split": string,
"flatten": boolean,
"id": string,
"is_default": boolean,
"max_file_mb": number | null,
"min_scale_in_per_ft": number | null,
"naming_max_length": number | null,
"naming_template": string,
"naming_upper": boolean,
"required_notes": (string)[],
"resubmittal_mode": string,
"revision_naming": string,
"sheet_size": string,
"signer": string,
"stamp_box_height_in": number,
"stamp_box_position": string,
"stamp_box_width_in": number,
"submittal_type": string,
"tenant_id": string,
"toc_sheet": boolean,
"transmittal": boolean,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "submittal_profile"
        isOneToOne: false
        isSetofReturn: true
      } },
"current_app_user_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_permissions":
{ Args: Record<PropertyKey, never>; Returns: {
              "listed_project_ids": (string)[],"membership_id": string,"permission_keys": (string)[],"project_scope": string
            }[]
                           },
"current_user_has_password":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"deactivate_member":
{ Args: { "p_ip"?: unknown,"p_membership_id": string }; Returns: Json
                           },
"delete_my_ai_key":
{ Args: Record<PropertyKey, never>; Returns: {
              "deleted": boolean,"last4": string
            }[]
                           },
"delete_my_sync_conflict":
{ Args: { "p_id": string }; Returns: boolean
                           },
"delete_project":
{ Args: { "p_confirm_name": string,"p_project": string }; Returns: Json
                           },
"delete_role":
{ Args: { "p_ip"?: unknown,"p_role_id": string }; Returns: Json
                           },
"delete_submittal_profile":
{ Args: { "p_id": string }; Returns: number
                           },
"enqueue_job":
{ Args: { "p_kind": string,"p_max_attempts": number,"p_payload": Json,"p_project_id": string,"p_run_after"?: string }; Returns: string
                           },
"error_tunnel_take":
{ Args: { "p_events": number,"p_ip_key": string }; Returns: boolean
                           },
"finish_import":
{ Args: { "p_job": string,"p_objects": Json,"p_project": string }; Returns: Json
                           },
"get_my_ai_key":
{ Args: Record<PropertyKey, never>; Returns: {
              "app_user_id": string,"ciphertext": string,"last4": string,"secret_version": number,"tenant_id": string
            }[]
                           },
"health":
{ Args: Record<PropertyKey, never>; Returns: {
              "schema_version": string,"status": string
            }[]
                           },
"invite_code_take":
{ Args: { "p_email": string }; Returns: Json
                           },
"invite_link_secret":
{ Args: { "p_membership_id": string }; Returns: Json
                           },
"invite_links_for_viewer":
{ Args: { "p_membership_ids": (string)[] }; Returns: Json
                           },
"invite_status":
{ Args: { "p_token_sha256": string }; Returns: Json
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
"list_benchmark_runs":
{ Args: { "p_page": number }; Returns: Json
                           },
"list_customers":
{ Args: { "p_archived": boolean,"p_page": number,"p_search": string }; Returns: Json
                           },
"list_foreman_candidates":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_my_sync_conflicts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_notifications":
{ Args: { "p_before_created_at": string,"p_before_id": string }; Returns: Json
                           },
"list_project_purge_files":
{ Args: { "p_limit": number,"p_project": string,"p_tenant": string }; Returns: {
              "bucket_id": string,"name": string
            }[]
                           },
"list_projects":
{ Args: { "p_after"?: Json,"p_search"?: string,"p_sort": string,"p_status"?: string }; Returns: Json
                           },
"list_recent_projects":
{ Args: { "p_exclude"?: string,"p_limit": number }; Returns: Json
                           },
"list_roles":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_scope_projects":
{ Args: { "p_search"?: string }; Returns: Json
                           },
"list_share_links":
{ Args: { "p_project": string }; Returns: Json
                           },
"list_users":
{ Args: { "p_page": number,"p_search": string }; Returns: Json
                           },
"log_event":
{ Args: { "p_action": string,"p_details": Json,"p_ip": unknown,"p_object_id": string,"p_object_type": string,"p_tenant_id": string }; Returns: undefined
                           },
"mark_all_notifications_read":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"mark_sent_package_emailed":
{ Args: { "p_sent_package": string }; Returns: boolean
                           },
"member_scope":
{ Args: { "p_membership_id": string }; Returns: Json
                           },
"name_snapshot":
{ Args: { "p_name": string,"p_project": string,"p_version": string }; Returns: Json
                           },
"open_notification":
{ Args: { "p_id": string }; Returns: {
              "link": string,"project_id": string,"project_state": string
            }[]
                           },
"owner_password_target":
{ Args: { "p_membership_id": string }; Returns: Json
                           },
"reactivate_member":
{ Args: { "p_ip"?: unknown,"p_membership_id": string }; Returns: Json
                           },
"read_edit_lock":
{ Args: { "p_project": string }; Returns: Json
                           },
"record_ai_usage":
{ Args: { "p_cost_usd": number,"p_model": string }; Returns: undefined
                           },
"record_benchmark_run":
{ Args: { "p_app_version": string,"p_device": Json,"p_results": Json }; Returns: string
                           },
"record_error_alert":
{ Args: { "p_fingerprint": string,"p_kind": string,"p_project_id": string,"p_ref": string,"p_source": string,"p_tenant_id": string,"p_title": string }; Returns: {
              "alert_id": string,"capped": boolean,"email_claim": string,"is_new": boolean
            }[]
                           },
"record_member_password_set":
{ Args: { "p_ip"?: unknown,"p_membership_id": string }; Returns: Json
                           },
"record_project_open":
{ Args: { "p_project": string }; Returns: undefined
                           },
"record_sync_conflicts":
{ Args: { "p_changes": Json,"p_payload": Json,"p_project": string }; Returns: Json
                           },
"release_ai_assistant_slot":
{ Args: { "p_slot_id": string }; Returns: undefined
                           },
"release_edit_lock":
{ Args: { "p_ip"?: unknown,"p_lock_epoch"?: number,"p_project": string,"p_reason": string }; Returns: Json
                           },
"release_error_alert_email":
{ Args: { "p_alert_id": string,"p_claim": string }; Returns: boolean
                           },
"remove_member":
{ Args: { "p_ip"?: unknown,"p_membership_id": string }; Returns: Json
                           },
"rename_project":
{ Args: { "p_name": string,"p_project": string }; Returns: Json
                           },
"renew_share_link":
{ Args: { "p_expiry_days": number,"p_ip"?: unknown,"p_sent_package": string }; Returns: Json
                           },
"reopen_project":
{ Args: { "p_project": string }; Returns: Json
                           },
"request_edit_lock":
{ Args: { "p_ip"?: unknown,"p_minutes": number,"p_project": string }; Returns: Json
                           },
"resend_invite":
{ Args: { "p_ip"?: unknown,"p_membership_id": string,"p_secret": string,"p_token_sha256": string }; Returns: Json
                           },
"resolve_sent_package":
{ Args: { "p_token_hash": string }; Returns: {
              "expires_at": string,"kind": string,"model_version_id": string,"project_id": string,"sent_package_id": string,"tenant_id": string
            }[]
                           },
"resolve_share_link":
{ Args: { "p_token_hash": string,"p_view"?: boolean }; Returns: Json
                           },
"respond_edit_request":
{ Args: { "p_ip"?: unknown,"p_project": string,"p_request": string,"p_response": string }; Returns: Json
                           },
"restore_project":
{ Args: { "p_project": string }; Returns: Json
                           },
"retry_import":
{ Args: { "p_job": string,"p_project": string }; Returns: Json
                           },
"revert_to_version":
{ Args: { "p_label": string,"p_lock_epoch": number,"p_objects": Json,"p_project": string,"p_version": string }; Returns: Json
                           },
"revoke_share_link":
{ Args: { "p_sent_package": string }; Returns: Json
                           },
"rewrap_my_ai_key":
{ Args: { "p_ciphertext": string,"p_old_version": number,"p_secret_version": number }; Returns: boolean
                           },
"save_field_measure_session":
{ Args: { "p_project": string,"p_rooms": Json }; Returns: Json
                           },
"save_import_review":
{ Args: { "p_changes": Json,"p_job": string,"p_mode": string,"p_project": string }; Returns: Json
                           },
"save_member":
{ Args: { "p_granted": (string)[],"p_ip"?: unknown,"p_language": string,"p_membership_id": string,"p_role_id": string }; Returns: Json
                           },
"save_member_scope":
{ Args: { "p_ip"?: unknown,"p_membership_id": string,"p_project_ids": (string)[],"p_scope": string }; Returns: Json
                           },
"save_my_ai_key":
{ Args: { "p_app_user_id": string,"p_ciphertext": string,"p_last4": string,"p_secret_version": number,"p_tenant_id": string }; Returns: undefined
                           },
"save_my_notification_settings":
{ Args: { "p_settings": Json }; Returns: undefined
                           },
"save_objects":
{ Args: { "p_changes": Json,"p_lock_epoch": number,"p_project": string }; Returns: Json
                           },
"save_objects_resolving":
{ Args: { "p_changes": Json,"p_lock_epoch": number,"p_project": string,"p_resolves": (string)[] }; Returns: Json
                           },
"save_render_settings":
{ Args: { "p_allowance"?: Json,"p_tiers": Json }; Returns: {
              "changed": (string)[],"tenant_id": string
            }[]
                           },
"send_test_notification":
{ Args: { "p_kind": string,"p_membership_id": string,"p_payload": Json,"p_project_id": string }; Returns: string
                           },
"send_to_client":
{ Args: { "p_expiry_days": number,"p_ip"?: unknown,"p_note": string,"p_project": string,"p_token_hash": string }; Returns: Json
                           },
"set_checkpoint_thumbnail":
{ Args: { "p_project": string,"p_version": string }; Returns: string
                           },
"set_default_submittal_profile":
{ Args: { "p_id": string }; Returns: string
                           },
"set_phase_default":
{ Args: { "p_phase": string,"p_project": string }; Returns: string
                           },
"set_plan_scale":
{ Args: { "p_project": string,"p_scale": number }; Returns: number
                           },
"set_project_status":
{ Args: { "p_project": string,"p_status": string }; Returns: Json
                           },
"set_project_submittal_profile":
{ Args: { "p_profile": string,"p_project": string }; Returns: boolean
                           },
"sign_in_throttle_settle":
{ Args: { "p_attempt_id": string,"p_ip_attempt_id": string }; Returns: undefined
                           },
"sign_in_throttle_take":
{ Args: { "p_email_key": string,"p_ip_key": string,"p_kind": string }; Returns: {
              "allowed": boolean,"attempt_id": string,"ip_attempt_id": string,"limited_by": string
            }[]
                           },
"start_checkpoint_thumbnail":
{ Args: { "p_project": string,"p_version": string }; Returns: string
                           },
"start_field_photo":
{ Args: { "p_action": string,"p_ext": string,"p_kind": string,"p_project": string }; Returns: Json
                           },
"sweep_edit_locks":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"sweep_share_link_reminders":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"sync_field_action":
{ Args: { "p_base_version": string,"p_device": string,"p_id": string,"p_kind": string,"p_ops": Json,"p_photo": string,"p_project": string,"p_queued_at": string }; Returns: Json
                           },
"system_backup_status":
{ Args: Record<PropertyKey, never>; Returns: {
              "bytes_copied": number,"finished_at": string,"kind": string,"location": string,"status": string
            }[]
                           },
"take_ai_assistant_slot":
{ Args: Record<PropertyKey, never>; Returns: {
              "refused": string,"slot_id": string
            }[]
                           },
"take_ai_key_attempt":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"touch_last_active":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"update_my_profile":
{ Args: { "p_ipad_input_mode": string,"p_language": string }; Returns: {
              "language_changed": boolean,"saved_ipad_input_mode": string,"saved_language": string
            }[]
                           },
"update_my_rail_order":
{ Args: { "p_order": (string)[] }; Returns: (string)[]
                           },
"update_project_settings":
{ Args: { "p_changes": Json,"p_lock_epoch"?: number,"p_project": string }; Returns: Json
                           },
"update_role":
{ Args: { "p_granted": (string)[],"p_ip"?: unknown,"p_name": string,"p_role_id": string }; Returns: Json
                           },
"update_submittal_profile":
{ Args: { "p_changes": Json,"p_id": string }; Returns: Json
                           },
"update_tenant_code_edition":
{ Args: { "p_code_edition": string,"p_optional_load_calc": boolean }; Returns: {
              "changed": (string)[],"code_edition": string,"tenant_defaults": Json,"tenant_id": string
            }[]
                           },
"update_tenant_defaults":
{ Args: { "p_remove": (string)[],"p_set": Json }; Returns: {
              "changed": (string)[],"tenant_defaults": Json,"tenant_id": string
            }[]
                           },
"update_tenant_identity":
{ Args: { "p_contact": Json,"p_license_no": string,"p_logo_path": string,"p_name": string,"p_set_logo": boolean }; Returns: {
              "changed": (string)[],"tenant_contact": Json,"tenant_id": string,"tenant_license_no": string,"tenant_logo_path": string,"tenant_name": string,"tenant_updated_at": string
            }[]
                           },
"update_tenant_title_block":
{ Args: { "p_show_company": boolean }; Returns: {
              "changed": (string)[],"tenant_id": string,"title_block": Json
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

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Enums: {
      app_role:
        | "Admin"
        | "Sales Manager"
        | "Indoor Sales"
        | "Outdoor Sales"
        | "Sales Rep"
        | "Finance / Accountant"
        | "Operations Manager"
        | "Procurement Engineer"
        | "Project Manager"
        | "Project Engineer"
        | "Site Engineer"
        | "Auditor"
        | "Audit Team"
        | "Branch Manager"
        | "Factory"
        | "Glass Department"
        | "Delivery Head"
        | "Delivery Team"
        | "Installation Head"
        | "Installation Team"
        | "Quality Control"
        | "HR";
      project_status:
        | "Draft"
        | "Measuring"
        | "Quotation"
        | "Contract"
        | "Production"
        | "Completed";
      quotation_status: "Draft" | "Sent" | "Approved" | "Rejected" | "Expired";
      contract_status: "Draft" | "Review" | "Active" | "Completed" | "Cancelled";
      project_workflow_status:
        | "sales_client_created"
        | "sales_opportunity_created"
        | "sales_quotation_created"
        | "sales_contract_created"
        | "finance_down_payment_pending"
        | "finance_down_payment_confirmed"
        | "finance_payment_exception"
        | "operations_manager_review"
        | "project_manager_assigned"
        | "project_engineer_assigned"
        | "site_engineer_assigned"
        | "measurement_pending"
        | "project_description_draft"
        | "audit_pending"
        | "audit_rejected"
        | "audit_approved"
        | "finance_final_check"
        | "branch_manager_review"
        | "approved_for_factory"
        | "sent_to_factory"
        | "factory_in_progress"
        | "factory_completed"
        | "glass_production"
        | "assembly"
        | "final_payment_requested"
        | "final_payment_received"
        | "delivery_pending"
        | "delivered"
        | "installation_in_progress"
        | "installation_completed"
        | "quality_control"
        | "project_handover"
        | "closed";
      document_owner_type: "client" | "project" | "quotation" | "contract";
      activity_entity_type:
        | "profile"
        | "client"
        | "project"
        | "opening"
        | "quotation"
        | "quotation_item"
        | "contract"
        | "document";
    };
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          username: string | null;
          full_name: string | null;
          role: Database["public"]["Enums"]["app_role"];
          is_active: boolean;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          username?: string | null;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          is_active?: boolean;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      clients: {
        Row: {
          id: string;
          client_name: string;
          mobile: string | null;
          alternate_mobile: string | null;
          address: string | null;
          province: string | null;
          city: string | null;
          email: string | null;
          notes: string | null;
          client_type: "individual" | "company";
          company_name: string | null;
          whatsapp: string | null;
          preferred_language: "ar" | "en";
          normalized_mobile: string;
          normalized_whatsapp: string;
          archived_at: string | null;
          archived_by: string | null;
          archive_reason: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_name: string;
          mobile?: string | null;
          alternate_mobile?: string | null;
          address?: string | null;
          province?: string | null;
          city?: string | null;
          email?: string | null;
          notes?: string | null;
          client_type?: "individual" | "company";
          company_name?: string | null;
          whatsapp?: string | null;
          preferred_language?: "ar" | "en";
          archived_at?: string | null;
          archived_by?: string | null;
          archive_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
      };
      client_contacts: {
        Row: {
          id: string;
          client_id: string;
          project_id: string | null;
          contact_type:
            | "client"
            | "company"
            | "engineer"
            | "consultant"
            | "contractor"
            | "procurement"
            | "finance"
            | "other";
          contact_name: string;
          role_title: string | null;
          mobile: string | null;
          whatsapp: string | null;
          email: string | null;
          is_primary: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          project_id?: string | null;
          contact_type?: Database["public"]["Tables"]["client_contacts"]["Row"]["contact_type"];
          contact_name: string;
          role_title?: string | null;
          mobile?: string | null;
          whatsapp?: string | null;
          email?: string | null;
          is_primary?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["client_contacts"]["Insert"]
        >;
      };
      projects: {
        Row: {
          id: string;
          project_number: string;
          project_name: string;
          client_id: string;
          address: string | null;
          location_latitude: number | null;
          location_longitude: number | null;
          geofence_radius_meters: number | null;
          project_type: string | null;
          branch: "Rasafa" | "Karkh" | null;
          sales_engineer_id: string | null;
          status: Database["public"]["Enums"]["project_status"];
          workflow_status: Database["public"]["Enums"]["project_workflow_status"];
          operations_manager_id: string | null;
          project_manager_id: string | null;
          project_engineer_id: string | null;
          site_engineer_id: string | null;
          original_source:
            | "outdoor_sales"
            | "showroom_walk_in"
            | "existing_client"
            | "referral"
            | "phone_inquiry"
            | "website"
            | "social_media"
            | "management_referral"
            | "other"
            | "legacy";
          original_creator_id: string | null;
          original_creator_role: Database["public"]["Enums"]["app_role"] | null;
          owner_id: string | null;
          responsible_user_id: string | null;
          responsible_department:
            | "indoor_sales"
            | "outdoor_sales"
            | "sales_management"
            | "operations"
            | "sales"
            | "unassigned";
          sales_status: string;
          structure_readiness: "unknown" | "ready" | "not_ready";
          expected_structure_ready_date: string | null;
          next_follow_up_at: string | null;
          priority: "low" | "normal" | "high" | "urgent";
          estimated_value: number | null;
          project_notes: string | null;
          last_updated_by: string | null;
          archived_at: string | null;
          archived_by: string | null;
          archive_reason: string | null;
          engineer_name: string | null;
          consultant_name: string | null;
          contractor_name: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_number: string;
          project_name: string;
          client_id: string;
          address?: string | null;
          location_latitude?: number | null;
          location_longitude?: number | null;
          geofence_radius_meters?: number | null;
          project_type?: string | null;
          branch?: "Rasafa" | "Karkh" | null;
          sales_engineer_id?: string | null;
          status?: Database["public"]["Enums"]["project_status"];
          workflow_status?: Database["public"]["Enums"]["project_workflow_status"];
          operations_manager_id?: string | null;
          project_manager_id?: string | null;
          project_engineer_id?: string | null;
          site_engineer_id?: string | null;
          original_source?: Database["public"]["Tables"]["projects"]["Row"]["original_source"];
          original_creator_id?: string | null;
          original_creator_role?: Database["public"]["Enums"]["app_role"] | null;
          owner_id?: string | null;
          responsible_user_id?: string | null;
          responsible_department?: Database["public"]["Tables"]["projects"]["Row"]["responsible_department"];
          sales_status?: string;
          structure_readiness?: "unknown" | "ready" | "not_ready";
          expected_structure_ready_date?: string | null;
          next_follow_up_at?: string | null;
          priority?: "low" | "normal" | "high" | "urgent";
          estimated_value?: number | null;
          project_notes?: string | null;
          last_updated_by?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          archive_reason?: string | null;
          engineer_name?: string | null;
          consultant_name?: string | null;
          contractor_name?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
      };
      openings: {
        Row: {
          id: string;
          project_id: string;
          floor: string | null;
          room: string | null;
          opening_code: string;
          width: number;
          height: number;
          solid_panel_height: number;
          fixed_height: number;
          quantity: number;
          area_sqm: number;
          product_system: string | null;
          glass_type: string | null;
          aluminum_color: string | null;
          shape: string | null;
          opening_type: string | null;
          bottom_frame: string | null;
          opening_direction: string | null;
          glass_color: string | null;
          measurement_request_id: string | null;
          measurement_visit_id: string | null;
          measurement_submission_id: string | null;
          measurement_version: number | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          floor?: string | null;
          room?: string | null;
          opening_code: string;
          width: number;
          height: number;
          solid_panel_height?: number;
          fixed_height?: number;
          quantity?: number;
          product_system?: string | null;
          glass_type?: string | null;
          aluminum_color?: string | null;
          shape?: string | null;
          opening_type?: string | null;
          bottom_frame?: string | null;
          opening_direction?: string | null;
          glass_color?: string | null;
          measurement_request_id?: string | null;
          measurement_visit_id?: string | null;
          measurement_submission_id?: string | null;
          measurement_version?: number | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["openings"]["Insert"]>;
      };
      project_price_settings: {
        Row: {
          id: string;
          project_id: string;
          opening_id: string;
          unit_price: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          opening_id: string;
          unit_price?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_price_settings"]["Insert"]>;
      };
      product_price_settings: {
        Row: {
          id: string;
          product_name: string;
          category: string | null;
          unit: string;
          unit_price: number;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_name: string;
          category?: string | null;
          unit?: string;
          unit_price?: number;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["product_price_settings"]["Insert"]>;
      };
      project_costings: {
        Row: {
          id: string;
          project_id: string;
          aluminum_system_name: string | null;
          aluminum_system_cost: number;
          installation_cost: number;
          fabrication_cost: number;
          glass_cost: number;
          shipping_cost: number;
          total_profit: number;
          total_project_cost: number;
          supplier_quotation_path: string | null;
          supplier_quotation_name: string | null;
          notes: string | null;
          handoff_status: "draft" | "sent_to_sales";
          sent_to_sales_at: string | null;
          sent_to_sales_by: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          aluminum_system_name?: string | null;
          aluminum_system_cost?: number;
          installation_cost?: number;
          fabrication_cost?: number;
          glass_cost?: number;
          shipping_cost?: number;
          total_profit?: number;
          total_project_cost?: number;
          supplier_quotation_path?: string | null;
          supplier_quotation_name?: string | null;
          notes?: string | null;
          handoff_status?: "draft" | "sent_to_sales";
          sent_to_sales_at?: string | null;
          sent_to_sales_by?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_costings"]["Insert"]>;
      };
      employee_page_access: {
        Row: {
          id: string;
          user_id: string;
          route_path: string;
          can_access: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          route_path: string;
          can_access?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_page_access"]["Insert"]>;
      };
      quotations: {
        Row: {
          id: string;
          quotation_number: string;
          project_id: string;
          client_id: string;
          status: Database["public"]["Enums"]["quotation_status"];
          quotation_discount_percent: number;
          subtotal: number;
          line_discount_total: number;
          quotation_discount_total: number;
          grand_total: number;
          pricing_source: "catalog" | "project_costing";
          notes: string | null;
          prepared_by: string | null;
          prepared_by_text: string | null;
          client_representative: string | null;
          valid_until: string | null;
          created_by: string | null;
          current_version_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          quotation_number: string;
          project_id: string;
          client_id: string;
          status?: Database["public"]["Enums"]["quotation_status"];
          quotation_discount_percent?: number;
          subtotal?: number;
          line_discount_total?: number;
          quotation_discount_total?: number;
          grand_total?: number;
          pricing_source?: "catalog" | "project_costing";
          notes?: string | null;
          prepared_by?: string | null;
          prepared_by_text?: string | null;
          client_representative?: string | null;
          valid_until?: string | null;
          created_by?: string | null;
          current_version_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quotations"]["Insert"]>;
      };
      quotation_items: {
        Row: {
          id: string;
          quotation_id: string;
          opening_id: string | null;
          opening_code: string;
          floor: string | null;
          room: string | null;
          width: number;
          height: number;
          solid_panel_height: number;
          quantity: number;
          area_sqm: number;
          product_system: string | null;
          glass_type: string | null;
          aluminum_color: string | null;
          unit_price: number;
          discount_percent: number;
          line_type: string;
          is_discountable: boolean;
          gross_total: number;
          discount_total: number;
          net_total: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          quotation_id: string;
          opening_id?: string | null;
          opening_code: string;
          floor?: string | null;
          room?: string | null;
          width: number;
          height: number;
          solid_panel_height?: number;
          quantity?: number;
          product_system?: string | null;
          glass_type?: string | null;
          aluminum_color?: string | null;
          unit_price?: number;
          discount_percent?: number;
          line_type?: string;
          is_discountable?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quotation_items"]["Insert"]>;
      };
      quotation_versions: {
        Row: {
          id: string;
          quotation_id: string;
          version_number: number;
          status:
            | "draft"
            | "ready_for_review"
            | "approved"
            | "presented"
            | "sent"
            | "rejected"
            | "superseded"
            | "expired";
          quotation_discount_percent: number;
          subtotal: number;
          line_discount_total: number;
          quotation_discount_total: number;
          grand_total: number;
          pricing_source: "catalog" | "project_costing";
          notes: string | null;
          prepared_by_text: string | null;
          client_representative: string | null;
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          presented_by: string | null;
          presented_at: string | null;
          sent_by: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          quotation_id: string;
          version_number: number;
          status?: Database["public"]["Tables"]["quotation_versions"]["Row"]["status"];
          quotation_discount_percent?: number;
          subtotal?: number;
          line_discount_total?: number;
          quotation_discount_total?: number;
          grand_total?: number;
          pricing_source?: "catalog" | "project_costing";
          notes?: string | null;
          prepared_by_text?: string | null;
          client_representative?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          presented_by?: string | null;
          presented_at?: string | null;
          sent_by?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["quotation_versions"]["Insert"]
        >;
      };
      quotation_version_items: {
        Row: {
          id: string;
          quotation_version_id: string;
          source_quotation_item_id: string | null;
          opening_id: string | null;
          opening_code: string;
          floor: string | null;
          room: string | null;
          width: number;
          height: number;
          solid_panel_height: number;
          quantity: number;
          product_system: string | null;
          glass_type: string | null;
          aluminum_color: string | null;
          unit_price: number;
          discount_percent: number;
          line_type: string;
          is_discountable: boolean;
          notes: string | null;
          area_sqm: number;
          gross_total: number;
          discount_total: number;
          net_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          quotation_version_id: string;
          source_quotation_item_id?: string | null;
          opening_id?: string | null;
          opening_code: string;
          floor?: string | null;
          room?: string | null;
          width: number;
          height: number;
          solid_panel_height?: number;
          quantity?: number;
          product_system?: string | null;
          glass_type?: string | null;
          aluminum_color?: string | null;
          unit_price?: number;
          discount_percent?: number;
          line_type?: string;
          is_discountable?: boolean;
          notes?: string | null;
          area_sqm?: number;
          gross_total?: number;
          discount_total?: number;
          net_total?: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["quotation_version_items"]["Insert"]
        >;
      };
      contracts: {
        Row: {
          id: string;
          contract_number: string;
          project_id: string;
          quotation_id: string | null;
          quotation_version_id: string | null;
          client_id: string;
          status: Database["public"]["Enums"]["contract_status"];
          contract_value: number;
          pricing_source: "catalog" | "project_costing";
          source_contract_value: number;
          contract_discount_percent: number;
          contract_discount_total: number;
          signed_at: string | null;
          start_date: string | null;
          end_date: string | null;
          contract_date: string | null;
          payment_terms: string | null;
          warranty_terms: string | null;
          execution_terms: string | null;
          contract_terms: string | null;
          first_party_obligations: string | null;
          second_party_obligations: string | null;
          prepared_by_text: string | null;
          client_signature_data_url: string | null;
          client_signed_name: string | null;
          client_signed_at: string | null;
          sales_signature_data_url: string | null;
          sales_signed_name: string | null;
          sales_signed_at: string | null;
          signed_by_sales_user_id: string | null;
          language: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          contract_number: string;
          project_id: string;
          quotation_id?: string | null;
          quotation_version_id?: string | null;
          client_id: string;
          status?: Database["public"]["Enums"]["contract_status"];
          contract_value?: number;
          pricing_source?: "catalog" | "project_costing";
          source_contract_value?: number;
          contract_discount_percent?: number;
          contract_discount_total?: number;
          signed_at?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          contract_date?: string | null;
          payment_terms?: string | null;
          warranty_terms?: string | null;
          execution_terms?: string | null;
          contract_terms?: string | null;
          first_party_obligations?: string | null;
          second_party_obligations?: string | null;
          prepared_by_text?: string | null;
          client_signature_data_url?: string | null;
          client_signed_name?: string | null;
          client_signed_at?: string | null;
          sales_signature_data_url?: string | null;
          sales_signed_name?: string | null;
          sales_signed_at?: string | null;
          signed_by_sales_user_id?: string | null;
          language?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contracts"]["Insert"]>;
      };
      operations_handoffs: {
        Row: {
          id: string;
          project_id: string;
          contract_id: string;
          quotation_version_id: string;
          status: "ready" | "accepted" | "returned";
          package_snapshot: Json;
          created_by: string | null;
          accepted_by: string | null;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          contract_id: string;
          quotation_version_id: string;
          status?: "ready" | "accepted" | "returned";
          package_snapshot?: Json;
          created_by?: string | null;
          accepted_by?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["operations_handoffs"]["Insert"]
        >;
      };
      documents: {
        Row: {
          id: string;
          owner_type: Database["public"]["Enums"]["document_owner_type"];
          client_id: string | null;
          project_id: string | null;
          quotation_id: string | null;
          contract_id: string | null;
          file_name: string;
          file_type: string | null;
          storage_bucket: string;
          storage_path: string;
          file_size_bytes: number | null;
          uploaded_by: string | null;
          print_logo_url: string | null;
          print_header_text: string | null;
          print_footer_text: string | null;
          attachment_category:
            | "general"
            | "site_photo"
            | "drawing"
            | "client_document"
            | "scope"
            | "correspondence";
          archived_at: string | null;
          archived_by: string | null;
          archive_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_type: Database["public"]["Enums"]["document_owner_type"];
          client_id?: string | null;
          project_id?: string | null;
          quotation_id?: string | null;
          contract_id?: string | null;
          file_name: string;
          file_type?: string | null;
          storage_bucket: string;
          storage_path: string;
          file_size_bytes?: number | null;
          uploaded_by?: string | null;
          print_logo_url?: string | null;
          print_header_text?: string | null;
          print_footer_text?: string | null;
          attachment_category?:
            | "general"
            | "site_photo"
            | "drawing"
            | "client_document"
            | "scope"
            | "correspondence";
          archived_at?: string | null;
          archived_by?: string | null;
          archive_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
      };
      activity_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          entity_type: Database["public"]["Enums"]["activity_entity_type"];
          entity_id: string | null;
          action: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          entity_type: Database["public"]["Enums"]["activity_entity_type"];
          entity_id?: string | null;
          action: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["activity_logs"]["Insert"]>;
      };
      sales_status_definitions: {
        Row: {
          status_key: string;
          sort_order: number;
          label_key: string;
          is_terminal: boolean;
          created_at: string;
        };
        Insert: {
          status_key: string;
          sort_order: number;
          label_key: string;
          is_terminal?: boolean;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["sales_status_definitions"]["Insert"]
        >;
      };
      sales_status_transitions: {
        Row: {
          from_status: string;
          to_status: string;
          allowed_roles: Database["public"]["Enums"]["app_role"][];
          requires_reason: boolean;
          created_at: string;
        };
        Insert: {
          from_status: string;
          to_status: string;
          allowed_roles: Database["public"]["Enums"]["app_role"][];
          requires_reason?: boolean;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["sales_status_transitions"]["Insert"]
        >;
      };
      project_assignments: {
        Row: {
          id: string;
          project_id: string;
          assignment_type:
            | "current_responsible"
            | "measurement"
            | "follow_up_support"
            | "temporary_support";
          assignee_id: string | null;
          assigned_by: string | null;
          assigned_at: string;
          ended_at: string | null;
          ended_by: string | null;
          reason: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          assignment_type: Database["public"]["Tables"]["project_assignments"]["Row"]["assignment_type"];
          assignee_id?: string | null;
          assigned_by?: string | null;
          assigned_at?: string;
          ended_at?: string | null;
          ended_by?: string | null;
          reason?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["project_assignments"]["Insert"]
        >;
      };
      project_ownership_history: {
        Row: {
          id: string;
          project_id: string;
          previous_owner_id: string | null;
          new_owner_id: string | null;
          changed_by: string | null;
          changed_by_role: Database["public"]["Enums"]["app_role"] | null;
          reason: string;
          correlation_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          previous_owner_id?: string | null;
          new_owner_id?: string | null;
          changed_by?: string | null;
          changed_by_role?: Database["public"]["Enums"]["app_role"] | null;
          reason: string;
          correlation_id?: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["project_ownership_history"]["Insert"]
        >;
      };
      appointments: {
        Row: {
          id: string;
          client_id: string;
          project_id: string;
          appointment_type:
            | "site_measurement"
            | "showroom_visit"
            | "quotation_presentation"
            | "contract_signing"
            | "client_meeting"
            | "follow_up_call";
          assigned_employee_id: string | null;
          created_by: string | null;
          starts_at: string;
          expected_duration_minutes: number | null;
          location: string | null;
          notes: string | null;
          status:
            | "proposed"
            | "confirmed"
            | "assigned"
            | "completed"
            | "postponed"
            | "cancelled"
            | "client_unavailable"
            | "no_show";
          completion_result: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          project_id: string;
          appointment_type: Database["public"]["Tables"]["appointments"]["Row"]["appointment_type"];
          assigned_employee_id?: string | null;
          created_by?: string | null;
          starts_at: string;
          expected_duration_minutes?: number | null;
          location?: string | null;
          notes?: string | null;
          status?: Database["public"]["Tables"]["appointments"]["Row"]["status"];
          completion_result?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["appointments"]["Insert"]
        >;
      };
      measurement_requests: {
        Row: {
          id: string;
          project_id: string;
          requested_by: string | null;
          return_to_user_id: string | null;
          assigned_to: string | null;
          appointment_id: string | null;
          status: string;
          instructions: string | null;
          preferred_at: string | null;
          requested_at: string;
          assigned_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          requested_by?: string | null;
          return_to_user_id?: string | null;
          assigned_to?: string | null;
          appointment_id?: string | null;
          status?: string;
          instructions?: string | null;
          preferred_at?: string | null;
          requested_at?: string;
          assigned_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["measurement_requests"]["Insert"]
        >;
      };
      measurement_visits: {
        Row: {
          id: string;
          measurement_request_id: string;
          appointment_id: string | null;
          performed_by: string | null;
          visit_number: number;
          started_at: string;
          draft_saved_at: string | null;
          completed_at: string | null;
          outcome: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          measurement_request_id: string;
          appointment_id?: string | null;
          performed_by?: string | null;
          visit_number?: number;
          started_at?: string;
          draft_saved_at?: string | null;
          completed_at?: string | null;
          outcome?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["measurement_visits"]["Insert"]
        >;
      };
      measurement_submissions: {
        Row: {
          id: string;
          measurement_request_id: string;
          measurement_visit_id: string;
          version: number;
          status: string;
          submitted_by: string | null;
          submitted_at: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          measurement_request_id: string;
          measurement_visit_id: string;
          version: number;
          status?: string;
          submitted_by?: string | null;
          submitted_at?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          review_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["measurement_submissions"]["Insert"]
        >;
      };
      follow_up_tasks: {
        Row: {
          id: string;
          client_id: string;
          project_id: string;
          quotation_id: string | null;
          task_type: "structure_readiness" | "quotation";
          status: "open" | "completed" | "cancelled";
          owner_id: string | null;
          assigned_to: string | null;
          due_at: string;
          completed_at: string | null;
          completed_by: string | null;
          completion_outcome: string | null;
          rescheduled_from_id: string | null;
          deduplication_key: string | null;
          interval_source:
            | "manual"
            | "structure_readiness"
            | "quotation_default"
            | "rescheduled";
          reminder_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          project_id: string;
          quotation_id?: string | null;
          task_type: "structure_readiness" | "quotation";
          status?: "open" | "completed" | "cancelled";
          owner_id?: string | null;
          assigned_to?: string | null;
          due_at: string;
          completed_at?: string | null;
          completed_by?: string | null;
          completion_outcome?: string | null;
          rescheduled_from_id?: string | null;
          deduplication_key?: string | null;
          interval_source?:
            | "manual"
            | "structure_readiness"
            | "quotation_default"
            | "rescheduled";
          reminder_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["follow_up_tasks"]["Insert"]
        >;
      };
      follow_up_activities: {
        Row: {
          id: string;
          follow_up_task_id: string | null;
          client_id: string;
          project_id: string;
          employee_id: string | null;
          employee_role: Database["public"]["Enums"]["app_role"] | null;
          performed_at: string;
          method:
            | "phone_call"
            | "whatsapp"
            | "showroom_meeting"
            | "site_meeting"
            | "email"
            | "quotation_sent"
            | "quotation_printed"
            | "client_visit"
            | "internal_note"
            | "other"
            | "correction";
          client_response: string | null;
          internal_notes: string | null;
          outcome: string | null;
          previous_status: string | null;
          new_status: string | null;
          next_follow_up_at: string | null;
          appointment_id: string | null;
          client_answered: boolean | null;
          task_completed: boolean;
          correction_of_id: string | null;
          attachment_metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          follow_up_task_id?: string | null;
          client_id: string;
          project_id: string;
          employee_id?: string | null;
          employee_role?: Database["public"]["Enums"]["app_role"] | null;
          performed_at?: string;
          method: Database["public"]["Tables"]["follow_up_activities"]["Row"]["method"];
          client_response?: string | null;
          internal_notes?: string | null;
          outcome?: string | null;
          previous_status?: string | null;
          new_status?: string | null;
          next_follow_up_at?: string | null;
          appointment_id?: string | null;
          client_answered?: boolean | null;
          task_completed?: boolean;
          correction_of_id?: string | null;
          attachment_metadata?: Json;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["follow_up_activities"]["Insert"]
        >;
      };
      notifications: {
        Row: {
          id: string;
          recipient_id: string;
          notification_kind: "information" | "action_required" | "overdue";
          event_type: string;
          entity_type: string;
          entity_id: string | null;
          title_key: string;
          message_key: string;
          link_path: string | null;
          payload: Json;
          deduplication_key: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_id: string;
          notification_kind?: "information" | "action_required" | "overdue";
          event_type: string;
          entity_type: string;
          entity_id?: string | null;
          title_key: string;
          message_key: string;
          link_path?: string | null;
          payload?: Json;
          deduplication_key?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["notifications"]["Insert"]
        >;
      };
      audit_events: {
        Row: {
          id: string;
          actor_id: string | null;
          actor_role: Database["public"]["Enums"]["app_role"] | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          previous_value: Json | null;
          new_value: Json | null;
          reason: string | null;
          correlation_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          actor_role?: Database["public"]["Enums"]["app_role"] | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          previous_value?: Json | null;
          new_value?: Json | null;
          reason?: string | null;
          correlation_id?: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["audit_events"]["Insert"]
        >;
      };
      project_status_history: {
        Row: {
          id: string;
          project_id: string;
          previous_status: string | null;
          new_status: string;
          changed_by: string | null;
          changed_by_role: Database["public"]["Enums"]["app_role"] | null;
          reason: string | null;
          correlation_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          previous_status?: string | null;
          new_status: string;
          changed_by?: string | null;
          changed_by_role?: Database["public"]["Enums"]["app_role"] | null;
          reason?: string | null;
          correlation_id?: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["project_status_history"]["Insert"]
        >;
      };
      workflow_settings: {
        Row: {
          setting_key: string;
          setting_value: Json;
          description: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          setting_key: string;
          setting_value: Json;
          description?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["workflow_settings"]["Insert"]
        >;
      };
      contract_templates: {
        Row: {
          id: string;
          payment_terms: string;
          warranty_terms: string;
          execution_terms: string;
          contract_terms: string;
          first_party_obligations: string;
          second_party_obligations: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          payment_terms?: string;
          warranty_terms?: string;
          execution_terms?: string;
          contract_terms?: string;
          first_party_obligations?: string;
          second_party_obligations?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contract_templates"]["Insert"]>;
      };
    };
    Functions: {
      delete_projects_as_admin: {
        Args: {
          target_project_ids: string[];
          actor_user_id: string;
        };
        Returns: Array<{ deleted_project_id: string }>;
      };
      create_measurement_request: {
        Args: {
          target_project_id: string;
          target_assignee_id?: string | null;
          target_preferred_at?: string | null;
          request_instructions?: string | null;
          actor_user_id?: string;
        };
        Returns: Database["public"]["Tables"]["measurement_requests"]["Row"];
      };
      advance_measurement_workflow: {
        Args: {
          target_request_id: string;
          workflow_action: string;
          actor_user_id?: string;
          action_note?: string | null;
        };
        Returns: Database["public"]["Tables"]["measurement_requests"]["Row"];
      };
      assign_measurement_request: {
        Args: {
          target_request_id: string;
          target_assignee_id: string;
          target_preferred_at?: string | null;
          assignment_note?: string | null;
          actor_user_id?: string;
        };
        Returns: Database["public"]["Tables"]["measurement_requests"]["Row"];
      };
      create_sales_follow_up_task: {
        Args: {
          target_project_id: string;
          target_task_type: string;
          target_due_at: string;
          target_assignee_id?: string | null;
          target_interval_source?: string;
          actor_user_id?: string;
        };
        Returns: Database["public"]["Tables"]["follow_up_tasks"]["Row"];
      };
      claim_sales_follow_up_task: {
        Args: {
          target_task_id: string;
          actor_user_id?: string;
        };
        Returns: Database["public"]["Tables"]["follow_up_tasks"]["Row"];
      };
      record_sales_follow_up_activity: {
        Args: {
          target_task_id: string;
          activity_method: string;
          activity_client_answered?: boolean | null;
          activity_client_response?: string | null;
          activity_internal_notes?: string | null;
          activity_outcome?: string | null;
          next_due_at?: string | null;
          complete_task?: boolean;
          actor_user_id?: string;
        };
        Returns: Database["public"]["Tables"]["follow_up_activities"]["Row"];
      };
      save_quotation_version_with_items: {
        Args: {
          p_quotation_id: string | null;
          p_project_id: string;
          p_client_id: string;
          p_quotation_discount_percent: number;
          p_subtotal: number;
          p_line_discount_total: number;
          p_quotation_discount_total: number;
          p_grand_total: number;
          p_pricing_source: string;
          p_notes: string | null;
          p_prepared_by_text: string | null;
          p_client_representative: string | null;
          p_created_by: string;
          p_items: Json;
        };
        Returns: Array<{
          id: string;
          quotation_number: string;
          version_id: string;
          version_number: number;
          version_status: string;
          created_at: string;
        }>;
      };
      transition_quotation_version: {
        Args: {
          target_version_id: string;
          transition_action: string;
          actor_user_id?: string;
        };
        Returns: Database["public"]["Tables"]["quotation_versions"]["Row"];
      };
      sign_contract_and_create_handoff: {
        Args: {
          target_contract_id: string;
          client_signature: string;
          client_name: string;
          client_signature_at: string;
          sales_signature: string;
          sales_name: string;
          sales_signature_at: string;
          actor_user_id?: string;
        };
        Returns: Array<{
          contract_id: string;
          handoff_id: string;
          handoff_status: string;
        }>;
      };
      update_sales_appointment_status: {
        Args: {
          target_appointment_id: string;
          target_status: string;
          completion_note?: string | null;
          actor_user_id?: string;
        };
        Returns: Database["public"]["Tables"]["appointments"]["Row"];
      };
    };
  };
};

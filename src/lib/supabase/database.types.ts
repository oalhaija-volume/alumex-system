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
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
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
      contracts: {
        Row: {
          id: string;
          contract_number: string;
          project_id: string;
          quotation_id: string | null;
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
  };
};

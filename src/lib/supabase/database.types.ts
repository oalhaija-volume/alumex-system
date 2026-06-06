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
      app_role: "Admin" | "Sales Manager" | "Sales User";
      project_status:
        | "Draft"
        | "Measuring"
        | "Quotation"
        | "Contract"
        | "Production"
        | "Completed";
      quotation_status: "Draft" | "Sent" | "Approved" | "Rejected" | "Expired";
      contract_status: "Draft" | "Review" | "Active" | "Completed" | "Cancelled";
      document_owner_type:
        | "client"
        | "project"
        | "quotation"
        | "contract";
    };
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: Database["public"]["Enums"]["app_role"];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          is_active?: boolean;
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
          project_type: string | null;
          sales_engineer_id: string | null;
          status: Database["public"]["Enums"]["project_status"];
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
          project_type?: string | null;
          sales_engineer_id?: string | null;
          status?: Database["public"]["Enums"]["project_status"];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
      };
    };
  };
};

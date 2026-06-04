export type UserRole = 'landlord' | 'tenant';
export type IssueCategory = 'plumbing' | 'electrical' | 'windows_doors' | 'other';
export type IssueStatus = 'open' | 'in_progress' | 'resolved';
export type InvitationStatus = 'pending' | 'accepted' | 'expired';
export type DocumentCategory = 'contract' | 'rules' | 'receipt' | 'other';
export type ExpenseCategory = 'maintenance' | 'repair' | 'utilities' | 'insurance' | 'tax' | 'other';
export type InspectionReportType = 'move_in' | 'move_out';
export type InspectionReportStatus = 'draft' | 'sent_to_tenant' | 'tenant_responded' | 'locked';
export type InspectionItemCategory = 'kitchen' | 'bathroom' | 'floors' | 'walls' | 'other';
export type InspectionItemCondition = 'good' | 'fair' | 'poor';

export interface Database {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: UserRole;
          avatar_url: string | null;
          push_token: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          landlord_id: string;
          address: string;
          city: string;
          postal_code: string;
          description: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['properties']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['properties']['Insert']>;
        Relationships: [];
      };
      units: {
        Row: {
          id: string;
          property_id: string;
          unit_number: string;
          floor: number | null;
          size_sqm: number | null;
          monthly_rent: number | null;
          tenant_id: string | null;
          lease_start: string | null;
          lease_end: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['units']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['units']['Insert']>;
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          unit_id: string;
          landlord_id: string;
          email: string;
          token: string;
          status: InvitationStatus;
          expires_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['invitations']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['invitations']['Insert']>;
        Relationships: [];
      };
      issues: {
        Row: {
          id: string;
          unit_id: string;
          tenant_id: string;
          title: string;
          description: string;
          category: IssueCategory;
          status: IssueStatus;
          created_at: string;
          updated_at: string;
          resolved_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['issues']['Row'], 'id' | 'created_at' | 'updated_at' | 'resolved_at'>;
        Update: Partial<Database['public']['Tables']['issues']['Insert']>;
        Relationships: [];
      };
      issue_images: {
        Row: {
          id: string;
          issue_id: string;
          storage_path: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['issue_images']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['issue_images']['Insert']>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          unit_id: string;
          sender_id: string;
          content: string;
          image_url: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          unit_id: string;
          uploaded_by: string;
          name: string;
          category: DocumentCategory;
          storage_path: string;
          file_size: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['documents']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['documents']['Insert']>;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          unit_id: string;
          landlord_id: string;
          amount: number;
          category: ExpenseCategory;
          description: string;
          date: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['expenses']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>;
        Relationships: [];
      };
      inspection_reports: {
        Row: {
          id: string;
          unit_id: string;
          landlord_id: string;
          type: InspectionReportType;
          status: InspectionReportStatus;
          notes: string | null;
          tenant_signed_at: string | null;
          tenant_signed_by: string | null;
          locked_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['inspection_reports']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['inspection_reports']['Insert']>;
        Relationships: [];
      };
      inspection_items: {
        Row: {
          id: string;
          report_id: string;
          category: InspectionItemCategory;
          condition: InspectionItemCondition | null;
          notes: string | null;
          tenant_comment: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['inspection_items']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['inspection_items']['Insert']>;
        Relationships: [];
      };
      leases: {
        Row: {
          id: string;
          unit_id: string;
          tenant_id: string;
          started_at: string;
          ended_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['leases']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['leases']['Insert']>;
        Relationships: [];
      };
      inspection_photos: {
        Row: {
          id: string;
          item_id: string;
          storage_path: string;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['inspection_photos']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['inspection_photos']['Insert']>;
        Relationships: [];
      };
    };
  };
}

export type UserRow = Database['public']['Tables']['users']['Row'];
export type PropertyRow = Database['public']['Tables']['properties']['Row'];
export type UnitRow = Database['public']['Tables']['units']['Row'];
export type IssueRow = Database['public']['Tables']['issues']['Row'];
export type MessageRow = Database['public']['Tables']['messages']['Row'];
export type DocumentRow = Database['public']['Tables']['documents']['Row'];
export type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
export type InspectionReportRow = Database['public']['Tables']['inspection_reports']['Row'];
export type InspectionItemRow = Database['public']['Tables']['inspection_items']['Row'];
export type InspectionPhotoRow = Database['public']['Tables']['inspection_photos']['Row'];
export type LeaseRow = Database['public']['Tables']['leases']['Row'];

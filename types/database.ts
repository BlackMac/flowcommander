export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          initial_prompt: string;
          current_code: string | null;
          sandbox_id: string | null;
          webhook_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          initial_prompt: string;
          current_code?: string | null;
          sandbox_id?: string | null;
          webhook_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          initial_prompt?: string;
          current_code?: string | null;
          sandbox_id?: string | null;
          webhook_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          project_id: string;
          role: "user" | "assistant";
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          role: "user" | "assistant";
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          role?: "user" | "assistant";
          content?: string;
          created_at?: string;
        };
      };
      webhook_events: {
        Row: {
          id: string;
          project_id: string;
          event_type: string;
          event_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          event_type: string;
          event_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          event_type?: string;
          event_data?: Json | null;
          created_at?: string;
        };
      };
      phone_numbers: {
        Row: {
          id: string;
          phone_number: string;
          display_number: string;
          project_id: string | null;
          assigned_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          phone_number: string;
          display_number: string;
          project_id?: string | null;
          assigned_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          phone_number?: string;
          display_number?: string;
          project_id?: string | null;
          assigned_at?: string | null;
          created_at?: string;
        };
      };
    };
  };
}

export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];
export type WebhookEvent = Database["public"]["Tables"]["webhook_events"]["Row"];
export type PhoneNumber = Database["public"]["Tables"]["phone_numbers"]["Row"];

// Extended project type that includes phone number
export interface ProjectWithPhone extends Project {
  phone_number: PhoneNumber | null;
}

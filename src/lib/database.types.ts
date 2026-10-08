export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      exam_assignments: {
        Row: { exam_id: string; student_id: string; assigned_by: string | null; assigned_at: string }
        Insert: { exam_id: string; student_id: string; assigned_by?: string | null; assigned_at?: string }
        Update: { exam_id?: string; student_id?: string; assigned_by?: string | null; assigned_at?: string }
        Relationships: []
      }
      exam_slots: {
        Row: { id: string; exam_id: string; starts_at: string; ends_at: string; capacity: number; created_by: string | null; created_at: string }
        Insert: { id?: string; exam_id: string; starts_at: string; ends_at: string; capacity: number; created_by?: string | null; created_at?: string }
        Update: { id?: string; exam_id?: string; starts_at?: string; ends_at?: string; capacity?: number; created_by?: string | null; created_at?: string }
        Relationships: []
      }
      exam_slot_bookings: {
        Row: { exam_id: string; student_id: string; slot_id: string; booked_at: string }
        Insert: { exam_id: string; student_id: string; slot_id: string; booked_at?: string }
        Update: { exam_id?: string; student_id?: string; slot_id?: string; booked_at?: string }
        Relationships: []
      }
      profiles: {
        Row: { id: string; email: string | null; display_name: string | null; role: Database['public']['Enums']['app_role']; provisioned: boolean; email_verified: boolean; email_verified_at: string | null; created_at: string }
        Insert: { id: string; email?: string | null; display_name?: string | null; role?: Database['public']['Enums']['app_role']; provisioned?: boolean; email_verified?: boolean; email_verified_at?: string | null; created_at?: string }
        Update: { id?: string; email?: string | null; display_name?: string | null; role?: Database['public']['Enums']['app_role']; provisioned?: boolean; email_verified?: boolean; email_verified_at?: string | null; created_at?: string }
        Relationships: []
      }
      exams: {
        Row: { id: string; title: string; description: string; duration_minutes: number; status: Database['public']['Enums']['exam_status']; starts_at: string | null; ends_at: string | null; created_by: string; created_at: string; updated_at: string }
        Insert: { id?: string; title: string; description?: string; duration_minutes: number; status?: Database['public']['Enums']['exam_status']; starts_at?: string | null; ends_at?: string | null; created_by: string; created_at?: string; updated_at?: string }
        Update: { id?: string; title?: string; description?: string; duration_minutes?: number; status?: Database['public']['Enums']['exam_status']; starts_at?: string | null; ends_at?: string | null; created_by?: string; created_at?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: 'exams_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }]
      }
      questions: {
        Row: { id: string; exam_id: string; prompt: string; type: Database['public']['Enums']['question_type']; points: number; position: number }
        Insert: { id?: string; exam_id: string; prompt: string; type: Database['public']['Enums']['question_type']; points?: number; position: number }
        Update: { id?: string; exam_id?: string; prompt?: string; type?: Database['public']['Enums']['question_type']; points?: number; position?: number }
        Relationships: [{ foreignKeyName: 'questions_exam_id_fkey'; columns: ['exam_id']; isOneToOne: false; referencedRelation: 'exams'; referencedColumns: ['id'] }]
      }
      question_options: {
        Row: { id: string; question_id: string; label: string; position: number }
        Insert: { id?: string; question_id: string; label: string; position: number }
        Update: { id?: string; question_id?: string; label?: string; position?: number }
        Relationships: [{ foreignKeyName: 'question_options_question_id_fkey'; columns: ['question_id']; isOneToOne: false; referencedRelation: 'questions'; referencedColumns: ['id'] }]
      }
      question_answer_keys: {
        Row: { question_id: string; correct_option_id: string }
        Insert: { question_id: string; correct_option_id: string }
        Update: { question_id?: string; correct_option_id?: string }
        Relationships: [
          { foreignKeyName: 'question_answer_keys_question_id_fkey'; columns: ['question_id']; isOneToOne: true; referencedRelation: 'questions'; referencedColumns: ['id'] },
          { foreignKeyName: 'question_answer_keys_correct_option_id_fkey'; columns: ['correct_option_id']; isOneToOne: false; referencedRelation: 'question_options'; referencedColumns: ['id'] }
        ]
      }
      exam_attempts: {
        Row: { id: string; exam_id: string; user_id: string; status: Database['public']['Enums']['attempt_status']; started_at: string; expires_at: string; submitted_at: string | null; disqualified_at: string | null; violation_count: number; face_violation_count: number; auto_score: number; manual_score: number; max_score: number; requires_manual_grading: boolean; created_at: string }
        Insert: { id?: string; exam_id: string; user_id: string; status?: Database['public']['Enums']['attempt_status']; started_at?: string; expires_at?: string; submitted_at?: string | null; disqualified_at?: string | null; violation_count?: number; face_violation_count?: number; auto_score?: number; manual_score?: number; max_score?: number; requires_manual_grading?: boolean; created_at?: string }
        Update: { id?: string; exam_id?: string; user_id?: string; status?: Database['public']['Enums']['attempt_status']; started_at?: string; expires_at?: string; submitted_at?: string | null; disqualified_at?: string | null; violation_count?: number; face_violation_count?: number; auto_score?: number; manual_score?: number; max_score?: number; requires_manual_grading?: boolean; created_at?: string }
        Relationships: [
          { foreignKeyName: 'exam_attempts_exam_id_fkey'; columns: ['exam_id']; isOneToOne: false; referencedRelation: 'exams'; referencedColumns: ['id'] },
          { foreignKeyName: 'exam_attempts_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
      answers: {
        Row: { id: string; attempt_id: string; question_id: string; selected_option_id: string | null; text_answer: string | null; manual_score: number | null; grader_feedback: string | null; graded_by: string | null; graded_at: string | null; updated_at: string }
        Insert: { id?: string; attempt_id: string; question_id: string; selected_option_id?: string | null; text_answer?: string | null; manual_score?: number | null; grader_feedback?: string | null; graded_by?: string | null; graded_at?: string | null; updated_at?: string }
        Update: { id?: string; attempt_id?: string; question_id?: string; selected_option_id?: string | null; text_answer?: string | null; manual_score?: number | null; grader_feedback?: string | null; graded_by?: string | null; graded_at?: string | null; updated_at?: string }
        Relationships: [
          { foreignKeyName: 'answers_attempt_id_fkey'; columns: ['attempt_id']; isOneToOne: false; referencedRelation: 'exam_attempts'; referencedColumns: ['id'] },
          { foreignKeyName: 'answers_question_id_fkey'; columns: ['question_id']; isOneToOne: false; referencedRelation: 'questions'; referencedColumns: ['id'] },
          { foreignKeyName: 'answers_selected_option_id_fkey'; columns: ['selected_option_id']; isOneToOne: false; referencedRelation: 'question_options'; referencedColumns: ['id'] },
          { foreignKeyName: 'answers_graded_by_fkey'; columns: ['graded_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
      proctor_events: {
        Row: { id: number; client_event_id: string; attempt_id: string; user_id: string; event_type: Database['public']['Enums']['proctor_event_type']; details: Json; occurred_at: string }
        Insert: { id?: number; client_event_id: string; attempt_id: string; user_id: string; event_type: Database['public']['Enums']['proctor_event_type']; details?: Json; occurred_at?: string }
        Update: { id?: number; client_event_id?: string; attempt_id?: string; user_id?: string; event_type?: Database['public']['Enums']['proctor_event_type']; details?: Json; occurred_at?: string }
        Relationships: [
          { foreignKeyName: 'proctor_events_attempt_id_fkey'; columns: ['attempt_id']; isOneToOne: false; referencedRelation: 'exam_attempts'; referencedColumns: ['id'] },
          { foreignKeyName: 'proctor_events_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      admin_set_exam_students: { Args: { p_exam_id: string; p_student_ids: string[] }; Returns: Json }
      admin_create_exam_slot: { Args: { p_exam_id: string; p_starts_at: string; p_ends_at: string; p_capacity: number }; Returns: string }
      choose_exam_slot: { Args: { p_exam_id: string; p_slot_id: string }; Returns: Json }
      get_exam_slots: { Args: { p_exam_id: string }; Returns: Json }
      admin_create_exam: { Args: { p_payload: Json }; Returns: string }
      admin_grade_answer: { Args: { p_attempt_id: string; p_question_id: string; p_score: number; p_feedback?: string }; Returns: Database['public']['Tables']['answers']['Row'] }
      finalize_attempt: { Args: { p_attempt_id: string; p_answers?: Json }; Returns: Database['public']['Tables']['exam_attempts']['Row'] }
      finish_student_password_change: { Args: { p_reservation_id: string; p_success: boolean }; Returns: undefined }
      get_attempt_grade: { Args: { p_attempt_id: string }; Returns: Json }
      get_student_email_verification_status: { Args: Record<PropertyKey, never>; Returns: Json }
      reserve_student_password_change: { Args: Record<PropertyKey, never>; Returns: Json }
      save_attempt_answer: { Args: { p_attempt_id: string; p_question_id: string; p_selected_option_id?: string | null; p_text_answer?: string | null }; Returns: Database['public']['Tables']['answers']['Row'] }
      submit_attempt: { Args: { p_attempt_id: string }; Returns: Database['public']['Tables']['exam_attempts']['Row'] }
      verify_student_email_otp: { Args: { p_code: string }; Returns: Json }
    }
    Enums: {
      app_role: 'student' | 'admin'
      exam_status: 'draft' | 'published' | 'archived'
      question_type: 'single_choice' | 'short_text'
      attempt_status: 'in_progress' | 'submitted' | 'disqualified' | 'graded'
      proctor_event_type: 'tab_hidden' | 'fullscreen_exit' | 'media_ended' | 'media_permission_denied' | 'window_blur' | 'face_missing_warning' | 'multiple_faces_warning' | 'face_monitor_error'
    }
    CompositeTypes: Record<string, never>
  }
}

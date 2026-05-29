import { ObjectId } from 'mongodb'

export interface EmployeeDoc {
  _id: ObjectId | string
  employee_code?: string | null
  email?: string | null
  password?: string | null
  name: string
  display_name: string
  default_language: string
  status: string
  created_at: Date
  updated_at: Date
}

export interface AdminDoc {
  _id: ObjectId
  email_id: string
  password: string
  name?: string | null
  status: string
  created_at: Date
  updated_at: Date
}

export interface AnalysisHeadDoc {
  _id: ObjectId | string
  name: string
  description?: string | null
  status: string
  created_at: Date
  updated_at: Date
}

export interface CallScenarioDoc {
  _id: ObjectId | string
  analysis_head_id: ObjectId | string
  name: string
  description?: string | null
  status: string
  created_at: Date
  updated_at: Date
}

export interface MasterFileDoc {
  _id: ObjectId | string
  title: string
  version: string
  scope: string
  analysis_head_id?: ObjectId | string | null
  file_url: string
  extracted_text?: string | null
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface CallDoc {
  _id: ObjectId
  employee_id: ObjectId | string
  analysis_head_id: ObjectId | string
  call_scenario_id: ObjectId | string
  upload_batch_id?: ObjectId | string | null
  call_datetime: Date
  file_name: string
  audio_url: string
  duration_seconds?: number | null
  transcription_status: string
  transcript_text?: string | null
  raw_transcript_json_url?: string | null
  analysis_status: string
  analysis_text?: string | null
  raw_analysis_json_url?: string | null
  analysis_error?: string | null
  analyzed_at?: Date | null
  language_detected?: string | null
  speaker_count?: number | null
  notes?: string | null
  created_at: Date
  updated_at: Date
}

export interface UploadBatchDoc {
  _id: ObjectId
  uploaded_by?: string | null
  employee_id: ObjectId | string
  analysis_head_id: ObjectId | string
  call_scenario_id: ObjectId | string
  batch_date: Date
  total_files: number
  completed_files: number
  failed_files: number
  sheet_file_name?: string | null
  sheet_file_url?: string | null
  sheet_text?: string | null
  report_status: string
  report_text?: string | null
  report_file_url?: string | null
  report_error?: string | null
  report_generated_at?: Date | null
  notes?: string | null
  created_at: Date
  updated_at: Date
}

// Serialised API shapes — _id converted to id string, ObjectId refs to strings
export type SerializedEmployee = Omit<EmployeeDoc, '_id' | 'password'> & { id: string }
export type SerializedAnalysisHead = Omit<AnalysisHeadDoc, '_id'> & { id: string }
export type SerializedCallScenario = Omit<CallScenarioDoc, '_id' | 'analysis_head_id'> & {
  id: string
  analysis_head_id: string
  analysis_head?: { id: string; name: string }
}
export type SerializedMasterFile = Omit<MasterFileDoc, '_id' | 'analysis_head_id'> & {
  id: string
  analysis_head_id: string | null
  analysis_head?: { id: string; name: string } | null
}
export type SerializedCall = Omit<
  CallDoc,
  '_id' | 'employee_id' | 'analysis_head_id' | 'call_scenario_id' | 'upload_batch_id'
> & {
  id: string
  employee_id: string
  analysis_head_id: string
  call_scenario_id: string
  upload_batch_id: string | null
  employee?: { id: string; name: string; display_name: string }
  analysis_head?: { id: string; name: string }
  call_scenario?: { id: string; name: string }
}
export type SerializedUploadBatch = Omit<
  UploadBatchDoc,
  '_id' | 'employee_id' | 'analysis_head_id' | 'call_scenario_id'
> & {
  id: string
  employee_id: string
  analysis_head_id: string
  call_scenario_id: string
  employee?: { id: string; name: string; display_name: string }
  analysis_head?: { id: string; name: string }
  call_scenario?: { id: string; name: string }
}

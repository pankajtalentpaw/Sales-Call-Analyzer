import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import type {
  AdminDoc,
  EmployeeDoc,
  AnalysisHeadDoc,
  CallScenarioDoc,
  MasterFileDoc,
  CallDoc,
  UploadBatchDoc,
} from './types'

export async function admins() {
  return (await getDb()).collection<AdminDoc>('admins')
}

export async function employees() {
  return (await getDb()).collection<EmployeeDoc>('employees')
}

export async function analysisHeads() {
  return (await getDb()).collection<AnalysisHeadDoc>('analysis_heads')
}

export async function callScenarios() {
  return (await getDb()).collection<CallScenarioDoc>('call_scenarios')
}

export async function masterFiles() {
  return (await getDb()).collection<MasterFileDoc>('master_files')
}

export async function calls() {
  return (await getDb()).collection<CallDoc>('calls')
}

export async function uploadBatches() {
  return (await getDb()).collection<UploadBatchDoc>('upload_batches')
}

export function toOid(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new Error(`Invalid ObjectId: ${id}`)
  return new ObjectId(id)
}

export function idToString(id: unknown): string {
  if (id instanceof ObjectId) return id.toHexString()
  if (typeof id === 'string') return id

  if (
    typeof id === 'object' &&
    id !== null &&
    'toHexString' in id &&
    typeof (id as { toHexString: () => string }).toHexString === 'function'
  ) {
    return (id as { toHexString: () => string }).toHexString()
  }

  return String(id)
}

export function idQueryValue(id: string): any {
  if (!ObjectId.isValid(id)) return id
  return { $in: [new ObjectId(id), id] }
}

export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000
}

export function now(): Date {
  return new Date()
}

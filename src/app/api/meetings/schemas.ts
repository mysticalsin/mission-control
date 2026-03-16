import { z } from 'zod'

// ---------------------------------------------------------------------------
// POST schemas
// ---------------------------------------------------------------------------

export const createMeetingSchema = z.object({
  action: z.literal('create_meeting'),
  title: z.string().min(1).max(500),
  start_at: z.string().min(1),
  end_at: z.string().min(1),
  location: z.string().max(500).optional(),
  meeting_url: z.string().url().max(2000).optional(),
  participants: z.array(z.string().max(200)).optional(),
  agenda: z.string().max(10000).optional(),
})

export const addActionItemSchema = z.object({
  action: z.literal('add_action_item'),
  meeting_id: z.number().int().positive(),
  description: z.string().min(1).max(2000),
  assignee: z.string().max(200).optional(),
  due_date: z.string().optional(),
})

export const uploadTranscriptSchema = z.object({
  action: z.literal('upload_transcript'),
  meeting_id: z.number().int().positive(),
  transcript: z.string().min(1).max(100000),
  summary: z.string().max(10000).optional(),
  key_decisions: z.array(z.string().max(2000)).optional(),
})

export const postBodySchema = z.discriminatedUnion('action', [
  createMeetingSchema,
  addActionItemSchema,
  uploadTranscriptSchema,
])

// ---------------------------------------------------------------------------
// PATCH schemas
// ---------------------------------------------------------------------------

export const patchMeetingSchema = z.object({
  action: z.literal('update_meeting'),
  id: z.number().int().positive(),
  title: z.string().min(1).max(500).optional(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  location: z.string().max(500).optional(),
  meeting_url: z.string().url().max(2000).optional(),
  participants: z.array(z.string().max(200)).optional(),
  agenda: z.string().max(10000).optional(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
})

export const patchActionItemSchema = z.object({
  action: z.literal('complete_action_item'),
  id: z.number().int().positive(),
  status: z.enum(['open', 'in-progress', 'done']),
})

export const patchBodySchema = z.discriminatedUnion('action', [
  patchMeetingSchema,
  patchActionItemSchema,
])

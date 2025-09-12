import { z } from "zod";

// schemas for tool args
export const SearchEmailsSchema = z.object({
  query: z.string(),
  maxResults: z.number().optional(),
});

export const ReadEmailSchema = z.object({
  messageId: z.string(),
});

export const SendEmailSchema = z.object({
  to: z.array(z.string().email()),
  subject: z.string(),
  body: z.string(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  threadId: z.string().optional(),
});

export const ModifyLabelsSchema = z.object({
  messageIds: z.array(z.string()),
  addLabels: z.array(z.string()).optional(),
  removeLabels: z.array(z.string()).optional(),
});

export const BatchOperationSchema = z.object({
  query: z.string(),
  operation: z.enum([
    "archive",
    "delete",
    "markRead",
    "markUnread",
    "star",
    "unstar",
  ]),
});

export const CreateLabelSchema = z.object({
  name: z.string(),
});

// type inference from schemas
export type SearchEmailsArgs = z.infer<typeof SearchEmailsSchema>;
export type ReadEmailArgs = z.infer<typeof ReadEmailSchema>;
export type SendEmailArgs = z.infer<typeof SendEmailSchema>;
export type ModifyLabelsArgs = z.infer<typeof ModifyLabelsSchema>;
export type BatchOperationArgs = z.infer<typeof BatchOperationSchema>;
export type CreateLabelArgs = z.infer<typeof CreateLabelSchema>;

// helper for validation with proper typing
export function validateArgs<T>(schema: z.ZodSchema<T>, args: unknown): T {
  const result = schema.safeParse(args);
  if (!result.success) {
    throw new Error(`Invalid arguments: ${result.error.message}`);
  }
  return result.data;
}

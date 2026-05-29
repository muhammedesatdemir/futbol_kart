import { z } from 'zod';

export const templateSchema = z.object({
  id: z.string(),
  category: z.enum(['numeric', 'geo', 'time', 'creative']),
  title: z.record(z.string()),
  description: z.record(z.string()).optional(),
  field: z.string(),
  compute: z.enum([
    'sum',
    'max',
    'min',
    'count',
    'countDistinct',
    'distance',
    'identity',
    'custom',
  ]),
  compareOp: z.enum(['max', 'min', 'bool']),
  tiebreakers: z.array(z.string()),
  requiresFields: z.array(z.string()),
});

export type Template = z.infer<typeof templateSchema>;

export const templatesSchema = z.array(templateSchema);

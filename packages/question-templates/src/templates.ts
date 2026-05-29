import raw from '../templates.json' with { type: 'json' };
import { templatesSchema, type Template } from './schema';

const parsed = templatesSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`templates.json validation failed: ${parsed.error.message}`);
}

export const TEMPLATES: readonly Template[] = parsed.data;

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

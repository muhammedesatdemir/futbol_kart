export type QuestionCategory = 'numeric' | 'geo' | 'time' | 'creative';
export type CompareOp = 'max' | 'min' | 'bool';
export type ComputeOp =
  | 'sum'
  | 'max'
  | 'min'
  | 'count'
  | 'countDistinct'
  | 'distance'
  | 'identity'
  | 'custom';

export interface Question {
  id: string;
  category: QuestionCategory;
  title: Record<string, string>;
  description?: Record<string, string>;
  field: string;
  compute: ComputeOp;
  compareOp: CompareOp;
  tiebreakers: string[];
  requiresFields: string[];
}

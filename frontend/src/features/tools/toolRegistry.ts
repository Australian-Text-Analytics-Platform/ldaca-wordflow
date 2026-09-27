import {
  FileText,
  Filter,
  FolderOpen,
  Hash,
  Puzzle,
  Quote,
  Tags,
  TrendingUp,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { ALL_TOOLS, type ToolId } from '@/features/tools/toolIds';

export interface ToolDefinition {
  id: ToolId;
  label: string;
  icon: LucideIcon;
}

/**
 * UI-facing tool metadata.
 *
 * Used by the sidebar and settings for labels and icons. Feature rendering
 * is owned by the project application.
 */
const TOOL_METADATA = {
  'data-loader': { label: 'Data Loader', icon: FolderOpen },
  filter: { label: 'Preprocessing', icon: Filter },
  'token-frequency': { label: 'Frequency', icon: Hash },
  concordance: { label: 'Concordance', icon: FileText },
  plots: { label: 'Plots', icon: TrendingUp },
  'topic-modeling': { label: 'Topic Modelling', icon: Puzzle },
  quotation: { label: 'Quotation', icon: Quote },
  annotation: { label: 'Annotation', icon: Tags },
  export: { label: 'Export', icon: Upload },
} satisfies Record<ToolId, Omit<ToolDefinition, 'id'>>;

export const TOOL_DEFINITIONS: ToolDefinition[] = ALL_TOOLS.map((id) => ({
  id,
  ...TOOL_METADATA[id],
}));

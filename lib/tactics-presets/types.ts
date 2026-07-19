import type {
  TacticsBoardObject,
  TacticsFieldOrientation,
  TacticsFieldView,
  TacticsPlaybackSettings,
} from "@/lib/tactics-boards";

export type TacticsPresetKind =
  | "formation"
  | "tactical_sequence"
  | "practice_drill";

export type TacticsPresetFormat = "9v9" | "11v11" | "small_sided";

export type TacticsPresetCategory =
  | "formations"
  | "attacking"
  | "defending"
  | "transitions"
  | "set_pieces"
  | "practice_drills";

export type TacticsPresetDifficulty =
  | "foundation"
  | "developing"
  | "advanced";

export type TacticsPresetSourceType = "built_in" | "team";

export type PresetSource = {
  presetId: string;
  presetVersion: number;
  presetTitle: string;
  sourceType: TacticsPresetSourceType;
};

export type TacticsPresetEquipment = {
  balls?: number | "one-per-player";
  cones?: number;
  pinnies?: number;
  goals?: number;
  miniGoals?: number;
};

export type DrillVariation = {
  title: string;
  description: string;
};

export type CoachingMistake = {
  mistake: string;
  correction?: string;
};

export type PresetEditorialMetadata = {
  contentStatus:
    | "internal_draft"
    | "reviewed"
    | "licensed"
    | "public_domain";
  methodologyTags?: string[];
  sourceName?: string;
  sourceReference?: string;
  sourceNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

export type ExternalDrillReference = {
  provider: string;
  title: string;
  url?: string;
  license?: string;
  attributionRequired?: boolean;
  importedAt?: string;
};

export type TacticsPresetStep = {
  id: string;
  order: number;
  title: string;
  explanation?: string;
  coachCue?: string;
  playerAction?: string;
  ballAction?: string;
  notes?: string;
  durationMs?: number;
  objects: TacticsBoardObject[];
};

export type TacticsPreset = {
  id: string;
  version: number;
  title: string;
  shortDescription: string;
  kind: TacticsPresetKind;
  category: TacticsPresetCategory;
  format: TacticsPresetFormat;
  playerCount?: number;
  goalkeeperCount?: number;
  ageGuidance?: string;
  difficulty: TacticsPresetDifficulty;
  estimatedMinutes?: number;
  fieldOrientation: TacticsFieldOrientation;
  fieldView: TacticsFieldView;
  fieldArea?: "full" | "half" | "third" | "custom";
  objectives: string[];
  setupInstructions: string[];
  howItWorks?: string[];
  /** @deprecated Use howItWorks for new presets. */
  activityInstructions?: string[];
  coachingPoints: string[];
  commonMistakes?: CoachingMistake[];
  progressions?: Array<DrillVariation | string>;
  regressions?: Array<DrillVariation | string>;
  safetyNotes?: string[];
  equipment?: TacticsPresetEquipment;
  editorialMetadata?: PresetEditorialMetadata;
  externalReferences?: ExternalDrillReference[];
  playbackSettings: TacticsPlaybackSettings;
  steps: TacticsPresetStep[];
  tags: string[];
};

export type TeamTacticsPreset = TacticsPreset & {
  teamId: string;
  sourceType: "team";
  createdAt: import("firebase/firestore").Timestamp | null;
  updatedAt: import("firebase/firestore").Timestamp | null;
  createdBy: string;
  updatedBy: string;
};

export const PRESET_CATEGORY_LABELS: Record<
  TacticsPresetCategory,
  string
> = {
  formations: "Formations",
  attacking: "Attacking",
  defending: "Defending",
  transitions: "Transitions",
  set_pieces: "Set Pieces",
  practice_drills: "Practice Drills",
};

export const PRESET_FORMAT_LABELS: Record<TacticsPresetFormat, string> = {
  "9v9": "9v9",
  "11v11": "11v11",
  small_sided: "Small-sided",
};

export const PRESET_DIFFICULTY_LABELS: Record<
  TacticsPresetDifficulty,
  string
> = {
  foundation: "Foundation",
  developing: "Developing",
  advanced: "Advanced",
};

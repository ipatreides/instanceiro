export const ARTISTA_CLASSES = ['Trovador', 'Musa'] as const;

export type SlotType = 'class' | 'dps_fisico' | 'dps_magico' | 'artista';

export const SLOT_TYPES: SlotType[] = ['dps_fisico', 'dps_magico', 'artista', 'class'];

export const SLOT_TYPE_LABELS: Record<SlotType, string> = {
  class: 'Classe',
  dps_fisico: 'DPS Físico',
  dps_magico: 'DPS Mágico',
  artista: 'Artista',
};

export const SLOT_TYPE_DESCRIPTIONS: Record<SlotType, string> = {
  class: 'Classe específica',
  dps_fisico: 'Qualquer classe',
  dps_magico: 'Qualquer classe',
  artista: 'Trovador ou Musa',
};

export const SLOT_TYPE_COLORS: Record<SlotType, string> = {
  dps_fisico: 'var(--slot-dps-fisico)',
  dps_magico: 'var(--slot-dps-magico)',
  artista: 'var(--slot-artista)',
  class: 'var(--slot-classe)',
};

export type StorageTier = 'hot' | 'warm' | 'cold' | 'archive';

export interface StorageLifecycleRule {
  id: string;
  tenantId: string;
  prefix: string;
  transitionDays: Partial<Record<StorageTier, number>>;
  retainDays?: number;
}

export interface StorageObjectMetadata {
  objectKey: string;
  tenantId: string;
  tier: StorageTier;
  createdAt: string;
  lastAccessedAt?: string;
}

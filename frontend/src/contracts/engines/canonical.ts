export interface CanonicalCandidate {
  sourceId: string;
  sourceType: 'youtube' | 'spotify' | 'internal' | 'manual';
  confidence: number;
  reasonCodes: string[];
}

export interface CanonicalDetectionRequest {
  artist: string;
  song: string;
  isrc?: string;
  upc?: string;
  tenantId: string;
}

export interface CanonicalDetectionResult {
  canonicalTrackId: string | null;
  candidates: CanonicalCandidate[];
}

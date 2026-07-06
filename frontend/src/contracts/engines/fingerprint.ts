export interface FingerprintVector {
  algorithm: 'chromaprint' | 'mfcc' | 'spectral' | 'constellation';
  version: string;
  values: number[];
}

export interface FingerprintRecord {
  id: string;
  sourceUrl: string;
  canonicalTrackId?: string;
  durationSeconds: number;
  sampleOffsetSeconds: number;
  vectors: FingerprintVector[];
  createdAt: string;
}

export interface FingerprintCompareRequest {
  referenceUrl: string;
  candidateUrl: string;
  sampleDurationSeconds?: number;
  sampleOffsetSeconds?: number;
}

export interface FingerprintCompareResult {
  combinedScore: number;
  verified: boolean;
  algorithmScores: Array<{ algorithm: FingerprintVector['algorithm']; score: number; weight: number }>;
}

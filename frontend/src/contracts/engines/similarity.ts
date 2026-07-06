export interface SimilarityFeatureSet {
  melodicContour: number[];
  harmonicProfile: number[];
  rhythmicProfile: number[];
  timbreProfile: number[];
}

export interface SimilarityRequest {
  referenceTrackId: string;
  candidateTrackId: string;
  tenantId: string;
}

export interface SimilarityResult {
  score: number;
  confidence: number;
  explainability: {
    melody: number;
    harmony: number;
    rhythm: number;
    timbre: number;
  };
}

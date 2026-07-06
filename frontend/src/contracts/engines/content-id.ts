export interface ContentIdClaim {
  claimId: string;
  tenantId: string;
  referenceTrackId: string;
  matchedAssetId: string;
  matchScore: number;
  policy: 'monetize' | 'track' | 'block';
  status: 'open' | 'review' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface ContentIdMatchEvent {
  eventId: string;
  sourcePlatform: string;
  externalAssetId: string;
  detectedAt: string;
  fingerprintScore: number;
  similarityScore: number;
}

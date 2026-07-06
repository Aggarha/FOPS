import type { FingerprintCompareRequest, FingerprintCompareResult, FingerprintRecord } from '@/contracts/engines/fingerprint';
import type { SimilarityRequest, SimilarityResult } from '@/contracts/engines/similarity';
import type { CanonicalDetectionRequest, CanonicalDetectionResult } from '@/contracts/engines/canonical';
import type { ContentIdClaim, ContentIdMatchEvent } from '@/contracts/engines/content-id';

export interface FingerprintEngineService {
  generateFromUrl(sourceUrl: string): Promise<FingerprintRecord>;
  compare(request: FingerprintCompareRequest): Promise<FingerprintCompareResult>;
}

export interface SimilarityEngineService {
  compare(request: SimilarityRequest): Promise<SimilarityResult>;
}

export interface CanonicalDetectionService {
  detect(request: CanonicalDetectionRequest): Promise<CanonicalDetectionResult>;
}

export interface ContentIdService {
  ingestMatchEvent(event: ContentIdMatchEvent): Promise<ContentIdClaim>;
}

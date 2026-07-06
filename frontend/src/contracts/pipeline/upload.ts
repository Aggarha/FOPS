export interface UploadAssetRequest {
  tenantId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  tags?: string[];
}

export interface UploadSession {
  uploadId: string;
  objectKey: string;
  expiresAt: string;
  partSizeBytes: number;
  maxParts: number;
}

export interface UploadCompleteRequest {
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}

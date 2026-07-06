# FOPS FINGERPRINT LIFECYCLE & ARCHITECTURE
**Complete Data Flow From Capture Through Verification**

**Status:** Architecture Design Complete  
**Date:** 2026-06-09  
**Scope:** End-to-end fingerprint pipeline stages and state transitions  
**Objective:** Define complete lifecycle for fingerprint ecosystem

---

## Executive Summary

### Fingerprint Lifecycle (Stages)

```
STAGE 1: ACQUISITION
  Source audio found
  ↓
STAGE 2: STORAGE
  Audio stored in reference library
  ↓
STAGE 3: FINGERPRINT GENERATION
  All 4 algorithms extract fingerprints
  ↓
STAGE 4: INDEXING
  Fingerprints indexed for search
  ↓
STAGE 5: DISCOVERY
  Candidate found during search
  ↓
STAGE 6: VERIFICATION
  Fingerprints compared
  ↓
STAGE 7: DECISION
  Match confirmed or rejected
  ↓
STAGE 8: FEEDBACK
  User approval → learning
  ↓
STAGE 9: INTEGRATION
  Decision integrated into workflow
  ↓
STAGE 10: ARCHIVAL
  Result stored for history
```

---

## Part 1: Stage 1 — ACQUISITION

### 1.1 Source Discovery

**Input:** User request, YouTube URL, or API call

**Trigger:**
```
1. User uploads file
2. User provides YouTube URL
3. Batch import from CSV
4. Periodic crawl of known channels
5. Submission queue
```

**Actions:**
- [ ] Validate input (format check)
- [ ] Normalize URL (YouTube standardization)
- [ ] Check for duplicates (file hash check)
- [ ] Authenticate source (if restricted)
- [ ] Store submission metadata

**Output:** Source record + audio download job

**Duration:** <1 second

**Example Flow:**
```json
{
  "event": "source_acquired",
  "source_type": "youtube",
  "url": "https://www.youtube.com/watch?v=abc123",
  "source_id": 1001,
  "timestamp": "2026-06-09T10:30:00Z",
  "status": "awaiting_download"
}
```

---

## Part 2: Stage 2 — STORAGE

### 2.1 Audio Download & Storage

**Input:** Source record with URL

**Actions:**
```
1. Download audio from source
   - Timeout: 60 seconds
   - Format: Auto-detected
   - Quality: Best available
   
2. Validate audio quality
   - Minimum duration: 10 seconds
   - Minimum sample rate: 16 kHz
   - Check for silence (not 100% mute)
   
3. Normalize audio
   - Resample to 22,050 Hz (if needed)
   - Stereo → Mono (if needed)
   - Normalize loudness (target: -23 LUFS)
   
4. Store audio
   - Local disk: /var/www/fops/storage/audio/{year}/{month}/{hash}.wav
   - OR S3: s3://fops-audio/{hash}.wav
   - OR YouTube cache (don't download)
   
5. Generate file hash
   - SHA256(audio_bytes)
   - Store in reference_audio table
   
6. Create metadata record
   - Duration, channels, sample rate
   - ID3/Vorbis tags (if present)
   - File size, format
```

**Duration:** 10-30 seconds (depends on download speed)

**State Transitions:**
```
awaiting_download
  ↓
downloading     (10-30s)
  ↓
validating      (1-5s)
  ↓
normalizing     (2-10s)
  ↓
stored          ✓
  
OR

download_failed (HTTP error, timeout)
  ↓
manual_review   (human intervention)

OR

invalid_audio   (too short, all silence, etc.)
  ↓
rejected        ✗
```

**Example Record:**
```json
{
  "reference_audio_id": 5001,
  "version_id": 4001,
  "storage_type": "local",
  "storage_path": "/var/www/fops/storage/audio/2026/06/a1b2c3d4.wav",
  "file_size_bytes": 1048576,
  "format": "WAV",
  "channels": 1,
  "sample_rate": 22050,
  "bitrate_kbps": 352,
  "duration_seconds": 30,
  "file_hash_sha256": "a1b2c3d4e5f6...",
  "normalized_loudness_lufs": -23.1,
  "processing_status": "processed",
  "created_at": "2026-06-09T10:35:00Z"
}
```

---

## Part 3: Stage 3 — FINGERPRINT GENERATION

### 3.1 Multi-Algorithm Extraction

**Input:** Audio file (PCM array)

**Parallel Processing (all 4 algorithms run simultaneously):**

```
CHROMAPRINT (fpcalc binary)
├─ Extract chroma features (12 bins per octave)
├─ Encode as fingerprint string
├─ Duration: 3-5 seconds
└─ Output: "AQIDBA..." (base64 string)

SPECTRAL (librosa.stft)
├─ Compute spectrogram
├─ Extract energy across 8 bands
├─ Duration: 2-3 seconds
└─ Output: [0.23, 0.45, 0.12, ...] (8 floats)

MFCC (librosa.feature.mfcc)
├─ Compute mel-frequency cepstral coefficients
├─ Extract 20 coefficients
├─ Duration: 2-4 seconds
└─ Output: [[coef1, coef2, ...], ...] (20 x N matrix)

PEAKS (scipy.signal.spectrogram)
├─ Find spectral peaks
├─ Create landmark set
├─ Duration: 1-2 seconds
└─ Output: {peak_indices} (set of integers)
```

**Quality Assessment:**

For each algorithm:
```python
quality_score = assess_quality(fingerprint)
  # Factors:
  #  - Uniqueness/entropy (higher = more distinctive)
  #  - Stability (consistent across slight variations)
  #  - Clarity (not noisy/ambiguous)
  # Result: 0-100 score
```

**Duration:** 8-15 seconds (parallel: 5-7 seconds)

**State Transitions:**
```
stored
  ↓
fingerprint_generating
  ├─ chromaprint_extracting
  ├─ spectral_extracting
  ├─ mfcc_extracting
  └─ peaks_extracting
  ↓
quality_assessing
  ↓
fingerprint_generated   ✓ (all 4 complete)

OR

extraction_failed
  ├─ chromaprint failed  (fpcalc error)
  ├─ spectral failed     (librosa error)
  ├─ mfcc failed         (librosa error)
  └─ peaks failed        (scipy error)
  ↓
manual_review           (retry or investigate)
```

**Example Records (4 fingerprints created):**
```json
[
  {
    "id": 10001,
    "reference_audio_id": 5001,
    "algorithm": "chromaprint",
    "algorithm_version": "1.5.0",
    "fingerprint_raw": "AQIDBA...",
    "fingerprint_hash": "a1b2c3d4...",
    "quality_score": 87.5,
    "entropy": 0.92,
    "stability": 0.88,
    "match_count": 0,
    "false_positive_count": 0,
    "created_at": "2026-06-09T10:40:00Z"
  },
  {
    "id": 10002,
    "reference_audio_id": 5001,
    "algorithm": "spectral",
    "fingerprint_vector": "base64_encoded_numpy_array...",
    "fingerprint_hash": "b2c3d4e5...",
    "quality_score": 84.2,
    "entropy": 0.87,
    "stability": 0.85,
    "created_at": "2026-06-09T10:40:00Z"
  },
  {
    "id": 10003,
    "reference_audio_id": 5001,
    "algorithm": "mfcc",
    "fingerprint_vector": "base64_encoded_numpy_array...",
    "fingerprint_hash": "c3d4e5f6...",
    "quality_score": 89.1,
    "entropy": 0.91,
    "stability": 0.90,
    "created_at": "2026-06-09T10:40:00Z"
  },
  {
    "id": 10004,
    "reference_audio_id": 5001,
    "algorithm": "peaks",
    "fingerprint_vector": "base64_encoded_numpy_array...",
    "fingerprint_hash": "d4e5f6g7...",
    "quality_score": 75.8,
    "entropy": 0.78,
    "stability": 0.72,
    "created_at": "2026-06-09T10:40:00Z"
  }
]
```

---

## Part 4: Stage 4 — INDEXING

### 4.1 Index Registration

**Input:** 4 fingerprints (freshly generated)

**Actions:**

```
1. Register in hash index
   fingerprint_hash → fingerprint_id
   (for exact match lookups)
   
2. Register in LSH (Locality-Sensitive Hash)
   fingerprint_vector → buckets
   (for approximate nearest neighbor search)
   
3. Register segment hashes
   segment_hash → segment_id
   (for partial clip matching)
   
4. Update search index
   artist_name + song_title + fingerprint_hash
   (for combined metadata + fingerprint search)
   
5. Cache high-quality fingerprints
   (in Redis for fast retrieval)
```

**Duration:** <1 second (index operations are fast)

**State Transitions:**
```
fingerprint_generated
  ↓
indexing
  ├─ hash_index_registered
  ├─ lsh_index_registered
  ├─ segment_index_registered
  └─ cache_registered
  ↓
indexed                 ✓ (searchable)
```

**Index Structures:**

```
Hash Index (Exact Match):
  {
    "a1b2c3d4e5f6": 10001,           # fingerprint_hash → fingerprint_id
    "b2c3d4e5f6g7": 10002,
    ...
  }

LSH Index (Approximate Match):
  {
    "lsh_bucket_001": [10001, 10005, 10012, ...],
    "lsh_bucket_002": [10002, 10008, 10015, ...],
    ...
  }

Segment Index (Partial Match):
  {
    "seg_x1y2z3a4": 20001,           # segment_hash → segment_id
    "seg_x2y3z4a5": 20002,
    ...
  }
```

---

## Part 5: Stage 5 — DISCOVERY

### 5.1 Search for Candidates

**Input:** Query fingerprint (from candidate audio being checked)

**Process:**

```
1. Compute query fingerprint
   - Download/receive candidate audio
   - Extract all 4 algorithms
   - Duration: 5-10 seconds

2. Query hash index
   - Exact match lookup
   - Result: Direct matches (rare)
   - Duration: <1ms

3. Query LSH index
   - Approximate neighbor search
   - Result: Candidate bucket
   - Duration: <1ms

4. Query segment index
   - Partial clip search
   - Result: Segment matches
   - Duration: <10ms

5. Rank candidates
   - By quality score
   - By confidence
   - By match rate
   - Keep top 100 candidates
```

**Duration:** 5-15 seconds total (most is download time)

**Example Query Result:**
```json
{
  "query_fingerprint_hash": "q1q2q3q4...",
  "search_method": "lsh_similarity",
  "candidates": [
    {
      "rank": 1,
      "fingerprint_id": 10001,
      "algorithm": "chromaprint",
      "quality_score": 87.5,
      "estimated_similarity": 0.92,
      "track": {
        "id": 999,
        "title": "Let It Be",
        "artist": "The Beatles",
        "album": "Let It Be"
      }
    },
    {
      "rank": 2,
      "fingerprint_id": 10005,
      "algorithm": "chromaprint",
      "quality_score": 85.2,
      "estimated_similarity": 0.87,
      "track": {
        "id": 1000,
        "title": "Let It Be (Remaster)",
        "artist": "The Beatles",
        "album": "Abbey Road (Remaster)"
      }
    }
  ],
  "total_candidates": 47,
  "search_time_ms": 1250
}
```

---

## Part 6: Stage 6 — VERIFICATION

### 6.1 Detailed Comparison

**Input:** Query fingerprint + top 5-10 candidates

**Process (for each candidate):**

```
Comparison Loop:

FOR each candidate_fingerprint:

  1. Extract algorithm
  2. Compute similarity score (0-100)
     - Cosine similarity for vectors
     - Hamming distance for hashes
     - Set intersection for peaks
  
  3. Apply weighting
     - Algorithm weight: {chromaprint: 0.35, ...}
     - Weighted score: algorithm_score * weight
  
  4. Accumulate weighted scores
     - combined_score = sum(weighted_scores)
  
  5. Check threshold
     - IF combined_score >= 80:
         ACCEPT (matched)
     - IF combined_score >= 70:
         UNCERTAIN (manual review)
     - IF combined_score < 70:
         REJECT (no match)
  
  6. Log comparison
     - Query FP: query_id
     - Reference FP: reference_id
     - Scores per algorithm
     - Combined score
     - Decision
     - Duration

END FOR
```

**Duration:** 2-5 seconds (per candidate)

**State Transitions:**
```
indexed
  ↓
candidate_discovered
  ↓
verifying
  ├─ algorithm_1_comparing
  ├─ algorithm_2_comparing
  ├─ algorithm_3_comparing
  └─ algorithm_4_comparing
  ↓
verification_complete
  ↓
  ├─ MATCHED (score >= 80)
  ├─ UNCERTAIN (score 70-80)
  └─ NO_MATCH (score < 70)
```

**Example Verification Result:**
```json
{
  "verification_id": 30001,
  "query_fingerprint_id": "q1q2q3q4",
  "reference_fingerprint_id": 10001,
  "algorithms": {
    "chromaprint": {
      "query_score": 0.95,
      "reference_score": 0.94,
      "similarity": 0.92,
      "weight": 0.35,
      "weighted_score": 32.2
    },
    "spectral": {
      "similarity": 0.88,
      "weight": 0.30,
      "weighted_score": 26.4
    },
    "mfcc": {
      "similarity": 0.91,
      "weight": 0.25,
      "weighted_score": 22.75
    },
    "peaks": {
      "similarity": 0.85,
      "weight": 0.10,
      "weighted_score": 8.5
    }
  },
  "combined_score": 89.85,
  "verified": true,
  "decision": "MATCHED",
  "confidence": 0.90,
  "processing_time_ms": 2340,
  "timestamp": "2026-06-09T10:42:00Z"
}
```

---

## Part 7: Stage 7 — DECISION

### 7.1 Decision Logic

**Input:** Verification result

**Logic:**
```
IF combined_score >= 80:
  decision = VERIFIED
  confidence = 0.95
  action = AUTO_APPROVE
  
ELIF combined_score >= 75:
  decision = LIKELY_MATCH
  confidence = 0.80
  action = SEND_TO_REVIEW_QUEUE
  
ELIF combined_score >= 70:
  decision = UNCERTAIN
  confidence = 0.65
  action = SEND_TO_REVIEW_QUEUE (with red flag)
  
ELSE:
  decision = NO_MATCH
  confidence = 0.05
  action = REJECT (log and continue)
```

**Actions by Decision:**

```
VERIFIED (automatic):
  - Mark as confirmed match
  - Store decision
  - Log verification
  - Trigger downstream action
    (e.g., flag for copyright review)
  
LIKELY_MATCH (human review):
  - Add to review queue
  - Show to moderator
  - Wait for decision
  - Log moderator choice
  - Update learning system
  
UNCERTAIN (high priority):
  - Add to review queue (high priority)
  - Flag for expert review
  - Show detailed breakdown
  - Require manual decision
  
NO_MATCH (automatic):
  - Log result
  - Discard result
  - Continue search or conclude
```

**Duration:** <1 second

**State Transitions:**
```
verification_complete
  ↓
  ├─ VERIFIED (auto-approved)
  │  ↓
  │  approved
  │  
  ├─ UNCERTAIN (needs review)
  │  ↓
  │  review_queue_pending
  │  
  └─ NO_MATCH (rejected)
     ↓
     rejected
```

---

## Part 8: Stage 8 — FEEDBACK & LEARNING

### 8.1 User Feedback Integration

**Input:** Human moderator decision (approve/reject/appeal)

**Process:**

```
1. Record feedback
   - Fingerprint ID(s) involved
   - Human decision (approve/reject)
   - Reason/notes (if provided)
   - Moderator ID
   - Timestamp
   
2. Update statistics
   - If correct: increment match_count
   - If incorrect: increment false_positive_count
   - Update per-algorithm accuracy
   
3. Adjust thresholds (learning)
   - Analyze pattern:
     "chromaprint consistently high, MFCC consistently low"
   - Suggest weight adjustment
   - Test new threshold on historical data
   
4. Update training data
   - Add to ML training set
   - Feature vector + label (correct/incorrect)
   - Segment-level labels
   
5. Trigger retraining (if needed)
   - If error rate > threshold
   - Retrain confidence model
   - Deploy new version
```

**Example Feedback Record:**
```json
{
  "feedback_id": 40001,
  "verification_id": 30001,
  "fingerprint_id": 10001,
  "moderator_id": 101,
  "decision": "CORRECT",
  "notes": "This is definitely the right match",
  "reason_code": "metadata_confirms",
  "confidence": 0.99,
  "timestamp": "2026-06-09T10:45:00Z"
}
```

**Duration:** Seconds (user reviews, decides, clicks)

**State Transitions:**
```
approved / rejected
  ↓
feedback_recorded
  ↓
  ├─ statistics_updated
  ├─ training_data_updated
  └─ threshold_evaluated
  ↓
learning_applied
```

---

## Part 9: Stage 9 — INTEGRATION

### 9.1 Result Integration

**Input:** Approved decision

**Actions:**

```
1. Store decision permanently
   - decision_id → decisions.db
   - approved_match_id
   - timestamp
   - moderator_id
   - confidence
   
2. Update canonical reference
   - Link new match to reference
   - Increment reference match count
   - Update version confidence
   
3. Trigger workflows
   - Copyright claim workflow
   - Content ID workflow
   - Revenue sharing workflow
   - Appeal workflow
   
4. Notify systems
   - YouTube Content ID (if applicable)
   - Revenue system
   - Analytics dashboard
   - User notification queue
   
5. Cache result
   - Store in Redis
   - TTL: 24 hours
   - Fast lookup for duplicate queries
```

**Duration:** <1 second

**State Transitions:**
```
learning_applied
  ↓
integrating
  ├─ decision_persisted
  ├─ reference_updated
  ├─ workflows_triggered
  ├─ systems_notified
  └─ cache_updated
  ↓
integrated
```

---

## Part 10: Stage 10 — ARCHIVAL

### 10.1 History & Analytics

**Input:** Completed decision

**Actions:**

```
1. Archive verification data
   - Query fingerprint
   - Reference fingerprint
   - Scores
   - Decision
   - Timestamp
   - Moderator (if human)
   
2. Update analytics
   - Match rate (daily, weekly, monthly)
   - Algorithm performance
   - False positive/negative rate
   - User agreement rate
   - Content type performance
   
3. Generate reports
   - System health
   - Accuracy trends
   - Bottleneck identification
   - Recommendations
   
4. Retention policy
   - Keep detailed records for 90 days
   - Archive to cold storage after 90 days
   - Aggregate statistics permanently
   
5. GDPR compliance
   - Anonymize user IDs (if needed)
   - Respect deletion requests
   - Maintain audit trail
```

**Duration:** <1 second

**State Transitions:**
```
integrated
  ↓
archiving
  ├─ data_archived
  ├─ analytics_updated
  ├─ reports_generated
  └─ retention_applied
  ↓
archived                ✓ (complete)
```

**Example Archive Record:**
```json
{
  "archive_id": 50001,
  "verification_id": 30001,
  "query_fingerprint_hash": "q1q2q3q4",
  "reference_fingerprint_hash": "a1b2c3d4",
  "combined_score": 89.85,
  "decision": "MATCHED",
  "human_approved": true,
  "moderator_id": 101,
  "timestamp": "2026-06-09T10:45:00Z",
  "archived_at": "2026-06-10T00:00:00Z"
}
```

---

## Part 11: Complete Lifecycle Flow

### 11.1 Simplified Timeline

```
00:00 - Audio source discovered (YouTube URL)
00:01 - Download started (yt-dlp)
00:30 - Audio downloaded and validated
00:40 - Fingerprints generated (4 algorithms, parallel)
00:45 - Fingerprints indexed (hash, LSH, segments)
00:46 - Search query arrives

--- SEARCH PHASE ---

00:50 - Candidate discovered via LSH
00:55 - Fingerprints compared (detailed)
01:00 - Verification complete (89.85 score)
01:01 - Decision made: MATCHED (auto-approved)

--- INTEGRATION PHASE ---

01:02 - Decision stored
01:03 - Canonical reference updated
01:04 - Workflows triggered
01:05 - Systems notified
01:06 - Analytics updated
01:07 - Complete (from discovery to integration: 7 seconds)
```

### 11.2 State Machine (Unified View)

```
┌─ ACQUISITION ─┐
│   source_     │
│  discovered   │
└───────┬───────┘
        │ (1 sec)
┌─ STORAGE ────┐
│  downloading  │
│  validating   │
│  normalizing  │
│    stored     │
└───────┬───────┘
        │ (25 sec)
┌─ FINGERPRINTING ──┐
│  chromaprint      │
│  spectral         │
│  mfcc             │
│  peaks            │
│  fingerprints_    │
│  generated        │
└───────┬───────────┘
        │ (5 sec)
┌─ INDEXING ───┐
│   indexing    │
│   indexed     │
└───────┬───────┘
        │ (<1 sec)
        ├─────────────────────┐
        │                     │
┌─ DISCOVERY ──┐      ┌─ STORAGE ─┐
│   search      │      │ (at rest)  │
│  candidates   │      └────────────┘
│   discovered  │
└───────┬───────┘
        │ (10 sec when searched)
┌─ VERIFICATION ──┐
│  comparing_      │
│  similarities    │
│  verification    │
│   complete       │
└───────┬──────────┘
        │ (5 sec)
┌─ DECISION ────┐
│   decision     │
│    made        │
└───────┬────────┘
        │ (<1 sec)
┌─ FEEDBACK ────┐
│  recording     │
│  learning      │
│   applied      │
└───────┬────────┘
        │ (<1 sec)
┌─ INTEGRATION ──┐
│  workflows     │
│  triggered     │
│  integrated    │
└───────┬────────┘
        │ (<1 sec)
┌─ ARCHIVAL ────┐
│  data_archived │
│  archived      │
└────────────────┘
```

---

## Part 12: Error Handling & Recovery

### 12.1 Failure Points & Recovery

```
STAGE 1: Acquisition fails
  ↓ Recovery: Log, retry, or manual submission

STAGE 2: Download fails
  ↓ Recovery: Retry with backoff, queue for manual download

STAGE 3: Fingerprint fails
  ↓ Recovery: Try individual algorithms, mark as partial

STAGE 4: Indexing fails
  ↓ Recovery: Rebuild index, check database integrity

STAGE 5: Discovery fails (no candidates found)
  ↓ Recovery: Return empty result, normal flow

STAGE 6: Verification fails
  ↓ Recovery: Log error, try different algorithms

STAGE 7: Decision fails
  ↓ Recovery: Mark as uncertain, send to manual review

STAGE 8: Feedback fails
  ↓ Recovery: Log feedback separately, retry later

STAGE 9: Integration fails
  ↓ Recovery: Queue for retry, alert operators

STAGE 10: Archival fails
  ↓ Recovery: Retain in hot storage, retry nightly
```

---

## Conclusion

### Complete Lifecycle

This document defines the **10-stage fingerprint lifecycle**, from acquisition through archival:

1. ✓ Acquisition (discovery)
2. ✓ Storage (validation + normalization)
3. ✓ Generation (4 algorithms in parallel)
4. ✓ Indexing (hash + LSH + segments)
5. ✓ Discovery (candidate search)
6. ✓ Verification (detailed comparison)
7. ✓ Decision (threshold + confidence)
8. ✓ Feedback (human approval + learning)
9. ✓ Integration (workflow triggering)
10. ✓ Archival (history + analytics)

### Timing

```
Reference generation (per source):  ~35 seconds
  - Download: 20 sec
  - Fingerprint: 8 sec
  - Index: <1 sec
  - Cache: <1 sec

Search + verification (per query):  ~15 seconds
  - Download query: 10 sec
  - LSH search: <1 sec
  - Verification: 5 sec
  - Decision: <1 sec

Total per match (cold): ~50 seconds
Total per match (cached): ~5 seconds
```

---

**Status:** ARCHITECTURE COMPLETE  
**Next:** FOPS_SEARCH_ARCHITECTURE.md (Official vs Discovery search)

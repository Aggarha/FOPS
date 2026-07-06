# FOPS FINGERPRINT LIBRARY V1 SPECIFICATION
**Database Schema & Data Model Design for Reference Audio Storage**

**Status:** Design Complete (NOT YET IMPLEMENTED)  
**Date:** 2026-06-09  
**Scope:** Entity definitions, relationships, indexing strategy  
**Objective:** Provide foundation for fingerprint storage and search

---

## Executive Summary

### Purpose

Fingerprint Library V1 provides **central storage** for reference audio fingerprints, enabling:
- Canonical source identification (official vs derivative)
- Fingerprint reuse (don't recalculate)
- Historical tracking (version management)
- Search capability (find similar fingerprints)

### Database Model

7 core entities + 3 supporting entities:

| Entity | Records | Purpose |
|--------|---------|---------|
| **Artist** | 1M-10M | Music creator |
| **Album** | 2M-10M | Release container |
| **Track** | 10M-50M | Song entity |
| **TrackVersion** | 50M-100M | Specific performance |
| **ReferenceAudio** | 50M-100M | Audio file record |
| **Fingerprint** | 50M-100M | Algorithm output |
| **FingerprintSegment** | 200M-500M | Time-indexed hash |

### Storage Estimate

```
Total storage (for 50M tracks, all 4 algorithms, segments):
  Fingerprints:           ~100 GB (50M * 4 algos * ~500 bytes)
  Segments:               ~500 GB (segments = fingerprints * 4-5x)
  Metadata:               ~50 GB
  Indexes:                ~200 GB
  ────────────────────────
  TOTAL:                  ~850 GB

With replication (3x):   ~2.5 TB
```

---

## Part 1: Entity Definitions

### 1.1 Artist Entity

```python
@dataclass
class Artist:
    """Music creator/performer"""
    
    # Identity
    id: int                         # Primary key
    name: str                       # "The Beatles", "Taylor Swift"
    name_lower: str                 # Normalized for search
    
    # Metadata
    type: str                       # "individual" | "group" | "orchestra"
    country: str                    # "US", "UK", "JP"
    birth_year: int                 # For individuals
    formation_year: int             # For groups
    
    # External identifiers
    isni: str                       # International Standard Name ID
    viaf_id: int                    # Virtual International Authority File
    musicbrainz_id: str             # MusicBrainz GUID
    spotify_id: str                 # Spotify artist ID
    wikipedia_url: str              # Wiki link
    
    # Metrics
    release_count: int              # Number of albums
    track_count: int                # Total songs
    fingerprint_count: int          # Fingerprints in library
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    last_fingerprint_at: datetime   # When last added fingerprint
```

**Table: `artists`**
```sql
CREATE TABLE artists (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    name            VARCHAR(255) NOT NULL,
    name_lower      VARCHAR(255) NOT NULL,
    type            ENUM('individual', 'group', 'orchestra'),
    country         VARCHAR(2),
    birth_year      INT,
    formation_year  INT,
    isni            VARCHAR(50),
    viaf_id         INT,
    musicbrainz_id  VARCHAR(50),
    spotify_id      VARCHAR(50),
    wikipedia_url   TEXT,
    release_count   INT DEFAULT 0,
    track_count     INT DEFAULT 0,
    fingerprint_count INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_fingerprint_at TIMESTAMP,
    
    INDEX idx_name_lower (name_lower),
    INDEX idx_musicbrainz_id (musicbrainz_id),
    INDEX idx_spotify_id (spotify_id),
    INDEX idx_country (country)
);
```

**Cardinality:** 1M-10M artists

---

### 1.2 Album Entity

```python
@dataclass
class Album:
    """Collection of songs (album, EP, compilation, etc.)"""
    
    # Identity
    id: int
    artist_id: int                  # FK to Artist
    title: str                      # "Abbey Road", "Reputation"
    title_lower: str                # Normalized
    
    # Type & status
    album_type: str                 # "album" | "ep" | "single" | "compilation" | "live"
    status: str                     # "official" | "bootleg" | "remix" | "tribute"
    
    # Release info
    release_date: date              # YYYY-MM-DD
    release_year: int               # YYYY (denormalized for range queries)
    country: str                    # Country of release
    label: str                      # Record label
    
    # External identifiers
    upc: str                        # Universal Product Code / Barcode
    asin: str                       # Amazon identifier
    musicbrainz_id: str             # MusicBrainz GUID
    spotify_id: str
    isrc: str                       # International Standard Recording Code (if single)
    
    # Content
    track_count: int                # Number of tracks
    duration_seconds: int           # Total duration
    artwork_url: str                # Album cover
    
    # Metrics
    fingerprint_count: int
    version_count: int              # Number of versions
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
```

**Table: `albums`**
```sql
CREATE TABLE albums (
    id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
    artist_id           BIGINT NOT NULL,
    title               VARCHAR(255) NOT NULL,
    title_lower         VARCHAR(255) NOT NULL,
    album_type          ENUM('album','ep','single','compilation','live'),
    status              ENUM('official','bootleg','remix','tribute'),
    release_date        DATE,
    release_year        INT,
    country             VARCHAR(2),
    label               VARCHAR(255),
    upc                 VARCHAR(20),
    asin                VARCHAR(50),
    musicbrainz_id      VARCHAR(50),
    spotify_id          VARCHAR(50),
    isrc                VARCHAR(20),
    track_count         INT DEFAULT 0,
    duration_seconds    INT,
    artwork_url         TEXT,
    fingerprint_count   INT DEFAULT 0,
    version_count       INT DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
    INDEX idx_artist_id (artist_id),
    INDEX idx_title_lower (title_lower),
    INDEX idx_musicbrainz_id (musicbrainz_id),
    INDEX idx_spotify_id (spotify_id),
    INDEX idx_release_year (release_year)
);
```

**Cardinality:** 2M-10M albums per artist

---

### 1.3 Track Entity

```python
@dataclass
class Track:
    """Individual song"""
    
    # Identity
    id: int
    album_id: int                   # FK to Album
    artist_id: int                  # FK to Artist (denormalized)
    
    # Content
    title: str                      # "Let It Be"
    title_lower: str
    track_number: int               # Position on album (1-30)
    disc_number: int                # For multi-disc albums
    
    # Audio properties
    duration_seconds: int
    sample_rate: int                # 44100, 48000, etc.
    bit_depth: int                  # 16, 24, 32-bit
    codec: str                      # "AAC", "MP3", "FLAC", etc.
    
    # Classification
    genre: str                      # "Pop", "Rock", "Jazz"
    tempo_bpm: float                # Estimated BPM
    key: str                        # "C major", "A minor", etc.
    
    # External identifiers
    isrc: str                       # International Standard Recording Code
    musicbrainz_id: str
    spotify_id: str
    
    # Metrics
    version_count: int              # Different performances/recordings
    fingerprint_count: int          # Total fingerprints
    canonical_version_id: int       # Which version is official
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
```

**Table: `tracks`**
```sql
CREATE TABLE tracks (
    id                      BIGINT PRIMARY KEY AUTO_INCREMENT,
    album_id                BIGINT NOT NULL,
    artist_id               BIGINT NOT NULL,
    title                   VARCHAR(255) NOT NULL,
    title_lower             VARCHAR(255) NOT NULL,
    track_number            INT,
    disc_number             INT DEFAULT 1,
    duration_seconds        INT,
    sample_rate             INT,
    bit_depth               INT,
    codec                   VARCHAR(20),
    genre                   VARCHAR(50),
    tempo_bpm               FLOAT,
    key                     VARCHAR(20),
    isrc                    VARCHAR(20),
    musicbrainz_id          VARCHAR(50),
    spotify_id              VARCHAR(50),
    version_count           INT DEFAULT 0,
    fingerprint_count       INT DEFAULT 0,
    canonical_version_id    BIGINT,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
    INDEX idx_album_id (album_id),
    INDEX idx_artist_id (artist_id),
    INDEX idx_title_lower (title_lower),
    INDEX idx_isrc (isrc),
    INDEX idx_musicbrainz_id (musicbrainz_id)
);
```

**Cardinality:** 10M-50M tracks

---

### 1.4 TrackVersion Entity

```python
@dataclass
class TrackVersion:
    """Specific performance/recording of a track"""
    
    # Identity
    id: int
    track_id: int                   # FK to Track
    
    # Version classification
    version_type: str               # "studio" | "live" | "acoustic" | "remix" | "cover"
    version_label: str              # "Live at Madison Square Garden 2009"
    
    # Source information
    source_type: str                # "official" | "youtube" | "spotify" | "soundcloud" | "submitted"
    source_url: str                 # Where it came from
    
    # Quality & format
    bitrate_kbps: int               # 128, 192, 320, etc.
    quality_level: str              # "low" | "medium" | "high" | "lossless"
    
    # Audio characteristics
    duration_seconds: int
    silence_at_start: float         # Seconds
    silence_at_end: float
    
    # Status & confidence
    status: str                     # "verified" | "unverified" | "rejected"
    confidence_score: float         # 0-100, how confident this is correct version
    verification_method: str        # "manual" | "fingerprint_match" | "metadata"
    verified_by: int                # User ID who verified
    verified_at: datetime
    
    # Metrics
    fingerprint_count: int
    match_count: int                # How many candidates matched this
    false_positive_count: int       # How many were actually different
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
```

**Table: `track_versions`**
```sql
CREATE TABLE track_versions (
    id                      BIGINT PRIMARY KEY AUTO_INCREMENT,
    track_id                BIGINT NOT NULL,
    version_type            ENUM('studio','live','acoustic','remix','cover','other'),
    version_label           VARCHAR(255),
    source_type             ENUM('official','youtube','spotify','soundcloud','submitted'),
    source_url              TEXT,
    bitrate_kbps            INT,
    quality_level           ENUM('low','medium','high','lossless'),
    duration_seconds        INT,
    silence_at_start        FLOAT,
    silence_at_end          FLOAT,
    status                  ENUM('verified','unverified','rejected'),
    confidence_score        FLOAT,
    verification_method     VARCHAR(50),
    verified_by             INT,
    verified_at             TIMESTAMP,
    fingerprint_count       INT DEFAULT 0,
    match_count             INT DEFAULT 0,
    false_positive_count    INT DEFAULT 0,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    INDEX idx_track_id (track_id),
    INDEX idx_status (status),
    INDEX idx_confidence_score (confidence_score),
    INDEX idx_source_url (source_url(100))
);
```

**Cardinality:** 50M-100M versions (multiple per track)

---

### 1.5 ReferenceAudio Entity

```python
@dataclass
class ReferenceAudio:
    """Audio file stored or referenced"""
    
    # Identity
    id: int
    version_id: int                 # FK to TrackVersion
    
    # Storage
    storage_type: str               # "local" | "s3" | "youtube" | "streaming_link"
    storage_path: str               # Local path or S3 key or URL
    file_size_bytes: int
    
    # Audio info
    format: str                     # "mp3", "wav", "m4a", "flac"
    channels: int                   # 1=mono, 2=stereo
    sample_rate: int
    bitrate_kbps: int
    
    # Timestamps
    duration_seconds: int
    file_hash_sha256: str           # For deduplication
    
    # Metadata
    tags_json: str                  # ID3, Vorbis, etc. (JSON)
    processing_status: str          # "raw" | "processed" | "failed"
    processing_error: str           # If failed
    
    # Metrics
    fingerprint_count: int
    normalized_loudness_lufs: float # LUFS for normalization
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    last_accessed: datetime
```

**Table: `reference_audio`**
```sql
CREATE TABLE reference_audio (
    id                          BIGINT PRIMARY KEY AUTO_INCREMENT,
    version_id                  BIGINT NOT NULL,
    storage_type                ENUM('local','s3','youtube','streaming_link'),
    storage_path                TEXT NOT NULL,
    file_size_bytes             BIGINT,
    format                      VARCHAR(20),
    channels                    INT,
    sample_rate                 INT,
    bitrate_kbps                INT,
    duration_seconds            INT,
    file_hash_sha256            VARCHAR(64),
    tags_json                   JSON,
    processing_status           ENUM('raw','processed','failed'),
    processing_error            TEXT,
    fingerprint_count           INT DEFAULT 0,
    normalized_loudness_lufs    FLOAT,
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed               TIMESTAMP,
    
    FOREIGN KEY (version_id) REFERENCES track_versions(id) ON DELETE CASCADE,
    UNIQUE KEY uk_file_hash (file_hash_sha256),
    INDEX idx_version_id (version_id),
    INDEX idx_storage_type (storage_type),
    INDEX idx_processing_status (processing_status)
);
```

**Cardinality:** 50M-100M files (may deduplicate)

---

### 1.6 Fingerprint Entity

```python
@dataclass
class Fingerprint:
    """Algorithm-specific fingerprint output"""
    
    # Identity
    id: int
    reference_audio_id: int         # FK to ReferenceAudio
    track_version_id: int           # FK to TrackVersion (denormalized)
    
    # Algorithm
    algorithm: str                  # "chromaprint" | "spectral" | "mfcc" | "peaks"
    algorithm_version: str          # "1.0", "2.1", etc. (for versioning)
    
    # Output
    fingerprint_raw: str            # Raw algorithm output (base64 or hex)
    fingerprint_hash: str           # SHA256 of fingerprint (for search)
    fingerprint_vector: bytes       # Numpy array serialized (for similarity)
    
    # Metadata
    duration_analyzed: float        # Seconds analyzed (usually 30)
    offset_analyzed: float          # Start offset (usually 10s)
    
    # Quality metrics
    quality_score: float            # 0-100, how confident is this fingerprint
    entropy: float                  # Randomness (higher = more unique)
    stability: float                # How stable across variations (0-100)
    
    # Comparison baseline
    match_count: int                # Times this fp has matched something
    false_positive_count: int       # Times it was actually different
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
```

**Table: `fingerprints`**
```sql
CREATE TABLE fingerprints (
    id                      BIGINT PRIMARY KEY AUTO_INCREMENT,
    reference_audio_id      BIGINT NOT NULL,
    track_version_id        BIGINT NOT NULL,
    algorithm               ENUM('chromaprint','spectral','mfcc','peaks'),
    algorithm_version       VARCHAR(20),
    fingerprint_raw         LONGBLOB,          -- Base64 encoded output
    fingerprint_hash        VARCHAR(64),       -- SHA256 for matching
    fingerprint_vector      LONGBLOB,          -- Binary numpy array
    duration_analyzed       FLOAT,
    offset_analyzed         FLOAT,
    quality_score           FLOAT,
    entropy                 FLOAT,
    stability               FLOAT,
    match_count             INT DEFAULT 0,
    false_positive_count    INT DEFAULT 0,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (reference_audio_id) REFERENCES reference_audio(id) ON DELETE CASCADE,
    FOREIGN KEY (track_version_id) REFERENCES track_versions(id) ON DELETE CASCADE,
    INDEX idx_reference_audio_id (reference_audio_id),
    INDEX idx_track_version_id (track_version_id),
    INDEX idx_algorithm (algorithm),
    INDEX idx_fingerprint_hash (fingerprint_hash),
    INDEX idx_quality_score (quality_score)
);
```

**Cardinality:** 50M-100M fingerprints (4 per audio at minimum)

---

### 1.7 FingerprintSegment Entity

```python
@dataclass
class FingerprintSegment:
    """Time-indexed segment for partial matching"""
    
    # Identity
    id: int
    fingerprint_id: int             # FK to Fingerprint
    
    # Temporal position
    segment_start_ms: int           # Start in milliseconds
    segment_end_ms: int             # End in milliseconds
    segment_index: int              # 0, 1, 2, ... (for ordering)
    
    # Segment hash
    segment_hash: str               # SHA256 or other hash
    segment_data: bytes             # Compressed segment data
    
    # Matching info
    priority: int                   # Higher = more distinctive (1-100)
    match_count: int                # Times this segment has matched
    false_positive_count: int
    
    # Timestamps
    created_at: datetime
```

**Table: `fingerprint_segments`**
```sql
CREATE TABLE fingerprint_segments (
    id                      BIGINT PRIMARY KEY AUTO_INCREMENT,
    fingerprint_id          BIGINT NOT NULL,
    segment_start_ms        INT,
    segment_end_ms          INT,
    segment_index           INT,
    segment_hash            VARCHAR(64),
    segment_data            LONGBLOB,
    priority                INT,
    match_count             INT DEFAULT 0,
    false_positive_count    INT DEFAULT 0,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (fingerprint_id) REFERENCES fingerprints(id) ON DELETE CASCADE,
    INDEX idx_fingerprint_id (fingerprint_id),
    INDEX idx_segment_hash (segment_hash),
    INDEX idx_priority (priority)
);
```

**Cardinality:** 200M-500M segments (typically 4-5 per fingerprint)

---

## Part 2: Relationships & Cardinality

### 2.1 Entity Relationship Diagram

```
Artist (1M-10M)
  ↓ 1:N
Album (2M-10M)
  ↓ 1:N
Track (10M-50M)
  ↓ 1:N
TrackVersion (50M-100M)
  ↓ 1:1
ReferenceAudio (50M-100M)
  ↓ 1:N (4 algorithms minimum)
Fingerprint (200M-400M)
  ↓ 1:N (4-5 segments each)
FingerprintSegment (800M-2B)
```

### 2.2 Query Paths

**Find all fingerprints for a song:**
```sql
SELECT f.*
FROM fingerprints f
JOIN reference_audio ra ON f.reference_audio_id = ra.id
JOIN track_versions tv ON ra.version_id = tv.id
JOIN tracks t ON tv.track_id = t.id
WHERE t.id = 123
```

**Find all fingerprints by artist:**
```sql
SELECT f.*
FROM fingerprints f
JOIN reference_audio ra ON f.reference_audio_id = ra.id
JOIN track_versions tv ON ra.version_id = tv.id
JOIN tracks t ON tv.track_id = t.id
JOIN albums a ON t.album_id = a.id
WHERE a.artist_id = 456
```

**Find candidate matches (by fingerprint hash):**
```sql
SELECT tv.*, f.*, ra.*
FROM fingerprints f
JOIN reference_audio ra ON f.reference_audio_id = ra.id
JOIN track_versions tv ON ra.version_id = tv.id
WHERE f.algorithm = 'chromaprint'
AND f.fingerprint_hash = ?  -- Hash of search fingerprint
LIMIT 100
```

**Find similar fingerprints (approximate matching):**
```sql
SELECT tv.*, f.*, 
       -- Cosine similarity between vectors
       (f.fingerprint_vector * ?) / 
       (SQRT(POW(f.fingerprint_vector, 2)) * SQRT(POW(?, 2))) AS similarity
FROM fingerprints f
JOIN track_versions tv ON f.track_version_id = tv.id
WHERE f.algorithm = 'chromaprint'
AND f.quality_score > 75
ORDER BY similarity DESC
LIMIT 100
```

---

## Part 3: Indexing Strategy

### 3.1 Primary Indexes (REQUIRED)

```sql
-- Artist searches
CREATE INDEX idx_artists_name_lower ON artists(name_lower);
CREATE INDEX idx_artists_musicbrainz ON artists(musicbrainz_id);

-- Album searches
CREATE INDEX idx_albums_artist_id ON albums(artist_id);
CREATE INDEX idx_albums_title_lower ON albums(title_lower);
CREATE INDEX idx_albums_musicbrainz ON albums(musicbrainz_id);
CREATE INDEX idx_albums_release_year ON albums(release_year);

-- Track searches
CREATE INDEX idx_tracks_album_id ON tracks(album_id);
CREATE INDEX idx_tracks_artist_id ON tracks(artist_id);
CREATE INDEX idx_tracks_title_lower ON tracks(title_lower);
CREATE INDEX idx_tracks_isrc ON tracks(isrc);

-- Version searches & filtering
CREATE INDEX idx_versions_track_id ON track_versions(track_id);
CREATE INDEX idx_versions_status ON track_versions(status);
CREATE INDEX idx_versions_confidence ON track_versions(confidence_score);

-- Audio storage
CREATE INDEX idx_audio_version_id ON reference_audio(version_id);
CREATE INDEX idx_audio_file_hash ON reference_audio(file_hash_sha256);

-- Fingerprint searches (CRITICAL)
CREATE INDEX idx_fingerprints_algorithm ON fingerprints(algorithm);
CREATE INDEX idx_fingerprints_hash ON fingerprints(fingerprint_hash);
CREATE INDEX idx_fingerprints_quality ON fingerprints(quality_score);

-- Segment searches (CRITICAL)
CREATE INDEX idx_segments_fingerprint ON fingerprint_segments(fingerprint_id);
CREATE INDEX idx_segments_hash ON fingerprint_segments(segment_hash);
CREATE INDEX idx_segments_priority ON fingerprint_segments(priority);
```

### 3.2 Advanced Indexes (PERFORMANCE)

```sql
-- Composite for common queries
CREATE INDEX idx_tracks_album_artist ON tracks(album_id, artist_id);
CREATE INDEX idx_versions_track_status ON track_versions(track_id, status);
CREATE INDEX idx_fps_algorithm_quality ON fingerprints(algorithm, quality_score);

-- Text search (if using MySQL 5.7+)
CREATE FULLTEXT INDEX idx_artist_name_ft ON artists(name);
CREATE FULLTEXT INDEX idx_album_title_ft ON albums(title);
CREATE FULLTEXT INDEX idx_track_title_ft ON tracks(title);

-- Spatial/similarity (if using specialized engines)
-- LSH (Locality-Sensitive Hashing) for fingerprint_vector
-- Requires specialized indexing (e.g., Annoy, HNSW, Faiss)
```

### 3.3 Search Optimization Recommendations

**For fingerprint_vector similarity:**
- Use **LSH (Locality-Sensitive Hashing)** for approximate nearest neighbor
- Consider **Approximate Nearest Neighbor** libraries:
  - Annoy (Spotify)
  - HNSW (Facebook)
  - Faiss (Meta)
  - Vamana (Microsoft)

**Storage format for fingerprint_vector:**
- Store as binary blob or base64-encoded numpy array
- Consider compression (zstd, LZ4)
- Typical size: 200-500 bytes per fingerprint

**Indexing strategy for scale:**
```
If < 100M fingerprints:
  - Standard SQL indexes sufficient
  - Add FULLTEXT for text search
  - Cache warm frequently-used fingerprints

If > 100M fingerprints:
  - Implement LSH or HNSW indexing
  - Consider sharding by fingerprint_hash prefix
  - Use read replicas for search queries
  - Cache most-popular fingerprints in Redis
```

---

## Part 4: Key Design Decisions

### 4.1 Denormalization Choices

**Why denormalize track_version_id in Fingerprint table?**
```
Alternative: Query through reference_audio → track_versions each time
Denormalization: Store track_version_id directly in fingerprints

Benefit: Faster queries (no 2 JOINs)
Cost: Slight redundancy, must maintain consistency

DECISION: Denormalize (query speed > storage)
```

**Why denormalize artist_id in Album and Track?**
```
Alternative: Always join from album → artist
Denormalization: Store artist_id in both album AND track

Benefit: Direct track→artist query (1 index instead of 2 JOINs)
Cost: Slight redundancy

DECISION: Denormalize (fast artist lookups important)
```

### 4.2 Storage Format Choices

**fingerprint_raw format:**
```
Options:
1. Base64 string (human-readable, larger)
2. Binary blob (compact, fast)
3. JSON (flexible, medium size)

DECISION: Binary blob
  Reasoning: Size/speed tradeoff optimal for fingerprints
  Alternative: Base64 for easier debugging
```

**fingerprint_vector storage:**
```
Options:
1. Stored as binary (numpy array serialized)
2. Stored as JSON array of floats
3. Stored as external blob with pointer

DECISION: Binary blob
  Reasoning: Similarity search requires fast access
  Size: Typically 0.5-2 KB per fingerprint
  Compressed: gzip to 200-500 bytes
```

### 4.3 Cascade Delete Strategy

```
Artist DELETE → Cascades to Albums, Tracks, Versions, Audio, Fingerprints
  (WARNING: Irreversible, should add soft-delete flag)

Album DELETE → Cascades to Tracks, Versions, Audio, Fingerprints
  (Less risky, album-level corrections)

Track DELETE → Cascades to Versions, Audio, Fingerprints
  (Dangerous, use soft-delete)

TrackVersion DELETE → Cascades to Audio, Fingerprints
  (Normal operation)

ReferenceAudio DELETE → Cascades to Fingerprints, Segments
  (Happens during cleanup)

Fingerprint DELETE → Cascades to Segments
  (Normal operation)
```

**RECOMMENDATION:** Add soft_delete flags instead of cascades for Artist/Track/Album.

---

## Part 5: Specific Implementation Notes

### 5.1 Fingerprint Hash Strategy

**Current approach (chromaprint example):**
```python
# Chromaprint outputs: "AQIDBA..." (base64)
fingerprint_hash = sha256(chromaprint_raw).hexdigest()
# Result: "a1b2c3d4..." (64-char hex)
```

**Indexing:**
- Exact match: `fingerprint_hash = "a1b2c3d4..."`
- Prefix match: `fingerprint_hash LIKE "a1b2%"` (sharding)

**Collision probability:**
- SHA256: 1 in 2^256 (astronomically low for this application)
- Safe to use as unique identifier

### 5.2 Fingerprint Similarity Scoring

**Cosine Similarity (for vector comparison):**
```python
def cosine_similarity(fp1_vector, fp2_vector):
    """Compare two fingerprint vectors (0-1 scale)"""
    dot_product = np.dot(fp1_vector, fp2_vector)
    norm1 = np.linalg.norm(fp1_vector)
    norm2 = np.linalg.norm(fp2_vector)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return dot_product / (norm1 * norm2)  # 0-1 score

# Convert to 0-100
similarity_score = cosine_similarity(fp1, fp2) * 100
```

**Storage consideration:**
- Pre-normalize vectors before storage
- Compute similarity on retrieval: fast O(n) operation

### 5.3 Version Selection Logic

**Canonical version choice:**
```python
def select_canonical_version(track_id):
    """Choose official version from multiple options"""
    
    # Priority order:
    # 1. Official studio version (highest confidence)
    # 2. Most verified version
    # 3. Highest quality
    # 4. Most recent
    
    return session.query(TrackVersion).filter(
        TrackVersion.track_id == track_id
    ).order_by(
        TrackVersion.status == 'verified' DESC,
        TrackVersion.confidence_score DESC,
        TrackVersion.quality_level DESC,
        TrackVersion.created_at DESC
    ).first()
```

---

## Part 6: API-Ready Data Structures

### 6.1 REST API Response Format

**GET /api/fingerprints/{id}**
```json
{
  "success": true,
  "fingerprint": {
    "id": 12345,
    "algorithm": "chromaprint",
    "algorithm_version": "1.5.0",
    "fingerprint_hash": "a1b2c3d4...",
    "quality_score": 87.5,
    "entropy": 0.92,
    "stability": 0.88,
    "match_count": 42,
    "false_positive_count": 1,
    "created_at": "2026-06-09T10:30:00Z",
    "track": {
      "id": 999,
      "title": "Let It Be",
      "artist": "The Beatles",
      "album": "Let It Be",
      "version_type": "studio",
      "version_label": "Original Master"
    }
  }
}
```

**GET /api/fingerprints/search?hash=a1b2c3d4**
```json
{
  "success": true,
  "query_hash": "a1b2c3d4",
  "results": [
    {
      "id": 12345,
      "algorithm": "chromaprint",
      "quality_score": 87.5,
      "track": {
        "id": 999,
        "title": "Let It Be",
        "artist": "The Beatles"
      },
      "match_score": 98.5,
      "match_method": "exact_hash"
    },
    {
      "id": 12346,
      "algorithm": "chromaprint",
      "quality_score": 82.0,
      "track": {
        "id": 999,
        "title": "Let It Be (Remaster)",
        "artist": "The Beatles"
      },
      "match_score": 94.2,
      "match_method": "similarity"
    }
  ],
  "total_results": 2
}
```

---

## Part 7: Migration & Phasing Strategy

### 7.1 Database Creation Order

```
Phase 1: Core entities (no data)
  1. CREATE artists table
  2. CREATE albums table
  3. CREATE tracks table
  4. CREATE track_versions table
  5. CREATE reference_audio table
  6. CREATE fingerprints table
  7. CREATE fingerprint_segments table

Phase 2: Indexing
  1. Create primary indexes
  2. Create search indexes
  3. Create LSH index (if needed)

Phase 3: Data population (gradual)
  1. Import metadata from MusicBrainz (artists, albums, tracks)
  2. Add known reference audio
  3. Generate fingerprints for references
  4. Build segments

Phase 4: Optimization
  1. Analyze query patterns
  2. Add missing indexes
  3. Tune LSH parameters
  4. Set up caching
```

### 7.2 Data Import Priorities

```
Priority 1 (Week 1):
  - Top 10k artists
  - Top 50k albums
  - Top 500k tracks
  - Generate fingerprints for all

Priority 2 (Week 2-3):
  - Expand to 100k artists, 500k albums, 5M tracks
  - Add YouTube/Spotify metadata

Priority 3 (Month 2):
  - Full scale: 1M+ artists, 10M+ albums, 50M+ tracks
  - Complete fingerprint coverage
```

---

## Part 8: Future Enhancements (Out of Scope V1)

### 8.1 Additional Entities (V2)

```
FingerprintMatch table:
  - Track match history
  - Query fingerprint paired with result fingerprint
  - Timestamp, confidence, user feedback

FingerprintFeedback table:
  - User corrections ("this is wrong")
  - "This is actually song X"
  - Timestamp, feedback_type, user_id

FingerprintStats table:
  - Performance metrics by algorithm, by content type
  - Match rates, false positive rates
  - Aggregated daily/weekly

FingerprintLearning table:
  - ML model training data
  - Feature vectors + labels
  - Model versioning
```

### 8.2 Optimization Ideas

```
- Vector quantization (compress fingerprint_vector to 8-bit)
- Approximate nearest neighbors (LSH, HNSW)
- Fingerprint clustering by genre/style
- Multi-algorithm ensemble voting
- User-specific fingerprint weighting
```

---

## Conclusion

### Design Summary

**Fingerprint Library V1** provides:
- ✓ Hierarchical organization (Artist → Album → Track → Version)
- ✓ Flexible fingerprint storage (4+ algorithms)
- ✓ Segment-based partial matching
- ✓ Quality metrics and versioning
- ✓ Search optimization (hash + similarity)
- ✓ Scalability to 100M+ fingerprints

### Production Readiness

**When to implement:**
- After Phase 2 (Fingerprinting architecture complete)
- Before Phase 3 (Review system, which depends on library)

**Estimated effort:**
- Database design: 5 hours (complete)
- API endpoints: 15 hours
- Data import/ETL: 10 hours
- Indexing optimization: 5 hours
- **Total: 35 hours**

### Next Document

**Next:** FOPS_FINGERPRINT_LIFECYCLE.md (track progression from import → verification)

---

**Status:** DESIGN COMPLETE (NOT IMPLEMENTED)  
**Ready to Build:** Yes  
**Database Size:** 850 GB+ (with replication: 2.5 TB)  
**Query Latency Target:** <500ms for top-100k fingerprints

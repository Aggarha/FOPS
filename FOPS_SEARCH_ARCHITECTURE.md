# FOPS SEARCH ARCHITECTURE
**Official Search vs Discovery Search Design**

**Status:** Architecture Design Complete  
**Date:** 2026-06-09  
**Scope:** Two independent search systems for different use cases  
**Objective:** Define search strategies for content protection

---

## Executive Summary

### Two Search Modes

FOPS implements **two orthogonal search systems** serving different needs:

| Aspect | Official Search | Discovery Search |
|--------|-----------------|------------------|
| **Goal** | Find canonical source | Find all copies everywhere |
| **Input** | Artist + Title | Audio fingerprint OR metadata |
| **Search Space** | Official uploads only | Entire internet (YouTube, etc.) |
| **Scope** | Official channels | Multi-platform (7+) |
| **Accuracy** | Highest (95%+) | Lower (75-85%) |
| **Speed** | Fast (<2s) | Slow (30-60s) |
| **Use Case** | Verify legitimate sources | Discover unauthorized copies |

---

## Part 1: OFFICIAL SEARCH

### 1.1 Purpose

**Official Search** finds the canonical source for a song:
- Artist + Title → Official URL
- Used to verify "is this the official version?"
- Used to establish baseline fingerprints
- High confidence required

### 1.2 Architecture

```
INPUT: Artist + Title
  ↓
STEP 1: Metadata Normalization
  - Clean artist name (remove special chars)
  - Clean song title (remove remixes, feats)
  - Language detection (for non-Latin scripts)
  ↓
STEP 2: Canonical Search
  - Query official databases:
    * MusicBrainz (300M+ recordings)
    * Spotify API (100M+ tracks)
    * YouTube official channels
  ↓
STEP 3: Candidate Filtering
  - Official channel verification
  - Artist channel confirmation
  - Label channel check
  ↓
STEP 4: URL Resolution
  - Get highest-quality version
  - Prefer official over repost
  - Prefer highest-viewed version
  ↓
OUTPUT: Official URL + Metadata
```

### 1.3 Data Sources (Priority Order)

**Primary:**
1. **MusicBrainz API** (authoritative metadata)
   - Artist MBID
   - Release MBID
   - Recording MBID
   - Links to external databases

2. **Spotify API** (scale + accuracy)
   - 100M+ tracks
   - Artist verification
   - Album info
   - Popularity score

3. **YouTube Official Channels**
   - Official artist channels (@officialartist)
   - Label channels (Universal, Sony, etc.)
   - Verified VEVO accounts

**Secondary:**
4. Apple Music API
5. Tidal API
6. SoundCloud official accounts

### 1.4 Verification Steps

**Artist Verification:**
```python
def verify_artist_official(artist_name, channel_url):
    """Check if channel is official for artist"""
    
    checks = [
        check_channel_name(artist_name, channel_url),      # Name match?
        check_verification_badge(channel_url),             # Verified?
        check_subscriber_count(channel_url, ">100k"),      # Established?
        check_description_links(channel_url),              # Links to official site?
        check_pinned_video(channel_url),                   # Official bio pinned?
        check_upload_consistency(channel_url),             # Regular uploads?
    ]
    
    return all(checks)  # ALL must pass
```

**Channel Trust Scoring:**
```
+20 points: Channel name is exact artist name
+15 points: Channel verified (blue checkmark)
+10 points: 100k+ subscribers
+10 points: Website link in description
+10 points: Consistent upload pattern
+10 points: Pinned official bio/announcement
────────────
Max Score: 75 points (≥60 = trusted)
```

### 1.5 Example Flow

```
INPUT:
  artist: "The Beatles"
  title: "Let It Be"

STEP 1: Normalization
  normalized_artist: "the beatles"
  normalized_title: "let it be"

STEP 2: MusicBrainz Query
  MBID: 9dffb101-5f84-3e4c-3f44-0e7b848ee519
  Recording: "Let It Be"
  Release: "Let It Be"
  Release Year: 1970
  Isrc: "USIR20400274"

STEP 3: Spotify Verification
  Spotify ID: 3AJwUBCWF651dMvS5R7DXN
  Popularity: 85/100
  Official Artist Account: apple.com/music/...

STEP 4: YouTube Search (Official Channels Only)
  THE BEATLES (4M subscribers, verified)
    → Video: "Let It Be"
    → URL: https://www.youtube.com/watch?v=...
    → Views: 500M+
    → Verified: ✓
  
  THE BEATLES VEVO (3M subscribers, verified)
    → Video: "Let It Be (Official Music Video)"
    → Views: 250M+

STEP 5: Priority Ranking
  1. THE BEATLES (official account)
  2. BEATLES REMASTERED (official label)
  3. VEVO (authorized)

OUTPUT:
  official_url: "https://www.youtube.com/watch?v=..."
  channel: "THE BEATLES"
  verified: true
  confidence: 0.98
  metadata: {
    artist: "The Beatles",
    title: "Let It Be",
    album: "Let It Be",
    release_year: 1970,
    duration: 240,
    isrc: "USIR20400274",
    views: 500000000,
    verified_badge: true
  }
```

### 1.6 Performance Targets

| Metric | Target |
|--------|--------|
| Query Time | <2 seconds |
| Hit Rate | 95%+ for major artists |
| False Positive Rate | <1% |
| Verification Accuracy | 99%+ |

### 1.7 Failure Modes

```
Scenario 1: Artist not in databases
  → Return empty result
  → Suggest user manual search
  
Scenario 2: Multiple official channels
  → Return ranked list (by priority)
  → User selects primary
  
Scenario 3: Artist channel compromised
  → Manual verification flag
  → Use alternative source
  
Scenario 4: Song not found
  → Return closest match
  → Ask for confirmation
```

---

## Part 2: DISCOVERY SEARCH

### 2.1 Purpose

**Discovery Search** finds copies/variants of a song across internet:
- Audio fingerprint → All copies on internet
- Used to detect unauthorized uploads
- Used for copyright enforcement
- Used to monitor platform distribution

### 2.2 Architecture

```
INPUT: Audio Fingerprint (or URL)
  ↓
STEP 1: Normalize Fingerprint
  - Extract all 4 algorithms
  - Compute LSH buckets
  - Generate search queries
  ↓
STEP 2: Multi-Platform Search
  ├─ YouTube (via YouTube Search API)
  ├─ TikTok (via unofficial API / crawler)
  ├─ Facebook (via Graph API)
  ├─ Instagram (via unofficial API / crawler)
  ├─ Telegram (public channel crawl)
  ├─ SoundCloud (via API)
  └─ Web (via Google search)
  ↓
STEP 3: Candidate Collection
  - Aggregate results from all platforms
  - Deduplicate by source
  - Collect metadata
  ↓
STEP 4: Fingerprint Verification
  - For each top candidate:
    * Download audio
    * Extract fingerprints
    * Compare with reference
    * Compute confidence
  ↓
STEP 5: Ranking & Scoring
  - Sort by confidence score
  - Filter by threshold (>75%)
  - Return ranked results
  ↓
OUTPUT: Ranked list of matches by platform
```

### 2.3 Data Sources (Multi-Platform)

**Primary Search Sources:**

**1. YouTube (Dominant)**
- Via YouTube Search API (90M+ videos)
- Search types:
  * Title + Artist
  * Exact URL match
  * Fingerprint-indexed results
- Metadata collected:
  * Video ID, URL, Title, Channel
  * View count, upload date
  * Duration, availability
  * Subtitles (for text search)

**2. TikTok (Growing Fastest)**
- Unofficial API (no official API)
- Crawler-based discovery
- Search by audio fingerprint
- Metadata:
  * Video ID, URL, Creator
  * Engagement (likes, shares)
  * Audio duration

**3. Facebook (Video Platform)**
- Graph API (if authorized)
- Facebook Watch videos
- Search by title

**4. Instagram (Short-form)**
- Reels platform
- Official API (limited)
- Search by tags/audio

**5. Telegram (Open Channels)**
- Public channel crawl
- Search by metadata
- Audio file downloads

**6. SoundCloud (Audio Focus)**
- SoundCloud API
- Audio-first platform
- Direct audio download capability

**7. Web (Broad Coverage)**
- Google Search API
- Indirect audio discovery
- Links to audio files

### 2.4 Search Query Generation

**Query Templates (by platform):**

```python
# YouTube
youtube_queries = [
    f"{artist} {title}",
    f"{artist} - {title}",
    f'"{title}" {artist}',
    f"{artist} official",
    f"{title} lyrics",
    f"{artist} music video",
]

# TikTok (audio-based)
tiktok_queries = [
    f"audio:{fingerprint_hash[:16]}",    # Direct hash search
    f"{artist} {title}",
    f"sound:{title}",
]

# Facebook
facebook_queries = [
    f"{artist} {title}",
    f'"{title}"',
]

# SoundCloud
soundcloud_queries = [
    f"{artist} {title}",
    f'"{title}" {artist}',
]

# Web
web_queries = [
    f'"{artist}" "{title}" mp3',
    f"{artist} {title} filetype:mp3",
]
```

### 2.5 Candidate Ranking Algorithm

```python
def rank_candidates(candidates, reference_fingerprint):
    """
    Rank candidates by likelihood of being correct match
    """
    
    scored = []
    
    for candidate in candidates:
        score = 0
        
        # FINGERPRINT VERIFICATION (primary)
        fp_score = verify_fingerprint(candidate.audio, reference_fingerprint)
        score += fp_score * 0.60  # 60% weight
        
        # METADATA MATCH (secondary)
        metadata_score = score_metadata_match(
            candidate.title, candidate.artist,
            reference.title, reference.artist
        )
        score += metadata_score * 0.20  # 20% weight
        
        # CHANNEL TRUST (tertiary)
        if candidate.platform == "youtube":
            trust_score = score_channel_trust(candidate.channel)
            score += trust_score * 0.10  # 10% weight
        
        # PLATFORM PREFERENCE (quarternary)
        platform_score = {
            "youtube": 100,
            "soundcloud": 90,
            "official_site": 95,
            "facebook": 70,
            "instagram": 65,
            "tiktok": 50,  # Short clips, lower confidence
            "telegram": 40,  # Unmoderated
        }.get(candidate.platform, 30)
        score += platform_score * 0.10  # 10% weight
        
        scored.append({
            "candidate": candidate,
            "score": score,
            "fingerprint_score": fp_score,
            "metadata_score": metadata_score,
            "platform_score": platform_score,
        })
    
    return sorted(scored, key=lambda x: x["score"], reverse=True)
```

### 2.6 Example Discovery Flow

```
INPUT:
  Reference: "The Beatles - Let It Be"
  Fingerprint: chromaprint_hash...

STEP 1: Query Generation
  Queries:
    - "The Beatles Let It Be"
    - "The Beatles - Let It Be"
    - '"Let It Be" The Beatles'
    - "The Beatles official"
    - "Let It Be lyrics"

STEP 2: Multi-Platform Search
  YouTube:
    ├─ THE BEATLES (official) - 500M views ✓
    ├─ Random Channel - 1M views ✗
    ├─ Music Video - 250M views ✓
    └─ ... (100 results)
  
  TikTok:
    ├─ @user123 - 2M views
    ├─ @beatles_fan - 500k views
    └─ ... (50 results)
  
  Facebook:
    ├─ Official Beatles Page - 1M shares
    └─ ... (20 results)
  
  SoundCloud:
    ├─ @thebeatleshq - 10M plays
    └─ ... (30 results)

STEP 3: Candidate Collection
  Total candidates: 200
  After deduplication: 47

STEP 4: Fingerprint Verification (top 20)
  Candidate 1: YouTube official
    FP Score: 98% ✓
    Metadata: 100% match
    Platform: YouTube
    Combined: 96%
    
  Candidate 2: YouTube repost (HQ)
    FP Score: 94%
    Metadata: 100% match
    Platform: YouTube
    Combined: 92%
    
  Candidate 3: TikTok clip (15sec)
    FP Score: 78%
    Metadata: 80% match (partial title)
    Platform: TikTok
    Combined: 70%

STEP 5: Output (Top 10)
  Ranked Results:
    1. YouTube (Official Channel) - 96% confidence
    2. YouTube (VEVO) - 94% confidence
    3. Spotify - 92% confidence
    4. SoundCloud (Official) - 88% confidence
    5. Facebook (Official) - 85% confidence
    6. Instagram Reel - 65% confidence
    7. TikTok Audio - 55% confidence
    ...
```

### 2.7 Performance Targets

| Metric | Target |
|--------|--------|
| Total Search Time | 30-60 seconds |
| Candidates Found | 10-50+ |
| Top Result Accuracy | 90%+ |
| False Positive Rate | <5% |
| Platform Coverage | 7+ platforms |

### 2.8 Rate Limiting & Compliance

**API Rate Limits:**
```
YouTube API:     10,000 queries/day (standard tier)
Spotify API:     Unlimited (with auth)
Facebook Graph:  Varies by app tier
SoundCloud API:  Varies by auth
TikTok:          Via unofficial APIs (risky)
Google Search:   100 queries/day (free tier)
```

**Recommendation:**
- Use authenticated APIs where possible
- Respect rate limits (queue discovery requests)
- Implement caching (repeat queries)
- Batch requests (efficiency)

---

## Part 3: Comparison Matrix

### 3.1 Official vs Discovery

```
┌──────────────────────────────┬────────────────┬────────────────┐
│ Aspect                       │ Official       │ Discovery      │
├──────────────────────────────┼────────────────┼────────────────┤
│ Purpose                      │ Canonical URL  │ Find copies    │
│ Search Trigger               │ Manual request │ Automated scan │
│ Input                        │ Title/Artist   │ Fingerprint    │
│ Search Space                 │ Official only  │ Internet-wide  │
│ Platforms                    │ 3-4            │ 7-10           │
│ Speed                        │ <2 seconds     │ 30-60 seconds  │
│ Accuracy (top result)        │ 95%+           │ 85-90%         │
│ Coverage (hit rate)          │ 90%+ major     │ 70%+ existing  │
│ Confidence Required          │ >90%           │ >75%           │
│ Manual Review Rate           │ <1%            │ 5-10%          │
│ Cost Per Query               │ Low (cached)   │ High (multi)   │
│ Scaling                      │ Database       │ Distributed    │
│ Maintenance                  │ Low            │ High (APIs)    │
└──────────────────────────────┴────────────────┴────────────────┘
```

### 3.2 Use Cases

**Official Search — Use When:**
- ✓ Establishing baseline reference
- ✓ Verifying "is this official?"
- ✓ Building fingerprint library
- ✓ Content creator authorization needed
- ✓ High confidence required

**Discovery Search — Use When:**
- ✓ Monitoring for unauthorized copies
- ✓ Copyright enforcement actions needed
- ✓ Finding derivative versions (remixes, covers)
- ✓ Analyzing platform distribution
- ✓ Quick scan of common platforms
- ✓ Batch processing required

---

## Part 4: Implementation Roadmap

### 4.1 Phase 1: Official Search (Weeks 1-2)

**Deliverables:**
- MusicBrainz integration
- Spotify API connection
- YouTube official channel detection
- Ranking algorithm
- API endpoints

**Effort:** 20 hours

### 4.2 Phase 2: Discovery Search (Weeks 3-5)

**Deliverables:**
- YouTube Search integration
- SoundCloud API integration
- Fingerprint-based candidate matching
- Multi-platform aggregation
- Batch discovery jobs

**Effort:** 40 hours

### 4.3 Phase 3: Optimization (Weeks 6-7)

**Deliverables:**
- Caching strategy
- Rate limiting
- Performance tuning
- Error recovery
- Monitoring

**Effort:** 20 hours

---

## Conclusion

### Search Architecture Summary

FOPS implements **two complementary search systems**:

**Official Search:** Fast, accurate verification against canonical sources  
**Discovery Search:** Comprehensive internet-wide monitoring for copies

Together, they provide complete content protection visibility:
- ✓ Know where the official version is
- ✓ Know where all the copies are
- ✓ Verify authenticity
- ✓ Monitor distribution
- ✓ Enable enforcement

---

**Status:** ARCHITECTURE COMPLETE  
**Next:** FOPS_CONFIDENCE_ENGINE.md (Scoring formulas)

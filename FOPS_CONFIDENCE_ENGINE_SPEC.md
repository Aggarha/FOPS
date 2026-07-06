# FOPS CONFIDENCE ENGINE SPECIFICATION
**Scoring Formulas and Decision Logic**

**Status:** Specification Complete  
**Date:** 2026-06-09  
**Scope:** Multi-signal confidence scoring system  
**Objective:** Define transparent, auditable confidence calculations

---

## Executive Summary

### Confidence Scoring

FOPS uses a **multi-factor confidence engine** combining:
- Fingerprint accuracy (60%)
- Metadata match quality (20%)
- Channel/source trust (10%)
- Historical agreement (10%)

**Result:** 0-100 confidence score with clear reasoning.

---

## Part 1: Components of Confidence

### 1.1 Fingerprint Confidence (60% weight)

**Formula:**
```
fingerprint_confidence = weighted_average(
    chromaprint_score * 0.35,
    spectral_score * 0.30,
    mfcc_score * 0.25,
    peaks_score * 0.10
)
```

**Per-Algorithm Scoring:**

```python
def chromaprint_confidence(fp1, fp2) -> float:
    """Chromaprint comparison confidence (0-100)"""
    
    # Hamming distance between fingerprints
    # More similar = higher score
    
    hamming_similarity = compute_hamming_similarity(fp1, fp2)
    # hamming_similarity: 0-1 (1.0 = identical)
    
    score = hamming_similarity * 100
    
    # Adjust for quality
    fp_quality = (fp1.quality_score + fp2.quality_score) / 2
    quality_factor = 0.8 + (quality_factor / 500)  # 0.8-1.0 range
    
    return score * quality_factor

def spectral_confidence(spec1, spec2) -> float:
    """Spectral energy match confidence"""
    
    # Euclidean distance between 8-bin energy vectors
    euclidean_dist = numpy.linalg.norm(spec1 - spec2)
    
    # Normalize to 0-100 scale
    similarity = 100 / (1 + euclidean_dist)
    
    return min(100, similarity)

def mfcc_confidence(mfcc1, mfcc2) -> float:
    """MFCC timbre match confidence"""
    
    # Cosine similarity between MFCC coefficient means
    mean1 = mfcc1.mean(axis=1)
    mean2 = mfcc2.mean(axis=1)
    
    cosine_sim = numpy.dot(mean1, mean2) / (
        numpy.linalg.norm(mean1) * numpy.linalg.norm(mean2)
    )
    
    # Scale to 0-100
    return max(0, cosine_sim * 100)

def peaks_confidence(peaks1, peaks2) -> float:
    """Spectral peaks match confidence"""
    
    # Jaccard similarity of peak sets
    intersection = len(peaks1 & peaks2)
    union = len(peaks1 | peaks2)
    
    jaccard = intersection / union if union > 0 else 0
    
    return jaccard * 100
```

**Example:**
```
Chromaprint: 92%  (very similar chroma features)
Spectral:    88%  (energy distribution matches)
MFCC:        94%  (timbre is very similar)
Peaks:       85%  (landmark peaks mostly match)

Weighted:
  92 * 0.35 = 32.2
  88 * 0.30 = 26.4
  94 * 0.25 = 23.5
  85 * 0.10 = 8.5
  ───────────────
  Total:    90.6% (fingerprint confidence)
```

### 1.2 Metadata Confidence (20% weight)

**Formula:**
```
metadata_confidence = weighted_average(
    title_match * 0.40,
    artist_match * 0.35,
    album_match * 0.15,
    duration_match * 0.10
)
```

**Title Matching:**
```python
def title_confidence(title1, title2) -> float:
    """Similarity of song titles"""
    
    # Clean titles (remove features, versions)
    clean1 = clean_title(title1)  # "Let It Be (Remaster)" → "Let It Be"
    clean2 = clean_title(title2)
    
    # Fuzzy string matching (token_sort_ratio)
    from thefuzz import fuzz
    similarity = fuzz.token_sort_ratio(clean1, clean2) / 100
    
    # Confidence: 0-100
    return similarity * 100

def clean_title(title):
    """Remove version info, brackets, etc."""
    import re
    # Remove (Remaster), [Remix], - Live, etc.
    cleaned = re.sub(r'[\(\[\{].*?[\)\]\}]', '', title)
    cleaned = re.sub(r'-\s+(Live|Remix|Acoustic).*', '', cleaned, flags=re.I)
    return cleaned.strip()
```

**Artist Matching:**
```python
def artist_confidence(artist1, artist2) -> float:
    """Similarity of artist names"""
    
    # Normalize names (remove special chars, lowercase)
    norm1 = normalize_artist(artist1)
    norm2 = normalize_artist(artist2)
    
    # Fuzzy match
    similarity = fuzz.ratio(norm1, norm2) / 100
    
    return similarity * 100

def normalize_artist(artist):
    """Normalize artist name for comparison"""
    import re
    artist = artist.lower()
    artist = re.sub(r'[^a-z0-9\s]', '', artist)  # Remove special chars
    artist = re.sub(r'\s+', ' ', artist).strip()  # Normalize spaces
    return artist
```

**Duration Matching:**
```python
def duration_confidence(duration1, duration2) -> float:
    """Confidence that durations match"""
    
    # Allow 5% tolerance (typical for fade variations)
    diff = abs(duration1 - duration2)
    tolerance = duration1 * 0.05  # 5%
    
    if diff <= tolerance:
        return 100.0  # Perfect match
    elif diff <= tolerance * 2:
        return 75.0   # Close match
    elif diff <= tolerance * 4:
        return 50.0   # Acceptable
    else:
        return 0.0    # Mismatch (likely different)
```

**Example:**
```
Title match:     95%   ("Let It Be" vs "Let It Be")
Artist match:    92%   ("The Beatles" vs "Beatles")
Album match:     85%   ("Let It Be" vs "Let It Be Album")
Duration match: 100%   (240s vs 240s)

Weighted:
  95 * 0.40 = 38.0
  92 * 0.35 = 32.2
  85 * 0.15 = 12.75
 100 * 0.10 = 10.0
  ──────────────────
  Total:    92.95% (metadata confidence)
```

### 1.3 Channel Trust (10% weight)

**Platform-based Trust:**
```python
def channel_trust_score(platform, channel_info) -> float:
    """Trust score based on platform and channel"""
    
    trust_scores = {
        "official_artist_channel": 95,
        "verified_label": 90,
        "vevo_official": 88,
        "official_label": 85,
        "major_artist_channel": 80,
        "established_channel_100k": 70,
        "established_channel_10k": 50,
        "new_channel": 20,
        "suspicious_channel": 5,
    }
    
    return trust_scores.get(classify_channel(channel_info), 30)

def classify_channel(channel_info) -> str:
    """Classify channel trustworthiness"""
    
    checks = {
        "is_official": check_official_status(channel_info),
        "is_verified": channel_info.get("verified", False),
        "subscriber_count": channel_info.get("subscribers", 0),
        "upload_frequency": check_upload_frequency(channel_info),
        "avg_likes": channel_info.get("avg_likes", 0),
    }
    
    if checks["is_official"] and checks["is_verified"]:
        if checks["subscriber_count"] > 1000000:
            return "official_artist_channel"
        else:
            return "official_label"
    elif checks["is_verified"]:
        if checks["subscriber_count"] > 1000000:
            return "major_artist_channel"
        else:
            return "established_channel_100k"
    elif checks["subscriber_count"] > 100000:
        return "established_channel_100k"
    elif checks["subscriber_count"] > 10000:
        return "established_channel_10k"
    else:
        return "new_channel"
```

**Example:**
```
Platform: YouTube
Channel: "THE BEATLES" (verified, official, 5M subscribers)

Trust Score: 95%
```

### 1.4 Historical Agreement (10% weight)

**Learning from Past Decisions:**
```python
def historical_agreement_score(
    fingerprint_pair,
    user_decision_history
) -> float:
    """Confidence based on user approval/rejection history"""
    
    # Query: Have we seen this pair before?
    past_decisions = query_history(fingerprint_pair)
    
    if not past_decisions:
        return 50.0  # No history, neutral
    
    total_decisions = len(past_decisions)
    approved = sum(1 for d in past_decisions if d["decision"] == "APPROVED")
    rejected = sum(1 for d in past_decisions if d["decision"] == "REJECTED")
    
    # Agreement score: how consistent are decisions?
    max_agreement = max(approved, rejected)
    agreement_rate = (max_agreement / total_decisions) * 100
    
    # Higher agreement = higher confidence
    # Even if we don't know absolute correctness
    return agreement_rate
```

**Example:**
```
Past decisions on this pair:
- Approved: 8/10
- Rejected: 2/10

Agreement rate: 80% (most people agreed)
Historical confidence: 80%
```

---

## Part 2: Combined Confidence Formula

### 2.1 Overall Confidence

```
total_confidence = (
    fingerprint_conf * 0.60 +
    metadata_conf * 0.20 +
    channel_trust * 0.10 +
    historical_agree * 0.10
)
```

**Example:**
```
Fingerprint:      90.6%  ×  0.60  =  54.36
Metadata:         92.95% ×  0.20  =  18.59
Channel Trust:    95%    ×  0.10  =  9.5
Historical:       80%    ×  0.10  =  8.0
────────────────────────────────────────
TOTAL CONFIDENCE: 90.45%
```

### 2.2 Confidence Categories

```
┌─────────────────┬─────────────┬──────────────────────┐
│ Confidence      │ Decision    │ Action               │
├─────────────────┼─────────────┼──────────────────────┤
│ 90-100%         │ VERIFIED    │ Auto-approve         │
│ 80-89%          │ LIKELY      │ Send to review       │
│ 75-79%          │ UNCERTAIN   │ Send to review (HR)  │
│ 70-74%          │ POSSIBLE    │ Low-priority review  │
│ < 70%           │ UNLIKELY    │ Reject               │
└─────────────────┴─────────────┴──────────────────────┘
```

---

## Part 3: Decision Thresholds

### 3.1 Threshold Logic

```python
def make_decision(confidence: float) -> tuple[str, str]:
    """
    Determine action based on confidence level
    Returns: (decision, action)
    """
    
    if confidence >= 90:
        return "VERIFIED", "auto_approve"
    elif confidence >= 80:
        return "LIKELY_MATCH", "send_to_review"
    elif confidence >= 75:
        return "UNCERTAIN", "send_to_review_high_priority"
    elif confidence >= 70:
        return "POSSIBLE", "send_to_review_low_priority"
    else:
        return "NO_MATCH", "reject"
```

### 3.2 Scenario-Based Thresholds

```python
# Different thresholds by content type

thresholds = {
    "exact_upload": {
        "auto_approve": 95,      # Same file uploaded
        "review": 85,
        "reject": 70,
    },
    "encoded_version": {
        "auto_approve": 88,      # Different bitrate
        "review": 75,
        "reject": 60,
    },
    "content_with_additions": {
        "auto_approve": 85,      # Intro/outro added
        "review": 75,
        "reject": 55,
    },
    "live_performance": {
        "auto_approve": 80,      # Different take
        "review": 70,
        "reject": 50,
    },
    "remix": {
        "auto_approve": None,    # Never auto-approve
        "review": 75,
        "reject": 50,
    },
    "clip": {
        "auto_approve": 85,      # If chorus/distinctive
        "review": 70,
        "reject": 50,
    },
}
```

---

## Part 4: Breakdown Visualization

### 4.1 User-Facing Display

```
Confidence: 90.45%  ✓ VERIFIED

┌─────────────────────────────────────────┐
│ CONFIDENCE BREAKDOWN                    │
├─────────────────────────────────────────┤
│                                         │
│ Fingerprint Analysis:        [■■■■■ 91%│ (60% weight)
│   Chromaprint:               [■■■■ 92%│
│   Spectral:                  [■■■■ 88%│
│   MFCC:                      [■■■■■ 94%│
│   Peaks:                     [■■■ 85% │
│                                         │
│ Metadata Match:              [■■■■■ 93%│ (20% weight)
│   Title:                     [■■■■■ 95%│
│   Artist:                    [■■■■■ 92%│
│   Duration:                  [■■■■■ 100%│
│                                         │
│ Source Trust:                [■■■■■ 95%│ (10% weight)
│   Channel:   THE BEATLES (Official)    │
│   Verified:  ✓ Yes                      │
│   Subscribers: 5.2M                     │
│                                         │
│ Historical Agreement:        [■■■■ 80% │ (10% weight)
│   Past Decisions: 8 approved, 2 rejected│
│                                         │
└─────────────────────────────────────────┘

Overall Decision: VERIFIED ✓
Recommended Action: Auto-approve
```

### 4.2 API Response Format

```json
{
  "confidence_analysis": {
    "total_confidence": 90.45,
    "decision": "VERIFIED",
    "action": "auto_approve",
    "reasoning": "Strong fingerprint match with official source",
    
    "component_scores": {
      "fingerprint": {
        "score": 90.6,
        "weight": 0.60,
        "weighted": 54.36,
        "breakdown": {
          "chromaprint": 92,
          "spectral": 88,
          "mfcc": 94,
          "peaks": 85
        }
      },
      "metadata": {
        "score": 92.95,
        "weight": 0.20,
        "weighted": 18.59,
        "breakdown": {
          "title": 95,
          "artist": 92,
          "album": 85,
          "duration": 100
        }
      },
      "channel_trust": {
        "score": 95,
        "weight": 0.10,
        "weighted": 9.5,
        "channel_class": "official_artist_channel",
        "verified": true
      },
      "historical_agreement": {
        "score": 80,
        "weight": 0.10,
        "weighted": 8.0,
        "approved_count": 8,
        "rejected_count": 2
      }
    },
    
    "timestamp": "2026-06-09T10:42:00Z"
  }
}
```

---

## Part 5: Transparency & Auditability

### 5.1 Explainability

**For each decision, provide:**
1. ✓ Component scores (why each number)
2. ✓ Weight allocation (why 60/20/10/10)
3. ✓ Example comparisons (show similar/dissimilar)
4. ✓ Decision boundary (what score would change decision?)
5. ✓ Historical context (past similar decisions)

### 5.2 Appeal Mechanism

**When user disagrees:**
```python
def handle_appeal(verification_id, user_feedback):
    """
    User challenges decision: "This is wrong!"
    
    Store:
    - Original decision
    - Original scores
    - User disagreement
    - Reason for appeal
    
    Action:
    - Send to expert reviewer
    - Re-run algorithms
    - Update thresholds if systematic issue
    - Document learning
    """
```

### 5.3 Continuous Calibration

```python
def calibrate_thresholds(
    recent_decisions,
    user_feedback,
    false_positive_rate,
    false_negative_rate
):
    """
    Adjust thresholds based on results
    
    Example:
    - If false_positive_rate > 5%: raise threshold by 2%
    - If false_negative_rate > 10%: lower threshold by 2%
    - Rebalance weights based on per-algorithm accuracy
    """
```

---

## Part 6: Advanced Features (Future)

### 6.1 Machine Learning Refinement

```
Once we have 10,000+ verified decisions:
- Train ML model on component scores → correct/incorrect
- Learn non-linear relationships
- Personalize thresholds by content type
- Ensemble methods (combining model + rules)
```

### 6.2 Dynamic Thresholds

```
By content type:
  Pop songs: threshold 85 (well-characterized)
  Classical: threshold 75 (more variation)
  Live: threshold 70 (high natural variation)

By user:
  Strict user: threshold 85
  Lenient user: threshold 75
  
By platform:
  Official YouTube: threshold 90 (high trust)
  TikTok: threshold 70 (lower trust)
```

---

## Conclusion

### Confidence Engine Summary

FOPS Confidence Engine provides:
- ✓ Transparent, auditable scoring
- ✓ Multi-factor decision logic
- ✓ Clear reasoning for each decision
- ✓ Explainable to users
- ✓ Continuous learning & calibration

**Key Properties:**
- **0-100 scale** (intuitive)
- **Component breakdown** (explainable)
- **Weighted average** (adjustable)
- **Threshold-based decisions** (predictable)
- **Appeal mechanism** (fair)

---

**Status:** SPECIFICATION COMPLETE  
**Next:** FOPS_CONTENT_ID_GAP_ANALYSIS.md (Final gap analysis)

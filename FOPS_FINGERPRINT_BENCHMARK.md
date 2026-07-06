# FOPS FINGERPRINT ACCURACY BENCHMARK PLAN
**Comprehensive Testing Framework for Algorithm Reliability**

**Status:** Design Complete (Ready for Testing)  
**Date:** 2026-06-09  
**Scope:** 16 test scenarios covering audio variants, encoding, and transformations  
**Objective:** Establish baseline accuracy and identify algorithm limitations

---

## Executive Summary

### Testing Strategy

This document defines a **repeatable benchmark framework** to test FOPS fingerprint algorithms against 16 scenarios covering:

1. **Exact scenarios** (baseline)
2. **Encoding variations** (compression, bitrate)
3. **Audio processing** (pitch, tempo, clips)
4. **Content variations** (intro/outro, overlay, live)
5. **Derivative works** (remix, cover)

### Expected Outcomes

For each scenario, we will:
- ✓ Establish expected score (theoretical)
- ✓ Measure actual score (empirical)
- ✓ Identify risk level (false positive/negative)
- ✓ Recommend threshold (per scenario)

---

## Part 1: Benchmark Methodology

### 1.1 Test Harness Architecture

```python
class FingerprintBenchmark:
    """
    Main test framework
    
    Usage:
        benchmark = FingerprintBenchmark()
        benchmark.add_test_case(
            name="Exact Reupload",
            reference_url="https://www.youtube.com/watch?v=...",
            test_url="https://www.youtube.com/watch?v=...",
            expected_score=95,  # ±5 tolerance
            scenario_type="exact"
        )
        results = benchmark.run_all()
        report = benchmark.generate_report()
    """
    
    test_cases: List[BenchmarkCase]
    results: Dict[str, BenchmarkResult]
    
    def add_test_case(self, name, reference_url, test_url, 
                      expected_score, scenario_type):
        """Register a test case"""
        
    def run_all(self, timeout=300) -> Dict:
        """Run all tests and return results"""
        
    def generate_report(self) -> str:
        """Generate markdown report"""
```

### 1.2 Test Case Definition

Each test case includes:

```python
@dataclass
class BenchmarkCase:
    # Identity
    name: str                       # "Exact Reupload"
    scenario_type: str              # "exact" | "encoding" | "pitch" | etc.
    
    # Test inputs
    reference_url: str              # Known good version
    test_urls: List[str]            # 1-5 test URLs
    
    # Expected behavior
    expected_score: float           # 0-100 (average of test_urls)
    expected_verified: bool         # Should cross 80% threshold?
    score_tolerance: float          # ±5 points acceptable?
    
    # Algorithm-specific expectations
    chromaprint_expected: float
    spectral_expected: float
    mfcc_expected: float
    peaks_expected: float
    
    # Risk classification
    risk_level: str                 # "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    false_positive_risk: float      # 0-100% likelihood of false positive
    false_negative_risk: float      # 0-100% likelihood of false negative
    
    # Notes
    notes: str                      # Why this scenario matters
    impact: str                     # "Affects official search" etc.
```

### 1.3 Test Execution Flow

```
1. Setup Phase
   - Download reference audio (cache for reuse)
   - Download test audio URLs
   - Validate audio quality (check for errors)
   - Log start time

2. Compute Phase
   - Extract Chromaprint
   - Extract Spectral features
   - Extract MFCC coefficients
   - Extract Peaks constellation
   - Compute combined score

3. Compare Phase
   - For each algorithm: compare reference vs test
   - Record per-algorithm scores
   - Compute weighted combined score
   - Check against 80% threshold

4. Analyze Phase
   - Compare actual vs expected
   - Calculate error delta
   - Classify as PASS/FAIL/WARNING
   - Categorize as false positive/negative

5. Report Phase
   - Generate markdown report
   - Summarize by scenario type
   - Identify problem algorithms
   - Recommend threshold adjustments
```

### 1.4 Success Criteria

```python
# PASS: Within tolerance
actual >= (expected - tolerance) and actual <= (expected + tolerance)

# FAIL: Outside tolerance, but expected
(actual < expected - tolerance) and risk_level in ["LOW", "MEDIUM"]

# CRITICAL FAIL: Expected to work but doesn't
(actual < 80) and expected >= 80

# FALSE POSITIVE: Unexpectedly high score
(actual >= 80) and expected < 60 and risk_level == "HIGH"

# FALSE NEGATIVE: Unexpectedly low score
(actual < 80) and expected >= 80
```

---

## Part 2: Test Scenarios (16 Total)

### Scenario 1: EXACT REUPLOAD
**Type:** Baseline | **Risk:** LOW

**What it is:**
- Same video file uploaded twice to YouTube
- Or: Official channel + official repost

**Test Plan:**
```python
BenchmarkCase(
    name="Exact Reupload",
    scenario_type="exact",
    reference_url="https://www.youtube.com/watch?v=official_id_1",
    test_urls=[
        "https://www.youtube.com/watch?v=official_id_2",  # Same song, official post
    ],
    expected_score=97.0,
    score_tolerance=±3,
    chromaprint_expected=99,
    spectral_expected=98,
    mfcc_expected=98,
    peaks_expected=92,
    expected_verified=True,
    risk_level="LOW",
    false_positive_risk=0.1,  # 0.1% chance of false positive
    false_negative_risk=0.0,  # Should never fail
    notes="Baseline test - must work perfectly",
    impact="Critical for detection of duplicate uploads"
)
```

**Expected Behavior:**
- ✓ ALL algorithms should score 90%+
- ✓ Combined score: 97-98%
- ✓ VERDICT: VERIFIED

**Failure Mode:**
- If < 90%: Algorithm bug or configuration issue
- If < 80%: Severe problem (reject this build)

**Current Status:** ✓ LIKELY PASS

---

### Scenario 2: RE-ENCODED AUDIO (192 kbps)
**Type:** Encoding | **Risk:** LOW

**What it is:**
- Original audio 320 kbps MP3
- Re-encoded to 192 kbps MP3 (quality loss)

**Test Plan:**
```python
BenchmarkCase(
    name="Re-encoded (192 kbps)",
    scenario_type="encoding",
    reference_url="...",  # Original 320k
    test_urls=[
        "...",  # 192k version
    ],
    expected_score=93.0,
    score_tolerance=±4,
    chromaprint_expected=94,
    spectral_expected=92,
    mfcc_expected=93,
    peaks_expected=85,
    expected_verified=True,
    risk_level="LOW",
    false_positive_risk=0.5,
    false_negative_risk=1.0,
    notes="Common YouTube transcoding",
    impact="Most YouTube videos are not original quality"
)
```

**Expected Behavior:**
- ✓ Chromaprint: 92-96% (quality-invariant)
- ✓ Spectral: 90-94% (energy preserved)
- ✓ MFCC: 91-95% (timbre mostly preserved)
- ✓ Peaks: 80-90% (minor peak shift)
- ✓ Combined: 91-95%
- ✓ VERDICT: VERIFIED

**Failure Mode:**
- If < 85%: Spectral algorithm too sensitive to quality
- If < 75%: CRITICAL (most YouTube is this quality)

**Current Status:** ✓ LIKELY PASS

---

### Scenario 3: HEAVY COMPRESSION (64 kbps)
**Type:** Encoding | **Risk:** MEDIUM

**What it is:**
- Very low bitrate (voice quality)
- Typical for streaming apps, older phones

**Test Plan:**
```python
BenchmarkCase(
    name="Heavy Compression (64 kbps)",
    scenario_type="encoding",
    reference_url="...",  # Original 320k
    test_urls=[
        "...",  # 64k version
    ],
    expected_score=70.0,
    score_tolerance=±8,
    chromaprint_expected=72,
    spectral_expected=65,
    mfcc_expected=68,
    peaks_expected=55,
    expected_verified=False,  # Below 80% threshold
    risk_level="MEDIUM",
    false_positive_risk=2.0,  # Small risk of false positive
    false_negative_risk=15.0,  # 15% of 64k streams will be rejected
    notes="Problematic - affects low-bandwidth regions",
    impact="Can't verify legitimate matches from mobile apps"
)
```

**Expected Behavior:**
- ⚠️ Chromaprint: 70-75% (loses high-freq detail)
- ⚠️ Spectral: 60-70% (energy structure degraded)
- ⚠️ MFCC: 65-75% (timbre compressed)
- ⚠️ Peaks: 50-60% (many false peaks)
- ⚠️ Combined: 65-72% (BELOW threshold)
- ⚠️ VERDICT: UNCERTAIN (manual review recommended)

**Failure Mode:**
- If > 85%: False positive (shouldn't be this high)
- If < 50%: Algorithm too strict
- If > 80%: Problematic edge case

**Current Status:** ⚠️ UNCERTAIN

**Risk:** This is a **known limitation**. Recommendation: Provide "low-bitrate mode" option.

---

### Scenario 4: PITCH SHIFTED +1%
**Type:** Audio Processing | **Risk:** HIGH

**What it is:**
- Original song shifted up 1% (subtle)
- Affects key: C major → C#minor
- Common in streaming platforms (different mastering)

**Test Plan:**
```python
BenchmarkCase(
    name="Pitch Shift +1%",
    scenario_type="pitch",
    reference_url="...",
    test_urls=[
        "...",  # Pitched up 1%
    ],
    expected_score=72.0,
    score_tolerance=±10,
    chromaprint_expected=65,  # Chroma shifts
    spectral_expected=80,      # Energy preserved
    mfcc_expected=60,          # Timbre changes
    peaks_expected=55,
    expected_verified=False,
    risk_level="HIGH",
    false_positive_risk=3.0,
    false_negative_risk=25.0,  # 25% rejection rate expected
    notes="Common in music production",
    impact="Can't detect pitched versions of songs"
)
```

**Expected Behavior:**
- ✗ Chromaprint: 60-70% (very sensitive to key)
- ⚠️ Spectral: 75-85% (somewhat robust)
- ✗ MFCC: 50-65% (timbre changes with pitch)
- ✗ Peaks: 50-60% (peak frequencies shift)
- ✗ Combined: 65-72% (FAILS threshold)
- ✗ VERDICT: FALSE NEGATIVE (legitimate match rejected)

**Failure Mode:**
- This WILL FAIL at 1% pitch shift
- Risk: Legitimate audio matches rejected
- Requires: Pitch detection + compensation (not implemented)

**Current Status:** ✗ KNOWN LIMITATION

**Recommendation:** Use pitch detection library (librosa.piptrack) to normalize, then compare.

---

### Scenario 5: PITCH SHIFTED +3%
**Type:** Audio Processing | **Risk:** CRITICAL

**What it is:**
- Song shifted up 3% (more noticeable)
- Affects key significantly: C major → D minor
- Can occur in live versions, remasters

**Test Plan:**
```python
BenchmarkCase(
    name="Pitch Shift +3%",
    scenario_type="pitch",
    reference_url="...",
    test_urls=[
        "...",  # Pitched up 3%
    ],
    expected_score=55.0,
    score_tolerance=±8,
    chromaprint_expected=45,
    spectral_expected=70,
    mfcc_expected=40,
    peaks_expected=40,
    expected_verified=False,
    risk_level="CRITICAL",
    false_positive_risk=1.0,
    false_negative_risk=50.0,  # 50% rejection rate
    notes="Significant key change - very hard to detect",
    impact="Different tunings (e.g., A=440 vs A=432) won't match"
)
```

**Expected Behavior:**
- ✗ Chromaprint: 40-55% (key completely different)
- ⚠️ Spectral: 65-75% (some energy structure preserved)
- ✗ MFCC: 35-50% (timbre very different)
- ✗ Peaks: 35-50%
- ✗ Combined: 50-60% (FAR BELOW threshold)
- ✗ VERDICT: COMPLETE FALSE NEGATIVE

**Failure Mode:**
- This will DEFINITELY FAIL
- Scenario: Legitimate match at different tuning rejected

**Current Status:** ✗ KNOWN LIMITATION (NOT ADDRESSED)

**Recommendation:** Implement pitch detection before comparison, OR accept this as limitation.

---

### Scenario 6: TEMPO CHANGE 1.05x (5% faster)
**Type:** Audio Processing | **Risk:** HIGH

**What it is:**
- Song sped up 5% (tempo increased)
- Pitch preserved (time-stretching, not pitch shift)
- Common in fitness videos, DJmixes

**Test Plan:**
```python
BenchmarkCase(
    name="Tempo 1.05x (5% faster)",
    scenario_type="tempo",
    reference_url="...",
    test_urls=[
        "...",  # Sped up 5%, pitch preserved
    ],
    expected_score=65.0,
    score_tolerance=±8,
    chromaprint_expected=75,   # Chroma preserved (pitch same)
    spectral_expected=72,
    mfcc_expected=62,
    peaks_expected=45,
    expected_verified=False,
    risk_level="HIGH",
    false_positive_risk=2.0,
    false_negative_risk=30.0,
    notes="Time-stretching (pitch preserved)",
    impact="DJ mixes and workout versions won't match"
)
```

**Expected Behavior:**
- ⚠️ Chromaprint: 70-80% (pitch preserved, timing different)
- ⚠️ Spectral: 68-76% (time alignment issue)
- ✗ MFCC: 55-70% (frame timing shifts)
- ✗ Peaks: 40-55% (peak timing critical)
- ✗ Combined: 62-70% (BELOW threshold)
- ✗ VERDICT: FALSE NEGATIVE

**Failure Mode:**
- Will fail at 5% tempo change
- Scenario: DJ remix or workout version rejected

**Current Status:** ✗ KNOWN LIMITATION

**Recommendation:** Implement dynamic time warping (DTW) before comparison. High effort (8-10 hours).

---

### Scenario 7: TEMPO CHANGE 1.10x (10% faster)
**Type:** Audio Processing | **Risk:** CRITICAL

**What it is:**
- Song sped up 10% (significant)
- Common in fast-paced videos, chipmunk versions

**Test Plan:**
```python
BenchmarkCase(
    name="Tempo 1.10x (10% faster)",
    scenario_type="tempo",
    reference_url="...",
    test_urls=[
        "...",  # Sped up 10%, pitch preserved
    ],
    expected_score=50.0,
    score_tolerance=±8,
    chromaprint_expected=65,
    spectral_expected=60,
    mfcc_expected=45,
    peaks_expected=35,
    expected_verified=False,
    risk_level="CRITICAL",
    false_positive_risk=0.5,
    false_negative_risk=60.0,
    notes="Significant tempo change",
    impact="Speed-up/slow-down versions (common on social media)"
)
```

**Expected Behavior:**
- ✗ Chromaprint: 60-70% (significant timing mismatch)
- ✗ Spectral: 55-65%
- ✗ MFCC: 40-55%
- ✗ Peaks: 30-45%
- ✗ Combined: 48-55% (FAILS completely)
- ✗ VERDICT: COMPLETE FALSE NEGATIVE

**Failure Mode:**
- 100% rejection rate expected
- Scenario: TikTok speed-up version won't match original

**Current Status:** ✗ KNOWN LIMITATION

**Recommendation:** Accept as limitation OR implement DTW (significant effort).

---

### Scenario 8: INTRO ADDED
**Type:** Content Variation | **Risk:** LOW

**What it is:**
- Original song + intro (silence or music)
- Sample offset: first 10 seconds skipped automatically
- Most common YouTube transformation

**Test Plan:**
```python
BenchmarkCase(
    name="Intro Added",
    scenario_type="content",
    reference_url="...",
    test_urls=[
        "...",  # Song with 10s intro added
    ],
    expected_score=93.0,
    score_tolerance=±4,
    chromaprint_expected=94,
    spectral_expected=91,
    mfcc_expected=94,
    peaks_expected=85,
    expected_verified=True,
    risk_level="LOW",
    false_positive_risk=0.2,
    false_negative_risk=2.0,
    notes="Handled by sample offset (skip first 10s)",
    impact="Most official uploads have intros"
)
```

**Expected Behavior:**
- ✓ Chromaprint: 92-96% (main section analyzed)
- ✓ Spectral: 90-94%
- ✓ MFCC: 93-97%
- ✓ Peaks: 82-88%
- ✓ Combined: 91-95%
- ✓ VERDICT: VERIFIED

**Failure Mode:**
- If < 85%: Sample offset not working
- Should be VERY robust

**Current Status:** ✓ LIKELY PASS

---

### Scenario 9: OUTRO ADDED
**Type:** Content Variation | **Risk:** LOW

**What it is:**
- Original song + outro (silence or credits)
- Doesn't affect 30-second sample (taken from middle)
- Similar to intro

**Test Plan:**
```python
BenchmarkCase(
    name="Outro Added",
    scenario_type="content",
    reference_url="...",
    test_urls=[
        "...",  # Song with 10s outro added
    ],
    expected_score=93.0,
    score_tolerance=±4,
    chromaprint_expected=94,
    spectral_expected=91,
    mfcc_expected=94,
    peaks_expected=85,
    expected_verified=True,
    risk_level="LOW",
    false_positive_risk=0.2,
    false_negative_risk=2.0,
    notes="30s sample from middle avoids end",
    impact="Outro handling verified"
)
```

**Expected Behavior:**
- ✓ Chromaprint: 92-96%
- ✓ Spectral: 90-94%
- ✓ MFCC: 93-97%
- ✓ Peaks: 82-88%
- ✓ Combined: 91-95%
- ✓ VERDICT: VERIFIED

**Current Status:** ✓ LIKELY PASS

---

### Scenario 10: VOICE OVERLAY (DJ intro)
**Type:** Content Variation | **Risk:** HIGH

**What it is:**
- Original song + DJ talk overlay
- Common in radio edits, remixes
- Adds non-musical content on top

**Test Plan:**
```python
BenchmarkCase(
    name="Voice Overlay (DJ)",
    scenario_type="content",
    reference_url="...",
    test_urls=[
        "...",  # Song with DJ voice overlay
    ],
    expected_score=65.0,
    score_tolerance=±10,
    chromaprint_expected=70,
    spectral_expected=72,
    mfcc_expected=55,    # Voice masks timbre
    peaks_expected=50,
    expected_verified=False,
    risk_level="HIGH",
    false_positive_risk=2.0,
    false_negative_risk=35.0,
    notes="Vocal overlay changes timbral signature",
    impact="Radio versions with DJ talk won't match"
)
```

**Expected Behavior:**
- ⚠️ Chromaprint: 65-75% (musical content preserved)
- ⚠️ Spectral: 68-76% (energy modified by voice)
- ✗ MFCC: 50-65% (timbre VERY different with voice)
- ✗ Peaks: 45-60%
- ✗ Combined: 60-70% (BELOW threshold)
- ✗ VERDICT: FALSE NEGATIVE (likely)

**Failure Mode:**
- Probability of rejection: ~70%
- Scenario: Radio edit with DJ intro rejected

**Current Status:** ✗ KNOWN LIMITATION

**Recommendation:** Implement voice detection to strip before comparison, OR separate radio/DJ category.

---

### Scenario 11: LIVE PERFORMANCE
**Type:** Content Variation | **Risk:** HIGH

**What it is:**
- Live version of same song (different take)
- Instrumental variations, vocal ad-libs
- Common for concerts, live albums

**Test Plan:**
```python
BenchmarkCase(
    name="Live Performance",
    scenario_type="content",
    reference_url="...",  # Studio version
    test_urls=[
        "...",  # Live version from same artist
    ],
    expected_score=73.0,
    score_tolerance=±8,
    chromaprint_expected=80,     # Key/progression same
    spectral_expected=68,        # Energy different
    mfcc_expected=70,            # Timbre varies (live performance)
    peaks_expected=55,
    expected_verified=False,
    risk_level="HIGH",
    false_positive_risk=1.0,
    false_negative_risk=40.0,
    notes="Same song, different performance",
    impact="Live albums won't match studio versions"
)
```

**Expected Behavior:**
- ⚠️ Chromaprint: 75-85% (musical structure preserved)
- ⚠️ Spectral: 60-75% (live has more dynamics)
- ⚠️ MFCC: 65-80% (live instruments vs studio)
- ✗ Peaks: 50-65%
- ✗ Combined: 68-76% (NEAR threshold but often below)
- ⚠️ VERDICT: UNCERTAIN (50/50 chance of acceptance)

**Failure Mode:**
- Inconsistent results (sometimes passes, sometimes fails)
- Scenario: Live album version rejected
- Risk: Legitimate match missed

**Current Status:** ⚠️ UNCERTAIN

**Recommendation:** Accept as limitation for now. Could be improved with voice biometrics (future work).

---

### Scenario 12: REMIX (same tempo, different arrangement)
**Type:** Derivative Work | **Risk:** HIGH

**What it is:**
- Same song, different production
- Key and tempo preserved
- Arrangement, instrumentation changed
- Common in electronic music, dance mixes

**Test Plan:**
```python
BenchmarkCase(
    name="Remix (same tempo)",
    scenario_type="remix",
    reference_url="...",  # Original
    test_urls=[
        "...",  # Remix version (same key, tempo)
    ],
    expected_score=68.0,
    score_tolerance=±8,
    chromaprint_expected=75,     # Key preserved
    spectral_expected=62,        # Different instruments
    mfcc_expected=55,            # Timbre very different
    peaks_expected=48,
    expected_verified=False,
    risk_level="HIGH",
    false_positive_risk=1.0,
    false_negative_risk=50.0,
    notes="Same song, completely different production",
    impact="Remixes are common but will be rejected"
)
```

**Expected Behavior:**
- ⚠️ Chromaprint: 70-80% (musical progression same)
- ✗ Spectral: 55-70% (instrument EQ completely different)
- ✗ MFCC: 50-65% (different instruments = different timbre)
- ✗ Peaks: 45-55%
- ✗ Combined: 62-72% (BELOW threshold)
- ✗ VERDICT: FALSE NEGATIVE (remix rejected)

**Failure Mode:**
- Remix versions will be rejected
- Scenario: Dj remix versions not detected

**Current Status:** ✗ KNOWN LIMITATION

**Recommendation:** Remix detection (future feature). Chromaprint could be augmented with progression analysis.

---

### Scenario 13: COVER (different artist, same song)
**Type:** Derivative Work | **Risk:** CRITICAL

**What it is:**
- Same song, completely different performance
- Key could be different, tempo could vary
- Vocal timbre completely different

**Test Plan:**
```python
BenchmarkCase(
    name="Cover (acoustic)",
    scenario_type="cover",
    reference_url="...",  # Original (upbeat pop)
    test_urls=[
        "...",  # Acoustic cover (different artist)
    ],
    expected_score=45.0,
    score_tolerance=±10,
    chromaprint_expected=55,
    spectral_expected=50,
    mfcc_expected=35,            # VERY different vocals
    peaks_expected=30,
    expected_verified=False,
    risk_level="CRITICAL",
    false_positive_risk=0.5,
    false_negative_risk=90.0,    # 90% will be rejected
    notes="Different artist, same song - very different signatures",
    impact="Covers are NOT detected (by design)"
)
```

**Expected Behavior:**
- ✗ Chromaprint: 50-65% (chord progression might be same)
- ✗ Spectral: 45-60%
- ✗ MFCC: 30-45% (vocals very different)
- ✗ Peaks: 25-40%
- ✗ Combined: 40-52% (FAR BELOW threshold)
- ✗ VERDICT: FALSE NEGATIVE (cover rejected - as expected)

**Expected:** FAIL (by design - covers not detected)

**Current Status:** ✓ PASS (this is the expected behavior)

**Note:** Covers require different detection method (e.g., music information retrieval, chord analysis, vocal biometrics).

---

### Scenario 14: PARTIAL CLIP (30-second excerpt from middle)
**Type:** Audio Extraction | **Risk:** MEDIUM

**What it is:**
- 30-second clip from middle of song
- Typically chorus (most distinctive)
- Same as analysis window

**Test Plan:**
```python
BenchmarkCase(
    name="Partial Clip (30s chorus)",
    scenario_type="clip",
    reference_url="...",
    test_urls=[
        "...",  # Full song
    ],
    # Full song sample offset=10s → compares 10s-40s
    # Clip: 30s from chorus (0s-30s of clip)
    # Should align perfectly if both from chorus
    expected_score=88.0,
    score_tolerance=±5,
    chromaprint_expected=90,
    spectral_expected=87,
    mfcc_expected=89,
    peaks_expected=78,
    expected_verified=True,
    risk_level="MEDIUM",
    false_positive_risk=1.0,
    false_negative_risk=5.0,
    notes="30s clip from distinctive section",
    impact="Shazam-like matching requires clip support"
)
```

**Expected Behavior:**
- ✓ Chromaprint: 88-95%
- ✓ Spectral: 85-92%
- ✓ MFCC: 87-94%
- ⚠️ Peaks: 75-85% (fewer landmarks in 30s)
- ✓ Combined: 85-92%
- ✓ VERDICT: VERIFIED (if clip from chorus)

**Failure Mode:**
- If combined < 75%: Peak algorithm too weak on clips
- If combined < 80%: Rejected (false negative)

**Current Status:** ⚠️ UNCERTAIN

**Recommendation:** Test with chorus vs verse clips to understand variation.

---

### Scenario 15: PARTIAL CLIP (15-second excerpt from verse)
**Type:** Audio Extraction | **Risk:** HIGH

**What it is:**
- 15-second clip (half our analysis window)
- From verse (less distinctive than chorus)
- Harder to match

**Test Plan:**
```python
BenchmarkCase(
    name="Partial Clip (15s verse)",
    scenario_type="clip",
    reference_url="...",
    test_urls=[
        "...",  # Full song
    ],
    expected_score=70.0,
    score_tolerance=±8,
    chromaprint_expected=75,
    spectral_expected=68,
    mfcc_expected=72,
    peaks_expected=55,
    expected_verified=False,
    risk_level="HIGH",
    false_positive_risk=2.0,
    false_negative_risk=50.0,
    notes="Short clip from less distinctive section",
    impact="Short TikTok/social media clips won't match"
)
```

**Expected Behavior:**
- ⚠️ Chromaprint: 70-80% (verse has less harmonic uniqueness)
- ⚠️ Spectral: 65-75%
- ⚠️ MFCC: 68-78%
- ✗ Peaks: 50-65% (very few landmarks)
- ✗ Combined: 65-75% (BELOW threshold)
- ✗ VERDICT: FALSE NEGATIVE (15s verse clip rejected)

**Failure Mode:**
- Short clips from non-chorus sections will be rejected
- Scenario: TikTok clip won't identify source

**Current Status:** ✗ KNOWN LIMITATION

**Recommendation:** Implement multi-window analysis or sliding window matching (future work).

---

### Scenario 16: MULTIPLE TRANSFORMATIONS (pitch +1% + tempo 1.05x + 64kbps + intro)
**Type:** Combined | **Risk:** CRITICAL

**What it is:**
- Real-world scenario: accumulated transformations
- Song: pitched up 1%, sped up 5%, compressed 64kbps, intro added
- Common in social media versions (TikTok, Instagram)

**Test Plan:**
```python
BenchmarkCase(
    name="Multi-transform (realistic social media version)",
    scenario_type="combined",
    reference_url="...",  # Original 320kbps studio
    test_urls=[
        "...",  # Pitched +1%, tempo 1.05x, 64kbps, intro added
    ],
    expected_score=35.0,    # Very poor
    score_tolerance=±10,
    chromaprint_expected=45,
    spectral_expected=40,
    mfcc_expected=30,
    peaks_expected=20,
    expected_verified=False,
    risk_level="CRITICAL",
    false_positive_risk=0.1,
    false_negative_risk=98.0,   # 98% rejection rate
    notes="Worst-case real-world scenario",
    impact="Social media versions (TikTok, IG) won't be detected"
)
```

**Expected Behavior:**
- ✗ Chromaprint: 40-55% (pitch shift + tempo + compression)
- ✗ Spectral: 35-50%
- ✗ MFCC: 25-40%
- ✗ Peaks: 15-30%
- ✗ Combined: 30-45% (FAR BELOW threshold)
- ✗ VERDICT: COMPLETE FAILURE

**Expected:** FAIL (cumulative effect is severe)

**Current Status:** ✗ EXPECTED FAILURE

**Note:** This scenario illustrates the limitations of basic fingerprinting. Industry solutions (Shazam, ACRCloud) handle this by:
1. Pitch detection + normalization
2. Tempo detection + DTW alignment
3. Per-codec quality handling
4. Robust landmark matching

---

## Part 3: Benchmark Results Template

### 3.1 Results Summary Table

```markdown
| # | Scenario | Type | Expected | Actual | Status | Risk | Notes |
|----|----------|------|----------|--------|--------|------|-------|
| 1 | Exact Reupload | exact | 97 | TBD | TBD | LOW | Baseline |
| 2 | Re-encoded 192k | encoding | 93 | TBD | TBD | LOW | Common |
| 3 | Heavy Compression 64k | encoding | 70 | TBD | TBD | MED | Fails often |
| 4 | Pitch +1% | pitch | 72 | TBD | TBD | HIGH | Known fail |
| 5 | Pitch +3% | pitch | 55 | TBD | TBD | CRIT | Known fail |
| 6 | Tempo 1.05x | tempo | 65 | TBD | TBD | HIGH | Known fail |
| 7 | Tempo 1.10x | tempo | 50 | TBD | TBD | CRIT | Known fail |
| 8 | Intro Added | content | 93 | TBD | TBD | LOW | Handled |
| 9 | Outro Added | content | 93 | TBD | TBD | LOW | Handled |
| 10 | Voice Overlay | content | 65 | TBD | TBD | HIGH | Known fail |
| 11 | Live Perf | content | 73 | TBD | TBD | HIGH | Uncertain |
| 12 | Remix | derivative | 68 | TBD | TBD | HIGH | Known fail |
| 13 | Cover | derivative | 45 | TBD | TBD | CRIT | Expected |
| 14 | Clip 30s chorus | clip | 88 | TBD | TBD | MED | Uncertain |
| 15 | Clip 15s verse | clip | 70 | TBD | TBD | HIGH | Known fail |
| 16 | Multi-transform | combined | 35 | TBD | TBD | CRIT | Expected |
```

### 3.2 Algorithm Performance by Type

```
Scenario Type: EXACT
  Chromaprint: ✓ 99/100
  Spectral:    ✓ 98/100
  MFCC:        ✓ 98/100
  Peaks:       ✓ 92/100
  Average:     ✓ 97/100

Scenario Type: ENCODING
  Chromaprint: ✓ 83/100
  Spectral:    ✓ 79/100
  MFCC:        ✓ 81/100
  Peaks:       ✓ 70/100
  Average:     ✓ 78/100

Scenario Type: PITCH SHIFT
  Chromaprint: ✗ 56/100 (WEAK)
  Spectral:    ⚠️ 73/100
  MFCC:        ✗ 50/100 (WEAK)
  Peaks:       ✗ 47/100 (WEAK)
  Average:     ✗ 57/100 (FAILS)
  Recommendation: NOT SUITABLE for pitch-shifted audio

Scenario Type: TEMPO CHANGE
  Chromaprint: ✓ 70/100
  Spectral:    ✓ 66/100
  MFCC:        ✗ 53/100 (WEAK)
  Peaks:       ✗ 40/100 (WEAK)
  Average:     ✗ 58/100 (FAILS)
  Recommendation: DTW alignment required

Scenario Type: CONTENT VARIATION
  Chromaprint: ✓ 81/100
  Spectral:    ✓ 77/100
  MFCC:        ✓ 73/100
  Peaks:       ⚠️ 68/100
  Average:     ✓ 75/100
  Recommendation: Good for intros/outros, poor for overlays

Scenario Type: DERIVATIVE WORKS
  Chromaprint: ⚠️ 65/100
  Spectral:    ✗ 56/100
  MFCC:        ✗ 50/100
  Peaks:       ✗ 39/100
  Average:     ✗ 52/100 (FAILS)
  Recommendation: NOT SUITABLE for remixes/covers

Scenario Type: CLIPS
  Chromaprint: ✓ 79/100 (chorus) | ⚠️ 75/100 (verse)
  Spectral:    ✓ 78/100 (chorus) | ⚠️ 68/100 (verse)
  MFCC:        ✓ 80/100 (chorus) | ⚠️ 72/100 (verse)
  Peaks:       ⚠️ 67/100 (chorus) | ✗ 55/100 (verse)
  Average:     ✓ 75/100 (chorus only)
  Recommendation: Works for chorus clips, not for short verse excerpts
```

---

## Part 4: Interpretation Guide

### 4.1 Threshold Recommendations

```python
# Current threshold: 80%

# RECOMMENDED ADJUSTMENTS by scenario:

# For exact/encoded content:
threshold_exact = 85          # Higher - should be very confident

# For content with variations (intro, outro):
threshold_content = 82        # Slightly lower - expected

# For uncertain content (live, clips):
threshold_uncertain = 75      # Lower - manual review recommended

# For known-fails (pitch, tempo, remixes):
threshold_not_supported = None  # Don't attempt, flag as unsupported
```

### 4.2 Per-Algorithm Reliability

```
CHROMAPRINT (35% weight)
  ✓ Excellent for: Exact, encoded, content variations
  ✗ Poor for: Pitch shifts, tempo changes
  ⚠️ Use when: Musical key is preserved

SPECTRAL (25-30% weight)
  ✓ Excellent for: Quality invariance
  ✓ Good for: Energy-based detection
  ✗ Poor for: Heavy compression
  ⚠️ Use when: Instrumentation is similar

MFCC (25% weight)
  ✓ Excellent for: Exact matches, vocal detection
  ✓ Good for: Timbre-based matching
  ✗ Poor for: Vocal changes, covers, remixes
  ⚠️ Use when: Timbre should be preserved

PEAKS (10-15% weight)
  ✓ Good for: Temporal landmarks
  ✗ Poor for: Compressed audio, short clips
  ⚠️ Use when: Time alignment is critical
  ✗ NOTE: Current implementation is simplified (not Shazam-style)
```

### 4.3 False Positive/Negative Strategy

```
Risk Tolerance: Per-scenario

HIGH FALSE POSITIVE risk:
  - Scenario 3 (64kbps): Score ambiguous, use stricter threshold (80+)
  - Scenario 13 (covers): Unlikely but possible, review high scores

HIGH FALSE NEGATIVE risk:
  - Scenario 4-5 (pitch): Accept false negatives (known limitation)
  - Scenario 6-7 (tempo): Accept false negatives (known limitation)
  - Scenario 15 (15s clip): Use lower threshold (70+) OR manual review
  - Scenario 16 (multi-transform): Accept failure (known limitation)

STRATEGY:
1. Exact matches (1-2): Use strict threshold (85+)
2. Encoded/content (2-10): Use normal threshold (80-82)
3. Clips/uncertain (14-15): Use lenient threshold (70+) + manual review
4. Known fails (4-7, 12-13, 16): Flag as unsupported, don't compare
```

---

## Part 5: Test Execution Checklist

### 5.1 Pre-Test Setup

- [ ] Download reference audio files (or YouTube URLs)
- [ ] Create test audio variants (pitch shift, tempo change, compress, etc.)
- [ ] Verify test setup (fpcalc, ffmpeg, librosa all installed)
- [ ] Create results database/spreadsheet
- [ ] Document test environment (OS, Python version, library versions)
- [ ] Set logging to DEBUG level

### 5.2 Execution

- [ ] Run Scenario 1 (baseline - should pass)
- [ ] Run Scenarios 2-3 (encoding - should mostly pass)
- [ ] Run Scenarios 4-7 (pitch/tempo - will fail, document)
- [ ] Run Scenarios 8-11 (content variation - will vary)
- [ ] Run Scenarios 12-13 (derivatives - will fail as expected)
- [ ] Run Scenarios 14-15 (clips - mixed results)
- [ ] Run Scenario 16 (multi-transform - will fail)

### 5.3 Post-Test Analysis

- [ ] Compare actual vs expected for each scenario
- [ ] Identify false positives/negatives
- [ ] Calculate per-algorithm success rates
- [ ] Identify systematic failures (e.g., "all pitch shifts fail")
- [ ] Generate recommendations for algorithm improvements
- [ ] Document limitations for documentation

---

## Conclusion

This benchmark framework provides a **systematic way to evaluate fingerprint accuracy** and identify where algorithms succeed or fail.

### Expected Results Summary

```
✓ PASS (95-100%):      Scenarios 1-2, 8-9
⚠️ PARTIAL (75-85%):   Scenarios 3, 11, 14
✗ FAIL (< 75%):        Scenarios 4-7, 10, 12-13, 15-16
```

### Key Insights

1. **Exact matches work reliably** (98%+ confidence)
2. **Encoding doesn't hurt much** (90%+ for reasonable quality)
3. **Pitch/tempo changes are unsupported** (must be added)
4. **Content variations are mostly handled** (except voice overlay)
5. **Short clips/verses are problematic** (need better algorithms)
6. **Derived works (covers, remixes) won't match** (by design)

### Next Steps

1. Execute benchmark with actual FOPS system
2. Document actual scores for each scenario
3. Identify algorithm-specific weaknesses
4. Prioritize improvements based on real-world impact
5. Implement fixes (DTW, pitch detection, etc.)

---

**Status:** BENCHMARK PLAN COMPLETE  
**Ready to Execute:** Yes  
**Estimated Runtime:** 2-3 hours (all 16 scenarios)  
**Next Document:** FOPS_FINGERPRINT_LIBRARY_V1_SPEC.md (database design)

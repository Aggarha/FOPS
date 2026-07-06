"""
FOPS Credits Formatter Service
Handles intelligent parsing, role normalization, and formatting of music credits
with support for Arabic text, multi-line detection, and deduplication.
"""

import re
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, field
from enum import Enum
import json


# ===== ROLE NORMALIZATION MAPPINGS =====
ROLE_MAPPINGS = {
    # Arabic roles → English roles
    "كلمات": "Lyrics",
    "الحان": "Composition",
    "توزيع": "Arrangement",
    "تنفيذ": "Arrangement",
    "تنفيذ وتوزيع موسيقي": "Arrangement",
    "هندسة صوت": "Sound Engineering",
    "تسجيل صوت": "Sound Engineering",
    "استديو": "Sound Engineering",
    "هندسة صوت/تسجيل صوت/استديو": "Sound Engineering",
    "إنتاج موسيقي": "Music Production",
    "إنتاج": "Music Production",
    "غناء": "Vocals",
    "صوت": "Vocals",
    "موسيقى": "Music",
    "عود": "Oud",
    "بيانو": "Piano",
    "جيتار": "Guitar",
    "كمان": "Violin",
    "طبل": "Drums",
    "بيس": "Bass",
    "كيبورد": "Keyboard",
    "إيقاع": "Rhythm",
    "موسيقار": "Composer",
    "ملحن": "Composer",
    "ملحنة": "Composer",
    "كاتب": "Lyricist",
    "كاتبة": "Lyricist",
    # English variations
    "composer": "Composition",
    "composition": "Composition",
    "lyrics": "Lyrics",
    "lyricist": "Lyrics",
    "arrangement": "Arrangement",
    "arranger": "Arrangement",
    "sound engineering": "Sound Engineering",
    "sound engineer": "Sound Engineering",
    "engineer": "Sound Engineering",
    "audio": "Sound Engineering",
    "production": "Music Production",
    "producer": "Music Production",
    "music production": "Music Production",
    "vocals": "Vocals",
    "vocalist": "Vocals",
    "singing": "Vocals",
    "oud": "Oud",
    "piano": "Piano",
    "guitar": "Guitar",
    "violin": "Violin",
    "drums": "Drums",
    "bass": "Bass",
    "keyboard": "Keyboard",
}

# Arabic → English transliteration map (enhanced)
TRANSLITERATION_MAP = {
    # Alef variations
    "ا": "A", "أ": "A", "آ": "AA", "إ": "I",
    # Consonants
    "ب": "B", "ت": "T", "ث": "TH", "ج": "J",
    "ح": "H", "خ": "KH", "د": "D", "ذ": "DH",
    "ر": "R", "ز": "Z", "س": "S", "ش": "SH",
    "ص": "S", "ض": "D", "ط": "T", "ظ": "Z",
    "ع": "A", "غ": "GH", "ف": "F", "ق": "Q",
    "ك": "K", "ل": "L", "م": "M", "ن": "N",
    "ه": "H", "و": "W", "ي": "Y",
    # Diacritics (fatha, damma, kasra, shadda, sukun, tanwin)
    "َ": "", "ُ": "", "ِ": "", "ّ": "", "ْ": "",
    "ً": "", "ٌ": "", "ٍ": "", "ـ": "",
}

# Enhanced known names dictionary with common Arabic name patterns
KNOWN_NAMES = {
    # Common first names (male)
    "محمد": "Mohamed", "أحمد": "Ahmed", "علي": "Ali", "سعيد": "Saeed",
    "سالم": "Salem", "حسن": "Hassan", "حسين": "Hussain", "إبراهيم": "Ibrahim",
    "إسماعيل": "Ismail", "يوسف": "Youssef", "عمر": "Omar", "عثمان": "Othman",
    "ياسين": "Yaseen", "طارق": "Tariq", "خالد": "Khaled", "ماهر": "Maher",
    "ناصر": "Nasser", "عاطف": "Atef", "رمزي": "Ramzi", "شريف": "Sherif",
    "جمال": "Jamal", "كمال": "Kamal", "مجدي": "Magdy", "منتظر": "Montazer",
    "فتحي": "Fathy", "فتشي": "Fathy", "أسامة": "Osama", "محمود": "Mahmoud",
    "منصور": "Mansour", "جلال": "Jalal", "محروس": "Mahrous", "حمادة": "Hamada",
    # Common first names (female)
    "فاطمة": "Fatma", "عائشة": "Aisha", "خديجة": "Khadija", "مريم": "Maryam",
    "نور": "Noor", "ليل": "Leil", "سارة": "Sarah", "أمل": "Amal",
    "هناء": "Hana", "ليا": "Lia", "دعاء": "Doaa",
    # Common last names and family names
    "الزايد": "Al Zayed", "السيد": "El Sayed", "الحسيني": "El Husseini",
    "عبد الرحمن": "Abdul Rahman", "عبدالرحمن": "Abdul Rahman",
    "عبد العزيز": "Abdul Aziz", "عبدالعزيز": "Abdul Aziz",
    "عبد الله": "Abdullah", "عبدالله": "Abdullah",
    "عبد الحميد": "Abdul Hamid", "عبدالحميد": "Abdul Hamid",
    "عبد الكريم": "Abdul Karim", "عبدالكريم": "Abdul Karim",
    "عبد الحق": "Abdul Haq", "عبدالحق": "Abdul Haq",
    "عبد الواحد": "Abdul Wahid", "عبدالواحد": "Abdul Wahid",
    "الدين": "El Din", "الخير": "El Khair", "الندى": "El Nada",
}


# ===== DATA CLASSES =====
@dataclass
class Credit:
    """Represents a single credit entry"""
    name: str  # English name
    name_arabic: Optional[str] = None  # Arabic name if available
    role: str = "Unknown"  # Normalized English role
    role_arabic: Optional[str] = None  # Original Arabic role if applicable
    
    def to_dict(self) -> Dict:
        """Convert to dictionary representation"""
        return {
            "name": self.name,
            "name_arabic": self.name_arabic,
            "role": self.role,
            "role_arabic": self.role_arabic,
        }


@dataclass
class CreditBlock:
    """Represents a grouped set of credits (role → list of names)"""
    role: str  # Normalized role
    role_arabic: Optional[str] = None
    names: List[Credit] = field(default_factory=list)
    
    def add_credit(self, credit: Credit):
        """Add a credit to this block"""
        self.names.append(credit)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary representation"""
        return {
            "role": self.role,
            "role_arabic": self.role_arabic,
            "names": [c.to_dict() for c in self.names],
            "count": len(self.names),
        }


@dataclass
class FormattedCredits:
    """Complete formatted credits structure"""
    blocks: List[CreditBlock] = field(default_factory=list)
    raw_text: Optional[str] = None
    
    def to_dict(self) -> Dict:
        """Convert to dictionary representation"""
        return {
            "blocks": [b.to_dict() for b in self.blocks],
            "raw_text": self.raw_text,
            "total_credits": sum(len(b.names) for b in self.blocks),
        }
    
    def to_formatted_string(self) -> str:
        """Convert to readable formatted string"""
        lines = []
        for block in self.blocks:
            lines.append(f"✶ {block.role}")
            for credit in block.names:
                if credit.name_arabic:
                    lines.append(f"  • {credit.name} | {credit.name_arabic}")
                else:
                    lines.append(f"  • {credit.name}")
        return "\n".join(lines)


# ===== TRANSLITERATION SERVICE =====
class ArabicTransliterator:
    """Handles Arabic → English transliteration"""
    
    @staticmethod
    def transliterate(arabic_text: str) -> str:
        """
        Convert Arabic text to English transliteration
        Uses known names first, then falls back to character-by-character mapping
        """
        if not arabic_text:
            return ""
        
        text_clean = arabic_text.strip()
        
        # Check if it's an exact known name
        if text_clean in KNOWN_NAMES:
            return KNOWN_NAMES[text_clean]
        
        # Try to replace known name patterns (handles compound names)
        # Process longer names first to avoid partial replacements
        sorted_names = sorted(KNOWN_NAMES.items(), key=lambda x: len(x[0]), reverse=True)
        for known_ar, known_en in sorted_names:
            if known_ar in text_clean:
                text_clean = text_clean.replace(known_ar, known_en)
        
        # Character-by-character transliteration for remaining Arabic
        result = []
        i = 0
        while i < len(text_clean):
            char = text_clean[i]
            
            # Handle special patterns
            # Abdul/Abd patterns (عبد + genitive marker)
            if i < len(text_clean) - 1:
                two_char = char + text_clean[i + 1]
                if two_char in KNOWN_NAMES:
                    result.append(KNOWN_NAMES[two_char])
                    i += 2
                    continue
            
            if char in TRANSLITERATION_MAP:
                transliterated = TRANSLITERATION_MAP[char]
                if transliterated:  # Skip empty strings (diacritics)
                    result.append(transliterated)
            elif char.isascii():
                result.append(char)
            
            i += 1
        
        # Clean up: remove extra spaces, fix common issues
        transliterated = "".join(result).strip()
        transliterated = re.sub(r'\s+', ' ', transliterated)
        
        # Fix common transliteration issues
        transliterated = transliterated.replace("AA", "A").replace("II", "I")
        # Keep common English transliteration patterns
        transliterated = re.sub(r'([A-Z])\1{2,}', r'\1', transliterated)  # Remove triple+ letters
        
        return transliterated
    
    @staticmethod
    def is_arabic(text: str) -> bool:
        """Check if text contains Arabic characters"""
        return bool(re.search(r'[\u0600-\u06FF]', text))


# ===== ROLE NORMALIZATION SERVICE =====
class RoleNormalizer:
    """Normalizes and standardizes role names"""
    
    @staticmethod
    def normalize(role_text: str) -> Tuple[str, Optional[str]]:
        """
        Normalize a role name
        Returns: (normalized_role, original_arabic_role_if_applicable)
        """
        if not role_text:
            return "Unknown", None
        
        role_text = role_text.strip()
        is_arabic = ArabicTransliterator.is_arabic(role_text)
        original_arabic = role_text if is_arabic else None
        
        # Convert to lowercase for matching
        role_lower = role_text.lower()
        
        # Check direct mappings
        if role_text in ROLE_MAPPINGS:
            return ROLE_MAPPINGS[role_text], original_arabic
        
        if role_lower in ROLE_MAPPINGS:
            return ROLE_MAPPINGS[role_lower], original_arabic
        
        # Check if contains mapped role
        for mapped_role, normalized in ROLE_MAPPINGS.items():
            if mapped_role.lower() in role_lower:
                return normalized, original_arabic
        
        # If Arabic, transliterate and try again
        if is_arabic:
            transliterated = ArabicTransliterator.transliterate(role_text)
            if transliterated.lower() in ROLE_MAPPINGS:
                return ROLE_MAPPINGS[transliterated.lower()], original_arabic
        
        # Default: return original (cleaned)
        return role_text.replace("  ", " ").title(), original_arabic


# ===== CREDITS PARSER =====
class CreditsParser:
    """Parses credit text and extracts structured information"""
    
    def __init__(self):
        self.transliterator = ArabicTransliterator()
        self.normalizer = RoleNormalizer()
    
    def parse(self, credits_text: str) -> FormattedCredits:
        """
        Parse raw credits text and return structured FormattedCredits
        
        Handles:
        - Role headers followed by names (ROLE: name1 name2)
        - Name - Role pattern (name1 - role)
        - Name (Role) pattern (name1 (role))
        - Multi-line role hierarchy with indentation
        - Arabic and English text
        - Deduplication of roles
        """
        formatted = FormattedCredits(raw_text=credits_text)
        
        if not credits_text or not credits_text.strip():
            return formatted
        
        lines = credits_text.split('\n')
        
        # Parse with patterns AND role blocks simultaneously
        # Collect results from both methods
        credits_by_role = {}
        
        # First pass: try pattern-based parsing
        pattern_credits = self._parse_with_patterns(lines)
        credits_by_role.update(pattern_credits)
        
        # Second pass: extract role blocks and process remaining credits
        role_blocks = self._extract_role_blocks(lines)
        
        for role_text, names_text in role_blocks:
            normalized_role, arabic_role = self.normalizer.normalize(role_text)
            
            # Skip if this role was already covered by pattern parsing
            if any(self.normalizer.normalize(r)[0] == normalized_role for r in credits_by_role.keys()):
                continue
            
            names = self._extract_names(names_text)
            if names:
                if role_text not in credits_by_role:
                    credits_by_role[role_text] = []
                credits_by_role[role_text].extend(names)
        
        # Convert collected credits to formatted blocks
        for role_text, names_list in credits_by_role.items():
            normalized_role, arabic_role = self.normalizer.normalize(role_text)
            block = CreditBlock(role=normalized_role, role_arabic=arabic_role)
            
            for name_en, name_ar in names_list:
                credit = Credit(name=name_en, name_arabic=name_ar, role=normalized_role)
                # Avoid duplicates
                if not any(c.name == name_en for c in block.names):
                    block.add_credit(credit)
            
            if block.names:
                formatted.blocks.append(block)
        
        return formatted
    
    def _parse_with_patterns(self, lines: list) -> dict:
        """
        Parse credits using name-role patterns:
        - "Name - Role"
        - "Name (Role)" or "Role (Name)" - auto-detects which is which
        - "Role: Name"
        
        Returns dict of {role: [(name_en, name_ar), ...]}
        """
        credits_by_role = {}
        
        # Build list of known role keywords for detection
        role_keywords = set()
        for role in ROLE_MAPPINGS.values():
            role_keywords.add(role.lower())
        
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            
            # Pattern 1: "Name - Role" or "Name – Role"
            if re.search(r'\s[-–—]\s', stripped):
                parts = re.split(r'\s[-–—]\s', stripped, 1)
                if len(parts) == 2:
                    name_text = parts[0].strip()
                    role_text = parts[1].strip()
                    
                    # Extract names from name_text
                    names = self._extract_names_from_line(name_text)
                    for name_en, name_ar in names:
                        if role_text not in credits_by_role:
                            credits_by_role[role_text] = []
                        credits_by_role[role_text].append((name_en, name_ar))
                    continue
            
            # Pattern 2: "Name (Role)" or "Role (Name)" or with brackets [...]
            match = re.match(r'^(.+?)\s*[\(\[](.+?)[\)\]]$', stripped)
            if match:
                part1 = match.group(1).strip()
                part2 = match.group(2).strip()
                
                # Determine which is the role and which is the name
                part1_is_role = part1.lower() in role_keywords or self._looks_like_role(part1)
                part2_is_role = part2.lower() in role_keywords or self._looks_like_role(part2)
                
                # Prefer to treat the content in parentheses as the role
                # unless it clearly looks like a name
                if part2_is_role or (not self.transliterator.is_arabic(part2) and not part1_is_role):
                    # part2 is the role, part1 is the name
                    role_text = part2
                    names = self._extract_names_from_line(part1)
                elif part1_is_role:
                    # part1 is the role, part2 is the name
                    role_text = part1
                    names = self._extract_names_from_line(part2)
                else:
                    # Default: treat last part (in parentheses) as role
                    role_text = part2
                    names = self._extract_names_from_line(part1)
                
                for name_en, name_ar in names:
                    if role_text not in credits_by_role:
                        credits_by_role[role_text] = []
                    credits_by_role[role_text].append((name_en, name_ar))
                continue
        
        return credits_by_role if credits_by_role else {}
    
    def _looks_like_role(self, text: str) -> bool:
        """Check if text looks like a role"""
        lower_text = text.lower()
        role_keywords = [
            "composition", "arrangement", "lyrics", "vocals", "voice",
            "production", "producer", "sound engineering", "engineer",
            "director", "videography", "graphics", "design",
            "music", "vocalist", "composer", "arranger",
            "band", "ensemble", "orchestra", "instruments",
            "piano", "guitar", "drums", "bass", "violin", "oud"
        ]
        return any(kw in lower_text for kw in role_keywords)
    
    def _extract_names_from_line(self, line: str) -> list:
        """
        Extract names from a single line
        Handles comma-separated names
        """
        names = []
        
        # Split by comma if present
        if ',' in line:
            name_parts = [p.strip() for p in line.split(',')]
        else:
            name_parts = [line.strip()]
        
        for name_text in name_parts:
            if not name_text:
                continue
            
            # Remove common prefixes/bullets
            name_text = re.sub(r'^[\•\-\*\+]\s*', '', name_text).strip()
            
            if self.transliterator.is_arabic(name_text):
                # Arabic name - transliterate
                name_en = self.transliterator.transliterate(name_text)
                names.append((name_en, name_text))
            else:
                # English name
                names.append((name_text, None))
        
        return names
    
    def _extract_role_blocks(self, lines: list) -> list:
        """
        Extract role headers and their associated names
        Returns list of (role, names_text) tuples
        
        Handles multi-line indentation for role hierarchy
        """
        blocks = []
        current_role = None
        current_names = []
        base_indentation = None
        
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            
            indentation = len(line) - len(line.lstrip())
            
            # Check if this is a role header
            if self._is_role_header(stripped):
                # Save previous block
                if current_role and current_names:
                    blocks.append((current_role, '\n'.join(current_names)))
                
                current_role = self._extract_role_from_header(stripped)
                current_names = []
                base_indentation = indentation
            elif current_role:
                # This is a name/credit under current role
                # Check for multi-line hierarchy (indentation > base)
                if base_indentation is not None and indentation > base_indentation:
                    # Nested credit line - preserve it
                    current_names.append(stripped)
                else:
                    current_names.append(stripped)
        
        # Don't forget last block
        if current_role and current_names:
            blocks.append((current_role, '\n'.join(current_names)))
        
        return blocks
    
    def _is_role_header(self, line: str) -> bool:
        """Detect if a line is a role header"""
        # Check for colon (most reliable indicator)
        if ":" in line:
            # But skip URLs or timestamps
            if not re.match(r'^https?:|^\d+:', line):
                return True
        
        # Check for all-caps short phrase (likely a role header)
        words = line.split()
        if 1 <= len(words) <= 3 and line.isupper() and len(line) > 1:
            return True
        
        # Check for known role keywords
        lower_line = line.lower()
        role_keywords = [
            "role", "roles", "artist", "artists", "producer", "producers",
            "composer", "composers", "vocals", "voice", "instruments",
            "arrangement", "arrangements", "sound", "engineering", "lyrics",
            "lyricist", "arrangement", "director", "production", "band"
        ]
        if any(kw in lower_line for kw in role_keywords):
            return True
        
        return False
    
    def _extract_role_from_header(self, line: str) -> str:
        """Extract role name from header line"""
        if ":" in line:
            parts = line.split(":", 1)
            return parts[0].strip()
        return line.strip()
    
    def _extract_names(self, names_text: str) -> list:
        """
        Extract individual names from names section
        Returns list of (english_name, arabic_name) tuples
        Handles comma-separated names, bullet points, and mixed scripts
        """
        names = []
        
        for line in names_text.split('\n'):
            line = line.strip()
            if not line:
                continue
            
            # Remove common prefixes
            line = re.sub(r'^[\•\-\*\+]\s*', '', line)
            
            # Handle comma-separated names on same line
            if ',' in line and not self.transliterator.is_arabic(line):
                # Split by comma only if not Arabic (commas used differently in Arabic)
                name_parts = [p.strip() for p in line.split(',')]
            else:
                name_parts = [line]
            
            for name_part in name_parts:
                if not name_part:
                    continue
                
                # Check for English | Arabic pattern
                if "|" in name_part:
                    parts = name_part.split("|", 1)
                    name_en = parts[0].strip()
                    name_ar = parts[1].strip()
                    names.append((name_en, name_ar))
                elif self.transliterator.is_arabic(name_part):
                    # Pure Arabic name
                    name_en = self.transliterator.transliterate(name_part)
                    names.append((name_en, name_part))
                else:
                    # English name
                    names.append((name_part, None))
        
        return names


# ===== FORMATTING FUNCTIONS =====
def format_credits(credits_text: str) -> Dict:
    """
    Main function to parse and format credits
    
    Args:
        credits_text: Raw credits text (can be Arabic or English or mixed)
    
    Returns:
        Dictionary with formatted credits and metadata
    """
    parser = CreditsParser()
    formatted = parser.parse(credits_text)
    
    return {
        "status": "success",
        "data": formatted.to_dict(),
        "formatted_text": formatted.to_formatted_string(),
    }


def normalize_role(role_text: str) -> Dict:
    """
    Normalize a single role
    
    Args:
        role_text: Role name (Arabic or English)
    
    Returns:
        Dictionary with normalized role and metadata
    """
    normalizer = RoleNormalizer()
    normalized, arabic_original = normalizer.normalize(role_text)
    
    return {
        "input": role_text,
        "normalized": normalized,
        "arabic_original": arabic_original,
        "is_arabic_input": ArabicTransliterator.is_arabic(role_text),
    }


def transliterate_arabic(arabic_text: str) -> Dict:
    """
    Transliterate Arabic text to English
    
    Args:
        arabic_text: Arabic text
    
    Returns:
        Dictionary with transliteration and metadata
    """
    transliterator = ArabicTransliterator()
    transliterated = transliterator.transliterate(arabic_text)
    
    return {
        "input": arabic_text,
        "output": transliterated,
        "is_arabic": transliterator.is_arabic(arabic_text),
    }

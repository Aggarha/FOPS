'use client';

import { useState, useMemo } from 'react';
import { Copy, Download, Trash2, ChevronDown } from 'lucide-react';

interface Credit {
  role: string;
  nameEnglish: string;
  nameArabic: string;
  roleArabic: string;
}

interface GroupedCredits {
  role: string;
  people: Credit[];
}

// Canonical role mappings - all variations map to canonical English roles
const ROLE_MAP: Record<string, string> = {
  // Lyrics
  'كلمات': 'Lyrics',
  'كاتب الكلمات': 'Lyrics',
  'الكلمات': 'Lyrics',

  // Composition
  'الحان': 'Composition',
  'ألحان': 'Composition',
  'الحاني': 'Composition',
  'الحن': 'Composition',
  'تلحين': 'Composition',
  'ملحن': 'Composition',
  'composé': 'Composition',
  'composition': 'Composition',

  // Arrangement & Production
  'توزيع': 'Arrangement',
  'توزيع موسيقي': 'Arrangement',
  'تنفيذ وتوزيع موسيقي': 'Arrangement',
  'تنفيذ': 'Arrangement',
  'مُنتِج': 'Production',
  'إنتاج': 'Production',
  'producer': 'Production',

  // Mix & Mastering
  'مكس': 'Mix & Mastering',
  'مكس وماستر': 'Mix & Mastering',
  'ميكس': 'Mix & Mastering',
  'ميكس وماستر': 'Mix & Mastering',
  'ماستر': 'Mix & Mastering',
  'mastering': 'Mix & Mastering',
  'mixing': 'Mix & Mastering',
  'mix': 'Mix & Mastering',

  // Sound Engineering
  'هندسة صوت': 'Sound Engineering',
  'تسجيل صوت': 'Sound Engineering',
  'استديو': 'Sound Engineering',
  'إستديو': 'Sound Engineering',
  'engineer': 'Sound Engineering',
  'engineering': 'Sound Engineering',
  'recording': 'Sound Engineering',
  'sound engineer': 'Sound Engineering',

  // Supervision
  'إشراف': 'Supervision',
  'إشراف عام': 'Supervision',
  'الإشراف': 'Supervision',
  'مُشرِف': 'Supervision',
  'supervision': 'Supervision',

  // Instruments
  'جيتار': 'Guitar',
  'جيتارات': 'Guitar',
  'guitar': 'Guitar',
  'عود': 'Oud',
  'oud': 'Oud',
  'قانون': 'Qanun',
  'qanun': 'Qanun',
  'ناي': 'Nay',
  'nay': 'Nay',
  'كمنجات': 'Strings',
  'كمان': 'Violin',
  'تشيللو': 'Cello',
  'bass': 'Bass',
  'باص': 'Bass',
  'بيس': 'Bass',
  'كيبورد': 'Keyboard',
  'بيانو': 'Piano',
  'piano': 'Piano',
  'organ': 'Organ',
  'synthesizer': 'Synthesizer',

  // Percussion
  'ايقاعات': 'Percussion',
  'إيقاعات': 'Percussion',
  'drums': 'Percussion',
  'طبلة': 'Drums',
  'percussion': 'Percussion',

  // Vocal
  'كورال': 'Vocals',
  'جوقة': 'Vocals',
  'صوت': 'Vocals',
  'vocals': 'Vocals',
  'chorus': 'Chorus',
  'choir': 'Vocals',

  // Other
  'شكر خاص': 'Special Thanks',
  'شكر': 'Special Thanks',
  'special thanks': 'Special Thanks',
  'thanks': 'Special Thanks',
};

// Arabic to English transliteration map
const ARABIC_TO_ENGLISH_MAP: Record<string, string> = {
  'ا': 'a',
  'ب': 'b',
  'ت': 't',
  'ث': 'th',
  'ج': 'j',
  'ح': 'h',
  'خ': 'kh',
  'د': 'd',
  'ذ': 'dh',
  'ر': 'r',
  'ز': 'z',
  'س': 's',
  'ش': 'sh',
  'ص': 's',
  'ض': 'd',
  'ط': 't',
  'ظ': 'z',
  'ع': 'a',
  'غ': 'gh',
  'ف': 'f',
  'ق': 'q',
  'ك': 'k',
  'ل': 'l',
  'م': 'm',
  'ن': 'n',
  'ه': 'h',
  'و': 'w',
  'ي': 'y',
  'ة': 'a',
  'ى': 'a',
};

// Common Arabic name to English transliteration overrides
const NAME_TRANSLITERATION_OVERRIDES: Record<string, string> = {
  // Female Names
  'سلمى': 'Salma',
  'سهام': 'Seham',
  'سهى': 'Soha',
  'ليلى': 'Layla',
  'نور': 'Noor',
  'نجوى': 'Nagwa',
  'مريم': 'Maryam',
  'زينب': 'Zeina',
  'هناء': 'Hana',
  'فاطمة': 'Fatma',
  'فرح': 'Farah',
  'لينا': 'Lina',
  'لميا': 'Lamia',
  'رانيا': 'Rania',
  'هالة': 'Hala',
  'سارة': 'Sarah',
  'دينا': 'Dina',
  'ندى': 'Nada',
  'ريم': 'Rim',
  'وردة': 'Warda',
  
  // Male Names
  'أحمد': 'Ahmad',
  'محمد': 'Mohammad',
  'علي': 'Ali',
  'خالد': 'Khaled',
  'عمرو': 'Amr',
  'جمال': 'Jamal',
  'فلان': 'Folan',
  'علان': 'Olean',
  'بشار': 'Beshar',
  'بشار سلطان': 'Beshar Sultan',
  'سلطان': 'Sultan',
  'تامر': 'Tamer',
  'تامر العدواني': 'Tamer El Adawany',
  'عز العصامي': 'Ezz El Asamy',
  'محمود': 'Mahmoud',
  'إبراهيم': 'Ibrahim',
  'إبراهيم المبارك': 'Ibrahim Al Mubarak',
  'منتظر': 'Montazer',
  'منتظر الزايد': 'Montazer Al Zayed',
  'محمد فتشي': 'Mohamed Fathy',
  'محمد فتحي': 'Mohamed Fathy',
  'عمر': 'Omar',
  'حسن': 'Hassan',
  'حسين': 'Hussain',
  'سامي': 'Sami',
  'ياسر': 'Yasser',
  'وليد': 'Waleed',
  'طارق': 'Tarek',
};

// Transliterate Arabic name to English with smart handling
function transliterateArabicName(arabicName: string): string {
  const trimmed = arabicName.trim();
  
  // Check if there's an override (handles multi-word names too)
  if (NAME_TRANSLITERATION_OVERRIDES[trimmed]) {
    return NAME_TRANSLITERATION_OVERRIDES[trimmed];
  }

  // For multi-word names, try to transliterate each word
  const words = trimmed.split(/[\s]+/);
  const transliteratedWords: string[] = [];

  for (const word of words) {
    // Check if this word has an override
    if (NAME_TRANSLITERATION_OVERRIDES[word]) {
      transliteratedWords.push(NAME_TRANSLITERATION_OVERRIDES[word]);
      continue;
    }

    // Smart transliteration with diacritics and context awareness
    let transliterated = '';
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      const nextChar = i < word.length - 1 ? word[i + 1] : '';

      // Handle special cases with diacritics
      if (char === 'ا' || char === 'أ' || char === 'إ' || char === 'آ') {
        transliterated += 'a';
      } else if (char === 'ى' || char === 'ي') {
        // Check context - at end often becomes 'a', otherwise 'y'
        transliterated += (i === word.length - 1 && char === 'ى') ? 'a' : 'y';
      } else if (char === 'ة') {
        transliterated += 'a';
      } else if (char === 'و') {
        transliterated += (nextChar === '' || /[\s]/.test(nextChar)) ? '' : 'w';
      } else if (char === 'ه') {
        // ه at end of word is often silent
        transliterated += (i === word.length - 1) ? '' : 'h';
      } else if (ARABIC_TO_ENGLISH_MAP[char]) {
        transliterated += ARABIC_TO_ENGLISH_MAP[char];
      }
    }

    // Clean up and capitalize
    transliterated = transliterated
      .replace(/\s+/g, '')
      .replace(/[^a-z]/g, '')
      .trim();

    if (transliterated) {
      transliteratedWords.push(
        transliterated.charAt(0).toUpperCase() + transliterated.slice(1).toLowerCase()
      );
    }
  }

  const result = transliteratedWords.join(' ').trim();
  return result || arabicName;
}

// Intelligent role merging - consolidate related technical roles
function intelligentMergeRoles(credits: Credit[]): Credit[] {
  // Map of related roles that should be merged
  const roleMergeMap: Record<string, string> = {
    // Sound Engineering related
    'Recording': 'Sound Engineering',
    'Sound Engineering': 'Sound Engineering',
    'Studio': 'Sound Engineering',

    // Mix & Mastering related
    'Mix': 'Mix & Mastering',
    'Mastering': 'Mix & Mastering',
    'Mixing': 'Mix & Mastering',
    'Mix & Mastering': 'Mix & Mastering',

    // Arrangement related
    'Production': 'Arrangement',
    'Arrangement': 'Arrangement',

    // Vocals
    'Chorus': 'Vocals',
    'Vocals': 'Vocals',
  };

  // Apply role consolidation
  const mergedCredits = credits.map(credit => ({
    ...credit,
    role: roleMergeMap[credit.role] || credit.role,
  }));

  // Deduplicate: same person under same consolidated role should appear only once
  const seen = new Set<string>();
  const dedupedCredits: Credit[] = [];

  for (const credit of mergedCredits) {
    const key = `${credit.role}|${credit.nameEnglish}|${credit.nameArabic}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedupedCredits.push(credit);
    }
  }

  return dedupedCredits;
}

export function CreditsFormatter() {
  const [inputText, setInputText] = useState('');
  const [credits, setCreds] = useState<Credit[]>([]);
  const [specialThanks, setSpecialThanks] = useState<string[]>([]);
  const [mergeRoles, setMergeRoles] = useState(true);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  const processCredits = (text: string) => {
    if (!text.trim()) {
      setCreds([]);
      setSpecialThanks([]);
      return;
    }

    const lines = text.split('\n');
    const newCredits: Credit[] = [];
    const newThanks: string[] = [];
    
    let currentRole: string | null = null;
    let currentRoleArabic: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        currentRole = null;
        currentRoleArabic = null;
        continue;
      }

      // Check for special thanks
      if (line.toLowerCase().includes('شكر') || line.toLowerCase().includes('thanks')) {
        const name = line.replace(/^.*(شكر خاص|شكر|special thanks|thanks):?\s*/i, '').trim();
        if (name) {
          const englishName = transliterateArabicName(name);
          if (!newThanks.includes(englishName)) {
            newThanks.push(englishName);
          }
        }
        currentRole = null;
        currentRoleArabic = null;
        continue;
      }

      // Check if this line contains a role separator (: ، - |)
      const roleMatch = line.match(/^(.+?)[:،\-|]\s*(.*)$/);
      
      if (roleMatch && roleMatch[2]?.trim()) {
        // Line has format: "role : name"
        const roleText = roleMatch[1].trim();
        const nameArabic = roleMatch[2].trim();

        const englishRole = ROLE_MAP[roleText] || roleText;
        const englishName = transliterateArabicName(nameArabic);

        if (englishName && englishRole) {
          newCredits.push({
            role: englishRole,
            nameEnglish: englishName,
            nameArabic: nameArabic,
            roleArabic: roleText,
          });
        }
        currentRole = null;
        currentRoleArabic = null;
      } else if (ROLE_MAP[line]) {
        // This line is a role header (Arabic role name)
        currentRole = ROLE_MAP[line];
        currentRoleArabic = line;
      } else if (currentRole && line && !line.includes(':') && !line.includes('،')) {
        // This is a name under a multi-line role
        const englishName = transliterateArabicName(line);
        if (englishName) {
          newCredits.push({
            role: currentRole,
            nameEnglish: englishName,
            nameArabic: line,
            roleArabic: currentRoleArabic || '',
          });
        }
      } else if (!line.includes(':') && !line.includes('،') && line.length < 50) {
        // Check if it could be a role name (but not matched yet)
        // Try case-insensitive matching with normalization
        const normalizedLine = line.toLowerCase().trim();
        let found = false;
        
        for (const [key, val] of Object.entries(ROLE_MAP)) {
          if (key.toLowerCase() === normalizedLine) {
            currentRole = val;
            currentRoleArabic = line;
            found = true;
            break;
          }
        }
        
        // If not found as role and we have a current role, treat as name
        if (!found && currentRole && line.length > 0) {
          const englishName = transliterateArabicName(line);
          if (englishName) {
            newCredits.push({
              role: currentRole,
              nameEnglish: englishName,
              nameArabic: line,
              roleArabic: currentRoleArabic || '',
            });
          }
        }
      }
    }

    // Intelligent merging: consolidate related technical roles
    const consolidatedCredits = intelligentMergeRoles(newCredits);
    setCreds(consolidatedCredits);
    setSpecialThanks(newThanks);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInputText(text);
    processCredits(text);
  };

  const formattedOutput = useMemo(() => {
    const lines: string[] = [];

    if (mergeRoles) {
      // Group by role - maintain order of first appearance
      const groupedMap = new Map<string, Credit[]>();
      const roleOrder: string[] = [];
      
      credits.forEach((credit) => {
        if (!groupedMap.has(credit.role)) {
          groupedMap.set(credit.role, []);
          roleOrder.push(credit.role);
        }
        groupedMap.get(credit.role)!.push(credit);
      });

      // Output grouped format - cleaner professional style
      roleOrder.forEach((role) => {
        const people = groupedMap.get(role)!;
        
        if (people.length === 1) {
          // Single person - inline format
          const person = people[0];
          lines.push(`✶ ${role} : ${person.nameEnglish} | ${person.nameArabic}`);
        } else {
          // Multiple people - grouped format
          lines.push(`✶ ${role}`);
          people.forEach((person) => {
            lines.push(`  ${person.nameEnglish} | ${person.nameArabic}`);
          });
        }
        lines.push('');
      });
    } else {
      // Original format - one per line
      credits.forEach((credit) => {
        lines.push(`✶ ${credit.role} : ${credit.nameEnglish} | ${credit.nameArabic}`);
      });
    }

    if (specialThanks.length > 0) {
      lines.push('');
      lines.push('✶ Special Thanks');
      specialThanks.forEach((thanks) => {
        lines.push(`  ${thanks}`);
      });
    }

    return lines.filter((_, idx, arr) => !(arr[idx] === '' && arr[idx + 1] === '')).join('\n').trim();
  }, [credits, specialThanks, mergeRoles]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(formattedOutput);
  };

  const downloadAsText = () => {
    const element = document.createElement('a');
    const file = new Blob([formattedOutput], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'credits.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const clearAll = () => {
    setInputText('');
    setCreds([]);
    setSpecialThanks([]);
    setExpandedRoles(new Set());
  };

  // Group credits by role
  const groupedCredits = useMemo(() => {
    const groupedMap = new Map<string, Credit[]>();
    
    credits.forEach((credit) => {
      if (!groupedMap.has(credit.role)) {
        groupedMap.set(credit.role, []);
      }
      groupedMap.get(credit.role)!.push(credit);
    });

    return Array.from(groupedMap.entries()).map(([role, people]) => ({
      role,
      people,
    }));
  }, [credits]);

  const toggleRoleExpanded = (role: string) => {
    const newExpanded = new Set(expandedRoles);
    if (newExpanded.has(role)) {
      newExpanded.delete(role);
    } else {
      newExpanded.add(role);
    }
    setExpandedRoles(newExpanded);
  };

  return (
    <div className="space-y-6">
      {/* Input/Output Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-gray-300">Arabic Credits Input</label>
            <button
              onClick={clearAll}
              className="text-xs text-red-400 hover:text-red-300 transition flex items-center gap-1"
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>
          <textarea
            value={inputText}
            onChange={handleInputChange}
            placeholder="Paste Arabic credits here:&#10;كلمات فلان&#10;الحان علان&#10;توزيع شخص&#10;مكس وماستر مهندس"
            className="w-full h-64 bg-neutral-900 border border-neutral-700 rounded-lg p-4 text-sm text-white placeholder-neutral-500 focus:border-green-500 focus:outline-none resize-none"
          />
        </div>

        {/* Output Preview */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-300">Formatted Output</label>
          <div className="w-full h-64 bg-neutral-900 border border-neutral-700 rounded-lg p-4 overflow-y-auto">
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-words">
              {formattedOutput || '(formatted output will appear here)'}
            </pre>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap items-center">
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition font-medium text-sm"
        >
          <Copy size={16} /> Copy Credits
        </button>
        <button
          onClick={downloadAsText}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition font-medium text-sm"
        >
          <Download size={16} /> Download TXT
        </button>
        
        {/* Merge toggle */}
        <label className="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg cursor-pointer hover:border-green-500 transition">
          <input
            type="checkbox"
            checked={mergeRoles}
            onChange={(e) => setMergeRoles(e.target.checked)}
            className="w-4 h-4 accent-green-500"
          />
          <span className="text-sm text-gray-300">Merge Same Roles</span>
        </label>
      </div>

      {/* Credits Table */}
      {credits.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">
            {mergeRoles ? `Grouped Credits (${groupedCredits.length} roles)` : 'Parsed Credits'}
          </h3>
          <div className="overflow-x-auto">
            {mergeRoles ? (
              // Grouped table view
              <div className="space-y-2">
                {groupedCredits.map((group) => {
                  const isExpanded = expandedRoles.has(group.role);
                  return (
                    <div key={group.role} className="border border-neutral-700 rounded-lg overflow-hidden">
                      {/* Role header */}
                      <button
                        onClick={() => toggleRoleExpanded(group.role)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-neutral-900 hover:bg-neutral-800 transition text-left"
                      >
                        <ChevronDown 
                          size={16} 
                          className={`text-green-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                        <span className="text-green-400 font-medium flex-1">{group.role}</span>
                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                          {group.people.length}
                        </span>
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="border-t border-neutral-700">
                          <table className="w-full text-xs">
                            <tbody>
                              {group.people.map((person, idx) => (
                                <tr
                                  key={idx}
                                  className="border-b border-neutral-800 hover:bg-neutral-900 transition last:border-b-0"
                                >
                                  <td className="py-2 px-4 text-white">{person.nameEnglish}</td>
                                  <td className="py-2 px-4 text-gray-300 text-right" dir="rtl">
                                    {person.nameArabic}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              // Non-grouped table view
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-neutral-700">
                    <th className="text-left py-2 px-3 text-gray-400">Role (English)</th>
                    <th className="text-left py-2 px-3 text-gray-400">Name (English)</th>
                    <th className="text-right py-2 px-3 text-gray-400">Name (Arabic)</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map((credit, idx) => (
                    <tr key={idx} className="border-b border-neutral-800 hover:bg-neutral-900 transition">
                      <td className="py-2 px-3 text-green-400 font-medium">{credit.role}</td>
                      <td className="py-2 px-3 text-white">{credit.nameEnglish}</td>
                      <td className="py-2 px-3 text-gray-300 text-right" dir="rtl">{credit.nameArabic}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

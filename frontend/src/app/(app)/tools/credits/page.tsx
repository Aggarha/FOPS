'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  BookOpen, Copy, Check, Download, Trash2, ChevronDown, ChevronRight,
  Zap, Plus, X, Save, RotateCcw, Settings, Eye, EyeOff, ArrowRight,
  Hash, Globe, Layers, Music, Loader2, Sparkles, FileText, AlertCircle,
} from 'lucide-react';
import { authenticatedFetch } from '@/lib/api';

// ─── Role Map (100+ Arabic → English) ────────────────────────────────────────

const ROLE_MAP: Record<string, string> = {
  // Lyrics / Writing
  'كلمات': 'Lyrics',
  'كلمات وألحان': 'Lyrics & Composition',
  'الكلمات': 'Lyrics',
  'كاتب الكلمات': 'Lyrics',
  'كتابة': 'Lyrics',
  'النصوص': 'Lyrics',
  // Composition
  'ألحان': 'Composition',
  'الحان': 'Composition',
  'تلحين': 'Composition',
  'ملحن': 'Composition',
  'موسيقى': 'Composition',
  'الموسيقى': 'Composition',
  // Arrangement
  'توزيع': 'Arrangement',
  'توزيع موسيقي': 'Arrangement',
  'تنفيذ وتوزيع موسيقي': 'Arrangement',
  'تنفيذ': 'Arrangement',
  'الموزع': 'Arrangement',
  // Production
  'إنتاج': 'Production',
  'انتاج': 'Production',
  'منتج': 'Production',
  'مُنتِج': 'Production',
  'تنفيذ انتاجي': 'Production',
  // Mix & Mastering
  'مكس': 'Mix & Mastering',
  'مكس وماستر': 'Mix & Mastering',
  'ميكس': 'Mix & Mastering',
  'ميكس وماستر': 'Mix & Mastering',
  'مزج وإتقان': 'Mix & Mastering',
  'ماستر': 'Mastering',
  'مازترينج': 'Mastering',
  'ماسترينج': 'Mastering',
  'مكساج': 'Mixing',
  'مزج': 'Mixing',
  // Sound Engineering
  'هندسة صوت': 'Sound Engineering',
  'هندسة الصوت': 'Sound Engineering',
  'هندسة صوتية': 'Sound Engineering',
  'تسجيل صوت': 'Sound Engineering',
  'تسجيل': 'Sound Engineering',
  'مهندس صوت': 'Sound Engineering',
  'استديو': 'Sound Engineering',
  'إستديو': 'Sound Engineering',
  // Supervision
  'إشراف': 'Supervision',
  'الإشراف': 'Supervision',
  'إشراف عام': 'Supervision',
  'مشرف': 'Supervision',
  'مُشرِف': 'Supervision',
  // Musical Direction
  'إخراج موسيقي': 'Musical Direction',
  'موسيقي مخرج': 'Musical Direction',
  'قيادة موسيقية': 'Musical Direction',
  // Choir / Vocals
  'كورال': 'Choir',
  'جوقة': 'Choir',
  'أصوات': 'Choir',
  'صوت': 'Vocals',
  'مغنيون': 'Vocals',
  'أداء': 'Vocals',
  // Instruments
  'جيتار': 'Guitar',
  'جيتارات': 'Guitar',
  'جيتار كلاسيك': 'Classical Guitar',
  'جيتار إيقاعي': 'Rhythm Guitar',
  'عود': 'Oud',
  'قانون': 'Qanun',
  'ناي': 'Ney',
  'كمان': 'Violin',
  'كمنجات': 'Strings',
  'تشيللو': 'Cello',
  'تشيلو': 'Cello',
  'كونترباص': 'Contrabass',
  'أكورديون': 'Accordion',
  'مزمار': 'Oboe',
  'باص': 'Bass',
  'بيس': 'Bass Guitar',
  'كيبورد': 'Keyboard',
  'بيانو': 'Piano',
  'أورج': 'Organ',
  'أورغ': 'Organ',
  'سنثيسايزر': 'Synthesizer',
  'ترومبيت': 'Trumpet',
  'تروبمون': 'Trombone',
  'ساكسفون': 'Saxophone',
  'فلوت': 'Flute',
  'هارب': 'Harp',
  'بزق': 'Buzuq',
  // Percussion
  'إيقاع': 'Percussion',
  'إيقاعات': 'Percussion',
  'ايقاعات': 'Percussion',
  'طبول': 'Drums',
  'طبلة': 'Tabla',
  'رق': 'Riq',
  'دف': 'Duff',
  'كاخون': 'Cajon',
  // Video / Visual
  'تصوير': 'Cinematography',
  'مصور': 'Cinematography',
  'إخراج': 'Direction',
  'مخرج': 'Direction',
  'مونتاج': 'Editing',
  'مونتير': 'Editor',
  'إضاءة': 'Lighting',
  'ديكور': 'Set Design',
  'تصميم': 'Design',
  'مؤثرات': 'VFX',
  'غرافيك': 'Graphics',
  'موشن غرافيك': 'Motion Graphics',
  'تلوين': 'Coloring',
  'كلر غريدنج': 'Color Grading',
  // Management
  'إنتاج تنفيذي': 'Executive Production',
  'منتج تنفيذي': 'Executive Producer',
  'توزيع رقمي': 'Digital Distribution',
  'علاقات عامة': 'PR',
  'تنسيق': 'Coordination',
  // Thanks
  'شكر خاص': 'Special Thanks',
  'شكر': 'Special Thanks',
  'بدعم من': 'Supported By',
  'بالتعاون مع': 'In Collaboration With',
  'يتقدم': 'Presented By',
};

// ─── Transliteration ──────────────────────────────────────────────────────────

const CHAR_MAP: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa',
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a',
  'ئ': 'y', 'ؤ': 'w', 'لا': 'la', 'لأ': 'la',
};

const NAME_OVERRIDES: Record<string, string> = {
  'أحمد': 'Ahmad', 'احمد': 'Ahmad',
  'محمد': 'Mohammed', 'محمود': 'Mahmoud',
  'علي': 'Ali', 'عمرو': 'Amr', 'عمر': 'Omar',
  'خالد': 'Khaled', 'كريم': 'Karim',
  'وليد': 'Waleed', 'طارق': 'Tarek', 'سامي': 'Sami',
  'بشار': 'Beshar', 'سلطان': 'Sultan', 'تامر': 'Tamer',
  'ياسر': 'Yasser', 'حسن': 'Hassan', 'حسين': 'Hussein',
  'إبراهيم': 'Ibrahim', 'ابراهيم': 'Ibrahim',
  'منتظر': 'Montazer', 'محمود المصري': 'Mahmoud Al Masry',
  'سارة': 'Sarah', 'سارا': 'Sara', 'نور': 'Noor',
  'ليلى': 'Layla', 'مريم': 'Maryam', 'فاطمة': 'Fatma',
  'رانيا': 'Rania', 'هالة': 'Hala', 'دينا': 'Dina',
  'نجوى': 'Nagwa', 'سلمى': 'Salma', 'لينا': 'Lina',
  'فرح': 'Farah', 'ندى': 'Nada', 'ريم': 'Reem',
  'الموسيقار': 'The Maestro', 'الفنان': 'The Artist',
  'الحوساوي': 'Al Husawi', 'الشمراني': 'Al Shammrani',
  'الزهراني': 'Al Zahrani', 'الغامدي': 'Al Ghamdi',
  'الحربي': 'Al Harbi', 'العتيبي': 'Al Otaibi',
  'القحطاني': 'Al Qahtani', 'الدوسري': 'Al Dosari',
  'الشهري': 'Al Shahri', 'السهلي': 'Al Sahli',
  'العسيري': 'Al Asiri', 'البقمي': 'Al Baqami',
  'الجهني': 'Al Juhani', 'الرشيدي': 'Al Rashidi',
};

function transliterate(name: string): string {
  const t = name.trim();
  if (!t) return t;
  if (!/[\u0600-\u06FF]/.test(t)) return t; // Already Latin

  // Full name override
  if (NAME_OVERRIDES[t]) return NAME_OVERRIDES[t];

  // Word-by-word with overrides
  const words = t.split(/\s+/);
  return words.map((w) => {
    if (NAME_OVERRIDES[w]) return NAME_OVERRIDES[w];
    let out = '';
    for (let i = 0; i < w.length; i++) {
      const c = w[i];
      const next = w[i + 1] || '';
      if (c === 'ا' && i === 0) { out += 'A'; continue; }
      if (c === 'و' && (i === w.length - 1 || next === ' ')) continue;
      if (c === 'ه' && i === w.length - 1) continue;
      if (CHAR_MAP[c]) out += CHAR_MAP[c];
    }
    return out ? out.charAt(0).toUpperCase() + out.slice(1) : w;
  }).join(' ');
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedCredit {
  id: string;
  role: string;         // Canonical English role
  roleAr: string;       // Original Arabic role label
  nameAr: string;       // Original Arabic name
  nameEn: string;       // Transliterated English name
  nameEnOverride?: string; // Manually edited English name
  source: 'header' | 'inline' | 'parenthesis'; // How it was detected
}

interface Preset {
  id: string;
  name: string;
  type: 'single' | 'album' | 'concert' | 'custom';
  roleOrder: string[];
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function isArabic(s: string) { return /[\u0600-\u06FF]/.test(s); }

function normalizeRole(raw: string): { en: string; ar: string } | null {
  const t = raw.trim().replace(/[:،؛]+$/, '').trim();
  const en = ROLE_MAP[t];
  if (en) return { en, ar: t };
  // Case-insensitive fallback
  const lower = t.toLowerCase();
  for (const [k, v] of Object.entries(ROLE_MAP)) {
    if (k.toLowerCase() === lower) return { en: v, ar: t };
  }
  return null;
}

function parseCredits(raw: string): ParsedCredit[] {
  const lines = raw.split('\n');
  const results: ParsedCredit[] = [];
  let currentRole: { en: string; ar: string } | null = null;
  let idx = 0;

  const push = (role: { en: string; ar: string }, nameAr: string, source: ParsedCredit['source']) => {
    const nameEn = transliterate(nameAr);
    results.push({ id: `c${idx++}`, role: role.en, roleAr: role.ar, nameAr: nameAr.trim(), nameEn, source });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { currentRole = null; continue; }

    // Pattern 1 – "role : name" or "role - name" inline
    const inlineMatch = line.match(/^(.+?)\s*[:،\-]\s*(.+)$/);
    if (inlineMatch) {
      const roleCandidate = inlineMatch[1].trim();
      const nameCandidate = inlineMatch[2].trim();
      const resolved = normalizeRole(roleCandidate);
      if (resolved && nameCandidate) {
        push(resolved, nameCandidate, 'inline');
        currentRole = null;
        continue;
      }
    }

    // Pattern 2 – "name (role)" parenthetical
    const parenMatch = line.match(/^(.+?)\s*[\(（]\s*(.+?)\s*[\)）]$/);
    if (parenMatch) {
      const nameCandidate = parenMatch[1].trim();
      const roleCandidate = parenMatch[2].trim();
      const resolved = normalizeRole(roleCandidate);
      if (resolved && nameCandidate) {
        push(resolved, nameCandidate, 'parenthesis');
        continue;
      }
    }

    // Pattern 3 – standalone role header
    const headerResolved = normalizeRole(line);
    if (headerResolved) {
      currentRole = headerResolved;
      continue;
    }

    // Pattern 4 – name under a role header
    if (currentRole && line.length < 60) {
      push(currentRole, line, 'header');
    }
  }

  // Deduplicate: same role + same nameAr
  const seen = new Set<string>();
  return results.filter((c) => {
    const key = `${c.role}|${c.nameAr}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Role ordering by category importance ────────────────────────────────────

const ROLE_PRIORITY: Record<string, number> = {
  'Lyrics': 1, 'Lyrics & Composition': 2,
  'Composition': 3, 'Arrangement': 4, 'Production': 5,
  'Executive Production': 6, 'Musical Direction': 7,
  'Sound Engineering': 8, 'Mixing': 9, 'Mastering': 10, 'Mix & Mastering': 11,
  'Supervision': 12,
  'Guitar': 20, 'Classical Guitar': 21, 'Rhythm Guitar': 22,
  'Oud': 23, 'Qanun': 24, 'Ney': 25,
  'Violin': 26, 'Strings': 27, 'Cello': 28, 'Contrabass': 29,
  'Keyboard': 30, 'Piano': 31, 'Organ': 32, 'Synthesizer': 33,
  'Bass': 34, 'Bass Guitar': 35,
  'Drums': 36, 'Percussion': 37, 'Tabla': 38, 'Riq': 39, 'Duff': 40,
  'Trumpet': 41, 'Trombone': 42, 'Saxophone': 43, 'Flute': 44,
  'Vocals': 50, 'Choir': 51,
  'Direction': 60, 'Cinematography': 61, 'Editing': 62,
  'Color Grading': 63, 'Lighting': 64, 'Motion Graphics': 65,
  'Coordination': 70, 'PR': 71, 'Digital Distribution': 72,
  'Special Thanks': 99, 'Supported By': 100, 'In Collaboration With': 101,
};

function sortRoles(roles: string[]): string[] {
  return [...roles].sort((a, b) => (ROLE_PRIORITY[a] ?? 50) - (ROLE_PRIORITY[b] ?? 50));
}

// ─── Format Output ────────────────────────────────────────────────────────────

type OutputFormat = 'clean' | 'bilingual' | 'youtube' | 'table';

function formatOutput(credits: ParsedCredit[], fmt: OutputFormat, customNames: Record<string, string>): string {
  const grouped = new Map<string, ParsedCredit[]>();
  const roleOrder: string[] = [];
  for (const c of credits) {
    if (!grouped.has(c.role)) { grouped.set(c.role, []); roleOrder.push(c.role); }
    grouped.get(c.role)!.push(c);
  }
  const sortedRoles = sortRoles(roleOrder);

  const getName = (c: ParsedCredit) => customNames[c.id] ?? c.nameEn;

  if (fmt === 'clean') {
    return sortedRoles.map((role) => {
      const people = grouped.get(role)!;
      if (people.length === 1) return `✶ ${role} : ${getName(people[0])}`;
      return `✶ ${role}\n${people.map((p) => `    ${getName(p)}`).join('\n')}`;
    }).join('\n\n');
  }

  if (fmt === 'bilingual') {
    return sortedRoles.map((role) => {
      const people = grouped.get(role)!;
      const ar = people[0].roleAr || role;
      if (people.length === 1) {
        const p = people[0];
        return `✶ ${role} | ${ar} : ${getName(p)}${p.nameAr && p.nameAr !== getName(p) ? ` | ${p.nameAr}` : ''}`;
      }
      return `✶ ${role} | ${ar}\n${people.map((p) => `    ${getName(p)}${p.nameAr && p.nameAr !== getName(p) ? ` | ${p.nameAr}` : ''}`).join('\n')}`;
    }).join('\n\n');
  }

  if (fmt === 'youtube') {
    // YouTube description credits section
    const lines: string[] = ['── Credits ──', ''];
    for (const role of sortedRoles) {
      const people = grouped.get(role)!;
      lines.push(`${role}: ${people.map(getName).join(', ')}`);
    }
    return lines.join('\n');
  }

  if (fmt === 'table') {
    const header = 'Role\tEnglish Name\tArabic Name';
    const rows = credits.map((c) => `${c.role}\t${getName(c)}\t${c.nameAr}`);
    return [header, ...rows].join('\n');
  }

  return '';
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function CopyBtn({ text, label, compact }: { text: string; label?: string; compact?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); };
  if (compact) return (
    <button onClick={copy} className="p-1.5 rounded text-gray-600 hover:text-gray-300 transition-colors">
      {done ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
  return (
    <button onClick={copy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-all">
      {done ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {label || (done ? 'Copied!' : 'Copy')}
    </button>
  );
}

const FORMAT_TABS: { id: OutputFormat; label: string }[] = [
  { id: 'clean', label: 'Clean' },
  { id: 'bilingual', label: 'Bilingual' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'table', label: 'TSV Table' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CreditsFormatterPage() {
  const [input, setInput] = useState('');
  const [credits, setCredits] = useState<ParsedCredit[]>([]);
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [outputFmt, setOutputFmt] = useState<OutputFormat>('clean');
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [showPresets, setShowPresets] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [mergeEnabled, setMergeEnabled] = useState(true);

  // Derived
  const grouped = useMemo(() => {
    const map = new Map<string, ParsedCredit[]>();
    for (const c of credits) {
      if (!map.has(c.role)) map.set(c.role, []);
      map.get(c.role)!.push(c);
    }
    return map;
  }, [credits]);

  const sortedRoles = useMemo(() => sortRoles(Array.from(grouped.keys())), [grouped]);

  const output = useMemo(
    () => formatOutput(credits, outputFmt, customNames),
    [credits, outputFmt, customNames],
  );

  const handleInput = (val: string) => {
    setInput(val);
    const parsed = parseCredits(val);
    setCredits(parsed);
    setCustomNames({});
    setExpandedRoles(new Set(parsed.map((c) => c.role)));
  };

  const clear = () => { setInput(''); setCredits([]); setCustomNames({}); setExpandedRoles(new Set()); };

  const toggleRole = (role: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      next.has(role) ? next.delete(role) : next.add(role);
      return next;
    });
  };

  const startEdit = (c: ParsedCredit) => {
    setEditingId(c.id);
    setEditValue(customNames[c.id] ?? c.nameEn);
  };

  const commitEdit = (id: string) => {
    if (editValue.trim()) setCustomNames((prev) => ({ ...prev, [id]: editValue.trim() }));
    else { const n = { ...customNames }; delete n[id]; setCustomNames(n); }
    setEditingId(null);
  };

  const downloadTXT = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([output], { type: 'text/plain;charset=utf-8' })); a.download = 'credits.txt'; a.click();
  };

  const downloadDOCX = async () => {
    const res = await authenticatedFetch('/api/video/export-docx', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Credits', description: output, tags: '', channel: '', video_type: 'Credits', artist: '', song: '' }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'credits.docx'; a.click();
  };

  const SAMPLE = `كلمات:\nفلان الفلاني\n\nألحان وتوزيع:\nعلان العلاني\n\nهندسة صوت:\nمحمد عصمت\nسهم\n\nمكس وماستر:\nأحمد الحوساوي\n\nكمنجات:\nأوركسترا المحيط\n\nإخراج:\nبشار سلطان`;

  return (
    <div className="max-w-screen-xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Credits Formatter</h1>
        <p className="text-sm text-gray-500 mt-1">Smart Arabic/bilingual credits parser with role detection, transliteration &amp; export</p>
      </div>

      {/* Stats bar */}
      {credits.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-gray-500">{credits.length} credits parsed</span>
          <span className="text-gray-700">·</span>
          <span className="text-gray-500">{sortedRoles.length} roles</span>
          <span className="text-gray-700">·</span>
          <span className="text-gray-500">{credits.filter((c) => c.source === 'inline').length} inline</span>
          <span className="text-gray-700">·</span>
          <span className="text-gray-500">{credits.filter((c) => c.source === 'parenthesis').length} parenthetical</span>
          <span className="text-gray-700">·</span>
          <span className="text-gray-500">{credits.filter((c) => c.source === 'header').length} header blocks</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[440px_1fr] gap-6">
        {/* ── LEFT: Input + Controls ── */}
        <div className="space-y-4">
          {/* Input */}
          <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-900">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Raw Credits Input</p>
              <div className="flex items-center gap-2">
                <button onClick={() => handleInput(SAMPLE)} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
                  Load sample
                </button>
                {input && (
                  <button onClick={clear} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={input}
              onChange={(e) => handleInput(e.target.value)}
              rows={16}
              dir="rtl"
              placeholder={'هندسة صوت:\nمهندس الصوت\n\nتوزيع:\nعلان العلاني\n\nكلمات وألحان:\nفلان الفلاني\n\nمكس وماستر: أحمد الحوساوي\nمحمد (توزيع)'}
              className="w-full px-4 py-3 bg-transparent text-sm text-white font-mono placeholder-gray-800 resize-none focus:outline-none"
            />
          </div>

          {/* Parsing notes */}
          <div className="rounded-xl border border-gray-800/30 bg-gray-950/50 p-4 space-y-2">
            <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3">Supported Patterns</p>
            {[
              ['Header block', 'هندسة صوت:\\n  اسم المهندس'],
              ['Inline role', 'ألحان: فلان الفلاني'],
              ['Parenthetical', 'فلان (توزيع)'],
            ].map(([label, ex]) => (
              <div key={label} className="flex items-start gap-3">
                <span className="shrink-0 text-[10px] font-bold text-gray-700 w-24">{label}</span>
                <code className="text-[10px] text-green-700 font-mono">{ex}</code>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Parsed View + Output ── */}
        <div className="space-y-5">
          {/* Grouped parsed view */}
          {sortedRoles.length > 0 ? (
            <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-900">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Parsed Roles</p>
                <div className="flex gap-2">
                  <button onClick={() => setExpandedRoles(new Set(sortedRoles))} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">Expand all</button>
                  <span className="text-gray-800">·</span>
                  <button onClick={() => setExpandedRoles(new Set())} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">Collapse all</button>
                </div>
              </div>
              <div className="divide-y divide-gray-900">
                {sortedRoles.map((role) => {
                  const people = grouped.get(role) ?? [];
                  const expanded = expandedRoles.has(role);
                  return (
                    <div key={role}>
                      <button onClick={() => toggleRole(role)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-900/40 transition-colors text-left">
                        <ChevronDown className={`w-3.5 h-3.5 text-gray-700 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                        <span className="flex-1 text-sm font-semibold text-white">{role}</span>
                        {people[0]?.roleAr && people[0].roleAr !== role && (
                          <span className="text-xs text-gray-600 font-medium" dir="rtl">{people[0].roleAr}</span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 font-mono">{people.length}</span>
                      </button>
                      {expanded && (
                        <div className="pb-2 divide-y divide-gray-900/50">
                          {people.map((c) => {
                            const displayName = customNames[c.id] ?? c.nameEn;
                            const isEditing = editingId === c.id;
                            return (
                              <div key={c.id} className="flex items-center gap-3 px-8 py-2">
                                {/* EN name — editable */}
                                {isEditing ? (
                                  <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => commitEdit(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(c.id); if (e.key === 'Escape') setEditingId(null); }}
                                    className="flex-1 px-2 py-1 rounded bg-gray-800 border border-gray-600 text-sm text-white font-mono focus:outline-none" />
                                ) : (
                                  <button onClick={() => startEdit(c)} className="flex-1 text-left text-sm text-gray-200 hover:text-white font-mono group flex items-center gap-1">
                                    {displayName}
                                    {customNames[c.id] && <span className="text-[9px] text-yellow-600 opacity-70">edited</span>}
                                  </button>
                                )}
                                {/* AR name */}
                                <span className="text-sm text-gray-600 font-medium" dir="rtl">{c.nameAr}</span>
                                {/* Source badge */}
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                                  c.source === 'inline' ? 'bg-blue-950 text-blue-700' :
                                  c.source === 'parenthesis' ? 'bg-purple-950 text-purple-700' :
                                  'bg-gray-900 text-gray-700'
                                }`}>{c.source}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-800/30 bg-gray-950/30 flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="w-10 h-10 text-gray-800 mb-4" />
              <p className="text-gray-600 text-sm">Paste Arabic credits on the left to parse</p>
              <p className="text-gray-700 text-xs mt-1">Supports header blocks, inline, and parenthetical patterns</p>
            </div>
          )}

          {/* Output panel */}
          {credits.length > 0 && (
            <div className="rounded-xl border border-gray-800/50 bg-gray-950 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-900">
                <div className="flex gap-1">
                  {FORMAT_TABS.map(({ id, label }) => (
                    <button key={id} onClick={() => setOutputFmt(id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${outputFmt === id ? 'bg-gray-700 text-white' : 'text-gray-600 hover:text-gray-400'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <CopyBtn text={output} />
              </div>
              <pre className="px-4 py-3 text-xs text-green-400 font-mono whitespace-pre-wrap break-words min-h-[10rem] max-h-72 overflow-y-auto">
                {output}
              </pre>
              <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-900">
                <p className="text-[10px] text-gray-700 uppercase tracking-widest font-bold flex-1">Export</p>
                <button onClick={downloadTXT} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-all">
                  <Download className="w-3.5 h-3.5" /> TXT
                </button>
                <button onClick={downloadDOCX} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-800/50 hover:bg-blue-700/50 text-blue-300 border border-blue-800 transition-all">
                  <Download className="w-3.5 h-3.5" /> DOCX
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Role Map Reference */}
      <details className="group rounded-xl border border-gray-800/30 bg-gray-950/50 overflow-hidden">
        <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer text-sm font-semibold text-gray-500 hover:text-gray-300 transition-colors list-none">
          <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
          Role Map Reference — {Object.keys(ROLE_MAP).length} Arabic roles supported
        </summary>
        <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 border-t border-gray-900 pt-4">
          {Object.entries(ROLE_MAP).map(([ar, en]) => (
            <div key={ar} className="flex items-center gap-2 py-1">
              <span className="text-xs text-gray-500 font-medium" dir="rtl">{ar}</span>
              <ArrowRight className="w-3 h-3 text-gray-800 shrink-0" />
              <span className="text-xs text-gray-400 font-medium truncate">{en}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

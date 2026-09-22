import type { Language, Member } from "./types";
import { t } from "./i18n";
import type { StringKey } from "./i18n";

/** Preset professions. The key is what gets stored on a member; the label is translated. */
const PROFESSION_STRING_KEYS = {
  doctor: "professionDoctor",
  engineer: "professionEngineer",
  hafiz: "professionHafiz",
  maulana: "professionMaulana",
  teacher: "professionTeacher",
  lawyer: "professionLawyer",
  businessman: "professionBusinessman",
  farmer: "professionFarmer",
  government: "professionGovernment",
  student: "professionStudent",
  homemaker: "professionHomemaker"
} as const satisfies Record<string, StringKey>;

export type ProfessionKey = keyof typeof PROFESSION_STRING_KEYS;

export const PROFESSION_KEYS = Object.keys(PROFESSION_STRING_KEYS) as ProfessionKey[];

/** Value of the "Other…" option in the profession dropdown. */
export const PROFESSION_OTHER = "__other";

/**
 * Short forms for the name prefix. Hafiz/Maulana are religious titles and are never abbreviated,
 * and Farmer/Student/Homemaker are already as short as their full label, so those fall through
 * to professionLabel below instead of getting an invented abbreviation.
 */
const PROFESSION_SHORT_STRING_KEYS: Partial<Record<ProfessionKey, StringKey>> = {
  doctor: "professionDoctorShort",
  engineer: "professionEngineerShort",
  teacher: "professionTeacherShort",
  lawyer: "professionLawyerShort",
  businessman: "professionBusinessmanShort",
  government: "professionGovernmentShort"
};

export function isProfessionKey(value: string): value is ProfessionKey {
  return Object.prototype.hasOwnProperty.call(PROFESSION_STRING_KEYS, value);
}

export function professionLabel(language: Language, profession: string): string {
  return isProfessionKey(profession) ? t(language, PROFESSION_STRING_KEYS[profession]) : profession;
}

/** Short form used as a name prefix (e.g. "Engg. Anisurrahman"); falls back to the full label. */
export function professionShortLabel(language: Language, profession: string): string {
  if (!isProfessionKey(profession)) return profession;
  const shortKey = PROFESSION_SHORT_STRING_KEYS[profession];
  return t(language, shortKey ?? PROFESSION_STRING_KEYS[profession]);
}

/** Free text that matches a preset (by key or English name) is stored as that preset, so counts don't split. */
export function normalizeProfession(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const preset = PROFESSION_KEYS.find(
    (key) => key === lower || t("en", PROFESSION_STRING_KEYS[key]).toLowerCase() === lower
  );
  return preset ?? text;
}

export interface ProfessionGroup {
  id: string;
  label: string;
  members: Member[];
}

/** Groups members by profession, biggest group first. Members without a profession are skipped. */
export function groupByProfession(members: Member[], language: Language): ProfessionGroup[] {
  const groups = new Map<string, ProfessionGroup>();
  for (const member of members) {
    const profession = member.profession?.trim();
    if (!profession) continue;
    const id = profession.toLowerCase();
    const group = groups.get(id) ?? { id, label: professionLabel(language, profession), members: [] };
    group.members.push(member);
    groups.set(id, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.members.length - a.members.length || a.label.localeCompare(b.label, language)
  );
}

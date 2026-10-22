// Pure rules for accounts: validation, password guidance, age checks, option lists.
// No React and no network, so everything here is unit tested (tests/accountRules.test.ts).

export type AccountType = "parent" | "helper";
export type Gender = "female" | "male" | "non_binary" | "prefer_not_to_say";
export type Language = "en" | "ms" | "zh" | "ta";

export const ACCOUNT_TYPES: ReadonlyArray<{ value: AccountType; label: string; description: string }> = [
  { value: "parent", label: "Parent or guardian", description: "You manage a child's pickup plan, your household and who is approved to collect." },
  { value: "helper", label: "Family member or trusted helper", description: "You help with pickups when you are asked. You manage your own profile and availability." },
];

export const GENDERS: ReadonlyArray<{ value: Gender; label: string }> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const LANGUAGES: ReadonlyArray<{ value: Language; label: string }> = [
  { value: "en", label: "English" },
  { value: "ms", label: "Bahasa Melayu" },
  { value: "zh", label: "Chinese" },
  { value: "ta", label: "Tamil" },
];

export const RELATIONSHIPS = [
  "Mother",
  "Father",
  "Grandmother",
  "Grandfather",
  "Aunt",
  "Uncle",
  "Older sibling",
  "Legal guardian",
  "Other",
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const MIN_ADULT_AGE = 18;
export const MIN_PASSWORD_LENGTH = 8;

export function accountTypeLabel(t: string | null | undefined): string {
  if (t === "parent") return "Parent or guardian";
  if (t === "helper") return "Family member or trusted helper";
  return "Not set";
}

export function genderLabel(g: string | null | undefined): string {
  return GENDERS.find((x) => x.value === g)?.label ?? "Not shared";
}

export function languageLabel(l: string | null | undefined): string {
  return LANGUAGES.find((x) => x.value === l)?.label ?? "English";
}

// ---------------------------------------------------------------- field checks (return an error string or null)

export function checkFullName(v: string): string | null {
  const s = v.trim().replace(/\s+/g, " ");
  if (!s) return "Enter your full name.";
  if (s.length < 2) return "Name is too short.";
  if (s.length > 80) return "Name is too long.";
  if (!/\p{L}/u.test(s)) return "Name must contain letters.";
  return null;
}

export function checkEmail(v: string): string | null {
  const s = v.trim();
  if (!s) return "Enter your email address.";
  if (s.length > 254) return "Email address is too long.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return "Enter a valid email address, like name@example.com.";
  return null;
}

/** Digits only count; allows a leading + and spaces, dashes and brackets. 8 to 15 digits (E.164 maximum is 15). */
export function checkPhone(v: string, required: boolean): string | null {
  const s = v.trim();
  if (!s) return required ? "Enter your phone number." : null;
  if (!/^\+?[\d\s\-()]+$/.test(s)) return "Use digits only. A leading + is fine.";
  const digits = s.replace(/\D/g, "");
  if (digits.length < 8) return "Phone number looks too short.";
  if (digits.length > 15) return "Phone number looks too long.";
  return null;
}

export function normalizePhone(v: string): string {
  const s = v.trim();
  const plus = s.startsWith("+") ? "+" : "";
  return plus + s.replace(/\D/g, "");
}

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: "Too short" | "Weak" | "Fair" | "Good" | "Strong"; missing: string[] };

/** Guidance only. The hard rule is length plus a letter and a number. */
export function passwordStrength(pw: string): PasswordStrength {
  const missing: string[] = [];
  if (pw.length < MIN_PASSWORD_LENGTH) missing.push(`at least ${MIN_PASSWORD_LENGTH} characters`);
  if (!/[A-Za-z]/.test(pw)) missing.push("a letter");
  if (!/\d/.test(pw)) missing.push("a number");
  let score = 0;
  if (pw.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) score += 1;
  if (pw.length < MIN_PASSWORD_LENGTH) return { score: pw.length ? 1 : 0, label: "Too short", missing };
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;
  const s = Math.min(4, Math.max(1, score)) as 1 | 2 | 3 | 4;
  return { score: s, label: labels[s], missing };
}

export function checkPassword(pw: string): string | null {
  if (!pw) return "Enter a password.";
  const { missing } = passwordStrength(pw);
  if (missing.length) return `Password needs ${missing.join(", ")}.`;
  if (pw.length > 72) return "Password is too long (72 characters maximum).";
  return null;
}

export function checkConfirm(pw: string, confirm: string): string | null {
  if (!confirm) return "Re-enter your password.";
  if (pw !== confirm) return "Passwords do not match.";
  return null;
}

// ---------------------------------------------------------------- date of birth

export type Dob = { day: string; month: string; year: string };

export function parseDob(d: Dob): { iso: string; date: Date } | null {
  if (!/^\d{1,2}$/.test(d.day) || !/^\d{1,2}$/.test(d.month) || !/^\d{4}$/.test(d.year)) return null;
  const day = Number(d.day);
  const month = Number(d.month);
  const year = Number(d.year);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { iso, date };
}

export function ageOn(iso: string, today: Date): number {
  const [y, m, d] = iso.split("-").map(Number);
  let age = today.getUTCFullYear() - y;
  const beforeBirthday = today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Date of birth is collected only to confirm the account holder is an adult. SafeNest accounts carry guardian and
 * collector permissions, so a minor cannot create one. A parent adds a child as a child profile instead.
 */
export function checkDob(d: Dob, today: Date = new Date()): string | null {
  if (!d.day && !d.month && !d.year) return "Enter your date of birth.";
  const p = parseDob(d);
  if (!p) return "Enter a real date, like 14 / 03 / 1988.";
  const age = ageOn(p.iso, today);
  if (age < 0) return "That date is in the future.";
  if (age > 110) return "Check the year.";
  if (age < MIN_ADULT_AGE) return `SafeNest accounts are for adults (${MIN_ADULT_AGE}+). A parent can add a child as a child profile instead.`;
  return null;
}

// ---------------------------------------------------------------- whole-step checks

export type SignupDraft = {
  accountType: AccountType | null;
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
  dob: Dob;
  gender: Gender | null;
  language: Language;
};

export const emptySignup = (): SignupDraft => ({
  accountType: null,
  fullName: "",
  email: "",
  phone: "",
  password: "",
  confirm: "",
  dob: { day: "", month: "", year: "" },
  gender: null,
  language: "en",
});

export type StepErrors = Record<string, string>;

export function validateSignupStep(step: 0 | 1 | 2, d: SignupDraft, today: Date = new Date()): StepErrors {
  const e: StepErrors = {};
  const put = (k: string, v: string | null) => {
    if (v) e[k] = v;
  };
  if (step === 0) {
    if (!d.accountType) e.accountType = "Choose how you will use SafeNest.";
  } else if (step === 1) {
    put("fullName", checkFullName(d.fullName));
    put("email", checkEmail(d.email));
    put("phone", checkPhone(d.phone, true));
    put("dob", checkDob(d.dob, today));
  } else {
    put("password", checkPassword(d.password));
    put("confirm", checkConfirm(d.password, d.confirm));
  }
  return e;
}

export function firstStepWithErrors(d: SignupDraft, today: Date = new Date()): 0 | 1 | 2 | null {
  for (const s of [0, 1, 2] as const) if (Object.keys(validateSignupStep(s, d, today)).length) return s;
  return null;
}

export function displayDob(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Not shared";
  const [y, m, d] = iso.split("-");
  return `${d} / ${m} / ${y}`;
}

// ---------------------------------------------------------------- household drafts

export type ChildDraft = {
  name: string;
  age: string;
  className: string;
  schoolName: string;
  schoolAddress: string;
  teacherName: string;
  teacherPhone: string;
};

export const emptyChildDraft = (): ChildDraft => ({
  name: "", age: "", className: "", schoolName: "", schoolAddress: "", teacherName: "", teacherPhone: "",
});

/** Only what SafeNest needs to run a pickup. No photo, no ID number, no birth date for a child. */
export function validateChildDraft(d: ChildDraft): StepErrors {
  const e: StepErrors = {};
  const name = d.name.trim();
  if (!name) e.name = "Enter your child's name.";
  else if (name.length > 60) e.name = "Name is too long.";
  if (d.age.trim()) {
    const n = Number(d.age);
    if (!Number.isInteger(n) || n < 1 || n > 18) e.age = "Age must be a whole number from 1 to 18.";
  }
  if (!d.schoolName.trim()) e.schoolName = "Enter the school's name so we can find it on the map.";
  if (d.className.length > 40) e.className = "Class name is too long.";
  const phone = checkPhone(d.teacherPhone, false);
  if (phone) e.teacherPhone = phone;
  return e;
}

export type HelperDraft = { name: string; relationship: string; phone: string; isAdult: boolean };
export const emptyHelperDraft = (): HelperDraft => ({ name: "", relationship: "", phone: "", isAdult: false });

/**
 * A helper must be an adult. Relationship alone never authorizes anyone: this only creates a pending entry
 * that a guardian approves separately.
 */
export function validateHelperDraft(d: HelperDraft): StepErrors {
  const e: StepErrors = {};
  const nameErr = checkFullName(d.name);
  if (nameErr) e.name = nameErr;
  if (!d.relationship.trim()) e.relationship = "Choose how this person is related to your child.";
  const phone = checkPhone(d.phone, false);
  if (phone) e.phone = phone;
  if (!d.isAdult) e.isAdult = "Only adults (18+) can be approved to collect a child.";
  return e;
}

/** Who may do what, by account type. The database enforces the same rules; this only decides what the UI offers. */
export function capabilities(accountType: AccountType | null, isFamilyAdmin: boolean) {
  const guardian = accountType === "parent";
  return {
    manageChildren: guardian,
    managePlan: guardian,
    approveHelpers: guardian && isFamilyAdmin,
    inviteHelpers: guardian,
    inviteFamily: guardian && isFamilyAdmin,
    removeMembers: guardian && isFamilyAdmin,
    setOwnAvailability: true,
    respondToRequests: true,
  };
}

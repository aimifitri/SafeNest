export type PersonId = string;
export type ContactState = "active" | "pending" | "rejected";
export type PickupState = "planned" | "onTrack" | "late" | "covered" | "arrived";
export type BackupRequestState = "idle" | "requested" | "accepted" | "declined";
export type VerificationState = "notStarted" | "photoPrepared" | "awaitingTeacher" | "approved" | "rejected";

export interface Child {
  id: string;
  name: string;
  age: number;
  className: string;
}

export interface Caregiver {
  id: PersonId;
  name: string;
  role: string;
  email: string;
  phone: string;
  isAdmin: boolean;
}

export interface FamilyMember {
  id: PersonId;
  name: string;
  role: string;
  state: "active";
  locationLabel?: string;
}

export interface TrustedHelper {
  id: PersonId;
  name: string;
  role: string;
  state: ContactState;
  locationLabel?: string;
}

export interface School {
  name: string;
  address: string;
  teacher: string;
  teacherPhone: string;
}

export type Weekday = 1 | 2 | 3 | 4 | 5;
export interface PickupSchedule {
  weekdayTimes: Record<Weekday, string>;
  changedToday?: { time: string; reason: string; changedBy: string };
}

export interface PickupStatus {
  state: PickupState;
  collectorId: PersonId;
  currentPlace: "school" | "road" | "office";
  etaMinutes: number;
  simulated: true;
}

export interface BackupRequest {
  id?: string;
  state: BackupRequestState;
  helperId?: PersonId;
  requestedAt?: string;
  // true = local demo only. false = stored in Supabase and answered by the real helper.
  simulated: boolean;
}

export interface TeacherPhotoVerification {
  state: VerificationState;
  collectorId: PersonId;
  photoDescription: string;
  teacherResponse?: "approved" | "rejected";
  simulated: true;
}

export interface SafeNestMockData {
  child: Child;
  caregivers: Caregiver[];
  familyMembers: FamilyMember[];
  trustedHelpers: TrustedHelper[];
  school: School;
  schedule: PickupSchedule;
  pickupStatus: PickupStatus;
  backupRequest: BackupRequest;
  teacherPhotoVerification: TeacherPhotoVerification;
}

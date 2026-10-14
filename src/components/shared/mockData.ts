import type { SafeNestMockData } from "./types";

// Fictional prototype data. Location, pickup status, backup and verification are simulations.
export const mockData: SafeNestMockData = {
  child: { id: "laila", name: "Laila", age: 8, className: "2 Amanah" },
  caregivers: [
    { id: "abu", name: "Abu", role: "Parent", email: "abu@example.com", phone: "+60 12-880 1122", isAdmin: true },
    { id: "siti", name: "Siti", role: "Parent", email: "siti@example.com", phone: "+60 13-221 4455", isAdmin: true },
  ],
  familyMembers: [
    { id: "abu", name: "Abu", role: "Parent", state: "active" },
    { id: "siti", name: "Siti", role: "Parent", state: "active", locationLabel: "Home (demo)" },
    { id: "aiman", name: "Aiman", role: "Brother", state: "active", locationLabel: "College (demo)" },
  ],
  trustedHelpers: [
    { id: "ahmad", name: "Encik Ahmad", role: "Uncle", state: "active", locationLabel: "Work (demo)" },
    { id: "ima", name: "Kak Ima", role: "Aunt", state: "active", locationLabel: "Home (demo)" },
    { id: "salmah", name: "Pn. Salmah", role: "Neighbour", state: "pending" },
  ],
  school: {
    name: "Sekolah Kebangsaan Taman Aman",
    address: "Jalan Taman Aman 3, 75450 Bukit Beruang, Melaka",
    teacher: "Cikgu Aisyah",
    teacherPhone: "012-345 6789",
  },
  schedule: { weekdayTimes: { 1: "1:00 PM", 2: "1:00 PM", 3: "1:00 PM", 4: "1:00 PM", 5: "11:30 AM" } },
  pickupStatus: { state: "onTrack", collectorId: "ahmad", currentPlace: "office", etaMinutes: 35, simulated: true },
  backupRequest: { state: "idle", simulated: true },
  teacherPhotoVerification: {
    state: "notStarted",
    collectorId: "ahmad",
    photoDescription: "Demo profile photo on file",
    simulated: true,
  },
};

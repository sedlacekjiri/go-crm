export const PARTNER_TYPES = [
  { value: "hotel", label: "Hotels", singular: "Hotel" },
  { value: "guesthouse", label: "Guesthouses", singular: "Guesthouse" },
  { value: "ota", label: "OTA", singular: "OTA" },
  { value: "cafe", label: "Cafés", singular: "Café" },
  { value: "other", label: "Other", singular: "Other" },
] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number]["value"];

// Pipeline for in-person outreach. Interest (cold/warm/hot) is tracked separately
// so a partner can be "In talks" and still be cold.
export const STAGES = [
  { value: "new", label: "New", hint: "On the list, not visited yet" },
  { value: "contacted", label: "Contacted", hint: "Visited / first talk done" },
  { value: "in_talks", label: "In talks", hint: "Interested, waiting for decision" },
  { value: "accepted", label: "Accepted", hint: "Partner – has affiliate link" },
  { value: "declined", label: "Declined", hint: "Said no (for now)" },
] as const;
export type Stage = (typeof STAGES)[number]["value"];

export const INTEREST = [
  { value: 1, label: "Cold" },
  { value: 2, label: "Warm" },
  { value: 3, label: "Hot" },
] as const;

export const ACTIVITY_TYPES = [
  { value: "visit", label: "Visit" },
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Call" },
  { value: "email", label: "E-mail" },
  { value: "note", label: "Note" },
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];

// Reykjavík first, then the rest of the capital region.
export const AREAS = [
  "101 Miðborg (Downtown)",
  "102 Vatnsmýri",
  "103 Kringlan / Hvassaleiti",
  "104 Vogar",
  "105 Hlíðar / Laugardalur",
  "107 Vesturbær",
  "108 Háaleiti / Fossvogur",
  "109 / 111 Breiðholt",
  "110 Árbær",
  "112 Grafarvogur",
  "113 Grafarholt / Úlfarsárdalur",
  "116 Kjalarnes",
  "Seltjarnarnes",
  "Kópavogur",
  "Garðabær",
  "Hafnarfjörður",
  "Mosfellsbær",
] as const;

export const BRANDS = [
  { value: "car", label: "Go Car Rentals" },
  { value: "camper", label: "Go Campers" },
] as const;
export type Brand = (typeof BRANDS)[number]["value"];

export const GOAL_METRICS = [
  { value: "visits", label: "Visits & meetings", unit: "" },
  { value: "new_partners", label: "New partners", unit: "" },
  { value: "bookings", label: "Partner bookings", unit: "" },
  { value: "revenue_eur", label: "Partner revenue", unit: "EUR" },
] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number]["value"];

export interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  area: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  rooms: number | null;
  stars: number | null;
  stage: Stage;
  interest: number | null;
  affiliate_code: string | null;
  affiliate_url: string | null;
  next_follow_up: string | null;
  accepted_at: string | null;
  declined_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  partner_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
}

export interface Activity {
  id: string;
  partner_id: string;
  contact_id: string | null;
  type: ActivityType;
  happened_at: string;
  summary: string | null;
}

export interface Sale {
  id: string;
  booking_ref: string;
  booking_date: string;
  pickup_date: string | null;
  return_date: string | null;
  brand: Brand | null;
  vehicle: string | null;
  rental_days: number | null;
  amount: number;
  currency: string;
  amount_eur: number;
  amount_isk: number;
  fx_eur_isk: number | null;
  affiliate_code: string | null;
  status: string | null;
  is_cancelled: boolean;
  customer_country: string | null;
}

export interface Goal {
  id: string;
  month: string;
  metric: GoalMetric;
  target: number;
}

export const stageLabel = (s: string) => STAGES.find((x) => x.value === s)?.label ?? s;
export const typeLabel = (t: string) => PARTNER_TYPES.find((x) => x.value === t)?.singular ?? t;
export const interestLabel = (i: number | null) => INTEREST.find((x) => x.value === i)?.label ?? "–";
export const activityLabel = (t: string) => ACTIVITY_TYPES.find((x) => x.value === t)?.label ?? t;
export const brandLabel = (b: string | null) => BRANDS.find((x) => x.value === b)?.label ?? "Unknown";

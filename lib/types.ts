/**
 * Grovia Fullstack Prototype — Core Types & Interface Contracts
 * Aligned with PROJECT.md M1-M3 specifications.
 */

// ==========================================
// View & Navigation Types
// ==========================================

export type ViewType = 'overview' | 'people' | 'payroll';

// ==========================================
// Appearance & Avatar Types
// ==========================================

export type HairStyle =
  | 'long'
  | 'bob'
  | 'afro'
  | 'curly'
  | 'coils'
  | 'pony'
  | 'bun'
  | 'short';

export interface AppearanceConfig {
  skin: string;
  hair: HairStyle | string;
  hc: string; // hair color
  shirt: string;
  beard?: boolean | number;
  glasses?: boolean | number;
}

// ==========================================
// Personnel & Roster Types
// ==========================================

export type PersonStatus = 'Active' | 'On leave' | 'Invited';

export interface Person {
  id: string;
  name: string;
  role: string;
  team: string;
  city: string;
  hireDate: string;
  status: PersonStatus;
  avatar?: string;
  look?: AppearanceConfig;
  rate?: number;
  email?: string;
  phone?: string;
  bday?: string;
  since?: string;
  av?: string; // background color token
}

// ==========================================
// Icon System Types (31 Sprite Glyphs)
// ==========================================

export type IconName =
  | 'arrow-ur'
  | 'play'
  | 'pause'
  | 'reset'
  | 'alarm'
  | 'gear'
  | 'bell'
  | 'user'
  | 'users'
  | 'user-plus'
  | 'laptop'
  | 'chev-d'
  | 'chev-l'
  | 'chev-r'
  | 'check'
  | 'dots-v'
  | 'search'
  | 'plus'
  | 'monitor'
  | 'bolt'
  | 'chat'
  | 'flag'
  | 'link'
  | 'doc'
  | 'key'
  | 'cake'
  | 'mail'
  | 'phone'
  | 'pin'
  | 'download'
  | 'x'
  | 'i-arrow-ur'
  | 'i-play'
  | 'i-pause'
  | 'i-reset'
  | 'i-alarm'
  | 'i-gear'
  | 'i-bell'
  | 'i-user'
  | 'i-users'
  | 'i-user-plus'
  | 'i-laptop'
  | 'i-chev-d'
  | 'i-chev-l'
  | 'i-chev-r'
  | 'i-check'
  | 'i-dots-v'
  | 'i-search'
  | 'i-plus'
  | 'i-monitor'
  | 'i-bolt'
  | 'i-chat'
  | 'i-flag'
  | 'i-link'
  | 'i-doc'
  | 'i-key'
  | 'i-cake'
  | 'i-mail'
  | 'i-phone'
  | 'i-pin'
  | 'i-download'
  | 'i-x';

// ==========================================
// API Response & Request Contracts (M2-M3)
// ==========================================

export interface HealthSystemInfo {
  runtime: 'bun' | string;
  version: string;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  version: string;
  database: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  system: HealthSystemInfo;
}

export interface PipelineMetrics {
  interviews: number;
  hired: number;
  projectTime: number;
  output: number;
}

export interface MetricsResponse {
  teamCount: number;
  hiringCount: number;
  projectsCount: number;
  pipeline: PipelineMetrics;
  weeklyWorkdayAverage: number;
  activeSessions: number;
  benchmarkQuartile: string;
}

export interface RoiRequest {
  monthlyTraffic: number;
  conversionRate: number;
  averageOrderValue: number;
  industry?: string;
}

export interface MonthlyTrajectoryPoint {
  month: string;
  revenue: number;
}

export interface RoiResponse {
  currentMonthlyRevenue: number;
  projectedMonthlyRevenue: number;
  projectedConversionRate: number;
  incrementalMonthlyRevenue: number;
  incrementalAnnualGain: number;
  projectedRoiMultiple: string;
  monthlyTrajectory: MonthlyTrajectoryPoint[];
}

export interface WaitlistRequest {
  name: string;
  email: string;
  company?: string;
  teamSize?: string;
  useCase?: string;
}

export interface WaitlistResponse {
  success: boolean;
  message: string;
  position: number;
}

export type InquiryStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type InquiryPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface InquiryRequest {
  name: string;
  email: string;
  subject: string;
  message: string;
  priority?: InquiryPriority | string;
}

export interface InquiryResponse {
  success: boolean;
  ticketId: string;
  status: InquiryStatus | string;
}

// ==========================================
// Configuration & Settings Types
// ==========================================

export interface TemplateConfig {
  brand: string;
  greetingName: string;
  workdayHours: number;
  portrait: string;
  profileName: string;
  profileRole: string;
  showPurchaseBadge: boolean;
  colors: Record<string, string>;
  people: Partial<Person>[];
}

export interface TemplateSettings {
  name: string;
  day: number;
}

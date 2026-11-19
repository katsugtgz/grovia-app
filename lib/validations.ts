import { z } from 'zod';

// ==========================================
// Waitlist Schemas
// ==========================================

export const WaitlistRequestSchema = z.object({
  name: z
    .string({ required_error: 'name is required' })
    .trim()
    .min(1, 'Name must be at least 1 character')
    .max(1000, 'Name must not exceed 1000 characters'),
  email: z
    .string({ required_error: 'email is required' })
    .trim()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters')
    .toLowerCase(),
  company: z.string().trim().max(255).optional(),
  teamSize: z.string().trim().max(100).optional(),
  team_size: z.string().trim().max(100).optional(),
  useCase: z.string().trim().max(1000).optional(),
  use_case: z.string().trim().max(1000).optional(),
}).transform((data) => ({
  name: data.name,
  email: data.email,
  company: data.company,
  teamSize: data.teamSize || data.team_size,
  useCase: data.useCase || data.use_case,
}));

export type WaitlistInput = z.infer<typeof WaitlistRequestSchema>;

// ==========================================
// ROI Calculator Schemas
// ==========================================

export const RoiRequestSchema = z.object({
  monthlyTraffic: z
    .number({
      required_error: 'monthlyTraffic is required',
      invalid_type_error: 'monthlyTraffic must be a number',
    })
    .positive('monthlyTraffic must be positive')
    .finite('monthlyTraffic must be finite'),
  conversionRate: z
    .number({
      required_error: 'conversionRate is required',
      invalid_type_error: 'conversionRate must be a number',
    })
    .positive('conversionRate must be positive')
    .max(100, 'conversionRate cannot exceed 100%')
    .finite('conversionRate must be finite'),
  averageOrderValue: z
    .number({
      required_error: 'averageOrderValue is required',
      invalid_type_error: 'averageOrderValue must be a number',
    })
    .positive('averageOrderValue must be positive')
    .finite('averageOrderValue must be finite'),
  industry: z.string().trim().max(200).optional(),
});

export type RoiInput = z.infer<typeof RoiRequestSchema>;

// ==========================================
// Inquiries Schemas
// ==========================================

export const InquiryPostRequestSchema = z.object({
  name: z
    .string({ required_error: 'name is required' })
    .trim()
    .min(1, 'Name must be at least 1 character')
    .max(500, 'Name must not exceed 500 characters'),
  email: z
    .string({ required_error: 'email is required' })
    .trim()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters')
    .toLowerCase(),
  subject: z
    .string({ required_error: 'subject is required' })
    .trim()
    .min(1, 'Subject must be at least 1 character')
    .max(500, 'Subject must not exceed 500 characters'),
  message: z
    .string({ required_error: 'message is required' })
    .trim()
    .min(10, 'Message must be at least 10 characters')
    .max(10000, 'Message must not exceed 10000 characters'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
});

export type InquiryPostInput = z.infer<typeof InquiryPostRequestSchema>;

export const InquiryPatchRequestSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    ticketId: z.string().optional(),
    ticket_id: z.string().optional(),
    status: z.enum(['new', 'open', 'in_progress', 'resolved', 'closed']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  })
  .refine((data) => data.status !== undefined || data.priority !== undefined, {
    message: 'At least one of status or priority must be provided',
  });

export type InquiryPatchInput = z.infer<typeof InquiryPatchRequestSchema>;

// ==========================================
// Auth & People Schemas
// ==========================================

export const LoginRequestSchema = z.object({
  email: z
    .string({ required_error: 'email is required' })
    .trim()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters')
    .toLowerCase(),
  password: z
    .string({ required_error: 'password is required' })
    .min(1, 'Password is required')
    .max(1000, 'Password must not exceed 1000 characters'),
});

export type LoginInput = z.infer<typeof LoginRequestSchema>;

export const PEOPLE_TEAMS = ['Design', 'Engineering', 'Product', 'Operations'] as const;

export const InvitePersonRequestSchema = z.object({
  name: z
    .string({ required_error: 'name is required' })
    .trim()
    .min(1, 'Name must be at least 1 character')
    .max(200, 'Name must not exceed 200 characters'),
  email: z
    .string({ required_error: 'email is required' })
    .trim()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters')
    .toLowerCase(),
  role: z
    .string({ required_error: 'role is required' })
    .trim()
    .min(1, 'Role is required')
    .max(200, 'Role must not exceed 200 characters'),
  team: z.enum(PEOPLE_TEAMS, {
    errorMap: () => ({
      message: 'Team must be Design, Engineering, Product, or Operations',
    }),
  }),
  city: z
    .string()
    .trim()
    .max(120, 'City must not exceed 120 characters')
    .optional()
    .transform((val) => (val && val.length > 0 ? val : 'Remote')),
  rate: z
    .number({ invalid_type_error: 'rate must be a number' })
    .min(0, 'rate must be non-negative')
    .max(10000, 'rate must not exceed 10000')
    .finite('rate must be finite')
    .optional()
    .default(40),
});

export type InvitePersonInput = z.infer<typeof InvitePersonRequestSchema>;

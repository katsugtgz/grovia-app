export interface WaitlistPayload {
  name: string;
  email: string;
  company?: string;
  teamSize?: string;
  useCase?: string;
}

export interface InquiryPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface RoiPayload {
  monthlyTraffic: number;
  conversionRate: number;
  averageOrderValue: number;
  industry?: string;
}

export const fixtures = {
  waitlist: {
    standard: {
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      company: 'Acme Growth Labs',
      teamSize: '11-50',
      useCase: 'Team capacity and project tracking',
    } satisfies WaitlistPayload,
    enterprise: {
      name: 'Marcus Vance',
      email: 'm.vance@vanceholdings.com',
      company: 'Vance International',
      teamSize: '201-1000',
      useCase: 'Global payroll and cross-entity workforce modeling',
    } satisfies WaitlistPayload,
    minimal: {
      name: 'Alex Solo',
      email: 'alex@indiehacker.co',
    } satisfies WaitlistPayload,
    adversarial: {
      missingEmail: { name: 'Nameless' },
      emptyName: { name: '', email: 'empty.name@test.com' },
      whitespaceOnly: { name: '   \t  ', email: 'spaces@test.com' },
      invalidEmailFormats: [
        'plainaddress',
        '@missinguser.com',
        'user@.com',
        'user@example..com',
        'user name@example.com',
        '<script>alert(1)</script>@test.com',
      ],
      sqlInjection: {
        name: "Robert'); DROP TABLE waitlist;--",
        email: 'bobby.tables@inject.org',
        company: "' OR 1=1 --",
      },
      xssScript: {
        name: "<script>alert('xss')</script>",
        email: 'xss.hunter@safe.io',
        company: '<img src=x onerror=alert(1)>',
      },
      unicodeAndEmoji: {
        name: 'Renée Cœur 🚀 🌟',
        email: 'renee.coeur@intl.fr',
        company: 'Élégance Société',
      },
      tenKbString: {
        name: 'A'.repeat(10000),
        email: 'tenkb@string.com',
      },
    },
  },

  inquiries: {
    standard: {
      name: 'Sarah Connor',
      email: 'sarah@skynet-resistance.org',
      subject: 'Security & Access Control Review',
      message: 'Requesting documentation on database encryption and SOC2 readiness.',
      priority: 'high',
    } satisfies InquiryPayload,
    general: {
      name: 'Dave Bowman',
      email: 'dave@discovery-one.space',
      subject: 'Stopwatch dial keyboard shortcuts',
      message: 'Is there a keyboard hotkey to trigger the stopwatch play/pause?',
      priority: 'medium',
    } satisfies InquiryPayload,
    minimal: {
      name: 'Minimal Submitter',
      email: 'min@submit.com',
      subject: 'Pricing query',
      message: 'Need seat pricing for enterprise rollout.',
    } satisfies InquiryPayload,
    adversarial: {
      missingSubject: {
        name: 'Missing Subject',
        email: 'nosubject@test.com',
        message: 'This message has no subject provided.',
      },
      missingMessage: {
        name: 'Missing Message',
        email: 'nomessage@test.com',
        subject: 'Empty query',
      },
      shortMessage: {
        name: 'Short Message',
        email: 'short@test.com',
        subject: 'Brief inquiry',
        message: 'Too short',
      },
      invalidPriority: {
        name: 'Bad Priority',
        email: 'badpriority@test.com',
        subject: 'Ultra priority',
        message: 'Trying to set priority to urgent-mega.',
        priority: 'super-urgent' as any,
      },
      invalidStatusUpdate: {
        status: 'exploded_and_gone',
      },
      sqlInjectionTicketId: "GROV-8492' OR 1=1 --",
      fiftyKbMessage: {
        name: 'Spam Sender',
        email: 'spam@bot.com',
        subject: 'Massive message payload',
        message: 'M'.repeat(50000),
      },
    },
  },

  roi: {
    standard: {
      monthlyTraffic: 50000,
      conversionRate: 2.4,
      averageOrderValue: 120,
      industry: 'B2B SaaS',
    } satisfies RoiPayload,
    ecommerce: {
      monthlyTraffic: 250000,
      conversionRate: 1.8,
      averageOrderValue: 75,
      industry: 'E-Commerce',
    } satisfies RoiPayload,
    enterprise: {
      monthlyTraffic: 15000,
      conversionRate: 4.2,
      averageOrderValue: 1200,
      industry: 'Enterprise Software',
    } satisfies RoiPayload,
    adversarial: {
      zeroTraffic: {
        monthlyTraffic: 0,
        conversionRate: 2.5,
        averageOrderValue: 100,
      },
      negativeTraffic: {
        monthlyTraffic: -5000,
        conversionRate: 2.5,
        averageOrderValue: 100,
      },
      negativeConversion: {
        monthlyTraffic: 50000,
        conversionRate: -2.0,
        averageOrderValue: 100,
      },
      overHundredConversion: {
        monthlyTraffic: 50000,
        conversionRate: 125.0,
        averageOrderValue: 100,
      },
      negativeAov: {
        monthlyTraffic: 50000,
        conversionRate: 2.5,
        averageOrderValue: -50,
      },
      extremeAov: {
        monthlyTraffic: 10000,
        conversionRate: 2.0,
        averageOrderValue: 100000000,
      },
      microPrecision: {
        monthlyTraffic: 100000,
        conversionRate: 0.0001,
        averageOrderValue: 50,
      },
      stringTypes: {
        monthlyTraffic: 'fifty-thousand' as any,
        conversionRate: 'two-percent' as any,
        averageOrderValue: 'one-hundred' as any,
      },
    },
  },
};

export function createRandomEmail(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@grovia-test.io`;
}

import React from 'react';
import type { Metadata } from 'next';
import { LandingHeader as Header } from '@/components/landing/LandingHeader';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Grovia — People Operations, Onboarding & Payroll Platform',
  description:
    'Unify people directory, guided onboarding, workday capacity tracking, and audit-ready payroll in one calm Bento workspace.',
  openGraph: {
    title: 'Grovia — People Operations, Onboarding & Payroll Platform',
    description:
      'Unify people directory, guided onboarding, workday capacity tracking, and audit-ready payroll in one calm Bento workspace.',
    type: 'website',
  },
};

export default function HomePage() {
  return <LandingPage header={<Header />} />;
}

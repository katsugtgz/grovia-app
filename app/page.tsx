import React from 'react';
import { LandingHeader as Header } from '@/components/landing/LandingHeader';
import { LandingPage } from '@/components/landing/LandingPage';

export default function HomePage() {
  return <LandingPage header={<Header />} />;
}

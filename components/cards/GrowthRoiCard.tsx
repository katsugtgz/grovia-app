'use client';

import React, { useRef, useEffect, useState, useTransition } from 'react';
import gsap from 'gsap';
import { isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';
import { triggerToast } from '@/lib/toast';
import type { RoiResponse } from '@/lib/types';

const INITIAL_ROI: RoiResponse = {
  currentMonthlyRevenue: 106250,
  projectedMonthlyRevenue: 143437.5,
  projectedConversionRate: 3.375,
  incrementalMonthlyRevenue: 37187.5,
  incrementalAnnualGain: 446250,
  projectedRoiMultiple: '4.2x',
  monthlyTrajectory: [],
};

export function GrowthRoiCard() {
  const cardRef = useRef<HTMLElement>(null);
  const [traffic, setTraffic] = useState<number>(50000);
  const [conversionRate, setConversionRate] = useState<number>(2.5);
  const [aov, setAov] = useState<number>(85);
  const [roiData, setRoiData] = useState<RoiResponse>(INITIAL_ROI);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  const fetchRoi = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/roi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyTraffic: traffic,
          conversionRate,
          averageOrderValue: aov,
        }),
      });
      if (res.ok) {
        const data: RoiResponse = await res.json();
        startTransition(() => {
          setRoiData(data);
        });
      }
    } catch {
      // Fallback calculation if offline
      const currentRev = traffic * (conversionRate / 100) * aov;
      const projConv = conversionRate * 1.35;
      const projRev = traffic * (projConv / 100) * aov;
      const incrementalAnnualGain = (projRev - currentRev) * 12;
      setRoiData({
        currentMonthlyRevenue: currentRev,
        projectedMonthlyRevenue: projRev,
        projectedConversionRate: projConv,
        incrementalMonthlyRevenue: projRev - currentRev,
        incrementalAnnualGain,
        projectedRoiMultiple: '4.2x',
        monthlyTrajectory: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRoi();
    triggerToast('ROI model recalculated');
  };

  // Card hover lift
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const handlePointerEnter = () => {
      if (!isReducedMotion()) {
        gsap.to(card, { y: -3, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
      }
    };

    const handlePointerLeave = () => {
      if (!isReducedMotion()) {
        gsap.to(card, { y: 0, duration: 0.45, ease: 'power3.out', overwrite: 'auto', clearProps: 'transform' });
      }
    };

    card.addEventListener('pointerenter', handlePointerEnter);
    card.addEventListener('pointerleave', handlePointerLeave);
    return () => {
      card.removeEventListener('pointerenter', handlePointerEnter);
      card.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, []);

  return (
    <article className="card card--roi" data-card ref={cardRef}>
      <header className="card__head">
        <h2 className="card__title">Growth &amp; ROI Model</h2>
        <span className="glass-chip" data-prefix="">
          {roiData?.projectedRoiMultiple || '4.2x'} ROI
        </span>
      </header>

      <form className="roi-form" onSubmit={handleSubmit} style={{ marginTop: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          <div>
            <label
              htmlFor="roi-traffic"
              style={{ fontSize: '11px', color: 'var(--dim)', display: 'block', marginBottom: '4px' }}
            >
              Monthly Traffic
            </label>
            <input
              id="roi-traffic"
              type="number"
              className="field__input"
              value={traffic}
              min={100}
              max={10000000}
              onChange={(e) => {
                const val = e.target.valueAsNumber;
                if (!Number.isNaN(val) && Number.isFinite(val)) setTraffic(val);
              }}
              style={{ width: '100%', padding: '6px 10px', fontSize: '13px' }}
            />
          </div>
          <div>
            <label
              htmlFor="roi-conv"
              style={{ fontSize: '11px', color: 'var(--dim)', display: 'block', marginBottom: '4px' }}
            >
              Conversion (%)
            </label>
            <input
              id="roi-conv"
              type="number"
              step="0.1"
              className="field__input"
              value={conversionRate}
              min={0.1}
              max={100}
              onChange={(e) => {
                const val = e.target.valueAsNumber;
                if (!Number.isNaN(val) && Number.isFinite(val)) setConversionRate(val);
              }}
              style={{ width: '100%', padding: '6px 10px', fontSize: '13px' }}
            />
          </div>
          <div>
            <label
              htmlFor="roi-aov"
              style={{ fontSize: '11px', color: 'var(--dim)', display: 'block', marginBottom: '4px' }}
            >
              Avg Order ($)
            </label>
            <input
              id="roi-aov"
              type="number"
              className="field__input"
              value={aov}
              min={1}
              max={100000}
              onChange={(e) => {
                const val = e.target.valueAsNumber;
                if (!Number.isNaN(val) && Number.isFinite(val)) setAov(val);
              }}
              style={{ width: '100%', padding: '6px 10px', fontSize: '13px' }}
            />
          </div>
        </div>

        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            className="chip-btn magnetic"
            type="submit"
            aria-label="Recalculate ROI"
            disabled={isLoading}
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            <Icon name="bolt" className="ico" aria-hidden="true" />
            <span>{isLoading ? 'Computing...' : 'Recalculate'}</span>
          </button>

          {roiData && (
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '11px', color: 'var(--dim)' }}>Projected Gain: </span>
              <b style={{ font: '600 15px var(--font-body)', color: 'var(--honey-deep)' }}>
                +${Math.round(roiData.incrementalAnnualGain).toLocaleString('en-US')}/yr
              </b>
            </div>
          )}
        </div>
      </form>
    </article>
  );
}

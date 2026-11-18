'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import gsap from 'gsap';
import { $, isReducedMotion } from '@/lib/motion';
import type { Person } from '@/lib/types';
import {
  generateContractPdf,
  generatePayslipPdf,
  downloadPdf,
} from '@/lib/pdf-generator';
import { triggerToast } from '@/lib/toast';
import { PayrollRoster } from './payroll/PayrollRoster';
import { PayrollTimesheet, type TimesheetDay } from './payroll/PayrollTimesheet';
import { PayrollPersonCard } from './payroll/PayrollPersonCard';

export interface PayrollViewProps {
  active: boolean;
  people: Person[];
}

function createPrng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function calculateTimesheet(personIndex: number): TimesheetDay[] {
  const prng = createPrng(97 + personIndex * 131);
  const days: TimesheetDay[] = [];

  for (let d = 1; d <= 30; d++) {
    const r = d % 7;
    const isOff = r === 5 || r === 6;
    if (isOff || d > 29) {
      days.push({ d, off: isOff });
      continue;
    }
    const rand = prng();
    if (rand < 0.07) {
      days.push({ d, leave: 1, h: 0 });
    } else {
      const hours =
        rand > 0.8
          ? 8.5 + Math.round(prng() * 4) / 2
          : 7 + Math.round(prng() * 2) / 2;
      days.push({ d, h: hours });
    }
  }
  return days;
}

const ROSTER_INDICES = [0, 1, 2, 3, 5, 6];

export function PayrollView({ active, people }: PayrollViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const heroAvRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const roleRef = useRef<HTMLParagraphElement>(null);
  const monthGridRef = useRef<HTMLDivElement>(null);

  const [selectedRosterIdx, setSelectedRosterIdx] = useState(0);

  const currentPersonIndex = ROSTER_INDICES[selectedRosterIdx] ?? 0;
  const currentPerson = people[currentPersonIndex] || people[0];

  const timesheetDays = useMemo(
    () => calculateTimesheet(currentPersonIndex),
    [currentPersonIndex]
  );

  const timesheetSummary = useMemo(() => {
    const worked = timesheetDays.reduce((acc, day) => acc + (day.h || 0), 0);
    const ot = timesheetDays.reduce(
      (acc, day) => acc + Math.max(0, (day.h || 0) - 8),
      0
    );
    const leave = timesheetDays.filter((day) => day.leave).length * 8;
    return { worked, ot, leave };
  }, [timesheetDays]);

  const rate = currentPerson?.rate ?? 40;
  const totalPay =
    timesheetSummary.worked * rate + timesheetSummary.ot * rate * 0.5;

  const totalHoursCombined = timesheetSummary.worked + timesheetSummary.leave;
  const workPct =
    totalHoursCombined > 0
      ? Math.max(
          1,
          Math.round(
            ((timesheetSummary.worked - timesheetSummary.ot) /
              totalHoursCombined) *
              100
          )
        )
      : 0;
  const otPct =
    totalHoursCombined > 0
      ? Math.max(
          1,
          Math.round((timesheetSummary.ot / totalHoursCombined) * 100)
        )
      : 0;
  const leavePct =
    totalHoursCombined > 0
      ? Math.max(
          1,
          Math.round((timesheetSummary.leave / totalHoursCombined) * 100)
        )
      : 0;

  const ptoVal = 18 - (currentPersonIndex % 5) * 2;
  const learningVal = 1200 - currentPersonIndex * 110;
  const hoursPlanVal = Math.round(timesheetSummary.worked);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      setSelectedRosterIdx((prev) => (prev + 1) % ROSTER_INDICES.length);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setSelectedRosterIdx(
        (prev) => (prev - 1 + ROSTER_INDICES.length) % ROSTER_INDICES.length
      );
    }
  };

  useEffect(() => {
    if (!active || isReducedMotion()) return;

    if (heroAvRef.current) {
      gsap.fromTo(
        heroAvRef.current,
        { scale: 0.6, opacity: 0, rotation: -8 },
        { scale: 1, opacity: 1, rotation: 0, duration: $(0.7), ease: 'back.out(2)' }
      );
    }

    if (nameRef.current && roleRef.current) {
      gsap.fromTo(
        [nameRef.current, roleRef.current],
        { y: 12, opacity: 0 },
        { y: 0, opacity: 1, duration: $(0.5), stagger: $(0.05), ease: 'power3.out' }
      );
    }

    if (monthGridRef.current) {
      const chips = monthGridRef.current.querySelectorAll('.mday__chip');
      if (chips.length) {
        gsap.fromTo(
          chips,
          { scale: 0.4, opacity: 0 },
          {
            scale: 1,
            opacity: 1,
            duration: $(0.45),
            ease: 'back.out(2.5)',
            stagger: $(0.012),
          }
        );
      }
    }
  }, [active, currentPersonIndex]);

  const handleDownloadDoc = (type: 'contract' | 'payslip') => {
    if (!currentPerson) return;
    const firstName = currentPerson.name.split(' ')[0];
    const filename =
      type === 'contract'
        ? `Contract-${firstName}.pdf`
        : `Payslip-09-${firstName}.pdf`;

    const blob =
      type === 'contract'
        ? generateContractPdf(currentPerson)
        : generatePayslipPdf(currentPerson, timesheetSummary);

    downloadPdf(blob, filename);
    triggerToast(`${filename} downloaded`);
  };

  return (
    <div
      ref={containerRef}
      className={`view ${active ? 'is-active' : ''}`}
      id="view-payroll"
      data-view-panel="payroll"
      hidden={!active}
    >
      <div id="payroll-anchor" tabIndex={-1} className="sr-only" />

      <div className="payroll">
        <PayrollRoster
          people={people}
          rosterIndices={ROSTER_INDICES}
          selectedRosterIdx={selectedRosterIdx}
          onSelectRosterIdx={setSelectedRosterIdx}
          onKeyDown={handleKeyDown}
        />

        <PayrollTimesheet
          monthGridRef={monthGridRef}
          workedHours={timesheetSummary.worked}
          totalPay={totalPay}
          workPct={workPct}
          otPct={otPct}
          leavePct={leavePct}
          timesheetDays={timesheetDays}
        />

        <PayrollPersonCard
          currentPerson={currentPerson}
          heroAvRef={heroAvRef}
          nameRef={nameRef}
          roleRef={roleRef}
          ptoVal={ptoVal}
          learningVal={learningVal}
          hoursPlanVal={hoursPlanVal}
          onDownloadDoc={handleDownloadDoc}
        />
      </div>
    </div>
  );
}

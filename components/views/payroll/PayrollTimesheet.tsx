'use client';

import React from 'react';
import { formatCurrency } from '@/lib/pdf-generator';

export interface TimesheetDay {
  d: number;
  off?: boolean;
  leave?: number;
  h?: number;
}

export interface PayrollTimesheetProps {
  monthGridRef: React.RefObject<HTMLDivElement | null>;
  workedHours: number;
  totalPay: number;
  workPct: number;
  otPct: number;
  leavePct: number;
  timesheetDays: TimesheetDay[];
}

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function PayrollTimesheet({
  monthGridRef,
  workedHours,
  totalPay,
  workPct,
  otPct,
  leavePct,
  timesheetDays,
}: PayrollTimesheetProps) {
  return (
    <section className="card card--month" data-card>
      <header className="month__head">
        <p className="month__sum">
          <span className="big" id="pay-hours">
            {workedHours.toFixed(1)}
          </span>
          <span className="month__unit">hrs</span> /{' '}
          <span className="big" id="pay-amount">
            {formatCurrency(totalPay)}
          </span>
        </p>
        <span className="pill-btn pill-btn--static">September 2026</span>
      </header>

      <div className="rail rail--mini" id="pay-rail">
        <div
          className="seg seg--honey"
          style={{ '--w': workPct } as React.CSSProperties}
        >
          <span className="seg__label">Work hours</span>
          <span className="seg__bar">
            <i className="seg__fill" data-fill />
            <b className="seg__num">{workPct}%</b>
          </span>
        </div>
        <div
          className="seg seg--ink"
          style={{ '--w': otPct } as React.CSSProperties}
        >
          <span className="seg__label">Overtime</span>
          <span className="seg__bar">
            <i className="seg__fill" data-fill />
            <b className="seg__num">{otPct}%</b>
          </span>
        </div>
        <div
          className="seg seg--grey"
          style={{ '--w': leavePct } as React.CSSProperties}
        >
          <span className="seg__label">Leave</span>
          <span className="seg__bar">
            <i className="seg__fill" data-fill />
            <b className="seg__num">{leavePct}%</b>
          </span>
        </div>
      </div>

      <div className="month" id="month" ref={monthGridRef}>
        {DAY_HEADERS.map((name) => (
          <span key={name} className="month__dname">
            {name}
          </span>
        ))}
        {/* September 2026 starts Tuesday -> 1 padding day (Monday) */}
        <span className="mday is-pad" />

        {timesheetDays.map((day) => {
          const isToday = day.d === 29;
          const isOff = day.off;
          const hasLeave = day.leave;
          const hasOt = (day.h || 0) > 8;

          return (
            <div
              key={`mday-${day.d}`}
              className={`mday ${isOff ? 'is-off' : ''} ${isToday ? 'is-today' : ''}`}
            >
              <span className="mday__n">{day.d}</span>
              {hasLeave ? (
                <span className="mday__chip mday__chip--leave">Leave</span>
              ) : day.h ? (
                <span className={`mday__chip ${hasOt ? 'mday__chip--ot' : ''}`}>
                  {day.h.toFixed(1)}h
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

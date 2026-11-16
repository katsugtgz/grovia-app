'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Person } from '@/lib/types';
import { no } from '@/lib/template-core';
import { formatCurrency } from '@/lib/pdf-generator';

export interface PayrollPersonCardProps {
  currentPerson: Person;
  heroAvRef: React.RefObject<HTMLSpanElement | null>;
  nameRef: React.RefObject<HTMLHeadingElement | null>;
  roleRef: React.RefObject<HTMLParagraphElement | null>;
  ptoVal: number;
  learningVal: number;
  hoursPlanVal: number;
  onDownloadDoc: (type: 'contract' | 'payslip') => void;
}

export function PayrollPersonCard({
  currentPerson,
  heroAvRef,
  nameRef,
  roleRef,
  ptoVal,
  learningVal,
  hoursPlanVal,
  onDownloadDoc,
}: PayrollPersonCardProps) {
  return (
    <aside className="card card--person" data-card id="person">
      <div className="person__hero">
        <span
          ref={heroAvRef}
          className="avatar avatar--xl"
          id="person-av"
          style={{ '--av': currentPerson.av } as React.CSSProperties}
          aria-hidden="true"
          dangerouslySetInnerHTML={{
            __html: no(currentPerson.look, currentPerson.av),
          }}
        />
        <h2 className="person__name" id="person-name" ref={nameRef}>
          {currentPerson.name}
        </h2>
        <p className="person__role" id="person-role" ref={roleRef}>
          {currentPerson.role} · {currentPerson.team}
        </p>
      </div>

      <dl className="info" id="person-info">
        <div>
          <dt>
            <Icon name="cake" className="ico" aria-hidden="true" />
            Birthday
          </dt>
          <dd>{currentPerson.bday}</dd>
        </div>
        <div>
          <dt>
            <Icon name="phone" className="ico" aria-hidden="true" />
            Phone
          </dt>
          <dd>{currentPerson.phone}</dd>
        </div>
        <div>
          <dt>
            <Icon name="mail" className="ico" aria-hidden="true" />
            Email
          </dt>
          <dd>{currentPerson.email}</dd>
        </div>
        <div>
          <dt>
            <Icon name="pin" className="ico" aria-hidden="true" />
            Based in
          </dt>
          <dd>{currentPerson.city}</dd>
        </div>
        <div>
          <dt>
            <Icon name="flag" className="ico" aria-hidden="true" />
            Started
          </dt>
          <dd>{currentPerson.since || currentPerson.hireDate}</dd>
        </div>
      </dl>

      <h3 className="person__sub">Documents</h3>
      <div className="docs">
        <button
          className="doc"
          type="button"
          data-doc="contract"
          onClick={() => onDownloadDoc('contract')}
        >
          <Icon name="doc" className="ico" aria-hidden="true" />
          <span>Contract.pdf</span>
          <Icon name="download" className="ico doc__dl" aria-hidden="true" />
        </button>
        <button
          className="doc"
          type="button"
          data-doc="payslip"
          onClick={() => onDownloadDoc('payslip')}
        >
          <Icon name="doc" className="ico" aria-hidden="true" />
          <span>Payslip-09.pdf</span>
          <Icon name="download" className="ico doc__dl" aria-hidden="true" />
        </button>
      </div>

      <h3 className="person__sub">This month</h3>
      <div className="meters" id="person-meters">
        <div className="meter">
          <p className="meter__top">
            <span>Paid time off</span>
            <b>{ptoVal} / 25</b>
          </p>
          <p className="meter__bar">
            <i
              className="meter__fill"
              style={{
                display: 'block',
                transform: `scaleX(${Math.min(1, ptoVal / 25)})`,
                transformOrigin: '0 50%',
              }}
              data-to={Math.min(1, ptoVal / 25).toFixed(3)}
            />
          </p>
        </div>

        <div className="meter">
          <p className="meter__top">
            <span>Learning budget</span>
            <b>
              {formatCurrency(learningVal)} / {formatCurrency(1200)}
            </b>
          </p>
          <p className="meter__bar">
            <i
              className="meter__fill"
              style={{
                display: 'block',
                transform: `scaleX(${Math.min(1, learningVal / 1200)})`,
                transformOrigin: '0 50%',
              }}
              data-to={Math.min(1, learningVal / 1200).toFixed(3)}
            />
          </p>
        </div>

        <div className="meter">
          <p className="meter__top">
            <span>Hours vs plan</span>
            <b>{hoursPlanVal} / 168</b>
          </p>
          <p className="meter__bar">
            <i
              className="meter__fill"
              style={{
                display: 'block',
                transform: `scaleX(${Math.min(1, hoursPlanVal / 168)})`,
                transformOrigin: '0 50%',
              }}
              data-to={Math.min(1, hoursPlanVal / 168).toFixed(3)}
            />
          </p>
        </div>
      </div>
    </aside>
  );
}

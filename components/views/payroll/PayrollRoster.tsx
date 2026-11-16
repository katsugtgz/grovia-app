'use client';

import React from 'react';
import type { Person } from '@/lib/types';
import { no } from '@/lib/template-core';

export interface PayrollRosterProps {
  people: Person[];
  rosterIndices: number[];
  selectedRosterIdx: number;
  onSelectRosterIdx: (idx: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function PayrollRoster({
  people,
  rosterIndices,
  selectedRosterIdx,
  onSelectRosterIdx,
  onKeyDown,
}: PayrollRosterProps) {
  return (
    <aside className="card card--roster" data-card>
      <h2 className="card__title">Team</h2>
      <ul
        className="roster"
        id="roster"
        role="listbox"
        aria-label="Choose a person"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {rosterIndices.map((idx, rIdx) => {
          const person = people[idx];
          if (!person) return null;
          const isSelected = selectedRosterIdx === rIdx;

          return (
            <li key={person.id}>
              <button
                className={`roster__item ${isSelected ? 'is-sel' : ''}`}
                type="button"
                role="option"
                data-i={idx}
                aria-selected={isSelected}
                onClick={() => onSelectRosterIdx(rIdx)}
              >
                <span
                  className="avatar"
                  style={{ '--av': person.av } as React.CSSProperties}
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: no(person.look, person.av) }}
                />
                <span className="roster__txt">
                  <b>{person.name}</b>
                  <small>{person.role}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

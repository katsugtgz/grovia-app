'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Person } from '@/lib/types';
import { no } from '@/lib/template-core';

export interface PeopleTableProps {
  tbodyRef: React.RefObject<HTMLDivElement | null>;
  filteredPeople: Person[];
  selectedIds: Set<string>;
  allSelected: boolean;
  onToggleSelectAll: (e: React.MouseEvent) => void;
  onToggleRowSelect: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
}

export function PeopleTable({
  tbodyRef,
  filteredPeople,
  selectedIds,
  allSelected,
  onToggleSelectAll,
  onToggleRowSelect,
}: PeopleTableProps) {
  return (
    <div className="card card--table" data-card>
      <div className="table" aria-label="Team members">
        <div className="trow trow--head">
          <span className="c-check">
            <button
              type="button"
              className={`check check--head ${allSelected ? 'is-checked' : ''}`}
              aria-label="Select all teammates"
              aria-checked={allSelected}
              role="checkbox"
              onClick={onToggleSelectAll}
            >
              <Icon name="check" className="ico" aria-hidden="true" />
            </button>
          </span>
          <span className="c-name">Name</span>
          <span className="c-role">Role</span>
          <span className="c-team">Team</span>
          <span className="c-city">Location</span>
          <span className="c-since">Started</span>
          <span className="c-status">Status</span>
        </div>

        <div className="tbody" id="people" ref={tbodyRef}>
          {filteredPeople.map((person) => {
            const isSelected = selectedIds.has(person.id);
            const statusClass =
              person.status === 'Away' || person.status === 'On leave'
                ? 'status--away'
                : person.status === 'New'
                ? 'status--new'
                : person.status === 'Invited'
                ? 'status--invited'
                : '';

            return (
              <button
                key={person.id}
                type="button"
                className={`trow ${isSelected ? 'is-sel' : ''}`}
                data-i={person.id}
                data-team={person.team}
                aria-pressed={isSelected}
                onClick={(e) => onToggleRowSelect(person.id, e)}
              >
                <span className="trow__bg" aria-hidden="true" />
                <span className="c-check">
                  <span className="check">
                    <Icon name="check" className="ico" aria-hidden="true" />
                  </span>
                </span>

                <span className="c-name trow__name">
                  <span
                    className="avatar"
                    style={{ '--av': person.av } as React.CSSProperties}
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: no(person.look, person.av) }}
                  />
                  <span>{person.name}</span>
                </span>

                <span className="c-role trow__cell">
                  {person.role}
                </span>
                <span className="c-team trow__cell">
                  {person.team}
                </span>
                <span className="c-city trow__cell">
                  {person.city}
                </span>
                <span className="c-since trow__cell">
                  {person.since || person.hireDate}
                </span>

                <span className="c-status">
                  <span className={`status ${statusClass}`.trim()}>
                    {person.status}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p
          className="table__empty"
          id="people-empty"
          hidden={filteredPeople.length > 0}
        >
          Nobody matches that yet.
        </p>
      </div>
    </div>
  );
}

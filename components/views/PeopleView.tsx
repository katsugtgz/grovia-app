'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { $, isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';
import type { Person } from '@/lib/types';
import { PEOPLE_TEAMS } from '@/lib/validations';
import { triggerToast } from '@/lib/toast';
import { PeopleTable } from './people/PeopleTable';
import { PeopleActionTray } from './people/PeopleActionTray';

// Register Flip plugin
if (typeof window !== 'undefined') {
  gsap.registerPlugin(Flip);
}

export interface PeopleViewProps {
  active: boolean;
  people: Person[];
  /** Open the invite dialog; omit when the session may not invite (e.g. non-admin). */
  onOpenInvite?: () => void;
}

const TEAMS = ['all', ...PEOPLE_TEAMS] as const;

export function PeopleView({ active, people, onOpenInvite }: PeopleViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tbodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const [query, setQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState(() => {
    const firstPerson = people[0];
    return new Set(firstPerson ? [firstPerson.id] : []);
  });

  // Compute team counts
  const teamCounts = useMemo(() => {
    const counts: Record<string, number> = { all: people.length };
    for (const team of TEAMS) {
      if (team !== 'all') {
        counts[team] = people.filter((p) => p.team === team).length;
      }
    }
    return counts;
  }, [people]);

  // Filtered people with undefined/null safety guard
  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      const matchesTeam = selectedTeam === 'all' || p.team === selectedTeam;
      const matchesQuery =
        !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.role || '').toLowerCase().includes(q) ||
        (p.team || '').toLowerCase().includes(q);
      return matchesTeam && matchesQuery;
    });
  }, [people, selectedTeam, query]);

  // Select all state across filtered members
  const allSelected =
    filteredPeople.length > 0 &&
    filteredPeople.every((p) => selectedIds.has(p.id));

  const toggleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (allSelected) {
      for (const p of filteredPeople) {
        next.delete(p.id);
      }
    } else {
      for (const p of filteredPeople) {
        next.add(p.id);
      }
    }
    setSelectedIds(next);

    if (!isReducedMotion()) {
      const checkEl = e.currentTarget as HTMLElement;
      gsap.fromTo(
        checkEl,
        { scale: 0.7 },
        { scale: 1, duration: 0.35, ease: 'back.out(3)', clearProps: 'transform' }
      );
    }
  };

  // Character split greeting on active
  useEffect(() => {
    if (!active || isReducedMotion() || !titleRef.current) return;
    const chars = titleRef.current.querySelectorAll('.split-ch');
    if (chars.length) {
      gsap.fromTo(
        chars,
        { yPercent: 110 },
        { yPercent: 0, duration: $(0.8), stagger: $(0.022), ease: 'power4.out' }
      );
    }
  }, [active]);

  // Flip layout transition when filters or search change
  const handleTeamFilter = (team: string) => {
    if (team === selectedTeam) return;

    if (!isReducedMotion() && tbodyRef.current) {
      const rows = tbodyRef.current.querySelectorAll('.trow');
      const state = Flip.getState(rows);

      setSelectedTeam(team);

      requestAnimationFrame(() => {
        const updatedRows = tbodyRef.current?.querySelectorAll('.trow');
        if (updatedRows && updatedRows.length) {
          Flip.from(state, {
            duration: 0.5,
            ease: 'power3.inOut',
            absolute: true,
            nested: true,
            onEnter: (items) =>
              gsap.fromTo(
                items,
                { opacity: 0, x: 16 },
                { opacity: 1, x: 0, duration: 0.45, stagger: 0.03, ease: 'power3.out' }
              ),
            onLeave: (items) =>
              gsap.to(items, { opacity: 0, x: -12, duration: 0.25, ease: 'power2.in' }),
          });
        }
      });
    } else {
      setSelectedTeam(team);
    }
  };

  const toggleRowSelect = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    const nextSelected = new Set(selectedIds);
    const isNowSelected = !nextSelected.has(id);
    if (isNowSelected) {
      nextSelected.add(id);
    } else {
      nextSelected.delete(id);
    }
    setSelectedIds(nextSelected);

    if (isNowSelected && !isReducedMotion()) {
      const row = (e.currentTarget as HTMLElement).closest('.trow');
      const check = row?.querySelector('.check');
      if (check) {
        gsap.fromTo(
          check,
          { scale: 0.5 },
          { scale: 1, duration: 0.5, ease: 'back.out(3)', clearProps: 'transform' }
        );
      }
    }
  };

  // Bulk action handlers for floating action tray
  const handleExportSelected = () => {
    const selectedPeople = people.filter((p) => selectedIds.has(p.id));
    const header = 'Name,Role,Team,Location,Started,Status';
    const rows = selectedPeople.map(
      (p) =>
        `"${p.name || ''}","${p.role || ''}","${p.team || ''}","${p.city || ''}","${p.since || p.hireDate || ''}","${p.status || ''}"`
    );
    const csvContent =
      'data:text/csv;charset=utf-8,' + [header, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `grovia-team-export-${selectedPeople.length}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast(
      `Exported ${selectedIds.size} team member${selectedIds.size > 1 ? 's' : ''}`
    );
  };

  const handleMessageSelected = () => {
    triggerToast(
      `Drafting message to ${selectedIds.size} teammate${selectedIds.size > 1 ? 's' : ''}`
    );
  };

  const handleArchiveSelected = () => {
    triggerToast(
      `Archived ${selectedIds.size} teammate${selectedIds.size > 1 ? 's' : ''}`
    );
    setSelectedIds(new Set());
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  return (
    <div
      ref={containerRef}
      className={`view ${active ? 'is-active' : ''}`}
      id="view-people"
      data-view-panel="people"
      hidden={!active}
    >
      <div id="people-anchor" tabIndex={-1} className="sr-only" />

      <div className="view__head">
        <h1 ref={titleRef} className="hello__title" data-split>
          {[...'People'].map((ch, idx) => (
            <span key={idx} className="split-ch">
              {ch}
            </span>
          ))}
        </h1>

        <div className="toolbar">
          <label className="search" htmlFor="people-q">
            <span className="sr-only">Search by name or role</span>
            <Icon name="search" className="ico" aria-hidden="true" />
            <input
              id="people-q"
              type="search"
              aria-label="Search by name or role"
              placeholder="Search by name or role"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          {onOpenInvite && (
            <button
              className="dark-btn magnetic"
              type="button"
              id="add-member"
              onClick={onOpenInvite}
            >
              <Icon name="plus" className="ico" aria-hidden="true" />
              Add member
            </button>
          )}
        </div>
      </div>

      <div
        className="filters"
        id="filters"
        role="group"
        aria-label="Filter by team"
      >
        {TEAMS.map((team) => {
          const isSelected = selectedTeam === team;
          const count = teamCounts[team] ?? 0;
          const label = team === 'all' ? 'All' : team;

          return (
            <button
              key={team}
              className={`filter ${isSelected ? 'is-on' : ''}`}
              type="button"
              data-team={team}
              aria-pressed={isSelected}
              onClick={() => handleTeamFilter(team)}
            >
              {label} <span className="filter__n">{count}</span>
            </button>
          );
        })}
      </div>

      <PeopleTable
        tbodyRef={tbodyRef}
        filteredPeople={filteredPeople}
        selectedIds={selectedIds}
        allSelected={allSelected}
        onToggleSelectAll={toggleSelectAll}
        onToggleRowSelect={toggleRowSelect}
      />

      {people.length > 0 && (
        <PeopleActionTray
          selectedCount={selectedIds.size}
          onExport={handleExportSelected}
          onMessage={handleMessageSelected}
          onArchive={handleArchiveSelected}
          onClear={handleClearSelection}
        />
      )}
    </div>
  );
}

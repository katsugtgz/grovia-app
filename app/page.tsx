'use client';

import React, { useState, useEffect } from 'react';
import type { ViewType } from '@/lib/types';
import { normalizeView } from '@/lib/template-core';
import { Header } from '@/components/Header';

export default function HomePage() {
  const [currentView, setCurrentView] = useState<ViewType>('overview');

  // Synchronize view state with window URL hash
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash) {
        setCurrentView(normalizeView(hash));
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleViewChange = (newView: ViewType) => {
    setCurrentView(newView);
    const targetHash = newView === 'overview' ? '' : `#${newView}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(
        null,
        '',
        newView === 'overview'
          ? window.location.pathname + window.location.search
          : `#${newView}`
      );
    }
  };

  return (
    <section
      className="app"
      id="app"
      data-view={currentView}
      aria-label="Grovia workspace"
    >
      <Header activeView={currentView} onViewChange={handleViewChange} />

      {/* Overview Panel */}
      <div
        className={`view ${currentView === 'overview' ? 'is-active' : ''}`}
        id="view-overview"
        data-view-panel="overview"
        hidden={currentView !== 'overview'}
      >
        <div id="overview" tabIndex={-1} className="sr-only" />
        <div className="hello">
          <h1 className="hello__title" data-split>
            Good morning, Person 05
          </h1>
        </div>
      </div>

      {/* People Panel */}
      <div
        className={`view ${currentView === 'people' ? 'is-active' : ''}`}
        id="view-people"
        data-view-panel="people"
        hidden={currentView !== 'people'}
      >
        <div id="people" tabIndex={-1} className="sr-only" />
        <div className="hello">
          <h1 className="hello__title">Teammates</h1>
        </div>
      </div>

      {/* Payroll Panel */}
      <div
        className={`view ${currentView === 'payroll' ? 'is-active' : ''}`}
        id="view-payroll"
        data-view-panel="payroll"
        hidden={currentView !== 'payroll'}
      >
        <div id="payroll" tabIndex={-1} className="sr-only" />
        <div className="hello">
          <h1 className="hello__title">Payroll & Hours</h1>
        </div>
      </div>
    </section>
  );
}

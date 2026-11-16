'use client';

import React, { useRef, useEffect } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { isReducedMotion } from '@/lib/motion';

export interface ProfileCardProps {
  name?: string;
  role?: string;
  compensation?: string;
  avatarSrc?: string;
}

export function ProfileCard({
  name = 'Demo Person 01',
  role = 'Product Designer',
  compensation = '$4,850',
  avatarSrc = './photos/grovia/demo-avatar.svg',
}: ProfileCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    const img = imgRef.current;
    const meta = metaRef.current;
    if (!card || !img || !meta) return;

    if (
      typeof window === 'undefined' ||
      window.matchMedia('(pointer: coarse)').matches ||
      isReducedMotion()
    ) {
      return;
    }

    const quickImgX = gsap.quickTo(img, 'x', { duration: 0.8, ease: 'power3.out' });
    const quickImgY = gsap.quickTo(img, 'y', { duration: 0.8, ease: 'power3.out' });
    const quickMetaX = gsap.quickTo(meta, 'x', { duration: 0.8, ease: 'power3.out' });
    const quickMetaY = gsap.quickTo(meta, 'y', { duration: 0.8, ease: 'power3.out' });

    const handlePointerMove = (e: PointerEvent) => {
      if (isReducedMotion()) return;
      const rect = card.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / rect.width - 0.5;
      const normY = (e.clientY - rect.top) / rect.height - 0.5;
      quickImgX(normX * -14);
      quickImgY(normY * -14);
      quickMetaX(normX * 6);
      quickMetaY(normY * 4);
    };

    const handlePointerLeave = () => {
      quickImgX(0);
      quickImgY(0);
      quickMetaX(0);
      quickMetaY(0);
      if (!isReducedMotion()) {
        gsap.to(card, { y: 0, duration: 0.45, ease: 'power3.out', overwrite: 'auto', clearProps: 'transform' });
      }
    };

    const handlePointerEnter = () => {
      if (!isReducedMotion()) {
        gsap.to(card, { y: -3, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
      }
    };

    card.addEventListener('pointermove', handlePointerMove);
    card.addEventListener('pointerenter', handlePointerEnter);
    card.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      card.removeEventListener('pointermove', handlePointerMove);
      card.removeEventListener('pointerenter', handlePointerEnter);
      card.removeEventListener('pointerleave', handlePointerLeave);
      quickImgX(0);
      quickImgY(0);
      quickMetaX(0);
      quickMetaY(0);
    };
  }, []);

  return (
    <article className="card card--profile" data-card data-tilt ref={cardRef}>
      <div className="portrait" data-initials="MO">
        <Image
          ref={imgRef}
          className="portrait__img"
          src={avatarSrc.startsWith('./') ? avatarSrc.slice(1) : avatarSrc}
          alt="Fictional demo avatar illustration"
          width={640}
          height={760}
          priority
          unoptimized
          data-fallback=""
        />
      </div>
      <div className="profile__meta" ref={metaRef}>
        <div>
          <h2 className="profile__name">{name}</h2>
          <p className="profile__role">{role}</p>
        </div>
        <span className="glass-chip" data-count="4850" data-prefix="$">
          {compensation}
        </span>
      </div>
    </article>
  );
}

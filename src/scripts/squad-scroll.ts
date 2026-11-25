import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function initSquadScroll(): () => void {
  const nav = document.querySelector<HTMLElement>('[data-squad-nav]');
  const container = document.querySelector<HTMLElement>(
    '[data-squad-container]',
  );
  const sections = Array.from(
    container?.querySelectorAll<HTMLElement>('[data-squad-section]') ?? [],
  );
  const links = Array.from(
    nav?.querySelectorAll<HTMLAnchorElement>('[data-squad-target]') ?? [],
  );

  if (!nav || !container || !sections.length || !links.length) return () => {};

  const embeddedHeader = nav.classList.contains('squad-navigation--embedded')
    ? nav.closest<HTMLElement>('.page-hero--squad')
    : null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 600px)');
  const siteHeader = document.querySelector<HTMLElement>('.site-header');
  const siteContent = document.querySelector<HTMLElement>('.site-content');
  const indicator = document.querySelector<HTMLElement>(
    '[data-squad-indicator]',
  );
  const indicatorItems = Array.from(
    indicator?.querySelectorAll<HTMLAnchorElement>('[data-indicator-target]') ??
      [],
  );
  const activeTriggers: ScrollTrigger[] = [];
  const motionTriggers: ScrollTrigger[] = [];
  const tweens: gsap.core.Tween[] = [];
  const revealed = new Set<HTMLElement>();
  let offset = 0;
  let refreshFrame = 0;
  let activeId = '';

  function stickyHeight(element: HTMLElement | null): number {
    if (!element) return 0;
    const style = getComputedStyle(element);
    return style.position === 'sticky' && style.display !== 'none'
      ? element.getBoundingClientRect().height
      : 0;
  }

  function updateOffsets() {
    if (!nav || !container) return;
    const fixedHeight = stickyHeight(siteHeader);
    const navRect = nav.getBoundingClientRect();
    let bottomPadding = 0;
    if (embeddedHeader) {
      const headerRect = embeddedHeader.getBoundingClientRect();
      const navInset = navRect.top - headerRect.top;
      bottomPadding = headerRect.bottom - navRect.bottom;
      embeddedHeader.style.setProperty(
        '--squad-header-top',
        `${fixedHeight - navInset}px`,
      );
      embeddedHeader.dataset.squadHeaderReady = '';
    }
    const nextOffset = Math.ceil(
      fixedHeight + navRect.height + bottomPadding + 12,
    );
    nav.style.setProperty('--squad-sticky-top', `${Math.ceil(fixedHeight)}px`);
    container.style.setProperty('--squad-scroll-offset', `${nextOffset}px`);
    if (nextOffset !== offset) {
      offset = nextOffset;
      cancelAnimationFrame(refreshFrame);
      refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
    }
  }

  // Schaltet die sichtbare Ansicht um (z. B. Tab "Statistiken"), ohne den
  // aktiven Bereich zu setzen – das uebernimmt der ScrollTrigger nach dem
  // Scrollen. Nur bei echter Sichtbarkeitsaenderung wird ein Refresh der
  // ScrollTrigger angestossen, weil dessen Scroll-Restore einen laufenden
  // Smooth-Scroll abbrechen wuerde.
  function applyView(id: string) {
    if (!container) return;
    const visibilityBefore = sections
      .map((section) => section.getClientRects().length > 0)
      .join(',');
    if (id) container.dataset.activeSection = id;
    else delete container.dataset.activeSection;
    const visibilityAfter = sections
      .map((section) => section.getClientRects().length > 0)
      .join(',');
    if (visibilityBefore === visibilityAfter) return;
    cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
  }

  function setActiveSection(id: string) {
    if (id === activeId) return;
    activeId = id;
    applyView(id);
    const activeIndex = sections.findIndex(
      (section) => section.dataset.squadSection === id,
    );
    indicatorItems.forEach((item) => {
      const itemIndex = sections.findIndex(
        (section) =>
          section.dataset.squadSection === item.dataset.indicatorTarget,
      );
      const isActive = itemIndex === activeIndex;
      item.classList.toggle('is-active', isActive);
      item.classList.toggle(
        'is-visited',
        activeIndex >= 0 && itemIndex >= 0 && itemIndex < activeIndex,
      );
      if (isActive) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
    if (activeIndex >= 0) {
      indicator?.style.setProperty(
        '--squad-progress',
        String(activeIndex / Math.max(1, sections.length - 1)),
      );
    }
    for (const link of links) {
      if (link.dataset.squadTarget === id) {
        link.setAttribute('aria-current', 'true');
        if (mobile.matches) {
          const scroller = link.parentElement;
          scroller?.scrollTo({
            left:
              link.offsetLeft -
              (scroller.clientWidth - link.getBoundingClientRect().width) / 2,
            behavior: reducedMotion.matches ? 'auto' : 'smooth',
          });
        }
      } else {
        link.removeAttribute('aria-current');
      }
    }
  }

  function syncActiveSection() {
    const threshold = window.innerHeight * 0.45;
    // Ausgeblendete Bereiche (anderer Tab aktiv) duerfen nicht als aktiv gelten.
    const visible = sections.filter(
      (section) => section.getClientRects().length > 0,
    );
    const pool = visible.length ? visible : sections;
    const current =
      pool.findLast(
        (section) => section.getBoundingClientRect().top <= threshold,
      ) ?? pool[0];
    setActiveSection(current.dataset.squadSection ?? '');
  }

  function clearMotion() {
    motionTriggers.splice(0).forEach((trigger) => trigger.kill());
    tweens.splice(0).forEach((tween) => tween.kill());
    for (const section of sections) {
      gsap.set([section, ...section.querySelectorAll('[data-player-card]')], {
        clearProps: 'opacity,transform',
      });
    }
    siteContent?.style.removeProperty('--squad-stadium-shift');
  }

  function reveal(section: HTMLElement) {
    if (revealed.has(section) || reducedMotion.matches) return;
    revealed.add(section);
    tweens.push(
      gsap.fromTo(
        section,
        { opacity: mobile.matches ? 0.85 : 0.65, y: mobile.matches ? 10 : 24 },
        {
          opacity: 1,
          y: 0,
          duration: mobile.matches ? 0.4 : 0.55,
          ease: 'power2.out',
        },
      ),
    );
    if (!mobile.matches) {
      const cards = section.querySelectorAll('[data-player-card]');
      if (cards.length) {
        tweens.push(
          gsap.fromTo(
            cards,
            { opacity: 0, y: 16 },
            {
              opacity: 1,
              y: 0,
              duration: 0.45,
              stagger: 0.04,
              ease: 'power2.out',
            },
          ),
        );
      }
    }
  }

  function setupMotion() {
    clearMotion();
    if (reducedMotion.matches) return;

    for (const section of sections) {
      if (revealed.has(section)) continue;
      motionTriggers.push(
        ScrollTrigger.create({
          trigger: section,
          start: 'top 82%',
          onEnter: () => reveal(section),
          onEnterBack: () => reveal(section),
        }),
      );
    }

    if (!mobile.matches && siteContent) {
      const parallax = gsap.fromTo(
        siteContent,
        { '--squad-stadium-shift': '-20px' },
        {
          '--squad-stadium-shift': '20px',
          ease: 'none',
          scrollTrigger: {
            trigger: container,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        },
      );
      tweens.push(parallax);
      if (parallax.scrollTrigger) motionTriggers.push(parallax.scrollTrigger);
    }
    ScrollTrigger.refresh();
  }

  function onLinkClick(event: MouseEvent) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const link = event.currentTarget as HTMLAnchorElement;
    const target = link.dataset.squadTarget ?? '';
    const section = sections.find(
      (item) => item.dataset.squadSection === target,
    );
    if (!section) return;
    event.preventDefault();
    // Tab-Wechsel zuerst anwenden, damit die Zielsektion sichtbar ist und
    // die Scroll-Position korrekt berechnet werden kann.
    applyView(target);
    updateOffsets();
    history.pushState(null, '', link.hash);
    // Erst nach einem ggf. anstehenden ScrollTrigger.refresh() scrollen,
    // dessen Scroll-Restore einen Smooth-Scroll sonst abbrechen wuerde.
    requestAnimationFrame(() => {
      window.scrollTo({
        top: window.scrollY + section.getBoundingClientRect().top - offset,
        behavior: reducedMotion.matches ? 'auto' : 'smooth',
      });
    });
  }

  nav.dataset.squadReady = '';
  for (const link of [...links, ...indicatorItems]) {
    link.addEventListener('click', onLinkClick);
  }
  updateOffsets();

  for (const section of sections) {
    const id = section.dataset.squadSection;
    if (!id) continue;
    const isVisible = () => section.getClientRects().length > 0;
    activeTriggers.push(
      ScrollTrigger.create({
        trigger: section,
        start: 'top 45%',
        end: 'bottom 45%',
        onEnter: () => {
          if (isVisible()) setActiveSection(id);
        },
        onEnterBack: () => {
          if (isVisible()) setActiveSection(id);
        },
      }),
    );
  }

  if (indicator) {
    const showIndicator = () => {
      indicator.dataset.squadVisible = '';
    };
    const hideIndicator = () => {
      delete indicator.dataset.squadVisible;
    };
    activeTriggers.push(
      ScrollTrigger.create({
        trigger: container,
        start: 'top 40%',
        end: 'bottom 25%',
        onEnter: showIndicator,
        onEnterBack: showIndicator,
        onLeave: hideIndicator,
        onLeaveBack: hideIndicator,
      }),
    );
  }

  const resizeObserver = new ResizeObserver(updateOffsets);
  resizeObserver.observe(nav);
  if (embeddedHeader) resizeObserver.observe(embeddedHeader);
  if (siteHeader) resizeObserver.observe(siteHeader);
  window.addEventListener('resize', updateOffsets);
  ScrollTrigger.addEventListener('refresh', syncActiveSection);
  reducedMotion.addEventListener('change', setupMotion);
  mobile.addEventListener('change', setupMotion);
  setupMotion();
  syncActiveSection();

  // Direktlink auf einen zunaechst ausgeblendeten Tab (z. B. #statistiken):
  // Tab aktivieren und nach dem Einblenden dorthin scrollen.
  const hashId = decodeURIComponent(window.location.hash.slice(1));
  const hashSection = sections.find(
    (section) => section.dataset.squadSection === hashId,
  );
  if (hashId && hashSection && !hashSection.getClientRects().length) {
    setActiveSection(hashId);
    updateOffsets();
    requestAnimationFrame(() => {
      window.scrollTo({
        top: Math.max(
          0,
          window.scrollY + hashSection.getBoundingClientRect().top - offset,
        ),
        behavior: 'auto',
      });
    });
  }

  return () => {
    for (const link of [...links, ...indicatorItems]) {
      link.removeEventListener('click', onLinkClick);
    }
    resizeObserver.disconnect();
    window.removeEventListener('resize', updateOffsets);
    reducedMotion.removeEventListener('change', setupMotion);
    mobile.removeEventListener('change', setupMotion);
    ScrollTrigger.removeEventListener('refresh', syncActiveSection);
    cancelAnimationFrame(refreshFrame);
    activeTriggers.forEach((trigger) => trigger.kill());
    clearMotion();
    if (indicator) {
      delete indicator.dataset.squadVisible;
      indicator.style.removeProperty('--squad-progress');
      indicatorItems.forEach((item) => {
        item.classList.remove('is-active', 'is-visited');
      });
    }
    if (embeddedHeader) {
      delete embeddedHeader.dataset.squadHeaderReady;
      embeddedHeader.style.removeProperty('--squad-header-top');
    }
    delete nav.dataset.squadReady;
    nav.style.removeProperty('--squad-sticky-top');
    container.style.removeProperty('--squad-scroll-offset');
    delete container.dataset.activeSection;
  };
}

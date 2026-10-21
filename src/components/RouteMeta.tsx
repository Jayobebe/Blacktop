import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { tr } from '@/lib/i18n';

const SITE = 'https://blacktoplive.com';

/**
 * What each page says about itself to the browser and to search engines: its
 * tab title (the page's own name, translated, then "Blacktop"), and for the
 * public pages a description of their own, a canonical address and Open Graph
 * tags. Everything behind setup (rides, lobbies, settings, a crew's pages) is
 * the rider's own and marked noindex. index.html carries the full description
 * of the app for the landing page (and for crawlers that don't run scripts),
 * public/llms.txt the same for AI search, public/sitemap.xml the public pages.
 */
interface Meta {
  /** The page's name, already translated (null: the landing page's own title). */
  title: string | null;
  /** Public pages only: what the page is, for search results. */
  description?: string;
  /** Public pages are indexed; the rest are the rider's own. */
  index?: boolean;
}

const LANDING_TITLE = 'Blacktop: free ride app with live convoys, voice chat, crash rescue and ride tracking';
const LANDING_DESCRIPTION =
  'Free ride companion for motorcycles, cars, bicycles, e-bikes and e-scooters: ride tracking with lean angle and G-force, live GPS convoys with intercom voice chat, crash detection and rescue alerts, an anti-theft alarm, turn-by-turn maps with twisty routes, hazard reports and rain radar, track-day lap timing, a garage and logbook. No account, no ads, 18 languages.';

function metaFor(path: string): Meta {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/') return { title: null, description: LANDING_DESCRIPTION, index: true };
  if (p === '/demo')
    return {
      title: tr('Demo'),
      index: true,
      description:
        'A three-minute narrated tour of Blacktop: live convoys and intercom voice chat, crash detection and rescue, the anti-theft alarm, twisty routes and hazard reports, live lean and G-force, ride receipts and flyovers, crews, the garage and privacy.',
    };
  if (p === '/privacy')
    return {
      title: tr('Privacy Policy'),
      index: true,
      description: "Blacktop's privacy policy: no account, no ads, rides kept on your phone, convoy data wiped when a ride ends, and Burn to delete everything.",
    };
  if (p === '/terms')
    return {
      title: tr('Terms & Safety'),
      index: true,
      description: "Blacktop's terms and safety notes: crash detection and rescue, the anti-theft alarm, riding with the app, and public road privacy.",
    };
  if (p === '/enterprise')
    return {
      title: tr('Blacktop Enterprise'),
      index: true,
      description:
        'Blacktop Enterprise for riding schools, dealers, workshops, tour operators and race teams: a workspace on the rider’s phone from a QR code, with guest passes and nothing of the rider’s data shared.',
    };
  if (p.startsWith('/enterprise/demo/'))
    return {
      title: tr('Blacktop Enterprise'),
      index: true,
      description: 'A walkthrough of a Blacktop Enterprise package, for the business and for its riders.',
    };

  // The rider's own screens.
  const names: [RegExp, string][] = [
    [/^\/history$/, 'History'],
    [/^\/ride\/[^/]+$/, 'Ride'],
    [/^\/ride$/, 'Ride'],
    [/^\/stats$/, 'Stats'],
    [/^\/garage$/, 'Garage'],
    [/^\/settings$/, 'Settings'],
    [/^\/setup$/, 'Settings'],
    [/^\/world/, 'Blacktop World'],
    [/^\/arcade\/(switchback|blackgrid|card-wars)/, 'SwitchBack'],
    [/^\/arcade\/hit-heavy/, 'Hit Heavy'],
    [/^\/arcade\/petrol-head/, 'Petrol Head'],
    [/^\/arcade\/(gridlock|derez-legacy)/, 'Gridlock'],
    [/^\/arcade$/, 'Arcade'],
    [/^\/track/, 'Track Day'],
    [/^\/create-convoy$/, 'Start Convoy'],
    [/^\/join-convoy$|^\/join$/, 'Join Convoy'],
    [/^\/lobby$/, 'Convoy Lobby'],
    [/^\/solo-lobby$/, 'Plan a Route'],
    [/^\/pillion$/, 'Passenger'],
    [/^\/spectate\//, 'Spectate'],
    [/^\/crew\/convoys/, 'Crew Convoys'],
    [/^\/crew\/leaderboard/, 'Leaderboard'],
    [/^\/crew\/join/, 'Join Crew'],
    [/^\/crew\/challenges/, 'Challenges'],
    [/^\/rescue$/, 'Request rescue'],
    [/^\/speedshop$/, 'Speedshop'],
    [/^\/device-check$/, 'Device check'],
    [/^\/install$/, 'Install Blacktop'],
    [/^\/routes\/new$/, 'Save a route'],
    [/^\/trip\//, 'Trip'],
    [/^\/calendar$/, 'Blacktop Calendar'],
    [/^\/storage$/, 'Storage'],
    [/^\/whats-new$/, "What's new"],
  ];
  const hit = names.find(([re]) => re.test(p));
  return { title: hit ? tr(hit[1]) : null, index: false };
}

function setMeta(attr: 'name' | 'property', key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content == null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function RouteMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const m = metaFor(pathname);
    const title = m.title ? `${m.title} · Blacktop` : LANDING_TITLE;
    document.title = title;
    const url = `${SITE}${pathname === '/' ? '/' : pathname.replace(/\/+$/, '')}`;
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = m.index ? url : `${SITE}/`;
    setMeta('name', 'robots', m.index ? 'index, follow, max-image-preview:large, max-snippet:-1' : 'noindex, nofollow');
    const description = m.description ?? LANDING_DESCRIPTION;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', m.index ? url : `${SITE}/`);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
  }, [pathname]);
  return null;
}

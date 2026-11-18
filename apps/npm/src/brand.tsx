// Logo and name on the sign-in page: the NPM tool's components/authTitle.tsx (AuthTitle), taken over 1:1 and centred
// above the card like COMPASS's brand.
export const brand = (
  <div style={{ textAlign: 'center', marginBottom: 16 }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <img src="/icon-192.png" alt="" width={48} height={48} style={{ borderRadius: 10 }} />
      <span style={{ fontWeight: 700, fontSize: 28 }}>RADAR</span>
    </span>
  </div>
);

// Sider and phone header (from NPM components/title.tsx): the Nippon Paint Marine icon plus the name.
export const shellTitle = {
  expanded: (
    <>
      <img src="/icon-192.png" alt="" width={28} height={28} style={{ minWidth: 28, borderRadius: 6 }} />
      <span style={{ fontWeight: 700, fontSize: 16 }}>RADAR</span>
    </>
  ),
  collapsed: <img src="/icon-192.png" alt="" width={28} height={28} style={{ minWidth: 28, borderRadius: 6 }} />,
};

import bannerFleet from './assets/banners/banner-fleet.jpg';
import bannerHullEvents from './assets/banners/banner-hull-events.jpg';
import bannerSpecifications from './assets/banners/banner-specifications.webp';
import bannerCompanies from './assets/banners/banner-companies.webp';
import bannerProducts from './assets/banners/banner-products.png';

// Page banner (from NPM components/pageBanner.tsx): blue gradient over a photo per section, the fleet shot for every other page.
// The photos are the old RADAR's (SECTION_IMAGES in its pageBanner.tsx): fleet / hull events / companies the user's own, the rest
// from nipponpaint-marine.com. banner-fleet.jpg is pre-cropped so a plain `cover` keeps the ship in frame at any width; the hull
// events shot needs a position that favours the workers over the sky.
export const banner = {
  gradient: 'linear-gradient(90deg, #0F9ED5 0%, #4560DC 50%, transparent 100%)',
  defaultImage: { src: bannerFleet },
  images: {
    hull_events: { src: bannerHullEvents, position: 'center 60%' },
    newbuildings: { src: bannerHullEvents, position: 'center 60%' },
    specifications: { src: bannerSpecifications },
    shipyards: { src: bannerSpecifications },
    companies: { src: bannerCompanies },
    products: { src: bannerProducts },
  },
};

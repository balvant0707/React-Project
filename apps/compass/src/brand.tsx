// Logo and name on the sign-in page (from COMPASS components/logo.tsx, LoginBrand) and in the shell (components/title.tsx).
export const brand = (
  <div style={{ textAlign: 'center', marginBottom: 16 }}>
    <img src="/wilckens-logo.svg" alt="Wilckens Farben" height={40} style={{ display: 'block', width: 'auto', margin: '0 auto' }} />
    <div style={{ marginTop: 8, fontWeight: 600 }}>COMPASS</div>
  </div>
);

export const shellTitle = {
  expanded: (
    <div>
      <img src="/wilckens-logo.svg" alt="Wilckens Farben" height={26} style={{ display: 'block', width: 'auto' }} />
      <div style={{ fontWeight: 600, fontSize: 12, marginTop: 4, letterSpacing: 0.3, opacity: 0.7 }}>COMPASS</div>
    </div>
  ),
  collapsed: <img src="/favicon.ico" alt="Wilckens" width={28} height={28} style={{ minWidth: 28 }} />,
};

// Page banner: CI blue gradient, no photo yet (photos per section are a design decision for the user).
export const banner = { gradient: 'linear-gradient(90deg, #1a2b3c 0%, #2E4157 60%, #46596E 100%)' };

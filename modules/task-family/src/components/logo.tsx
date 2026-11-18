// Ported 1:1 from COMPASS (app/src/components/logo.tsx).
// Wilckens Farben wordmark (copied from wilckens.com). Red with white cut-outs, so the same file reads on light and dark backgrounds.
export const Logo = ({ height = 28 }: { height?: number }) => (
  <img src="/wilckens-logo.svg" alt="Wilckens Farben" height={height} style={{ display: "block", width: "auto" }} />
);

export const LoginBrand = () => (
  <div style={{ textAlign: "center", marginBottom: 16 }}>
    <Logo height={40} />
    <div style={{ marginTop: 8, fontWeight: 600 }}>COMPASS</div>
  </div>
);

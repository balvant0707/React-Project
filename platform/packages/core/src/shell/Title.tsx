import { Link } from 'react-router-dom';
import { useShell } from './ShellContext';

// From COMPASS components/title.tsx; the content (logo, name) comes from the app.
export const Title = ({ collapsed }: { collapsed?: boolean }) => {
  const { title } = useShell();
  return (
    <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', textDecoration: 'none' }}>
      {collapsed ? title.collapsed : title.expanded}
    </Link>
  );
};

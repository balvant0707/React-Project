import { Navigate, useParams } from 'react-router-dom';

/**
 * The database builds a record's link as '/<entity type>/<id>' (conversation_link, notification links), but a module's page may
 * sit under another path ('/hull-events/:id' for hull_events). A module adds a route for the entity type's own spelling with this
 * element, which sends it to the page: `{ path: '/hull_events/:id', element: <RecordRedirect to="/hull-events" /> }`.
 */
export const RecordRedirect = ({ to }: { to: string }) => {
  const { id = '' } = useParams<{ id: string }>();
  return <Navigate to={`${to}/${id}`} replace />;
};

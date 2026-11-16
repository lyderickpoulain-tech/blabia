import { lazy, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';
import PageLoader from '../components/PageLoader';

// v6 phase 2 : une réunion de revue (elle porte sur une version du projet) s'ouvre dans la
// salle allégée ; toute autre réunion, dans la salle v5.1.
const MeetingRoom = lazy(() => import('./MeetingRoom'));
const ReviewRoom = lazy(() => import('./ReviewRoom'));

export default function MeetingRoute() {
  const { id, sid } = useParams();
  const [kind, setKind] = useState(null);
  useEffect(() => {
    setKind(null);
    api.get(`/projects/${id}/sessions/${sid}`)
      .then(({ data }) => setKind(data.reviewOfVersion != null ? 'review' : 'meeting'))
      .catch(() => setKind('meeting')); // la salle v5.1 affiche elle-même l'erreur
  }, [id, sid]);
  if (!kind) return <PageLoader />;
  return kind === 'review' ? <ReviewRoom /> : <MeetingRoom />;
}

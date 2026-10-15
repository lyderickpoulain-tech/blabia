import { useProject, PageHeader } from '../../components/project/ProjectShell';
import InboxList from '../../components/assistant/InboxList';

// « À trancher » (v5.1, 16/10/2026) : un seul endroit pour tout ce qui attend votre réponse —
// les questions des agents de toutes les réunions (vous y répondez ici), les notes de votre
// bras droit, les conclusions préparées, les comptes rendus de mission, les décisions remises
// en question, les actions en retard. Remplace la colonne « Vous attend » et les points
// d'attention dispersés.
export default function ProjectInbox() {
  const { project, inbox, refreshInbox } = useProject();
  return (
    <>
      <PageHeader title="À trancher"
        subtitle="Tout ce qui attend votre réponse, de toutes les réunions. Répondez ici : les agents en tiendront compte à la reprise." />
      <InboxList project={project} inbox={inbox} onChanged={refreshInbox} />
    </>
  );
}

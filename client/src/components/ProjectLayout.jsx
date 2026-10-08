import { useState, useCallback, createContext, useContext } from 'react';
import Layout from './Layout';
import ProjectTimelinePanel from './ProjectTimelinePanel';

// Contexte permettant aux pages d'ordonner un refresh du panel
export const ProjectPanelContext = createContext({ refreshPanel: () => {} });
export const useProjectPanel = () => useContext(ProjectPanelContext);

export default function ProjectLayout({ projectId, children, panelRef }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshPanel = useCallback(() => setRefreshKey(k => k + 1), []);

  // Les pages qui rendent elles-mêmes ce <ProjectLayout> sont les parentes du
  // Provider ci-dessous : elles ne peuvent pas le consommer via useProjectPanel()
  // (un composant ne lit jamais un contexte fourni par son propre sous-arbre).
  // panelRef leur donne quand même refreshPanel, par une ref plutôt qu'un contexte.
  if (panelRef) panelRef.current = refreshPanel;

  return (
    <ProjectPanelContext.Provider value={{ refreshPanel }}>
      <Layout wide>
        <div className="flex items-start gap-0">
          {/* Contenu principal */}
          <div className="flex-1 min-w-0">
            {children}
          </div>

          {/* Panel timeline persistant */}
          <ProjectTimelinePanel projectId={projectId} refreshKey={refreshKey} />
        </div>
      </Layout>
    </ProjectPanelContext.Provider>
  );
}

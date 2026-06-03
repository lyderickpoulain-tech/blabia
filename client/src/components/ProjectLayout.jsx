import { useState, useCallback, createContext, useContext } from 'react';
import Layout from './Layout';
import ProjectTimelinePanel from './ProjectTimelinePanel';

// Contexte permettant aux pages d'ordonner un refresh du panel
export const ProjectPanelContext = createContext({ refreshPanel: () => {} });
export const useProjectPanel = () => useContext(ProjectPanelContext);

export default function ProjectLayout({ projectId, children }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshPanel = useCallback(() => setRefreshKey(k => k + 1), []);

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

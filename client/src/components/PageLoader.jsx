// Indicateur de chargement d'une page chargée à la demande (React.lazy)
export default function PageLoader({ inline = false }) {
  return (
    <div role="status" aria-label="Chargement" className={`flex items-center justify-center ${inline ? 'py-16' : 'min-h-screen bg-canvas'}`}>
      <div className="w-8 h-8 border-2 border-action border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

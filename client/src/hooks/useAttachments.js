import { useCallback, useRef, useState } from 'react';

// Pièces jointes d'un message de réunion (max 3) : images et PDF lus en base64,
// Word / Excel / CSV extraits par le serveur, texte brut lu tel quel ; glisser-déposer.
// Extrait de pages/MeetingRoom.jsx.

const MAX = 3;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ACCEPTED_EXTRACT     = ['.docx', '.xlsx', '.csv'];
const ACCEPTED_TEXT_TYPES  = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];

const isAccepted = (f) => {
  if (ACCEPTED_IMAGE_TYPES.includes(f.type)) return true;
  if (f.type === 'application/pdf') return true;
  if (ACCEPTED_TEXT_TYPES.includes(f.type) || f.type.startsWith('text/')) return true;
  const name = f.name.toLowerCase();
  return ACCEPTED_EXTRACT.some(ext => name.endsWith(ext));
};

const readFile = (file, mode) => new Promise(resolve => {
  const reader = new FileReader();
  reader.onload  = e => resolve({ ok: true, result: e.target.result });
  reader.onerror = () => resolve({ ok: false });
  if (mode === 'dataUrl') reader.readAsDataURL(file); else reader.readAsText(file);
});

export default function useAttachments({ projectId, sessionId, onError }) {
  const [attachments, setAttachments] = useState([]);
  const [isDragging,  setIsDragging]  = useState(false);
  const fileInputRef   = useRef(null);
  const attachmentsRef = useRef([]);
  attachmentsRef.current = attachments; // accès synchrone depuis l'envoi

  const processFiles = useCallback(async (fileList) => {
    const remaining = MAX - attachmentsRef.current.length;
    if (remaining <= 0) return;
    const files = Array.from(fileList).filter(isAccepted).slice(0, remaining);
    const results = [];

    for (const file of files) {
      const name = file.name.toLowerCase();
      const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
      const isPdf   = file.type === 'application/pdf';
      const needsExtract = name.endsWith('.docx') || name.endsWith('.xlsx') || name.endsWith('.csv');

      if (isImage || isPdf) {
        const r = await readFile(file, 'dataUrl');
        if (r.ok) results.push({ name: file.name, type: file.type, size: file.size,
          isImage, isPdf: isPdf && !isImage, dataUrl: isImage ? r.result : null, base64: r.result.split(',')[1] });
        else onError?.(`Impossible de lire : ${file.name}`);
      } else if (needsExtract) {
        // Extraction côté serveur
        try {
          const formData = new FormData();
          formData.append('file', file);
          const token = localStorage.getItem('token');
          const resp = await fetch(`/api/projects/${projectId}/sessions/${sessionId}/extract-file`,
            { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
          if (resp.ok) {
            const { text: extractedText } = await resp.json();
            results.push({ name: file.name, type: file.type, size: file.size, isImage: false, isPdf: false, extractedText });
          } else {
            onError?.(`Impossible d'extraire : ${file.name}`);
          }
        } catch {
          onError?.(`Erreur extraction : ${file.name}`);
        }
      } else {
        const r = await readFile(file, 'text');
        if (r.ok) results.push({ name: file.name, type: file.type, size: file.size, isImage: false, isPdf: false, text: r.result });
        else onError?.(`Impossible de lire : ${file.name}`);
      }
    }
    setAttachments(prev => [...prev, ...results].slice(0, MAX));
  }, [projectId, sessionId, onError]);

  const handleDragOver  = useCallback((e) => { e.preventDefault(); setIsDragging(true);  }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop      = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  return { attachments, setAttachments, attachmentsRef, fileInputRef, isDragging, processFiles, handleDragOver, handleDragLeave, handleDrop };
}

import api from './api';

// Téléchargement d'un fichier servi par l'API (jeton d'authentification requis :
// un simple lien <a href> ne l'enverrait pas). Nom lu dans Content-Disposition.
export async function downloadFile(path, fallbackName = 'export.docx') {
  const res = await api.get(path, { responseType: 'blob' });
  const cd = res.headers['content-disposition'] || '';
  const utf8 = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = cd.match(/filename="([^"]+)"/i);
  const name = utf8 ? decodeURIComponent(utf8[1]) : plain ? plain[1] : fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

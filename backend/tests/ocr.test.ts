import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IMAGE_TEXT_HEADER, extractText } from '../src/services/extraction';
import { drainJobs } from '../src/services/jobs';
import { api, createUser, uploadFile } from './helpers';

const available = (cmd: string, args: string[]) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
// La méthode d'extraction locale nécessite Python, Tesseract et poppler (présents dans l'image Docker).
const canRun = available('python3', ['--version']) && available('tesseract', ['--version']) && available('pdftoppm', ['-v']);

describe.skipIf(!canRun)("méthode d'extraction OCR locale des PDF", () => {
  // Page 1 : texte natif (avec un tableau) ; page 2 : la même page sous forme d'image scannée.
  const pdf = readFileSync(path.join(__dirname, 'fixtures/cours-mixte.pdf'));

  it('conserve le texte natif, lit la page scannée par OCR et repère les tableaux', async () => {
    const r = await extractText(pdf, 'application/pdf');
    expect(r.pageCount).toBe(2);
    expect(r.ocr?.moteur).toBe('tesseract');
    expect(r.pages[0]).toMatchObject({ page: 1, source: 'texte' });
    expect(r.pages[0].text).toContain('Total 344 165 47,97%');
    expect(r.pages[0].tableaux).toContainEqual(['Total', '344', '165', '47,97%']);
    // Les nombres du texte natif sont visibles sur l'image : rien à vérifier.
    expect(r.pages[0].aVerifier).toEqual([]);
    expect(r.pages[1]).toMatchObject({ page: 2, source: 'ocr' });
    expect(r.pages[1].text).toMatch(/moyenne est la somme des valeurs/i);
    expect(r.method).toBe('pdf-ocr');
    expect(r.warnings.join(' ')).toMatch(/Page\(s\) 2 .*OCR, à vérifier/);
  }, 120_000);

  it("lit le texte des images contenues dans une page qui a aussi du texte", async () => {
    // Page à texte natif + figure (image) contenant « Ecart-type sigma = 15 », « Effectif total 230 ».
    const r = await extractText(readFileSync(path.join(__dirname, 'fixtures/texte-et-image.pdf')), 'application/pdf');
    expect(r.pages[0].source).toBe('texte');
    expect(r.pages[0].texteImages).toMatch(/Effectif total 230/);
    expect(r.pages[0].texteImages).toMatch(/sigma = 15/);
    // Le texte de la figure rejoint le texte de la page (donc la base de connaissances), après le texte natif.
    expect(r.pages[0].text).toContain(IMAGE_TEXT_HEADER);
    expect(r.pages[0].text.indexOf('La variance mesure')).toBeLessThan(r.pages[0].text.indexOf('Effectif total 230'));
    expect(r.warnings.join(' ')).toMatch(/texte trouvé dans une image/);
  }, 120_000);

  it('traite une image importée (photo, scan) comme une page scannée', async () => {
    const r = await extractText(readFileSync(path.join(__dirname, 'fixtures/photo-cours.png')), 'image/png');
    expect(r.method).toBe('image-ocr');
    expect(r.pages[0]).toMatchObject({ page: 1, source: 'ocr' });
    expect(r.pages[0].text).toMatch(/probabilit/i);
    expect(r.pages[0].tableaux).toContainEqual(['Total', '120', '45', '37,50%']);
  }, 120_000);

  it("lit par OCR les images d'un fichier Word", async () => {
    const docx = readFileSync(path.join(__dirname, 'fixtures/cours-avec-image.docx'));
    const r = await extractText(docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(r.pages[0].text).toMatch(/Cours de probabilites : introduction/);
    expect(r.pages[0].texteImages).toMatch(/Total 120 45 37,50%/);
    expect(r.pages[0].text).toContain(IMAGE_TEXT_HEADER);
    expect(r.warnings.join(' ')).toMatch(/1 image\(s\) du document lue\(s\) par OCR/);
  }, 120_000);

  it('réunit le texte des fichiers, des scans et des textes collés dans la base du dossier', async () => {
    const u = await createUser();
    const folder = (await api.post(u, '/courses', { title: 'Statistique' })).body.data;
    await api.post(u, '/documents/text', { title: 'Notes amphi', content: 'La médiane partage une série ordonnée en deux parties égales.', courseId: folder.id }).expect(201);
    await uploadFile(u, { courseId: folder.id, fileName: 'photo-cours.png', mimeType: 'image/png', buffer: readFileSync(path.join(__dirname, 'fixtures/photo-cours.png')), source: 'scan' });
    await uploadFile(u, { courseId: folder.id, fileName: 'dispersion.pdf', mimeType: 'application/pdf', buffer: readFileSync(path.join(__dirname, 'fixtures/texte-et-image.pdf')) });
    await drainJobs();

    const kb = (await api.get(u, `/courses/${folder.id}/knowledge-base/content`)).body.data;
    expect(kb.pending).toEqual([]);
    expect(kb.documents.map((d: { source: string }) => d.source)).toEqual(['text', 'scan', 'file']);
    const all = kb.documents.flatMap((d: { pages: { text: string }[] }) => d.pages.map((p) => p.text)).join('\n');
    expect(all).toMatch(/La médiane partage/);
    expect(all).toMatch(/probabilit/i);
    expect(all).toMatch(/Effectif total 230/);

    const md = await api.get(u, `/courses/${folder.id}/knowledge-base/content?format=md`);
    expect(md.headers['content-disposition']).toContain('base-de-connaissances-statistique.md');
    expect(md.text).toMatch(/^# Base de connaissances — Statistique/);
    expect(md.text).toMatch(/## 2\. photo-cours\.png[\s\S]*OCR, à vérifier/);
    // Le contenu d'un autre étudiant reste inaccessible.
    expect((await api.get(await createUser(), `/courses/${folder.id}/knowledge-base/content`)).status).toBe(404);
  }, 180_000);
});

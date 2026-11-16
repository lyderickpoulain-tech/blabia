import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseBuilderOutput, splitSections } = require('../work/builderOutput');
const { SYSTEM, firstVersionPrompt, nextVersionPrompt } = require('../prompts/builderPrompt');
const { getGenre, registerGenre, templateOf } = require('../work/genres');

const SAMPLE = `<nom>Volcans en famille</nom>
<gabarit>jeu</gabarit>
<resume>Première version complète du jeu.</resume>
<ouvrage>
## Le principe
Les joueurs fuient la lave.

## Le matériel
- 40 cartes (à vérifier)
</ouvrage>
<suppositions>
- Nombre de joueurs :: 2 à 4
- Durée d'une partie : :: 30 minutes
- ligne sans séparateur
</suppositions>
<idees>
- + « pour jouer en famille » :: Le principe
- + « thème des volcans » :: pas encore — à développer
- I2 :: Le matériel
</idees>
<fini_quand>
- Ce sera fini quand les règles tiennent sur une page
- on peut jouer une partie de test
</fini_quand>`;

describe('réponse du constructeur (v6)', () => {
  it('lit toutes les balises', () => {
    const p = parseBuilderOutput(SAMPLE);
    expect(p.name).toBe('Volcans en famille');
    expect(p.template).toBe('jeu');
    expect(p.summary).toBe('Première version complète du jeu.');
    expect(p.content).toMatch(/^## Le principe/);
    expect(p.content).toContain('(à vérifier)');
    expect(p.assumptions).toEqual([
      { statement: 'Nombre de joueurs', value: '2 à 4' },
      { statement: 'Durée d\'une partie', value: '30 minutes' },
    ]);
    expect(p.ideas).toEqual([
      { text: 'pour jouer en famille', present: true, where: 'Le principe' },
      { text: 'thème des volcans', present: false, where: 'à développer' },
      { ref: 'I2', present: true, where: 'Le matériel' },
    ]);
    expect(p.criteria).toEqual(['les règles tiennent sur une page', 'on peut jouer une partie de test']);
  });

  it('sans balise <ouvrage> : le texte devient l’ouvrage ; balise non fermée tolérée', () => {
    expect(parseBuilderOutput('## Partie\nTexte libre').content).toBe('## Partie\nTexte libre');
    expect(parseBuilderOutput('<nom>X</nom><ouvrage>## A\nCoupé en route').content).toBe('## A\nCoupé en route');
  });

  it('découpe l’ouvrage en parties', () => {
    const parts = splitSections(parseBuilderOutput(SAMPLE).content);
    expect(parts.map(p => p.title)).toEqual(['Le principe', 'Le matériel']);
    expect(splitSections('Intro\n## A\nx')[0]).toEqual({ title: null, body: 'Intro' });
  });

  it('consignes : livrer complet, signaler l’incertain, pas de question, critères du porteur seuls', () => {
    expect(SYSTEM).toMatch(/LIVRE COMPLET/);
    expect(SYSTEM).toMatch(/à vérifier/);
    expect(SYSTEM).toMatch(/PAS DE QUESTION/);
    expect(SYSTEM).toMatch(/SEULS CRITÈRES SONT CEUX DU PORTEUR/);
    expect(SYSTEM).toContain('- jeu :');
    const first = firstVersionPrompt({ story: 'Un jeu sur les volcans' });
    expect(first.user).toContain('Un jeu sur les volcans');
    const next = nextVersionPrompt({
      story: 's', current: { number: 1, content: '## A' },
      assumptions: [{ statement: 'Joueurs', value: '6', state: 'changed' }],
      comments: [{ section: 'A', content: 'Plus court' }], ideas: [{ ref: 'I1', text: 'volcans' }], criteria: [],
    });
    expect(next.user).toMatch(/Joueurs :: 6 .*CHANGÉ PAR LE PORTEUR/);
    expect(next.user).toContain('Sur « A » : Plus court');
    expect(next.user).toContain('I1 « volcans »');
  });

  it('registre des genres : un genre s’ajoute sans toucher au cœur', () => {
    expect(getGenre('inconnu').id).toBe('dossier');
    expect(templateOf('dossier', 'nimporte').label).toBe('Projet');
    registerGenre({ id: 'essai', defaultTemplate: 'a', templates: { a: { label: 'A', when: 'essai', parts: ['x'] } } });
    expect(getGenre('essai').templates.a.label).toBe('A');
    expect(() => registerGenre({ id: 'incomplet' })).toThrow();
  });
});

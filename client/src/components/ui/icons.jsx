// Iconographie unique du site : icônes contour lucide (trait 1,75), jamais d'émoji.
// Les émojis encore stockés en base (avatar d'un assistant, catégorie d'outil du catalogue
// serveur) sont traduits ici en icônes.
import {
  Bot, Search, Lightbulb, Target, Brain, Zap, Library, Compass, PenLine, Scale, Palette, Code2,
  Coins, TrendingUp, Megaphone, Server, Mic, Factory, Map, Briefcase, Languages, BookOpen, Hash,
  ShieldAlert, Database, KeyRound, Mail, Sparkles, CreditCard, Image, Hammer, Package, Globe,
  Link2, Siren, Workflow, BarChart3, FolderKanban, Calculator, Network, GraduationCap, Microscope,
  HeartHandshake, Users, MessageCircle, Eye,
} from 'lucide-react';

export const ICON_STROKE = 1.75;

// Avatars d'assistants : émoji enregistré → icône
const EMOJI_ICON = {
  '🤖': Bot, '🔍': Search, '💡': Lightbulb, '🎯': Target, '🧠': Brain, '⚡': Zap, '📚': Library,
  '♟': Compass, '✍': PenLine, '⚖': Scale, '🎨': Palette, '💻': Code2, '💰': Coins, '📈': TrendingUp,
  '📣': Megaphone, '🧐': ShieldAlert, '🧪': Microscope, '📊': BarChart3, '🧮': Calculator,
  '🎓': GraduationCap, '🤝': HeartHandshake, '👥': Users, '💬': MessageCircle, '👁': Eye,
};
const normalize = e => String(e || '').replace(/[️‍]/g, '').trim();

// Agent à l'émoji par défaut (🤖) : icône déduite du nom et du rôle
const ROLE_ICON = [
  [/jurist|juridi|droit|rgpd|l[ée]gal|avocat/i, Scale],
  [/design|\bui\b|\bux\b|graphi|charte|brand|identit/i, Palette],
  [/devops|infra|serveur|h[ée]berg|d[ée]ploi/i, Server],
  [/financ|comptab|r[ée]concili|budget|tr[ée]sor|paiement/i, Coins],
  [/m[ée]tier|mod[ée]lis/i, Briefcase],
  [/d[ée]velopp|frontend|backend|code|technique|ing[ée]nieur/i, Code2],
  [/march[ée]|business|commerc|vente|croissance/i, TrendingUp],
  [/marketing|communic|r[ée]seaux/i, Megaphone],
  [/voice|voix|vocal|audio/i, Mic],
  [/nlp|langag|donn[ée]es|data/i, Database],
  [/industri|usine|production/i, Factory],
  [/cartograph|parcours|fonctionnel/i, Map],
  [/vulgaris|p[ée]dagog|formateur/i, BookOpen],
  [/num[ée]ro/i, Hash],
  [/strat[èe]g/i, Compass],
  [/analys/i, Search],
  [/cr[ée]ati/i, Lightbulb],
  [/critique|risque/i, Target],
  [/expert/i, Brain],
  [/synth[ée]/i, Zap],
  [/cherch|recherch/i, Library],
  [/r[ée]dact|[ée]crivain|contenu/i, PenLine],
  [/traduct/i, Languages],
];

export function agentIconFor(agent) {
  const byEmoji = EMOJI_ICON[normalize(agent?.emoji)];
  if (byEmoji && byEmoji !== Bot) return byEmoji;
  const text = `${agent?.name || ''} ${agent?.role || ''}`;
  return ROLE_ICON.find(([re]) => re.test(text))?.[1] || Bot;
}

// Choix proposés à la création d'un assistant : la valeur enregistrée reste un émoji
// (colonne Agent.emoji), affiché partout sous forme d'icône
export const AGENT_ICON_CHOICES = [
  { emoji: '🤖', Icon: Bot, label: 'Automatique (selon le rôle)' },
  { emoji: '🔍', Icon: Search, label: 'Analyse' },
  { emoji: '💡', Icon: Lightbulb, label: 'Idées' },
  { emoji: '🎯', Icon: Target, label: 'Critique' },
  { emoji: '🧠', Icon: Brain, label: 'Expertise' },
  { emoji: '⚡', Icon: Zap, label: 'Synthèse' },
  { emoji: '📚', Icon: Library, label: 'Recherche' },
  { emoji: '♟️', Icon: Compass, label: 'Stratégie' },
  { emoji: '✍️', Icon: PenLine, label: 'Rédaction' },
  { emoji: '⚖️', Icon: Scale, label: 'Droit' },
  { emoji: '🎨', Icon: Palette, label: 'Design' },
  { emoji: '💻', Icon: Code2, label: 'Développement' },
  { emoji: '💰', Icon: Coins, label: 'Finance' },
  { emoji: '📈', Icon: TrendingUp, label: 'Marché' },
  { emoji: '📣', Icon: Megaphone, label: 'Communication' },
  { emoji: '📊', Icon: BarChart3, label: 'Données' },
];

const AVATAR_SIZES = { xs: ['w-6 h-6', 13], sm: ['w-7 h-7', 15], md: ['w-9 h-9', 18], lg: ['w-10 h-10', 20] };

// Avatar d'assistant : pastille ronde + icône. className fixe le fond et la couleur.
export function AgentAvatar({ agent, size = 'md', className = 'bg-muted-light text-ink-soft', hidden = false }) {
  const Icon = agentIconFor(agent);
  const [box, px] = AVATAR_SIZES[size] || AVATAR_SIZES.md;
  return (
    <span aria-hidden="true" className={`${box} rounded-full inline-flex items-center justify-center shrink-0 ${className} ${hidden ? 'invisible' : ''}`}>
      <Icon size={px} strokeWidth={ICON_STROKE} />
    </span>
  );
}

// Catégories d'outils (catalogue serveur, services/tools/catalog.js) : id → icône
const TOOL_CATEGORY_ICON = {
  frontend: Palette, backend: Brain, database: Database, auth: KeyRound, messaging: Mail, ai: Sparkles,
  payment: CreditCard, storage: Image, devtools: Hammer, git: Package, hosting: Globe, domain: Link2,
  monitoring: Siren, nocode: Workflow, analytics: BarChart3, organization: FolderKanban,
};

export function ToolCategoryIcon({ id, size = 18, className = '' }) {
  const Icon = TOOL_CATEGORY_ICON[id] || Network;
  return <Icon size={size} strokeWidth={ICON_STROKE} aria-hidden="true" className={className} />;
}

// Texte venu du serveur ou d'une ancienne réunion : émoji de tête retiré
export const stripLeadingEmoji = text => String(text || '').replace(/^\s*(?:[☀-➿⭐⬆←-⇿\u{1F000}-\u{1FAFF}][️‍]?)+\s*/u, '');

// Choix de l'icône d'un assistant (formulaires de création et de modification)
export function AgentIconPicker({ value, onChange, agent }) {
  const current = normalize(value || '🤖');
  return (
    <div role="radiogroup" aria-label="Icône de l'assistant" className="flex flex-wrap gap-1.5">
      {AGENT_ICON_CHOICES.map(({ emoji, Icon, label }) => {
        const on = normalize(emoji) === current;
        const Shown = emoji === '🤖' && agent ? agentIconFor({ ...agent, emoji: '🤖' }) : Icon;
        return (
          <button key={emoji} type="button" role="radio" aria-checked={on} aria-label={label} title={label}
            onClick={() => onChange(emoji)}
            className={`w-9 h-9 inline-flex items-center justify-center rounded-[10px] border transition ${
              on ? 'bg-action-light border-action text-action' : 'bg-white border-line text-ink-muted hover:border-action-border hover:text-ink'
            }`}>
            <Shown size={17} strokeWidth={ICON_STROKE} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

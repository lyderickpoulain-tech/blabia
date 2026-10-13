import { Handshake, Code2, Wrench } from 'lucide-react';
// Constantes de la salle de réunion (extraites de pages/MeetingRoom.jsx)

// Palette agent (initiale + couleur de bulle)
export const AGENT_COLORS = [
  { bg: 'bg-blue-100',    text: 'text-blue-700',    avatar: 'bg-blue-600',    soft: 'bg-blue-50 ring-1 ring-blue-100'       },
  { bg: 'bg-violet-100',  text: 'text-violet-700',  avatar: 'bg-violet-600',  soft: 'bg-violet-50 ring-1 ring-violet-100'   },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', avatar: 'bg-emerald-700', soft: 'bg-emerald-50 ring-1 ring-emerald-100' },
  { bg: 'bg-rose-100',    text: 'text-rose-700',    avatar: 'bg-rose-600',    soft: 'bg-rose-50 ring-1 ring-rose-100'       },
  { bg: 'bg-amber-100',   text: 'text-amber-800',   avatar: 'bg-amber-700',   soft: 'bg-amber-50 ring-1 ring-amber-100'     },
  { bg: 'bg-cyan-100',    text: 'text-cyan-800',    avatar: 'bg-cyan-700',    soft: 'bg-cyan-50 ring-1 ring-cyan-100'       },
];

// Statut de la réunion
export const STATUS_BADGE = {
  open:      { label: 'En cours',   cls: 'bg-action-light text-action'  },
  accepted:  { label: 'Acceptée',   cls: 'bg-ok-light text-ok'          },
  abandoned: { label: 'Abandonnée', cls: 'bg-muted-light text-muted'    },
  postponed: { label: 'Reportée',   cls: 'bg-await-light text-await'    }, // v5.1 : en attente d'une mission
};

// v5.0 phase 3.2 : decision | claude_code | stack
export const DELIVERABLE_TYPES = [
  { id: 'decision',    icon: Handshake, label: 'Décision'    },
  { id: 'claude_code', icon: Code2,     label: 'Claude Code' },
  { id: 'stack',       icon: Wrench,    label: 'Services'    },
];

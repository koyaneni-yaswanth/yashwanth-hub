import { Wind, Bot, GraduationCap, IndianRupee, Heart, FolderKanban, Brain } from 'lucide-react';
import type { HudGlyph } from '../../lib/jarvisHud';

export function renderWorkspaceGlyph(glyph: HudGlyph, className = 'w-4 h-4') {
  switch (glyph) {
    case 'wind':
      return <Wind className={className} aria-hidden="true" />;
    case 'bot':
      return <Bot className={className} aria-hidden="true" />;
    case 'graduation':
      return <GraduationCap className={className} aria-hidden="true" />;
    case 'rupee':
      return <IndianRupee className={className} aria-hidden="true" />;
    case 'heart':
      return <Heart className={className} aria-hidden="true" />;
    case 'folder':
      return <FolderKanban className={className} aria-hidden="true" />;
    case 'brain':
      return <Brain className={className} aria-hidden="true" />;
  }
}

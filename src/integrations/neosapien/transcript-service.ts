// NeoSapien Integration: Transcript & Speaker Intelligence
import type { NeoMemory, NeoSpeaker } from './types';

export class NeoTranscriptService {
  // Format verbatim transcript with speaker timestamps
  public static formatTranscriptWithSpeakers(memory: NeoMemory): string {
    if (!memory.transcript) return 'No verbatim transcript available for this memory.';

    let formatted = memory.transcript;
    if (memory.speakers && memory.speakers.length > 0) {
      // Annotate speakers
      memory.speakers.forEach((speaker: NeoSpeaker) => {
        const regex = new RegExp(`\\b${speaker.name}:`, 'gi');
        formatted = formatted.replace(regex, `🗣️ [${speaker.name}]:`);
      });
    }

    return formatted;
  }

  // Redact speaker names if privacy setting is active
  public static applyPrivacyMasking(transcript: string, speakers?: NeoSpeaker[]): string {
    if (!speakers || speakers.length === 0) return transcript;

    let masked = transcript;
    speakers.forEach((s, idx) => {
      const alias = s.isCurrentUser ? 'Founder' : `Speaker ${idx + 1}`;
      const reg = new RegExp(`\\b${s.name}\\b`, 'gi');
      masked = masked.replace(reg, alias);
    });

    return masked;
  }
}

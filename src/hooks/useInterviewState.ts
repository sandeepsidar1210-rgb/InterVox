export function useInterviewState({
  isSpeaking,
  isRecording,
  isEvaluating,
  isGenerating,
  isConversing,
  isEvaluatingAll
}: {
  isSpeaking: boolean;
  isRecording: boolean;
  isEvaluating: boolean;
  isGenerating: boolean;
  isConversing: boolean;
  isEvaluatingAll: boolean;
}) {
  let phase: 'idle' | 'listening' | 'thinking' | 'speaking' = 'idle';

  if (isSpeaking) {
    phase = 'speaking';
  } else if (isRecording) {
    phase = 'listening';
  } else if (isEvaluating || isGenerating || isConversing || isEvaluatingAll) {
    phase = 'thinking';
  }

  return { phase };
}

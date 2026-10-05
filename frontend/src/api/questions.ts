// Questions about one saved analysis (POST /analyses/{id}/questions).
import { useMutation } from '@tanstack/react-query';
import { api } from './client';
import type { AskQuestionRequest, QuestionAnswerResponse } from './types';

/** Same limits as AskQuestionRequest in shared/schemas/requests.py. */
export const MIN_QUESTION_CHARS = 3;
export const MAX_QUESTION_CHARS = 500;

/** Never retried automatically: each question may call an AI model and counts towards the limit. */
export function useAskQuestion(requestId: string) {
  return useMutation({
    mutationFn: (body: AskQuestionRequest) =>
      api.post<QuestionAnswerResponse>(
        `/api/v1/analyses/${encodeURIComponent(requestId)}/questions`,
        body,
      ),
    retry: false,
  });
}

/** The client-side check before sending; null when the question is fine. */
export function questionProblem(question: string): string | null {
  const text = question.trim();
  if (text.length < MIN_QUESTION_CHARS) return 'Type a question of at least a few words.';
  if (text.length > MAX_QUESTION_CHARS)
    return `Keep the question under ${MAX_QUESTION_CHARS} characters.`;
  if (!/[\p{L}\p{N}]/u.test(text)) return 'Type a question in words.';
  return null;
}

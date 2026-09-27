import { expect, it } from 'vitest';
import { useUIStore } from '@/stores/uiStore';
import { buildSurveyUrl, SURVEY_BASE_URL } from './feedbackContext';
it('captures the invoking feature once and keeps survey metadata anonymous', () => {
  useUIStore.getState().openFeedback('preprocessing.build');
  const context = useUIStore.getState().feedback!;
  useUIStore.getState().openDocument({ docType: 'tutorial', docKey: 'ui' });
  expect(useUIStore.getState().feedback).toBe(context);
  const params = new URL(buildSurveyUrl(SURVEY_BASE_URL, context)).searchParams;
  expect(params.get('feature')).toBe('preprocessing.build');
  expect(params.get('user_role')).toBe('anonymous');
  expect(params.get('submitted_at')).toBe(context.submitted_at);
  useUIStore.getState().closeFeedback();
  useUIStore.getState().closeDocument();
  expect(useUIStore.getState().feedback).toBeNull();
});

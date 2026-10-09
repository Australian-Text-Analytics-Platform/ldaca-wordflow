import { expect, it } from 'vite-plus/test';
import { combineExpression, compileEditor, initialEditorDraft } from './expressions';
it('compiles escaped templates, explicit missing behaviour and constant columns without synthetic rows', () => {
  expect(combineExpression('{{{Body}}}: {id}', ['Body', 'id'], 'blank')).toBe(
    "'{' || coalesce(CAST(\"Body\" AS VARCHAR), '') || '}: ' || coalesce(CAST(\"id\" AS VARCHAR), '')",
  );
  expect(combineExpression('{Body}', ['Body'], 'missing')).toBe('CAST("Body" AS VARCHAR)');
  const result = compileEditor(
    'combine',
    { ...initialEditorDraft('Body'), template: 'fixed', output: '  exact  name  ' },
    ['Body'],
  );
  expect(result.select).toBe('SELECT *, \'fixed\' AS "exact  name" FROM __wf_current');
  expect(() => combineExpression('{missing}', ['Body'], 'blank')).toThrow('unavailable');
  expect(() => combineExpression('', ['Body'], 'blank')).toThrow('nonempty');
});
it('rejects case collisions but allows replacing the exact existing source name', () => {
  const draft = { ...initialEditorDraft(' Body '), pattern: '.', replacement: '$1' };
  expect(compileEditor('replace', draft, [' Body ', 'other']).change).toMatchObject({
    columns: [{ column: ' Body ', replace: true }],
  });
  expect(() =>
    compileEditor('replace', { ...draft, newColumn: true, output: 'OTHER' }, [' Body ', 'other']),
  ).toThrow('already exists');
  expect(() => compileEditor('duplicate', { ...draft, output: ' ' }, [' Body '])).toThrow(
    'Enter a column name',
  );
});
it('allocates all split outputs together and enforces 2–50 columns', () => {
  const draft = { ...initialEditorDraft('Body'), delimiters: [':', '::'], parts: 3, right: true };
  const result = compileEditor('split', draft, ['Body', 'BODY_1', 'body_2']);
  expect(result.outputs).toEqual(['Body_1 2', 'Body_2 2', 'Body_3']);
  expect(result.change).toMatchObject({
    operation: 'transform_many',
    columns: result.outputs.map((column) => ({
      column,
      expression: expect.stringContaining('wordflow_split('),
      replace: false,
    })),
  });
  expect(() => compileEditor('split', { ...draft, parts: 51 }, ['Body'])).toThrow('2 and 50');
});
it('previews in-place Table assignments with the original physical type', () => {
  const draft = { ...initialEditorDraft('exact'), pattern: '1', replacement: '2' };
  const table = compileEditor('replace', draft, ['exact'], true);
  expect(table.select).toContain('cast_to_type((wordflow_replace(');
  expect(table.change).toMatchObject({
    columns: [{ expression: expect.stringContaining('cast_to_type(') }],
  });
  expect(compileEditor('replace', draft, ['exact']).select).not.toContain('cast_to_type(');
});

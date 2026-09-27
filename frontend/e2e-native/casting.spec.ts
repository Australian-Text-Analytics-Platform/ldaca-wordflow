import { browser, $, expect } from '@wdio/globals';
import { it } from 'mocha';

// All source values are SQL literals. Expected values stay in DuckDB so integers,
// decimals and fractional timestamps never pass through JavaScript numbers/dates.
const commonCasts = [
  { target: 'BOOLEAN', source: "'true', 'false'", expected: 'true, false' },
  { target: 'INTEGER', source: "'2147483647', '-2147483648'", expected: '2147483647, -2147483648' },
  {
    target: 'BIGINT',
    source: "'9223372036854775807', '-9223372036854775808'",
    expected: '9223372036854775807, -9223372036854775808',
  },
  { target: 'FLOAT', source: "'0.125', '-2.5'", expected: '0.125, -2.5' },
  { target: 'DOUBLE', source: "'1.25e3', '-0.5'", expected: '1250.0, -0.5' },
  {
    target: 'DECIMAL(18,4)',
    source: "'12345678901234.1234', '-0.0001'",
    expected: '12345678901234.1234, -0.0001',
  },
  { target: 'VARCHAR', source: '42, -7', expected: "'42', '-7'" },
  {
    target: 'DATE',
    source: "'2024-02-29', '2026-09-18'",
    expected: "DATE '2024-02-29', DATE '2026-09-18'",
  },
  {
    target: 'TIME',
    source: "'12:34:56.123456', '00:00:00.000001'",
    expected: "TIME '12:34:56.123456', TIME '00:00:00.000001'",
  },
  {
    target: 'TIMESTAMP',
    source: "'2026-09-18 12:34:56.123456', '1970-01-01 00:00:00.000001'",
    expected: "TIMESTAMP '2026-09-18 12:34:56.123456', TIMESTAMP '1970-01-01 00:00:00.000001'",
  },
  {
    target: 'TIMESTAMPTZ',
    canonical: 'TIMESTAMP WITH TIME ZONE',
    source: "'2020-10-16 15:20:22.123456+05:30', '2026-09-18 00:00:00.000001-04:00'",
    expected:
      "TIMESTAMPTZ '2020-10-16 09:50:22.123456+00', TIMESTAMPTZ '2026-09-18 04:00:00.000001+00'",
  },
  {
    target: 'UUID',
    source: "'550e8400-e29b-41d4-a716-446655440000', '00000000-0000-0000-0000-000000000000'",
    expected:
      "UUID '550e8400-e29b-41d4-a716-446655440000', UUID '00000000-0000-0000-0000-000000000000'",
  },
  {
    target: 'JSON',
    source: `'[{"name":"世界","n":1}]', '{"ok":true,"missing":null}'`,
    expected: `JSON '[{"name":"世界","n":1}]', JSON '{"ok":true,"missing":null}'`,
  },
] as const;

async function sql(script: string) {
  const status = await browser.tauri.execute(
    ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
  );
  const response = await fetch(`${status.url}/api/project/sql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ script, response: 'command' }),
  });
  if (!response.ok) throw new Error(await response.text());
}

it('confirms SQL type casts explicitly in the native Table and View UI in both themes', async () => {
  await sql(`
    CREATE TABLE native_cast_table AS SELECT '12.3456' AS amount;
    CREATE VIEW native_cast_view AS SELECT '12.3456' AS amount;
    INSERT INTO wordflow.nodes(table_name) VALUES ('native_cast_table'), ('native_cast_view');
  `);
  await browser.refresh();
  const originalTheme = await $('html').getAttribute('data-theme');
  try {
    for (const [kind, dark] of [
      ['table', false],
      ['view', true],
    ] as const) {
      await $('button[aria-label="Open settings"]').click();
      const toggle = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
      if (((await toggle.getAttribute('aria-checked')) === 'true') !== dark) await toggle.click();
      await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
      await $(`[aria-label="Select native_cast_${kind}"]`).click();
      await $('[data-testid="project-data-overlay"]').waitForStable();
      await $('button[aria-label="Change data type for column amount"]').click();
      // The embedded driver emits mouse events; Radix opens this menu on pointerdown or keyboard.
      await browser.keys('ArrowDown');
      await $('[role="menuitem"]=More SQL types…').click();
      const input = $('[role="dialog"] input');
      await expect(input).toBeFocused();
      await $('[role="dialog"]').waitForStable();
      await browser.waitUntil(async () =>
        $('[role="dialog"]').execute((el) => getComputedStyle(el).opacity === '1'),
      );
      expect(
        await $('button[aria-label="Use BIGINT"]').execute(
          (el) => el.scrollHeight <= el.clientHeight,
        ),
      ).toBe(true);
      await browser.saveScreenshot(`.tmp/wdio/sql-types-list-${dark ? 'dark' : 'light'}.png`);
      await input.setValue('numeric');
      await $('button[aria-label="Use NUMERIC"]').click();
      await expect(input).toHaveValue('NUMERIC');
      await input.setValue('DECIMAL(18,4)');
      await sql(
        `SELECT CASE WHEN typeof(amount)='VARCHAR' THEN 1 ELSE error('Selection cast automatically') END FROM native_cast_${kind}`,
      );
      await browser.saveScreenshot(`.tmp/wdio/sql-types-${dark ? 'dark' : 'light'}.png`);
      await $('button=Cast').click();
      await expect($('[role="dialog"]')).not.toExist();
      await sql(
        `SELECT CASE WHEN typeof(amount)='DECIMAL(18,4)' AND amount=12.3456 THEN 1 ELSE error('Native cast failed') END FROM native_cast_${kind}`,
      );
      if (kind === 'view') {
        await $('button[aria-label="Undo Data Block edit"]').waitForEnabled();
        await $('button[aria-label="Undo Data Block edit"]').waitForStable();
        await $('button[aria-label="Undo Data Block edit"]').click();
        await expect($('button[aria-label="Undo Data Block edit"]')).toBeDisabled();
        await expect($('button[aria-label="Change data type for column amount"]')).toHaveText(
          expect.stringContaining('string'),
        );
      }
      await $('button[aria-label="Close preview"]').click();
    }
  } finally {
    if ((await $('html').getAttribute('data-theme')) !== originalTheme) {
      await $('button[aria-label="Open settings"]').click();
      await $('[role="switch"][aria-label="Use Dark 2026 theme"]').click();
      await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
    }
  }
});

for (const kind of ['table', 'view']) {
  for (const [index, testCase] of commonCasts.entries()) {
    it(`casts ${testCase.target} in a native ${kind}, preserving values and NULLs`, async () => {
      const name = `native_common_cast_${kind}_${String(index)}`;
      await sql(`
        CREATE ${kind} ${name} AS
          SELECT ordinality AS id, value, 'keep' AS untouched
          FROM unnest([${testCase.source}, NULL]) WITH ORDINALITY t(value, ordinality);
        INSERT INTO wordflow.nodes(table_name) VALUES ('${name}');
      `);
      try {
        await browser.refresh();
        await $(`[aria-label="Select ${name}"]`).click();
        await $('[data-testid="project-data-overlay"]').waitForStable();
        const header = $('button[aria-label="Change data type for column value"]');
        const originalHeader = await header.getText();
        await header.click();
        await browser.keys('ArrowDown');
        await $('[role="menuitem"]=More SQL types…').click();
        await $('[role="dialog"] input').setValue(testCase.target);
        await $('button=Cast').click();
        await expect($('[role="dialog"]')).not.toExist();
        await sql(`
          SELECT CASE WHEN count(*)=3 AND count(actual.id)=3 AND count(expected.id)=3
            AND bool_and(actual.value IS NOT DISTINCT FROM expected.value)
            AND bool_and(actual.untouched='keep')
            AND min(typeof(actual.value))='${'canonical' in testCase ? testCase.canonical : testCase.target}'
            THEN 1 ELSE error('Wrong cast type, values or NULLs') END
          FROM ${name} actual FULL JOIN
            unnest([${testCase.expected}, NULL]) WITH ORDINALITY expected(value, id) USING (id);
        `);
        if (kind === 'view') {
          const undo = $('button[aria-label="Undo Data Block edit"]');
          await undo.waitForEnabled();
          await undo.waitForStable();
          await undo.click();
          await expect(undo).toBeDisabled();
          await expect(header).toHaveText(originalHeader);
          await sql(`
            SELECT CASE WHEN count(*)=3 AND count(actual.id)=3 AND count(expected.id)=3
              AND bool_and(actual.value IS NOT DISTINCT FROM expected.value)
              THEN 1 ELSE error('Undo changed source values') END
            FROM ${name} actual FULL JOIN
              unnest([${testCase.source}, NULL]) WITH ORDINALITY expected(value, id) USING (id);
          `);
        } else {
          await expect($('button[aria-label="Undo Data Block edit"]')).toBeDisabled();
        }
      } finally {
        // Shared hooks own database cleanup. Release this reader before the next reset.
        const close = $('button[aria-label="Close preview"]');
        if (await close.isExisting()) await close.click();
      }
    });
  }
}

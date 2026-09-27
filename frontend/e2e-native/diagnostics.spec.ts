import { it } from 'mocha';
import { sessionErrorsScenario } from '../e2e-browser/diagnosticsScenario';

it('native session diagnostics retains errors for E2E after history clear and reload', () => sessionErrorsScenario('native'));

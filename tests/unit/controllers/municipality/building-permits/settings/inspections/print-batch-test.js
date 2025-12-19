import { module, test } from 'qunit';
import { setupTest } from 'avitar-suite/tests/helpers';

module(
  'Unit | Controller | municipality/building-permits/settings/inspections/print-batch',
  function (hooks) {
    setupTest(hooks);

    // TODO: Replace this with your real tests.
    test('it exists', function (assert) {
      let controller = this.owner.lookup(
        'controller:municipality/building-permits/settings/inspections/print-batch',
      );
      assert.ok(controller);
    });
  },
);

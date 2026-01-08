import { module, test } from 'qunit';
import { setupTest } from 'avitar-suite/tests/helpers';

module(
  'Unit | Controller | municipality/assessing/settings/general',
  function (hooks) {
    setupTest(hooks);

    // TODO: Replace this with your real tests.
    test('it exists', function (assert) {
      let controller = this.owner.lookup(
        'controller:municipality/assessing/settings/general',
      );
      assert.ok(controller);
    });
  },
);

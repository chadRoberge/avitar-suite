import { module, test } from 'qunit';
import { setupTest } from 'avitar-suite/tests/helpers';

module(
  'Unit | Route | municipality/building-permits/inspection',
  function (hooks) {
    setupTest(hooks);

    test('it exists', function (assert) {
      let route = this.owner.lookup(
        'route:municipality/building-permits/inspection',
      );
      assert.ok(route);
    });
  },
);

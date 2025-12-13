import { module, test } from 'qunit';
import { setupTest } from 'avitar-suite/tests/helpers';

module('Unit | Route | my-permits/permit', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let route = this.owner.lookup('route:my-permits/permit');
    assert.ok(route);
  });
});

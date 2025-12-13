import { module, test } from 'qunit';
import { setupTest } from 'avitar-suite/tests/helpers';

module('Unit | Route | my-permits/project', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let route = this.owner.lookup('route:my-permits/project');
    assert.ok(route);
  });
});

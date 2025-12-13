import { module, test } from 'qunit';
import { setupTest } from 'avitar-suite/tests/helpers';

module('Unit | Controller | my-permits/project', function (hooks) {
  setupTest(hooks);

  // TODO: Replace this with your real tests.
  test('it exists', function (assert) {
    let controller = this.owner.lookup('controller:my-permits/project');
    assert.ok(controller);
  });
});

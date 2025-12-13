import { module, test } from 'qunit';
import { setupRenderingTest } from 'avitar-suite/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | shared/users-table', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders', async function (assert) {
    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.set('myAction', function(val) { ... });

    await render(hbs`<Shared::UsersTable />`);

    assert.dom().hasText('');

    // Template block usage:
    await render(hbs`
      <Shared::UsersTable>
        template block text
      </Shared::UsersTable>
    `);

    assert.dom().hasText('template block text');
  });
});

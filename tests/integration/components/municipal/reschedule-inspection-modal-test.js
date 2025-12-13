import { module, test } from 'qunit';
import { setupRenderingTest } from 'avitar-suite/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module(
  'Integration | Component | municipal/reschedule-inspection-modal',
  function (hooks) {
    setupRenderingTest(hooks);

    test('it renders', async function (assert) {
      // Set any properties with this.set('myProperty', 'value');
      // Handle any actions with this.set('myAction', function(val) { ... });

      await render(hbs`<Municipal::RescheduleInspectionModal />`);

      assert.dom().hasText('');

      // Template block usage:
      await render(hbs`
      <Municipal::RescheduleInspectionModal>
        template block text
      </Municipal::RescheduleInspectionModal>
    `);

      assert.dom().hasText('template block text');
    });
  },
);

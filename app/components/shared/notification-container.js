import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';

export default class SharedNotificationContainerComponent extends Component {
  @service notifications;

  get messages() {
    return this.notifications.messages;
  }

  @action
  dismiss(id) {
    this.notifications.removeMessage(id);
  }

  getIconForType(type) {
    const icons = {
      success: 'checkmark-circle',
      error: 'cross-circle',
      warning: 'warning',
      info: 'question-circle',
    };
    return icons[type] || 'info';
  }
}
